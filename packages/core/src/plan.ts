import type {
  AggregationMode,
  Chain,
  ChainPlan,
  DustInventory,
  DustToken,
  SweepPlan,
  SweepSettings,
  SweepStep,
} from "./types.js";
import { CHAINS, hasCCTPSupport } from "./chains/index.js";
import { estimateUSDCBridgeWithBridgeKit } from "./cctp/bridge-kit.js";
import { parseUnits } from "viem";

const SLIPPAGE_PCT = 0.01;
const CCTP_STANDARD_PROTOCOL_FEE_USDC = 0;

const ESTIMATED_GAS_PER_STEP: Record<Chain, number> = {
  ethereum: 3,
  arbitrum: 0.05,
  base: 0.03,
  polygon: 0.01,
  optimism: 0.03,
  avalanche: 0.05,
  unichain: 0.03,
  linea: 0.05,
  sonic: 0.01,
  monad: 0.02,
  codex: 0.03,
  edge: 0.03,
  hyperevm: 0.02,
  ink: 0.03,
  morph: 0.03,
  pharos: 0.03,
  plume: 0.03,
  sei: 0.03,
  worldchain: 0.03,
  xdc: 0.03,
  solana: 0.002,
};

export interface PlanOptions {
  aggregationMode?: AggregationMode;
  recipientEvm?: string;
  recipientSolana?: string;
  destinationPayerEvm?: string;
  destinationPayerSolana?: string;
  /**
   * Frontend planning mode: fail before burn if there is no explicit mint payer.
   * Legacy callers can omit this and use the first scanned signer as fallback.
   */
  requireDestinationPayer?: boolean;
}

const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Build a sweep plan. Settings can carry aggregationMode + recipient (preferred);
 * the legacy `(inv, destChain)` signature still works for single-wallet callers.
 */
export function planSweep(
  inv: DustInventory,
  destChain: Chain,
  options: PlanOptions | SweepSettings = {}
): SweepPlan {
  const aggregationMode: AggregationMode =
    options.aggregationMode ?? "per-wallet";
  const destIsEVM = CHAINS[destChain].isEVM;

  if (aggregationMode === "unified") {
    if (destIsEVM) {
      if (!options.recipientEvm)
        throw new Error("unified mode + EVM destination requires recipientEvm");
      if (!EVM_ADDR_RE.test(options.recipientEvm))
        throw new Error(`recipientEvm not a valid EVM address: ${options.recipientEvm}`);
    } else {
      if (!options.recipientSolana)
        throw new Error("unified mode + Solana destination requires recipientSolana");
      if (!BASE58_RE.test(options.recipientSolana))
        throw new Error(`recipientSolana not a valid base58 address: ${options.recipientSolana}`);
    }
  }

  // Group dust by (owner, chain).
  const byOwnerChain = new Map<string, DustToken[]>();
  for (const c of inv.chains) {
    for (const t of c.tokens) {
      const key = `${t.owner}::${c.chain}`;
      const arr = byOwnerChain.get(key) ?? [];
      arr.push(t);
      byOwnerChain.set(key, arr);
    }
  }

  const perChain: ChainPlan[] = [];
  for (const [key, tokens] of byOwnerChain.entries()) {
    if (tokens.length === 0) continue;
    const [owner, chain] = key.split("::") as [string, Chain];
    const subtotalUSD = tokens.reduce((s, t) => s + t.usdValue, 0);
    const recipient =
      aggregationMode === "unified"
        ? destIsEVM
          ? options.recipientEvm!
          : options.recipientSolana!
        : owner; // per-wallet: USDC mints back to source wallet
    perChain.push(
      buildChainPlan(chain, owner, tokens, subtotalUSD, destChain, recipient)
    );
  }

  const needsDestinationPayer = perChain.some((cp) =>
    cp.steps.some((s) => s.kind === "cctp_burn")
  );
  const destinationPayer = resolveDestinationPayer(
    inv,
    destChain,
    options,
    needsDestinationPayer
  );
  if (destinationPayer) {
    for (const cp of perChain) {
      for (const step of cp.steps) {
        if (step.kind === "cctp_burn") {
          step.details.destinationPayer = destinationPayer;
        }
      }
    }
  }

  const totalInputUSD = perChain.reduce((s, p) => s + (p.inputUSD ?? 0), 0);
  const totalSwapOutputUSDC = perChain.reduce(
    (s, p) => s + (p.swapOutputUSDC ?? p.estimatedReceiveUSDC),
    0
  );
  const totalRouteImpactUSD = perChain.reduce(
    (s, p) => s + (p.routeImpactUSD ?? 0),
    0
  );
  const totalCctpProtocolFeeUSDC = perChain.reduce(
    (s, p) => s + (p.cctpProtocolFeeUSDC ?? 0),
    0
  );
  const totalGasUSD = perChain.reduce((s, p) => s + p.estimatedCostUSD, 0);

  return {
    destChain,
    aggregationMode,
    destinationPayer,
    perChain,
    totalCostUSD: totalGasUSD,
    totalReceiveUSDC: perChain.reduce((s, p) => s + p.estimatedReceiveUSDC, 0),
    totalInputUSD,
    totalSwapOutputUSDC,
    totalRouteImpactUSD,
    totalCctpProtocolFeeUSDC,
    totalGasUSD,
    quoteSource: mergeQuoteSources(perChain.map((p) => p.quoteSource)),
    createdAt: Date.now(),
  };
}

