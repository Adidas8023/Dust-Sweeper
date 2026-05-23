import type {
  Chain,
  DustInventory,
  DustToken,
  ProgressEvent,
  SweepPlan,
  SweepResult,
  SweepSettings,
} from "./types.js";
import { getRuntimeSignerKeys } from "./signing/runtime.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { isDust } from "./filter.js";

const runtimeDemoMode = new AsyncLocalStorage<boolean>();

export function withRuntimeDemoMode<T>(
  demoMode: boolean | undefined,
  fn: () => T
): T {
  if (demoMode === undefined) return fn();
  return runtimeDemoMode.run(demoMode, fn);
}

export function isDemoMode(): boolean {
  const requestOverride = runtimeDemoMode.getStore();
  if (requestOverride !== undefined) return requestOverride;
  if (process.env.DEMO_MODE === "0") return false;
  if (process.env.DEMO_MODE === "1") return true;
  // auto-enable if neither EVM nor Solana keys are present
  const runtime = getRuntimeSignerKeys();
  const hasEvm =
    runtime?.evm?.length || process.env.PRIVATE_KEY_EVM || process.env.PRIVATE_KEYS_EVM;
  const hasSol =
    runtime?.solana?.length || process.env.PRIVATE_KEY_SOL || process.env.PRIVATE_KEYS_SOL;
  return !hasEvm && !hasSol;
}

const DEMO_WALLET = {
  evm: "0xCAfe7d1deCAFe7d1deCAFe7d1deCAFe7d1de7c0F",
  solana: "DemoSo1DemoSo1DemoSo1DemoSo1DemoSo1DemoSo1abc",
};

const DEMO_GAS_USD_BY_CHAIN: Record<Chain, number> = {
  ethereum: 2.5,
  arbitrum: 0.1,
  base: 0.05,
  polygon: 0.02,
  optimism: 0.05,
  avalanche: 0.1,
  unichain: 0.05,
  linea: 0.1,
  sonic: 0.02,
  monad: 0.05,
  codex: 0.05,
  edge: 0.05,
  hyperevm: 0.05,
  ink: 0.05,
  morph: 0.05,
  pharos: 0.05,
  plume: 0.05,
  sei: 0.05,
  worldchain: 0.05,
  xdc: 0.05,
  solana: 0.002,
};

