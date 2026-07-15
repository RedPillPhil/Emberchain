# Memory Index

- [Chain persistence layer](chain-persistence.md) — PostgreSQL primary + local file fallback; seeded from file on first boot; ephemeral deployed filesystem was the bug.
- [Browser mining architecture](browser-mining-architecture.md) — WebWorker PoW, template/submit API, hash compatibility with server, stale-template 409 retry flow.
- [EthereumJS SimpleStateManager for cheap persistence](ethereumjs-simplestatemanager-persistence.md) — checkpoint stack always returns to depth 1 after `runCall`, so index 0 is always canonical state.
- [ethereum-cryptography v3 secp256k1 API](ethereum-cryptography-secp256k1-api.md) — its bundled `@noble/curves` version differs from the workspace-hoisted one; API shapes are not interchangeable.
- [EthereumJS EVM.runCall for lightweight chains](ethereumjs-evm-runcall.md) — auto CREATE/CALL detection, nonce/value semantics, lets you skip building full RLP transactions.
- [Privacy pool blinding factor arithmetic](privacy-blinding-arithmetic.md) — correct way to balance Pedersen commitments across inputs/outputs/fee for the shielded pool.
- [Running TypeScript in this workspace](ts-execution-in-workspace.md) — use `pnpm dlx tsx` for one-off TS scripts; esbuild bundler handles extensionless imports at build time.
