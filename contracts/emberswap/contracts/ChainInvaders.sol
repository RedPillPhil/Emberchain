// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title ChainInvaders
 * @notice Daily jackpot competition for the on-site Chain Invaders arcade game.
 *
 * Entry: 500 EMBR (native) during the daily window.
 * Window: noon → 8pm America/New_York, approximated as 16:00–24:00 UTC (EDT).
 *
 * Payouts (after the window closes):
 *   - 75% of the pot → highest cumulative score for the day (play well + play a lot)
 *   - 25% of the pot → highest single-run score for the day
 *   Same address may win both shares.
 *
 * Anti-cheat = commit–reveal + ECDSA game-server signature (not a Chainlink-style oracle):
 *   1. enter() once per day during the window.
 *   2. After each run, commitScore(keccak256(player, dayId, score, salt, playHash)).
 *   3. revealScore(score, salt, playHash, signature) — commitment must match, and
 *      `signature` must be ECDSA from `gameSigner` over keccak256(player, dayId, score, playHash).
 *      Players cannot forge rewards without the game server's private key.
 *   4. settleDay(dayId) pays both prize shares.
 */
contract ChainInvaders is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    uint256 public constant ENTRY_FEE = 500 ether; // 500 EMBR
    uint256 public constant CUMULATIVE_BPS = 7500; // 75%
    uint256 public constant SINGLE_BPS = 2500; // 25%
    uint256 public constant BPS_DENOM = 10_000;

    /// @dev Seconds from UTC midnight when the daily window opens (default 16:00 = noon EDT).
    uint256 public windowStartOffset = 16 hours;
    /// @dev Seconds from UTC midnight when the daily window closes (default 24:00 = 8pm EDT).
    uint256 public windowEndOffset = 24 hours;

    /// @dev Game server address whose private key signs valid play rewards (ECDSA).
    ///      Required — set at deploy. Without a valid signature, revealScore reverts.
    address public gameSigner;

    struct DayState {
        uint256 pot;
        uint256 bestCumulative;
        address cumulativeLeader;
        uint256 bestSingle;
        address singleLeader;
        bool settled;
        uint256 entrants;
    }

    mapping(uint256 => DayState) public days_;
    mapping(uint256 => mapping(address => bool)) public entered;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    /// @dev Sum of all verified run scores for the day.
    mapping(uint256 => mapping(address => uint256)) public cumulativeScores;
    /// @dev Best single verified run for the day.
    mapping(uint256 => mapping(address => uint256)) public bestSingleScores;
    mapping(bytes32 => bool) public usedSignatures;

    event Entered(uint256 indexed dayId, address indexed player, uint256 pot);
    event ScoreCommitted(uint256 indexed dayId, address indexed player, bytes32 commitment);
    event ScoreRevealed(
        uint256 indexed dayId,
        address indexed player,
        uint256 score,
        uint256 cumulativeTotal,
        bool newCumulativeLead,
        bool newSingleLead
    );
    event DaySettled(
        uint256 indexed dayId,
        address indexed cumulativeWinner,
        uint256 cumulativePayout,
        uint256 cumulativeScore,
        address indexed singleWinner,
        uint256 singlePayout,
        uint256 singleScore
    );
    event WindowUpdated(uint256 startOffset, uint256 endOffset);
    event GameSignerUpdated(address indexed signer);

    constructor(address _gameSigner) Ownable(msg.sender) {
        require(_gameSigner != address(0), "ChainInvaders: zero signer");
        gameSigner = _gameSigner;
    }

    // ── Time helpers ──────────────────────────────────────────────────────────

    function currentDayId() public view returns (uint256) {
        return (block.timestamp - windowStartOffset) / 1 days;
    }

    function dayWindow(uint256 dayId) public view returns (uint256 start, uint256 end) {
        start = dayId * 1 days + windowStartOffset;
        end = dayId * 1 days + windowEndOffset;
        if (windowEndOffset <= windowStartOffset) {
            end = start + (1 days - windowStartOffset) + windowEndOffset;
        }
    }

    function inCompetitionWindow() public view returns (bool) {
        uint256 dayId = currentDayId();
        (uint256 start, uint256 end) = dayWindow(dayId);
        return block.timestamp >= start && block.timestamp < end;
    }

    function jackpot(uint256 dayId) external view returns (uint256) {
        return days_[dayId].pot;
    }

    function todayJackpot() external view returns (uint256) {
        return days_[currentDayId()].pot;
    }

    // ── Entry ─────────────────────────────────────────────────────────────────

    function enter() external payable nonReentrant {
        require(msg.value == ENTRY_FEE, "ChainInvaders: entry is 500 EMBR");
        require(inCompetitionWindow(), "ChainInvaders: outside competition window");

        uint256 dayId = currentDayId();
        require(!entered[dayId][msg.sender], "ChainInvaders: already entered today");

        entered[dayId][msg.sender] = true;
        days_[dayId].pot += msg.value;
        days_[dayId].entrants += 1;

        emit Entered(dayId, msg.sender, days_[dayId].pot);
    }

    // ── Commit–reveal + ECDSA game-server signature ───────────────────────────

    /**
     * @notice Commit a score hash before revealing (prevents last-second inflation
     *         after inspecting the live leaderboard).
     * @param commitment  keccak256(abi.encodePacked(player, dayId, score, salt, playHash))
     */
    function commitScore(bytes32 commitment) external {
        require(inCompetitionWindow(), "ChainInvaders: outside competition window");
        uint256 dayId = currentDayId();
        require(entered[dayId][msg.sender], "ChainInvaders: not entered");
        require(commitment != bytes32(0), "ChainInvaders: zero commitment");

        commitments[dayId][msg.sender] = commitment;
        emit ScoreCommitted(dayId, msg.sender, commitment);
    }

    /**
     * @notice Reveal a previously committed score, authenticated by the game server.
     *         Adds `score` to the player's cumulative total and updates best single if higher.
     * @param score      Final run score
     * @param salt       Random salt used in the commitment
     * @param playHash   Hash of the play transcript binding the run
     * @param signature  ECDSA signature from gameSigner over
     *                   keccak256(abi.encodePacked(player, dayId, score, playHash))
     */
    function revealScore(
        uint256 score,
        bytes32 salt,
        bytes32 playHash,
        bytes calldata signature
    ) external nonReentrant {
        require(inCompetitionWindow(), "ChainInvaders: outside competition window");
        uint256 dayId = currentDayId();
        require(entered[dayId][msg.sender], "ChainInvaders: not entered");
        require(score > 0, "ChainInvaders: zero score");

        bytes32 expected = keccak256(abi.encodePacked(msg.sender, dayId, score, salt, playHash));
        require(commitments[dayId][msg.sender] == expected, "ChainInvaders: commitment mismatch");
        commitments[dayId][msg.sender] = bytes32(0);

        require(signature.length == 65, "ChainInvaders: bad signature");
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encodePacked(msg.sender, dayId, score, playHash))
        );
        address signer = ECDSA.recover(digest, signature);
        require(signer == gameSigner, "ChainInvaders: invalid signature");

        bytes32 sigKey = keccak256(abi.encodePacked(msg.sender, dayId, score, playHash));
        require(!usedSignatures[sigKey], "ChainInvaders: signature reused");
        usedSignatures[sigKey] = true;

        uint256 newCumulative = cumulativeScores[dayId][msg.sender] + score;
        cumulativeScores[dayId][msg.sender] = newCumulative;

        bool newSingleLead = false;
        if (score > bestSingleScores[dayId][msg.sender]) {
            bestSingleScores[dayId][msg.sender] = score;
        }
        if (score > days_[dayId].bestSingle) {
            days_[dayId].bestSingle = score;
            days_[dayId].singleLeader = msg.sender;
            newSingleLead = true;
        }

        bool newCumulativeLead = false;
        if (newCumulative > days_[dayId].bestCumulative) {
            days_[dayId].bestCumulative = newCumulative;
            days_[dayId].cumulativeLeader = msg.sender;
            newCumulativeLead = true;
        }

        emit ScoreRevealed(dayId, msg.sender, score, newCumulative, newCumulativeLead, newSingleLead);
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    function settleDay(uint256 dayId) external nonReentrant {
        DayState storage d = days_[dayId];
        require(!d.settled, "ChainInvaders: already settled");
        require(d.pot > 0, "ChainInvaders: empty pot");

        (, uint256 end) = dayWindow(dayId);
        require(block.timestamp >= end, "ChainInvaders: window still open");
        require(d.cumulativeLeader != address(0), "ChainInvaders: no cumulative winner");
        require(d.singleLeader != address(0), "ChainInvaders: no single winner");

        d.settled = true;
        uint256 pot = d.pot;
        d.pot = 0;

        uint256 cumulativePayout = (pot * CUMULATIVE_BPS) / BPS_DENOM;
        uint256 singlePayout = pot - cumulativePayout; // remainder → avoids dust loss

        if (d.cumulativeLeader == d.singleLeader) {
            (bool ok, ) = payable(d.cumulativeLeader).call{value: pot}("");
            require(ok, "ChainInvaders: payout failed");
        } else {
            (bool ok1, ) = payable(d.cumulativeLeader).call{value: cumulativePayout}("");
            require(ok1, "ChainInvaders: cumulative payout failed");
            (bool ok2, ) = payable(d.singleLeader).call{value: singlePayout}("");
            require(ok2, "ChainInvaders: single payout failed");
        }

        emit DaySettled(
            dayId,
            d.cumulativeLeader,
            cumulativePayout,
            d.bestCumulative,
            d.singleLeader,
            singlePayout,
            d.bestSingle
        );
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setWindow(uint256 startOffset, uint256 endOffset) external onlyOwner {
        require(startOffset < 1 days, "ChainInvaders: bad start");
        require(endOffset > 0 && endOffset <= 1 days, "ChainInvaders: bad end");
        windowStartOffset = startOffset;
        windowEndOffset = endOffset;
        emit WindowUpdated(startOffset, endOffset);
    }

    function setGameSigner(address signer) external onlyOwner {
        require(signer != address(0), "ChainInvaders: zero signer");
        gameSigner = signer;
        emit GameSignerUpdated(signer);
    }

    function rescue(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "ChainInvaders: zero");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ChainInvaders: rescue failed");
    }

    receive() external payable {}
}