export async function enrichPlanWithBridgeKitEstimates(
  plan: SweepPlan
): Promise<SweepPlan> {
  const next: SweepPlan = {
    ...plan,
    perChain: plan.perChain.map((cp) => ({
      ...cp,
      steps: cp.steps.map((step) => ({
        ...step,
        details: { ...step.details },
      })),
    })),
  };

  for (const cp of next.perChain) {
    const burn = cp.steps.find((s) => s.kind === "cctp_burn");
    if (!burn || cp.willAccumulate || !next.destinationPayer) continue;
    try {
      const amountUSDC = amountString(cp.swapOutputUSDC ?? cp.estimatedReceiveUSDC);
      const estimate = await estimateUSDCBridgeWithBridgeKit({
        sourceChain: cp.chain,
        destChain: next.destChain,
        sourceOwner: cp.owner,
        destinationPayer: next.destinationPayer,
        mintRecipient: cp.mintRecipient,
        amountUSDC,
      });
      cp.cctpProtocolFeeUSDC = estimate.cctpProtocolFeeUSDC;
      cp.estimatedReceiveUSDC = Math.max(
        0,
        (cp.swapOutputUSDC ?? cp.estimatedReceiveUSDC) -
          estimate.cctpProtocolFeeUSDC
      );
      burn.details.bridgeProvider = "circle-bridge-kit";
      burn.details.bridgeFeeSource = "bridge-kit";
      burn.details.cctpProtocolFeeUSDC = estimate.cctpProtocolFeeUSDC;
      burn.details.bridgeKitFees = estimate.fees;
      burn.details.bridgeKitGasFees = estimate.gasFees;
    } catch (e: any) {
      burn.details.bridgeProvider = "circle-bridge-kit";
      burn.details.bridgeFeeSource = "fallback";
      burn.details.bridgeEstimateError = e?.message ?? String(e);
    }
  }

  next.totalCctpProtocolFeeUSDC = next.perChain.reduce(
    (sum, cp) => sum + (cp.cctpProtocolFeeUSDC ?? 0),
    0
  );
  next.totalReceiveUSDC = next.perChain.reduce(
    (sum, cp) => sum + cp.estimatedReceiveUSDC,
    0
  );
  return next;
}

