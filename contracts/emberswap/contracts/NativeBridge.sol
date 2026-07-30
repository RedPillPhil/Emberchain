// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NativeBridge
 * @notice Generic EVM-chain-side bridge contract.  Deployed on any EVM-compatible
 *         native chain (e.g. ABC chain) to lock/release its native coin.
 *
 * Flow A — Native chain → Base (locking native coin):
 *   1. User calls lockNative{value: amount}(baseRecipient, nonce).
 *   2. Native coin is held in escrow; BridgeLocked event emitted.
 *   3. UniversalBridge relayer detects event and mints the wrapped token on Base.
 *
 * Flow B — Base → Native chain (releasing native coin):
 *   1. User burns wrapped token on Base via UniversalBridge.bridgeOut().
 *   2. Relayer calls releaseNative() here to return native coin to user.
 *
 * Replay protection: nonces are tracked permanently in usedNonces.
 */
contract NativeBridge is Ownable, ReentrancyGuard {
    address public relayer;
    uint256 public totalLocked;
    mapping(uint256 => bool) public usedNonces;

    event BridgeLocked(
        address indexed sender,
        address indexed baseRecipient,
        uint256 amount,
        uint256 indexed nonce
    );
    event BridgeReleased(
        address indexed recipient,
        uint256 amount,
        uint256 indexed nonce
    );
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "NativeBridge: not relayer");
        _;
    }

    constructor(address _relayer) Ownable(msg.sender) {
        require(_relayer != address(0), "NativeBridge: zero relayer");
        relayer = _relayer;
    }

    /**
     * @notice Lock native coin to bridge it to Base as a wrapped token.
     * @param baseRecipient  Base chain address that will receive the wrapped token.
     * @param nonce          Unique nonce for this bridge request.
     */
    function lockNative(address baseRecipient, uint256 nonce) external payable nonReentrant {
        require(msg.value > 0, "NativeBridge: zero value");
        require(baseRecipient != address(0), "NativeBridge: zero recipient");
        require(!usedNonces[nonce], "NativeBridge: nonce used");

        usedNonces[nonce] = true;
        totalLocked += msg.value;

        emit BridgeLocked(msg.sender, baseRecipient, msg.value, nonce);
    }

    /**
     * @notice Release escrowed native coin after wrapped tokens were burned on Base.
     *         Called exclusively by the relayer.
     * @param recipient  Address to receive the native coin.
     * @param amount     Amount (in wei / native units) to release.
     * @param nonce      Nonce from the Base BridgeOut event — prevents replay.
     */
    function releaseNative(
        address payable recipient,
        uint256 amount,
        uint256 nonce
    ) external onlyRelayer nonReentrant {
        require(recipient != address(0), "NativeBridge: zero recipient");
        require(amount > 0, "NativeBridge: zero amount");
        require(!usedNonces[nonce], "NativeBridge: nonce used");
        require(address(this).balance >= amount, "NativeBridge: insufficient escrow");

        usedNonces[nonce] = true;
        totalLocked -= amount;

        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "NativeBridge: transfer failed");

        emit BridgeReleased(recipient, amount, nonce);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "NativeBridge: zero address");
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    receive() external payable {}
}
