// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EmberDelta
 * @notice EtherDelta-style off-chain order book DEX on Base.
 *
 * Orders are created and signed off-chain (EIP-712). The on-chain contract
 * handles deposits, withdrawals, order settlement, and cancellation.
 *
 * ETH is represented as address(0) throughout.
 * Primary pair: wEMBR (ERC-20) / ETH.
 *
 * Order semantics:
 *   tokenGet  = token the maker wants to receive
 *   amountGet = amount the maker wants to receive (for the full order)
 *   tokenGive = token the maker is offering
 *   amountGive= amount the maker is offering (for the full order)
 *   expires   = block number after which order is invalid
 *   nonce     = per-user uniqueness value chosen by maker
 *
 * Trade semantics:
 *   amount = how much of tokenGet the taker delivers (and maker receives)
 *   The taker receives (amount * amountGive / amountGet) of tokenGive.
 *   A protocol fee (feeBps) is charged on top of `amount` from the taker.
 */
contract EmberDelta is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ---- State ----

    /// Protocol fee in basis points. Default 30 = 0.3%.
    uint256 public feeBps = 30;
    uint256 public constant MAX_FEE_BPS = 100; // 1% hard cap

    /// Address that accumulates protocol fees.
    address public feeAccount;

    /// token => user => deposited balance
    mapping(address => mapping(address => uint256)) public tokens;

    /// orderHash => cumulative amount of tokenGet already filled
    mapping(bytes32 => uint256) public orderFills;

    /// orderHash => whether the maker has cancelled this order
    mapping(bytes32 => bool) public cancelledOrders;

    // EIP-712 ---------------------------------------------------------------

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address tokenGet,uint256 amountGet,address tokenGive,uint256 amountGive,uint256 expires,uint256 nonce,address user)"
    );

    // Launch requests -------------------------------------------------------

    /// Fee (in ETH wei) to submit a launch request. Default 0.02 ETH.
    uint256 public launchFee = 0.02 ether;

    struct LaunchRequest {
        address requester;
        string  tokenName;
        string  nativeChain;
        string  chainType;    // "evm" | "pow"
        string  rpcUrl;       // for EVM chains
        string  description;
        uint256 timestamp;
        bool    approved;
    }

    LaunchRequest[] public launchRequests;

    // ---- Events ----

    event Deposit(address indexed token, address indexed user, uint256 amount, uint256 balance);
    event Withdraw(address indexed token, address indexed user, uint256 amount, uint256 balance);
    event Order(
        address indexed tokenGet, uint256 amountGet,
        address indexed tokenGive, uint256 amountGive,
        uint256 expires, uint256 nonce,
        address indexed user
    );
    event Cancel(
        address indexed tokenGet, uint256 amountGet,
        address indexed tokenGive, uint256 amountGive,
        uint256 expires, uint256 nonce,
        address indexed user, bytes32 hash
    );
    event Trade(
        address indexed tokenGet, uint256 amountGet,
        address indexed tokenGive, uint256 amountGive,
        address indexed taker, address maker,
        bytes32 orderHash
    );
    event LaunchRequestSubmitted(
        uint256 indexed id,
        address indexed requester,
        string tokenName,
        string nativeChain
    );
    event LaunchRequestApproved(uint256 indexed id);
    event FeeUpdated(uint256 newFeeBps);
    event LaunchFeeUpdated(uint256 newLaunchFee);

    // ---- Constructor ----

    constructor(address _feeAccount) Ownable(msg.sender) {
        require(_feeAccount != address(0), "Zero fee account");
        feeAccount = _feeAccount;

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            ),
            keccak256("EmberDelta"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // Allow direct ETH deposits via plain transfer
    receive() external payable {
        _depositETH(msg.sender, msg.value);
    }

    // ---- Deposit / Withdraw ----

    function deposit() external payable nonReentrant {
        _depositETH(msg.sender, msg.value);
    }

    function _depositETH(address user, uint256 amount) internal {
        tokens[address(0)][user] += amount;
        emit Deposit(address(0), user, amount, tokens[address(0)][user]);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(tokens[address(0)][msg.sender] >= amount, "Insufficient ETH balance");
        tokens[address(0)][msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Withdraw(address(0), msg.sender, amount, tokens[address(0)][msg.sender]);
    }

    function depositToken(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Use deposit() for ETH");
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 credited = IERC20(token).balanceOf(address(this)) - before;
        tokens[token][msg.sender] += credited;
        emit Deposit(token, msg.sender, credited, tokens[token][msg.sender]);
    }

    function withdrawToken(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Use withdraw() for ETH");
        require(tokens[token][msg.sender] >= amount, "Insufficient token balance");
        tokens[token][msg.sender] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(token, msg.sender, amount, tokens[token][msg.sender]);
    }

    function balanceOf(address token, address user) external view returns (uint256) {
        return tokens[token][user];
    }

    // ---- Order hash ----

    function orderHash(
        address tokenGet,
        uint256 amountGet,
        address tokenGive,
        uint256 amountGive,
        uint256 expires,
        uint256 nonce,
        address user
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            ORDER_TYPEHASH,
            tokenGet, amountGet,
            tokenGive, amountGive,
            expires, nonce, user
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    // ---- Cancel ----

    function cancelOrder(
        address tokenGet,
        uint256 amountGet,
        address tokenGive,
        uint256 amountGive,
        uint256 expires,
        uint256 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        bytes32 hash = orderHash(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, msg.sender);
        require(_isValidSig(hash, msg.sender, v, r, s), "Invalid signature");
        cancelledOrders[hash] = true;
        emit Cancel(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, msg.sender, hash);
    }

    // ---- Trade ----

    /**
     * @param amount Amount of tokenGet the taker is delivering (and maker receives).
     *               The taker also pays a fee on top of this amount.
     *               The taker receives (amount * amountGive / amountGet) of tokenGive.
     */
    function trade(
        address tokenGet,
        uint256 amountGet,
        address tokenGive,
        uint256 amountGive,
        uint256 expires,
        uint256 nonce,
        address user,
        uint8 v, bytes32 r, bytes32 s,
        uint256 amount
    ) external nonReentrant {
        bytes32 hash = orderHash(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, user);

        require(!cancelledOrders[hash],           "Order cancelled");
        require(block.number <= expires,          "Order expired");
        require(_isValidSig(hash, user, v, r, s), "Invalid signature");
        require(orderFills[hash] + amount <= amountGet, "Overfill");

        _settle(tokenGet, amountGet, tokenGive, amountGive, user, msg.sender, amount, hash);
    }

    function _settle(
        address tokenGet,
        uint256 amountGet,
        address tokenGive,
        uint256 amountGive,
        address maker,
        address taker,
        uint256 amount,
        bytes32 hash
    ) internal {
        uint256 tokenGiveAmount = (amount * amountGive) / amountGet;
        uint256 fee             = (amount * feeBps) / 10_000;

        require(tokens[tokenGet][taker]  >= amount + fee,     "Taker: insufficient tokenGet");
        require(tokens[tokenGive][maker] >= tokenGiveAmount,  "Maker: insufficient tokenGive");

        // tokenGet: taker → maker (taker also pays fee → feeAccount)
        tokens[tokenGet][taker]       -= amount + fee;
        tokens[tokenGet][maker]       += amount;
        tokens[tokenGet][feeAccount]  += fee;

        // tokenGive: maker → taker
        tokens[tokenGive][maker]  -= tokenGiveAmount;
        tokens[tokenGive][taker]  += tokenGiveAmount;

        orderFills[hash] += amount;

        emit Trade(tokenGet, amount, tokenGive, tokenGiveAmount, taker, maker, hash);
    }

    // ---- View helpers ----

    function isValidSignature(
        bytes32 hash, address signer, uint8 v, bytes32 r, bytes32 s
    ) external pure returns (bool) {
        return _isValidSig(hash, signer, v, r, s);
    }

    function _isValidSig(
        bytes32 hash, address signer, uint8 v, bytes32 r, bytes32 s
    ) internal pure returns (bool) {
        address recovered = ecrecover(hash, v, r, s);
        return recovered != address(0) && recovered == signer;
    }

    /**
     * @notice Returns the remaining fillable amount for an order (in tokenGet units),
     *         accounting for cancellation, expiry, maker balance, and existing fills.
     */
    function availableVolume(
        address tokenGet,
        uint256 amountGet,
        address tokenGive,
        uint256 amountGive,
        uint256 expires,
        uint256 nonce,
        address user,
        uint8 v, bytes32 r, bytes32 s
    ) external view returns (uint256) {
        bytes32 hash = orderHash(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, user);
        if (cancelledOrders[hash])                  return 0;
        if (block.number > expires)                 return 0;
        if (!_isValidSig(hash, user, v, r, s))     return 0;

        uint256 fillable   = amountGet - orderFills[hash];
        uint256 makerBal   = tokens[tokenGive][user];
        // Convert maker balance into tokenGet units
        uint256 makerCap   = (makerBal * amountGet) / amountGive;
        return fillable < makerCap ? fillable : makerCap;
    }

    // ---- Launch request ----

    function submitLaunchRequest(
        string calldata tokenName,
        string calldata nativeChain,
        string calldata chainType,
        string calldata rpcUrl,
        string calldata description
    ) external payable nonReentrant {
        require(msg.value >= launchFee, "Insufficient launch fee");

        // Refund any excess
        uint256 excess = msg.value - launchFee;
        if (excess > 0) {
            (bool refund, ) = msg.sender.call{value: excess}("");
            require(refund, "Refund failed");
        }

        // Forward fee
        (bool sent, ) = feeAccount.call{value: launchFee}("");
        require(sent, "Fee transfer failed");

        uint256 id = launchRequests.length;
        launchRequests.push(LaunchRequest({
            requester:   msg.sender,
            tokenName:   tokenName,
            nativeChain: nativeChain,
            chainType:   chainType,
            rpcUrl:      rpcUrl,
            description: description,
            timestamp:   block.timestamp,
            approved:    false
        }));

        emit LaunchRequestSubmitted(id, msg.sender, tokenName, nativeChain);
    }

    function getLaunchRequestCount() external view returns (uint256) {
        return launchRequests.length;
    }

    function approveLaunchRequest(uint256 id) external onlyOwner {
        require(id < launchRequests.length, "Invalid ID");
        launchRequests[id].approved = true;
        emit LaunchRequestApproved(id);
    }

    // ---- Admin ----

    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeAccount(address _feeAccount) external onlyOwner {
        require(_feeAccount != address(0), "Zero address");
        feeAccount = _feeAccount;
    }

    function setLaunchFee(uint256 _launchFee) external onlyOwner {
        launchFee = _launchFee;
        emit LaunchFeeUpdated(_launchFee);
    }
}
