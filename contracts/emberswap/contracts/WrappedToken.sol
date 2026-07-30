// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WrappedToken
 * @notice Generic bridge-controlled ERC-20 for any native token launched through EmberDelta.
 *         Deployed by the backend for each new project (e.g. wPEPE, wDOGE).
 *         Only the designated bridge contract may mint or burn tokens.
 */
contract WrappedToken is ERC20, Ownable {
    uint8 private _decimals;
    address public bridge;

    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);

    modifier onlyBridge() {
        require(msg.sender == bridge, "WrappedToken: caller is not the bridge");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address bridge_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(bridge_ != address(0), "WrappedToken: zero bridge address");
        _decimals = decimals_;
        bridge = bridge_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint tokens to a recipient after native tokens are locked/received.
    function mint(address to, uint256 amount) external onlyBridge {
        _mint(to, amount);
    }

    /// @notice Burn tokens from a holder when bridging back to the native chain.
    function burn(address from, uint256 amount) external onlyBridge {
        _burn(from, amount);
    }

    /// @notice Update the bridge contract address. Only owner.
    function setBridge(address newBridge) external onlyOwner {
        require(newBridge != address(0), "WrappedToken: zero address");
        emit BridgeUpdated(bridge, newBridge);
        bridge = newBridge;
    }
}
