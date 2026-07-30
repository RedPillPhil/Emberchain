// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWrappedToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

/**
 * @title UniversalBridge
 * @notice Base-side bridge supporting multiple wrapped tokens.
 *         Each project launched through EmberDelta registers its wrapped token here.
 *
 * Flow A — Native chain → Base (bridge IN):
 *   Relayer calls bridgeIn() after detecting a confirmed deposit on the native chain.
 *   Mints (gross - fee) to recipient; mints fee to FEE_RECIPIENT.
 *
 * Flow B — Base → Native chain (bridge OUT):
 *   User calls bridgeOut() — burns gross from user, mints fee to FEE_RECIPIENT.
 *   BridgeOut event carries net amount; relayer releases net on native chain.
 *
 * Fee: 0.5% of gross amount → 0xa8f6efc25896c24ac6c9441f9f693c14517aa818
 */
contract UniversalBridge is Ownable, ReentrancyGuard {
    address public constant FEE_RECIPIENT = 0xa8F6eFC25896c24ac6c9441f9f693C14517aa818;
    uint256 public constant FEE_BPS = 50;      // 0.5%
    uint256 public constant BPS_BASE = 10_000;

    address public relayer;

    mapping(address => bool) public supportedTokens;
    mapping(uint256 => bool) public usedNonces;

    event TokenRegistered(address indexed token);
    event TokenRemoved(address indexed token);
    event BridgeIn(
        address indexed token,
        address indexed recipient,
        uint256 gross,
        uint256 net,
        uint256 fee,
        uint256 indexed nonce
    );
    event BridgeOut(
        address indexed token,
        address indexed sender,
        string nativeRecipient,
        uint256 gross,
        uint256 net,
        uint256 fee,
        uint256 indexed nonce
    );
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "UniversalBridge: not relayer");
        _;
    }

    constructor(address _relayer) Ownable(msg.sender) {
        require(_relayer != address(0), "UniversalBridge: zero relayer");
        relayer = _relayer;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function registerToken(address token) external onlyOwner {
        require(token != address(0), "UniversalBridge: zero token");
        supportedTokens[token] = true;
        emit TokenRegistered(token);
    }

    function removeToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "UniversalBridge: zero relayer");
        emit RelayerUpdated(relayer, newRelayer);
        relayer = newRelayer;
    }

    // ── Bridge IN (native → Base) ─────────────────────────────────────────────

    /**
     * @notice Mint wrapped tokens after a native chain deposit.
     *         Called exclusively by the relayer; nonce ensures idempotency.
     *         Fee is minted to FEE_RECIPIENT; net is minted to recipient.
     */
    function bridgeIn(
        address token,
        address recipient,
        uint256 grossAmount,
        uint256 nonce
    ) external onlyRelayer nonReentrant {
        require(supportedTokens[token], "UniversalBridge: token not supported");
        require(recipient != address(0), "UniversalBridge: zero recipient");
        require(grossAmount > 0, "UniversalBridge: zero amount");
        require(!usedNonces[nonce], "UniversalBridge: nonce used");

        usedNonces[nonce] = true;

        uint256 fee = (grossAmount * FEE_BPS) / BPS_BASE;
        uint256 net  = grossAmount - fee;

        IWrappedToken(token).mint(recipient, net);
        if (fee > 0) IWrappedToken(token).mint(FEE_RECIPIENT, fee);

        emit BridgeIn(token, recipient, grossAmount, net, fee, nonce);
    }

    // ── Bridge OUT (Base → native) ────────────────────────────────────────────

    /**
     * @notice Burn wrapped tokens; relayer releases native tokens for `net` amount.
     *         Burns gross from user; mints fee to FEE_RECIPIENT on Base.
     *         Net supply change = -net (correct: fee stays on Base as wrapped tokens).
     *
     * @param token           Wrapped token address (e.g. wPEPE).
     * @param grossAmount     Amount the user wants to bridge out (fee deducted from this).
     * @param nativeRecipient Address on the native chain (string supports non-EVM formats).
     * @param nonce           Caller-provided unique nonce for replay protection.
     */
    function bridgeOut(
        address token,
        uint256 grossAmount,
        string calldata nativeRecipient,
        uint256 nonce
    ) external nonReentrant {
        require(supportedTokens[token], "UniversalBridge: token not supported");
        require(grossAmount > 0, "UniversalBridge: zero amount");
        require(bytes(nativeRecipient).length > 0, "UniversalBridge: empty recipient");
        require(!usedNonces[nonce], "UniversalBridge: nonce used");

        usedNonces[nonce] = true;

        uint256 fee = (grossAmount * FEE_BPS) / BPS_BASE;
        uint256 net  = grossAmount - fee;

        // Burn gross from sender; re-mint fee to treasury on Base
        IWrappedToken(token).burn(msg.sender, grossAmount);
        if (fee > 0) IWrappedToken(token).mint(FEE_RECIPIENT, fee);

        emit BridgeOut(token, msg.sender, nativeRecipient, grossAmount, net, fee, nonce);
    }
}
