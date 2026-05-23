export type Chain =
  | "ethereum"
  | "arbitrum"
  | "base"
  | "polygon"
  | "optimism"
  | "avalanche"
  | "unichain"
  | "linea"
  | "sonic"
  | "monad"
  | "codex"
  | "edge"
  | "hyperevm"
  | "ink"
  | "morph"
  | "pharos"
  | "plume"
  | "sei"
  | "worldchain"
  | "xdc"
  | "solana";

/**
 * Aggregation strategy when multiple source wallets are configured.
 * - `per-wallet`: each wallet's USDC mints back to itself on the destination chain.
 * - `unified`:    all wallets' USDC mints to a single recipient on the destination chain.
 *                 The recipient family must match destChain (EVM↔EVM, solana↔solana).
 */
export type AggregationMode = "per-wallet" | "unified";
export type SweepScope = "dust" | "all";

export interface SweepSettings {
  /** "dust" filters by threshold; "all" includes every eligible priced token. */
  sweepScope?: SweepScope;
  thresholdUSD: number;
  includeNativeGas: boolean;
  gasReserveUSD: number;
  includeStables: boolean;
  includeWrapped: boolean;
  excludeAddresses: string[];
  chains?: Chain[];
  /** Defaults to "per-wallet" when omitted. */
  aggregationMode?: AggregationMode;
  /** Required when aggregationMode === "unified" and destChain is EVM. */
  recipientEvm?: string;
  /** Required when aggregationMode === "unified" and destChain === "solana". */
  recipientSolana?: string;
}

export interface DustToken {
  /** Source wallet address that holds this token. */
  owner: string;
  chain: Chain;
  address: string;
  symbol: string;
  decimals: number;
  balance: string;       // human-readable
  rawBalance?: string;   // raw base units (preferred for tx amounts)
  usdValue: number;
  priceUSD: number;
  category: "normal" | "native" | "stable" | "wrapped" | "usdc";
  needsApproval: boolean;
  logoUrl?: string;
  /**
   * Best known route output before the local slippage reserve is applied.
   * Live scans populate this from OKX DEX quote; demo data marks it as demo.
   */
  quoteToUSDC?: number;
  quoteSource?: "okx" | "demo" | "fallback" | "direct";
  quotePriceImpactPct?: number;
  quoteUpdatedAt?: number;
  /**
   * `unavailable` means the holding is visible for UX/debugging, but cannot be
   * planned because OKX could not quote the token into native USDC.
   * `insufficient_gas` means a native gas balance is visible, but sweeping it
   * would leave too little gas to safely execute the source-chain transaction.
   */
  routeStatus?: "ready" | "unavailable" | "insufficient_gas";
  routeError?: string;
}

export interface DustInventory {
  /** All configured source addresses, by family. */
  wallets: { evm: string[]; solana: string[] };
  chains: Array<{
    chain: Chain;
    tokens: DustToken[];
    subtotalUSD: number;
    error?: string;
  }>;
  /** Per-owner totals across all chains. */
  byOwner: Array<{ owner: string; totalUSD: number }>;
  grandTotalUSD: number;
  scannedAt: number;
}

export type StepKind =
  | "approve"
  | "swap"
  | "usdc_transfer"
  | "cctp_burn"
  | "cctp_mint";

export interface SweepStep {
  kind: StepKind;
  chain: Chain;
  /** Owning source wallet for this step (signer). */
  owner: string;
  token?: DustToken;
  estimatedGasUSD: number;
  estimatedReceiveUSDC?: number;
  details: Record<string, unknown>;
}

export interface ChainPlan {
  chain: Chain;
  /** Source wallet this plan applies to. */
  owner: string;
  /** Where USDC lands on destChain (string form: 0x… for EVM, base58 for solana). */
  mintRecipient: string;
  steps: SweepStep[];
  estimatedCostUSD: number;
  estimatedReceiveUSDC: number;
  inputUSD?: number;
  swapOutputUSDC?: number;
  routeImpactUSD?: number;
  cctpProtocolFeeUSDC?: number;
  quoteSource?: "okx" | "demo" | "fallback" | "direct" | "mixed";
  /**
   * High-level route shape for UX and execution summaries.
   * - `swap_then_cctp`: source token swaps to native USDC, then burns/mints.
   * - `cctp_only`: selected asset is already native USDC and only needs CCTP.
   * - `local_swap`: source and destination are the same chain; no CCTP.
   * - `local_transfer`: native USDC moves on the same chain to a unified recipient.
   * - `local_usdc`: native USDC is already on the destination owner/recipient.
   * - `unsupported`: selected value cannot be delivered by the current route.
   */
  routeKind?:
    | "swap_then_cctp"
    | "cctp_only"
    | "local_swap"
    | "local_transfer"
    | "local_usdc"
    | "unsupported";
  willAccumulate: boolean;
  skipReason?: string;
}

export interface SweepPlan {
  destChain: Chain;
  aggregationMode: AggregationMode;
  /**
   * Explicit signer that pays the permissionless CCTP receive/mint tx on
   * destChain. EVM destinations expect 0x…; Solana destinations expect base58.
   */
  destinationPayer?: string;
  perChain: ChainPlan[];
  totalCostUSD: number;
  totalReceiveUSDC: number;
  totalInputUSD?: number;
  totalSwapOutputUSDC?: number;
  totalRouteImpactUSD?: number;
  totalCctpProtocolFeeUSDC?: number;
  totalGasUSD?: number;
  quoteSource?: "okx" | "demo" | "fallback" | "direct" | "mixed";
  createdAt: number;
}

export type ProgressKind =
  | "chain_start"
  | "step_start"
  | "step_success"
  | "step_failed"
  | "chain_complete"
  | "sweep_complete"
  // CCTP-specific sub-phases (emitted from inside the cctp_burn step)
  | "cctp_burn_sent"
  | "cctp_burn_confirmed"
  | "cctp_attestation_pending"
  | "cctp_attestation_received"
  | "cctp_mint_sent"
  | "cctp_mint_confirmed";

export type ChainPhase =
  | "idle"
  | "approving"
  | "swapping"
  | "burning"
  | "attesting"
  | "minting"
  | "done"
  | "failed"
  | "skipped";

export interface ProgressEvent {
  kind: ProgressKind;
  chain?: Chain;
  /** Source wallet the event belongs to (for multi-address runs). */
  owner?: string;
  stepIdx?: number;
  txHash?: string;
  error?: string;
  timestamp: number;
}

export interface SweepResult {
  planId: string;
  status: "success" | "partial" | "failed";
  perChain: Array<{
    chain: Chain;
    owner: string;
    status: "success" | "partial" | "failed" | "skipped";
    txHashes: string[];
    receivedUSDC?: number;
    error?: string;
  }>;
  totalReceivedUSDC: number;
  completedAt: number;
}
