# Dust Sweeper Submission Notes

Dust Sweeper is a local, non-custodial app for consolidating token dust into
native USDC. It combines OKX DEX / OnchainOS swap routing with Circle CCTP V2
native USDC bridging.

## Product

- Local Next.js UI.
- Shared TypeScript core for scan, filter, plan, execute, OKX, CCTP, and signing.
- MCP server for agent workflows.
- English and Chinese UI.
- Demo mode for users without imported keys.
- Live mode with local browser vault keys or `.env` keys.

## Current Route Model

- 21 chains modeled for native USDC / CCTP:
  Ethereum, Arbitrum, Base, Polygon, Optimism, Avalanche, Unichain, Linea,
  Sonic, Monad, Codex, Edge, HyperEVM, Ink, Morph, Pharos, Plume, Sei,
  World Chain, XDC, and Solana.
- Arbitrary-token dust swaps depend on OKX DEX / OnchainOS quote support.
- CCTP-only chains can move native USDC even when arbitrary dust swaps are not
  available there.

## Verification

```bash
pnpm --filter @dust-sweeper/core test
pnpm --filter @dust-sweeper/core build
pnpm --filter @dust-sweeper/mcp build
pnpm --filter web build
```

Latest local verification:

- Core tests: 79 passing.
- Core build: passing.
- MCP build: passing.
- Web build: passing.

See [README.md](README.md) for setup, screenshots, architecture, and safety notes.