// Curated set of fake dust covering 8 chains, ~$47 total — matches our pitch deck.
// Logo URLs come straight from OKX onchainos `token info` endpoint (static.oklink.com)
// so demo and live mode share the same visual identity.
const OK = "https://static.oklink.com/cdn/web3/currency/token/large";
const DEMO_DUST: Array<Omit<DustToken, "needsApproval" | "owner">> = [
  // Ethereum
  { chain: "ethereum", address: "0x6982508145454ce325ddbe47a25d4ec3d2311933", symbol: "PEPE", decimals: 18, balance: "1234567", priceUSD: 0.0000034, usdValue: 4.2, category: "normal", logoUrl: `${OK}/1-0x6982508145454ce325ddbe47a25d4ec3d2311933-106/type=default_90_0` },
  { chain: "ethereum", address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", symbol: "SHIB", decimals: 18, balance: "8800000", priceUSD: 0.0000089, usdValue: 0.78, category: "normal", logoUrl: `${OK}/8453-0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce-110/type=default_90_0` },
  // Arbitrum
  { chain: "arbitrum", address: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", symbol: "GMX", decimals: 18, balance: "0.18", priceUSD: 25.6, usdValue: 4.6, category: "normal", logoUrl: `${OK}/42161-0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a-106/type=default_90_0` },
  { chain: "arbitrum", address: "0x539bde0d7dbd336b79148aa742883198bbf60342", symbol: "MAGIC", decimals: 18, balance: "12", priceUSD: 0.42, usdValue: 5.04, category: "normal", logoUrl: `${OK}/1-0xb0c7a3ba49c7a6eaba6cd4a96c55a1391070ac9a-106/type=default_90_0` },
  // Base
  { chain: "base", address: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", symbol: "DEGEN", decimals: 18, balance: "560", priceUSD: 0.012, usdValue: 6.72, category: "normal", logoUrl: `${OK}/8453-0x4ed4e862860bed51a9570b96d89af5e1b0efefed-106/type=default_90_0` },
  { chain: "base", address: "0x532f27101965dd16442e59d40670faf5ebb142e4", symbol: "BRETT", decimals: 18, balance: "32", priceUSD: 0.085, usdValue: 2.72, category: "normal", logoUrl: `${OK}/8453-0x532f27101965dd16442e59d40670faf5ebb142e4-106/type=default_90_0` },
  // Polygon
  { chain: "polygon", address: "0xb5c064f955d8e7f38fe0460c556a72987494ee17", symbol: "QUICK", decimals: 18, balance: "0.6", priceUSD: 4.9, usdValue: 2.94, category: "normal", logoUrl: `${OK}/137-0xb5c064f955d8e7f38fe0460c556a72987494ee17-106/type=default_90_0` },
  // Optimism
  { chain: "optimism", address: "0x9560e827af36c94d2ac33a39bce1fe78631088db", symbol: "VELO", decimals: 18, balance: "78", priceUSD: 0.058, usdValue: 4.52, category: "normal", logoUrl: `${OK}/10-0x9560e827af36c94d2ac33a39bce1fe78631088db-106/type=default_90_0` },
  // Avalanche
  { chain: "avalanche", address: "0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd", symbol: "JOE", decimals: 18, balance: "16", priceUSD: 0.31, usdValue: 4.96, category: "normal", logoUrl: `${OK}/43114-0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd-106/type=default_90_0` },
  // Solana
  { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", decimals: 5, balance: "120000", priceUSD: 0.000023, usdValue: 2.76, category: "normal", logoUrl: `${OK}/501-DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263-107/type=default_90_0` },
  { chain: "solana", address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", decimals: 6, balance: "1.2", priceUSD: 1.65, usdValue: 1.98, category: "normal", logoUrl: `${OK}/501-EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm-107/type=default_90_0` },
  // Linea
  { chain: "linea", address: "0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af", symbol: "FOX", decimals: 18, balance: "78", priceUSD: 0.07, usdValue: 5.46, category: "normal", logoUrl: `${OK}/59144-0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af-106/type=default_90_0` },
];

export function buildDemoInventory(settings: SweepSettings): DustInventory {
  const tokens: DustToken[] = DEMO_DUST.map((t) => {
    const n = Number(t.balance);
    const rawBalance = Number.isFinite(n)
      ? BigInt(Math.floor(n * 10 ** t.decimals)).toString()
      : "0";
    const owner = t.chain === "solana" ? DEMO_WALLET.solana : DEMO_WALLET.evm;
    return {
      ...t,
      owner,
      rawBalance,
      needsApproval: t.category !== "native",
      quoteToUSDC: t.usdValue,
      quoteSource: "demo" as const,
      quotePriceImpactPct: 0,
      quoteUpdatedAt: Date.now(),
    };
  }).filter((t) => isDust(t, settings, DEMO_GAS_USD_BY_CHAIN[t.chain]));
  const byChain = new Map<Chain, DustToken[]>();
  for (const t of tokens) {
    const arr = byChain.get(t.chain) ?? [];
    arr.push(t);
    byChain.set(t.chain, arr);
  }
  const chains: DustInventory["chains"] = Array.from(byChain.entries()).map(
    ([chain, tks]) => ({
      chain,
      tokens: tks,
      subtotalUSD: tks.reduce((s, t) => s + t.usdValue, 0),
    })
  );
  const ownerTotals = new Map<string, number>();
  for (const t of tokens) {
    ownerTotals.set(t.owner, (ownerTotals.get(t.owner) ?? 0) + t.usdValue);
  }
  return {
    wallets: { evm: [DEMO_WALLET.evm], solana: [DEMO_WALLET.solana] },
    chains,
    byOwner: Array.from(ownerTotals.entries()).map(([owner, totalUSD]) => ({
      owner,
      totalUSD,
    })),
    grandTotalUSD: chains.reduce((s, c) => s + c.subtotalUSD, 0),
    scannedAt: Date.now(),
  };
}

export async function runDemoExecution(
  plan: SweepPlan,
  onProgress: (e: ProgressEvent) => void
): Promise<SweepResult> {
  const txHashes: SweepResult["perChain"] = [];
  for (const cp of plan.perChain) {
    if (cp.willAccumulate) {
      txHashes.push({
        chain: cp.chain,
        owner: cp.owner,
        status: "skipped",
        txHashes: [],
        error: cp.skipReason,
      });
      continue;
    }
    onProgress({
      kind: "chain_start",
      chain: cp.chain,
      owner: cp.owner,
      timestamp: Date.now(),
    });
    const hashes: string[] = [];
    for (let i = 0; i < cp.steps.length; i++) {
      const step = cp.steps[i];
      onProgress({ kind: "step_start", chain: cp.chain, stepIdx: i, timestamp: Date.now() });

      if (step.kind === "cctp_burn") {
        // Emit the full burn → attest → mint ceremony with realistic timing.
        const burnTx = `0xDEMO${cp.chain.slice(0, 3)}burn${Math.random().toString(16).slice(2, 8)}`;
        await sleep(400);
        onProgress({ kind: "cctp_burn_sent", chain: cp.chain, stepIdx: i, txHash: burnTx, timestamp: Date.now() });
        await sleep(700);
        onProgress({ kind: "cctp_burn_confirmed", chain: cp.chain, stepIdx: i, txHash: burnTx, timestamp: Date.now() });
        onProgress({ kind: "cctp_attestation_pending", chain: cp.chain, stepIdx: i, timestamp: Date.now() });
        await sleep(1100 + Math.random() * 600);
        onProgress({ kind: "cctp_attestation_received", chain: cp.chain, stepIdx: i, timestamp: Date.now() });
        const mintTx = `0xDEMO${cp.chain.slice(0, 3)}mint${Math.random().toString(16).slice(2, 8)}`;
        onProgress({ kind: "cctp_mint_sent", chain: cp.chain, stepIdx: i, timestamp: Date.now() });
        await sleep(500);
        onProgress({ kind: "cctp_mint_confirmed", chain: cp.chain, stepIdx: i, txHash: mintTx, timestamp: Date.now() });
        hashes.push(`${burnTx}:${mintTx}`);
        onProgress({
          kind: "step_success",
          chain: cp.chain,
          stepIdx: i,
          txHash: `${burnTx}:${mintTx}`,
          timestamp: Date.now(),
        });
      } else {
        await sleep(180 + Math.random() * 220);
        const fake = `0xDEMO${cp.chain.slice(0, 3)}${step.kind.slice(0, 3)}${Math.random().toString(16).slice(2, 8)}`;
        hashes.push(fake);
        onProgress({
          kind: "step_success",
          chain: cp.chain,
          stepIdx: i,
          txHash: fake,
          timestamp: Date.now(),
        });
      }
    }
    onProgress({
      kind: "chain_complete",
      chain: cp.chain,
      owner: cp.owner,
      timestamp: Date.now(),
    });
    txHashes.push({
      chain: cp.chain,
      owner: cp.owner,
      status: "success",
      txHashes: hashes,
      receivedUSDC: cp.estimatedReceiveUSDC,
    });
  }
  onProgress({ kind: "sweep_complete", timestamp: Date.now() });
  return {
    planId: `demo-${Date.now().toString(36)}`,
    status: "success",
    perChain: txHashes,
    totalReceivedUSDC: txHashes.reduce((s, r) => s + (r.receivedUSDC ?? 0), 0),
    completedAt: Date.now(),
  };
}

function sleep(ms: number) {
  const scale = Number(process.env.DEMO_EXECUTION_DELAY_SCALE ?? "1");
  const delay = Number.isFinite(scale) ? Math.max(0, Math.floor(ms * scale)) : ms;
  return new Promise((r) => setTimeout(r, delay));
}