function amountString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function resolveDestinationPayer(
  inv: DustInventory,
  destChain: Chain,
  options: PlanOptions | SweepSettings,
  needsDestinationPayer: boolean
): string | undefined {
  if (!needsDestinationPayer) return undefined;

  const planOptions = options as PlanOptions;
  const destIsEVM = CHAINS[destChain].isEVM;
  if (destIsEVM) {
    const candidate =
      planOptions.destinationPayerEvm ??
      (!planOptions.requireDestinationPayer ? inv.wallets.evm[0] : undefined);
    if (!candidate) {
      throw new Error(
        "CCTP mint on EVM destination requires destinationPayerEvm"
      );
    }
    if (!EVM_ADDR_RE.test(candidate)) {
      throw new Error(
        `destinationPayerEvm not a valid EVM address: ${candidate}`
      );
    }
    if (!hasAddress(inv.wallets.evm, candidate)) {
      throw new Error(
        `destinationPayerEvm must be one of the scanned EVM signer wallets: ${candidate}`
      );
    }
    return candidate;
  }

  const candidate =
    planOptions.destinationPayerSolana ??
    (!planOptions.requireDestinationPayer ? inv.wallets.solana[0] : undefined);
  if (!candidate) {
    throw new Error(
      "CCTP mint on Solana destination requires destinationPayerSolana"
    );
  }
  if (!BASE58_RE.test(candidate)) {
    throw new Error(
      `destinationPayerSolana not a valid base58 address: ${candidate}`
    );
  }
  if (!hasAddress(inv.wallets.solana, candidate)) {
    throw new Error(
      `destinationPayerSolana must be one of the scanned Solana signer wallets: ${candidate}`
    );
  }
  return candidate;
}

function hasAddress(addresses: string[], candidate: string): boolean {
  return addresses.some((a) => a.toLowerCase() === candidate.toLowerCase());
}

function buildChainPlan(
  chain: Chain,
  owner: string,
  tokens: DustToken[],
  subtotalUSD: number,
  destChain: Chain,
  mintRecipient: string
): ChainPlan {
  const gasPerStep = ESTIMATED_GAS_PER_STEP[chain];
  const steps: SweepStep[] = [];
  let swapOutputUSDC = 0;
  const quoteSources: Array<"okx" | "demo" | "fallback" | "direct"> = [];
  let directUsdcRaw = 0n;

  for (const t of tokens) {
    if (t.routeStatus === "unavailable") {
      throw new Error(
        `${t.symbol} on ${chain} has no route to native USDC: ${
          t.routeError ?? "OKX quote unavailable"
        }`
      );
    }
    if (t.routeStatus === "insufficient_gas") {
      throw new Error(
        `${t.symbol} on ${chain} cannot be swept: ${
          t.routeError ?? "insufficient native gas"
        }`
      );
    }
    if (isDirectUsdcToken(t)) {
      const directAmount = directUsdcAmount(t);
      swapOutputUSDC += directAmount;
      directUsdcRaw += rawAmountForToken(t);
      quoteSources.push("direct");
      continue;
    }

    const quote = quoteForToken(t);
    const estimatedReceiveUSDC = quote.toUSDC * (1 - SLIPPAGE_PCT);
    swapOutputUSDC += estimatedReceiveUSDC;
    quoteSources.push(quote.source);
    if (t.needsApproval) {
      steps.push({
        kind: "approve",
        chain,
        owner,
        token: t,
        estimatedGasUSD: gasPerStep,
        details: {},
      });
    }
    steps.push({
      kind: "swap",
      chain,
      owner,
      token: t,
      estimatedGasUSD: gasPerStep,
      estimatedReceiveUSDC,
      details: {
        slippagePct: SLIPPAGE_PCT,
        quoteSource: quote.source,
        quoteToUSDC: quote.toUSDC,
      },
    });
  }

  const expectedUSDC = swapOutputUSDC;
  const routeImpactUSD = Math.max(0, subtotalUSD - expectedUSDC);
  const isSameChain = chain === destChain;
  // unified mode crossing EVM↔Solana also needs a bridge even when source==dest
  // chain semantically; CCTP only kicks in when source !== dest, so for
  // same-chain unified the recipient receives directly via swap output.
  const hasCCTP = hasCCTPSupport(chain) && hasCCTPSupport(destChain);
  const needsBridge = !isSameChain;
  const willAccumulate = needsBridge && !hasCCTP;

  let skipReason: string | undefined;
  if (willAccumulate) {
    skipReason = "CCTP not yet available on source or destination chain";
  }

  if (needsBridge && !willAccumulate) {
    steps.push({
      kind: "cctp_burn",
      chain,
      owner,
      estimatedGasUSD: gasPerStep,
      estimatedReceiveUSDC: expectedUSDC,
      details: {
        destChain,
        mintRecipient,
        directUsdcRaw: directUsdcRaw.toString(),
        cctpProtocolFeeUSDC: CCTP_STANDARD_PROTOCOL_FEE_USDC,
        finality: "standard",
      },
    });
  }

  if (
    isSameChain &&
    expectedUSDC > 0 &&
    !sameAddress(owner, mintRecipient)
  ) {
    steps.push({
      kind: "usdc_transfer",
      chain,
      owner,
      estimatedGasUSD: gasPerStep,
      estimatedReceiveUSDC: expectedUSDC,
      details: {
        mintRecipient,
        directUsdcRaw: directUsdcRaw.toString(),
      },
    });
  }

  const receiveUSDC = isSameChain
    ? expectedUSDC
    : willAccumulate
      ? 0
      : Math.max(0, expectedUSDC - CCTP_STANDARD_PROTOCOL_FEE_USDC);

  return {
    chain,
    owner,
    mintRecipient,
    steps,
    estimatedCostUSD: steps.reduce((s, x) => s + x.estimatedGasUSD, 0),
    estimatedReceiveUSDC: receiveUSDC,
    inputUSD: subtotalUSD,
    swapOutputUSDC,
    routeImpactUSD,
    cctpProtocolFeeUSDC:
      needsBridge && !willAccumulate ? CCTP_STANDARD_PROTOCOL_FEE_USDC : 0,
    quoteSource: mergeQuoteSources(quoteSources),
    routeKind: routeKindFor({
      steps,
      willAccumulate,
      expectedUSDC,
      isSameChain,
      sameRecipient: sameAddress(owner, mintRecipient),
    }),
    willAccumulate,
    skipReason,
  };
}

