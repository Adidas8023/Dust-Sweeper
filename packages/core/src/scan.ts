import type {
  Chain,
  DustInventory,
  DustToken,
  SweepSettings,
} from "./types.js";
import { CHAINS, SUPPORTED_CHAINS, hasCCTPSupport } from "./chains/index.js";
import { getHoldings } from "./okx/portfolio.js";
import { getQuote } from "./okx/dex.js";
import {
  applyNativeGasReserve,
  classifyToken,
  isDust,
  nativeGasBlockReason,
} from "./filter.js";
import { getEvmAddresses } from "./signing/evm.js";
import { getSolanaAddresses } from "./signing/svm.js";
import { buildDemoInventory, isDemoMode } from "./demo.js";
import { getUSDCBalanceForOwner } from "./cctp/evm.js";
import { getUSDCBalanceSolana } from "./cctp/svm.js";
import { formatUnits } from "viem";

// Ballpark gas cost estimates in USD for a single token swap on each chain.
// These feed isDust's economic-viability gate; live quotes refine at plan time.
const ESTIMATED_GAS_USD_BY_CHAIN: Record<Chain, number> = {
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

interface ScanCell {
  chain: Chain;
  owner: string;
  tokens: DustToken[];
  subtotalUSD: number;
  error?: string;
}

export async function scanDust(settings: SweepSettings): Promise<DustInventory> {
  if (isDemoMode()) return buildDemoInventory(settings);

  const evmAddresses = getEvmAddresses();
  const solanaAddresses = getSolanaAddresses();
  const requestedChains = settings.chains ?? SUPPORTED_CHAINS;
  const portfolioChains = requestedChains.filter(
    (chain) => CHAINS[chain].okxPortfolioSupported !== false
  );

  // Cartesian product: every (owner, chain) compatible pair.
  const pairs: Array<{ chain: Chain; owner: string }> = [];
  for (const chain of portfolioChains) {
    const isEVM = CHAINS[chain].isEVM;
    const owners = isEVM ? evmAddresses : solanaAddresses;
    for (const owner of owners) pairs.push({ chain, owner });
  }

  const portfolioCells: ScanCell[] = await Promise.all(
    pairs.map(async ({ chain, owner }) => {
      try {
        const raw = await getHoldings(owner, chain);
        const gasCost = ESTIMATED_GAS_USD_BY_CHAIN[chain];
        const dust: DustToken[] = [];

        for (const h of raw) {
          const category = classifyToken(chain, h.tokenAddress, h.symbol);
          const holding: DustToken = {
            owner,
            chain,
            address: h.tokenAddress,
            symbol: h.symbol,
            decimals: h.decimals,
            balance: h.balance,
            rawBalance: h.rawBalance,
            usdValue: h.valueUSD,
            priceUSD: h.priceUSD,
            category,
            needsApproval: category !== "native" && category !== "usdc",
            logoUrl: h.logoUrl,
          };
          const nativeBlock = nativeGasBlockReason(holding, settings, gasCost);
          if (nativeBlock) {
            if (shouldShowBlockedNative(holding, settings)) {
              dust.push({
                ...holding,
                routeStatus: "insufficient_gas",
                routeError: nativeBlock,
              });
            }
            continue;
          }

          const candidate: DustToken = applyNativeGasReserve(holding, settings);
          if (!candidate.rawBalance || candidate.rawBalance === "0") continue;
          if (!isDust(candidate, settings, gasCost)) {
            if (shouldShowUneconomic(candidate, settings, gasCost)) {
              dust.push({
                ...candidate,
                routeStatus: "insufficient_gas",
                routeError: `Below estimated gas budget (~$${formatUSD(gasCost * 1.5)})`,
              });
            }
            continue;
          }

          if (candidate.category === "usdc") {
            candidate.quoteToUSDC = Number(
              formatUnits(BigInt(candidate.rawBalance), candidate.decimals)
            );
            candidate.quoteSource = "direct";
            candidate.routeStatus = "ready";
            candidate.quoteUpdatedAt = Date.now();
            dust.push(candidate);
            continue;
          }

          // Liquidity probe — skip if OKX can't route the swap.
          try {
            const quote = await getQuote(
              chain,
              candidate.address,
              candidate.rawBalance
            );
            candidate.quoteToUSDC = Number(formatUnits(BigInt(quote.toAmount), 6));
            candidate.quoteSource = "okx";
            candidate.quotePriceImpactPct = quote.priceImpactPct;
            candidate.routeStatus = "ready";
            candidate.quoteUpdatedAt = Date.now();
            dust.push(candidate);
          } catch (e: any) {
            candidate.routeStatus = "unavailable";
            candidate.routeError = e?.message ?? String(e);
            dust.push(candidate);
          }
        }

        return {
          chain,
          owner,
          tokens: dust,
          subtotalUSD: dust.reduce((s, t) => s + t.usdValue, 0),
        };
      } catch (e: any) {
        return {
          chain,
          owner,
          tokens: [],
          subtotalUSD: 0,
          error: e.message ?? String(e),
        };
      }
    })
  );

  const nativeUsdcCells = await scanNativeUsdcBalances(
    requestedChains,
    evmAddresses,
    solanaAddresses,
    settings
  );

  const cells = [...portfolioCells, ...nativeUsdcCells];

  // Aggregate per-chain (across all owners) for the existing chain-level view.
  const byChain = new Map<Chain, { tokens: DustToken[]; subtotalUSD: number; errors: string[] }>();
  for (const cell of cells) {
    const acc = byChain.get(cell.chain) ?? { tokens: [], subtotalUSD: 0, errors: [] };
    acc.tokens.push(...cell.tokens);
    acc.subtotalUSD += cell.subtotalUSD;
    if (cell.error) acc.errors.push(`${shortAddr(cell.owner)}: ${cell.error}`);
    byChain.set(cell.chain, acc);
  }

  const chainsOut: DustInventory["chains"] = requestedChains.map((chain) => {
    const acc = byChain.get(chain) ?? { tokens: [], subtotalUSD: 0, errors: [] };
    const tokens = dedupeTokens(acc.tokens);
    return {
      chain,
      tokens,
      subtotalUSD: tokens.reduce((s, t) => s + t.usdValue, 0),
      ...(acc.errors.length ? { error: acc.errors.join("; ") } : {}),
    };
  });

  // Per-owner totals
  const ownerTotals = new Map<string, number>();
  for (const chain of chainsOut) {
    for (const token of chain.tokens) {
      ownerTotals.set(
        token.owner,
        (ownerTotals.get(token.owner) ?? 0) + token.usdValue
      );
    }
  }

  return {
    wallets: { evm: evmAddresses, solana: solanaAddresses },
    chains: chainsOut,
    byOwner: Array.from(ownerTotals.entries()).map(([owner, totalUSD]) => ({
      owner,
      totalUSD,
    })),
    grandTotalUSD: chainsOut.reduce((s, c) => s + c.subtotalUSD, 0),
    scannedAt: Date.now(),
  };
}

async function scanNativeUsdcBalances(
  chains: Chain[],
  evmAddresses: string[],
  solanaAddresses: string[],
  settings: SweepSettings
): Promise<ScanCell[]> {
  const pairs: Array<{ chain: Chain; owner: string }> = [];
  for (const chain of chains) {
    if (!hasCCTPSupport(chain)) continue;
    const owners = CHAINS[chain].isEVM ? evmAddresses : solanaAddresses;
    for (const owner of owners) pairs.push({ chain, owner });
  }

  return Promise.all(
    pairs.map(async ({ chain, owner }) => {
      try {
        const rawBalance = CHAINS[chain].isEVM
          ? await getUSDCBalanceForOwner(chain, owner)
          : await getUSDCBalanceSolana(owner);
        if (rawBalance <= 0n) {
          return { chain, owner, tokens: [], subtotalUSD: 0 };
        }

        const cfg = CHAINS[chain];
        const balance = trimDecimal(formatUnits(rawBalance, 6));
        const usdValue = Number(balance);
        const token: DustToken = {
          owner,
          chain,
          address: cfg.usdcAddress,
          symbol: "USDC",
          decimals: 6,
          balance,
          rawBalance: rawBalance.toString(),
          usdValue,
          priceUSD: 1,
          category: "usdc",
          needsApproval: false,
          quoteToUSDC: usdValue,
          quoteSource: "direct",
          routeStatus: "ready",
          quoteUpdatedAt: Date.now(),
        };

        if (!isDust(token, settings, ESTIMATED_GAS_USD_BY_CHAIN[chain])) {
          return { chain, owner, tokens: [], subtotalUSD: 0 };
        }

        return { chain, owner, tokens: [token], subtotalUSD: token.usdValue };
      } catch (e: any) {
        return {
          chain,
          owner,
          tokens: [],
          subtotalUSD: 0,
          error: `native USDC balance check failed: ${formatScanError(e)}`,
        };
      }
    })
  );
}

function dedupeTokens(tokens: DustToken[]): DustToken[] {
  const out = new Map<string, DustToken>();
  for (const token of tokens) {
    const key = `${token.owner}:${token.chain}:${token.address}`.toLowerCase();
    const existing = out.get(key);
    if (!existing) {
      out.set(key, token);
      continue;
    }
    if (!existing.logoUrl && token.logoUrl) {
      out.set(key, { ...existing, logoUrl: token.logoUrl });
    }
  }
  return [...out.values()];
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function shouldShowBlockedNative(token: DustToken, settings: SweepSettings): boolean {
  if (token.category !== "native" || !settings.includeNativeGas) return false;
  if (token.usdValue <= 0) return false;
  if ((settings.sweepScope ?? "dust") === "all") return true;
  return token.usdValue < settings.thresholdUSD;
}

function shouldShowUneconomic(
  token: DustToken,
  settings: SweepSettings,
  estimatedGasCostUSD: number
): boolean {
  if ((settings.sweepScope ?? "dust") === "all") return false;
  if (token.category === "native") return false;
  if (!categoryEnabledForScan(token, settings)) return false;
  if (isExcludedForScan(token, settings)) return false;
  if (token.usdValue <= 0 || token.usdValue >= settings.thresholdUSD) return false;
  return estimatedGasCostUSD * 1.5 >= token.usdValue;
}

function categoryEnabledForScan(token: DustToken, settings: SweepSettings): boolean {
  switch (token.category) {
    case "native":
      return settings.includeNativeGas;
    case "stable":
      return settings.includeStables;
    case "wrapped":
      return settings.includeWrapped;
    default:
      return true;
  }
}

function isExcludedForScan(token: DustToken, settings: SweepSettings): boolean {
  return settings.excludeAddresses
    .map((a) => a.toLowerCase())
    .includes(token.address.toLowerCase());
}

function trimDecimal(value: string): string {
  return value.replace(/\.?0+$/, "") || "0";
}

function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value > 0 && value < 0.01) return value.toFixed(4);
  return trimDecimal(value.toFixed(2));
}

function formatScanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (/user-specified gas exceeds provider limit/i.test(normalized)) {
    return "RPC rejected the balance check gas limit";
  }
  const detailsIndex = normalized.search(/\b(?:Contract Call|Docs:|Details:|Version:)\b/);
  const short = detailsIndex >= 0 ? normalized.slice(0, detailsIndex).trim() : normalized;
  return short.length > 220 ? `${short.slice(0, 217)}...` : short;
}
