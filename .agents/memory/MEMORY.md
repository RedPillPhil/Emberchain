# Memory Index

- [EthereumJS SimpleStateManager for cheap persistence](ethereumjs-simplestatemanager-persistence.md) — checkpoint stack always returns to depth 1 after `runCall`, so index 0 is always canonical state.
- [ethereum-cryptography v3 secp256k1 API](ethereum-cryptography-secp256k1-api.md) — its bundled `@noble/curves` version differs from the workspace-hoisted one; API shapes are not interchangeable.
- [EthereumJS EVM.runCall for lightweight chains](ethereumjs-evm-runcall.md) — auto CREATE/CALL detection, nonce/value semantics, lets you skip building full RLP transactions.