function routeKindFor({
  steps,
  willAccumulate,
  expectedUSDC,
  isSameChain,
  sameRecipient,
}: {
  steps: SweepStep[];
  willAccumulate: boolean;
  expectedUSDC: number;
  isSameChain: boolean;
  sameRecipient: boolean;
}): NonNullable<ChainPlan["routeKind"]> {
  if (willAccumulate) return "unsupported";
  const hasSwap = steps.some((s) => s.kind === "swap");
  const hasCctp = steps.some((s) => s.kind === "cctp_burn");
  const hasTransfer = steps.some((s) => s.kind === "usdc_transfer");
  if (hasCctp) return hasSwap ? "swap_then_cctp" : "cctp_only";
  if (hasSwap) return "local_swap";
  if (hasTransfer) return "local_transfer";
  if (isSameChain && sameRecipient && expectedUSDC > 0) return "local_usdc";
  return "unsupported";
}

function quoteForToken(t: DustToken): {
  toUSDC: number;
  source: "okx" | "demo" | "fallback" | "direct";
} {
  if (typeof t.quoteToUSDC === "number" && Number.isFinite(t.quoteToUSDC)) {
    return {
      toUSDC: Math.max(0, t.quoteToUSDC),
      source: t.quoteSource ?? "okx",
    };
  }
  return { toUSDC: t.usdValue, source: "fallback" };
}

function mergeQuoteSources(
  sources: Array<
    "okx" | "demo" | "fallback" | "direct" | "mixed" | undefined
  >
): "okx" | "demo" | "fallback" | "direct" | "mixed" {
  const clean = sources.filter(Boolean) as Array<
    "okx" | "demo" | "fallback" | "direct" | "mixed"
  >;
  if (clean.length === 0) return "fallback";
  if (clean.includes("mixed")) return "mixed";
  const first = clean[0];
  return clean.every((s) => s === first) ? first : "mixed";
}

function isDirectUsdcToken(t: DustToken): boolean {
  return t.category === "usdc" || t.quoteSource === "direct";
}

function directUsdcAmount(t: DustToken): number {
  if (typeof t.quoteToUSDC === "number" && Number.isFinite(t.quoteToUSDC)) {
    return Math.max(0, t.quoteToUSDC);
  }
  const byBalance = Number(t.balance);
  if (Number.isFinite(byBalance)) return Math.max(0, byBalance);
  return Math.max(0, t.usdValue);
}

function rawAmountForToken(t: DustToken): bigint {
  if (t.rawBalance && /^\d+$/.test(t.rawBalance)) return BigInt(t.rawBalance);
  const n = Number(t.balance);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return parseUnits(decimalAmount(n, t.decimals), t.decimals);
}

function decimalAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return trimDecimal(value.toFixed(Math.min(decimals, 18)));
}

function trimDecimal(value: string): string {
  return value.replace(/\.?0+$/, "") || "0";
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
