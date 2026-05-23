---
name: dust-sweeper
description: Scan dust tokens across supported EVM chains and Solana on one or many wallets, then consolidate them into native USDC on a target chain via OKX DEX / OnchainOS and Circle CCTP V2. Trigger on 归集, dust, 小额代币, sweep, consolidate small balances, clean up wallet, multi-wallet sweep, or requests to convert leftover tokens into a single stablecoin.
---

# Dust Sweeper

## Prerequisites
The user's dust-sweeper project `.env` must be configured with:
- **EVM signers** — either `PRIVATE_KEY_EVM` (single wallet, legacy) **or** `PRIVATE_KEYS_EVM` (comma-separated for multi-wallet). Multi-key takes precedence when both are set.
- **Solana signers** — either `PRIVATE_KEY_SOL` (single, base58) **or** `PRIVATE_KEYS_SOL` (comma-separated base58). Required if Solana is source or destination.
- OKX Web3 API credentials: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `OKX_PROJECT_ID`.

Solana is fully supported bidirectionally on every configured wallet.

If the user asks to sweep before these are configured, explain which env vars are missing and point them to `.env.example`.

## Workflow

1. **Scan** — Call `scan_dust`. Default settings stay conservative:
   - `thresholdUSD: 5`, all opt-in categories OFF.
   - If the user says "aggressive", "sweep everything", or names categories, enable `includeNativeGas`, `includeStables`, or `includeWrapped`.
   - The returned `DustInventory` carries:
     - `wallets.evm[]` / `wallets.solana[]` — every address that was scanned
     - `chains[].tokens[]` — each token tagged with `owner` (source wallet)
     - `byOwner[]` — per-wallet totals
   - Present results grouped by chain with per-chain subtotals **and** by owner when more than one wallet is configured. Show a masked owner column (e.g. `0xabcd…1234`) so the user can sanity-check the address list before continuing.

2. **Pick destination chain** — Ask which chain to consolidate USDC on. Default suggestion: the chain with the largest dust balance (reduces bridge legs).

3. **Pick aggregation mode** — Ask the user how multi-wallet dust should land:
   - `per-wallet` (default, also the only sensible choice when one wallet is configured) — each wallet's USDC mints back to itself on the destination chain.
   - `unified` — all wallets' USDC mints to a **single** recipient address.
     - If destination is an EVM chain, ask for `recipientEvm` (`0x…`).
     - If destination is Solana, ask for `recipientSolana` (base58).
     - Reject with a clear error if the recipient family doesn't match the destination chain.
   - **Always echo the recipient back to the user for confirmation before planning.** A typo here sends the entire sweep to the wrong wallet.

4. **Plan** — Call `plan_sweep` with the inventory, chosen `destChain`, `aggregationMode`, and `recipientEvm`/`recipientSolana` if unified.
   - Present the cost estimate as a table grouped by `(owner, chain)`: per-row gas cost and expected USDC received.
   - Flag any `(owner, chain)` row where `willAccumulate === true` — that USDC stays on source (below CCTP minimum or CCTP not yet supported on that pair).

5. **Confirm** — Wait for explicit user confirmation. Restate aggregation mode and destination address one more time before execution. Never auto-execute.

6. **Execute** — Call `execute_sweep`. The tool returns the `SweepResult` plus event stream; report `(owner, chain)` status and tx hashes.

## Safety rules
- Always show estimated cost before execution.
- Warn if grand total < $10 (gas may eat >50% of value).
- Never execute without explicit user confirmation ("yes", "confirm", "execute", "go ahead").
- When more than one EVM/Solana key is configured, **always show the full address list** before scanning so the user can spot a stray key.
- In `unified` mode, **double-confirm the recipient address** — wrong recipient = funds are sent to a wallet the user may not control.
- If the chosen `recipientEvm` is in `wallets.evm` (or `recipientSolana` in `wallets.solana`), call that out — the user may have meant `per-wallet` mode.
- If `PRIVATE_KEY_SOL`/`PRIVATE_KEYS_SOL` is missing and the user selects Solana as source or dest, explain the env var must be set (base58 secret key).
- Native gas opt-in keeps `gasReserveUSD` of native balance behind on each wallet — mention this explicitly when user enables it.
