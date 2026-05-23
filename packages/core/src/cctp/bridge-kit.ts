import {
  BridgeChain,
  BridgeKit,
  TransferSpeed,
  isRetryableError,
  type BridgeResult,
  type EstimateResult,
} from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { createSolanaAdapterFromPrivateKey } from "@circle-fin/adapter-solana";
import { Connection } from "@solana/web3.js";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  formatUnits,
  http,
} from "viem";
import type { Chain } from "../types.js";
import { CHAINS, getRpcUrl } from "../chains/index.js";
import { getEvmPrivateKey } from "../signing/evm.js";
import { getSolanaPrivateKey } from "../signing/svm.js";
import type { ProgressEvent } from "../types.js";

const USDC_DECIMALS = 6;

export interface BridgeKitLegParams {
  sourceChain: Chain;
  destChain: Chain;
  sourceOwner: string;
  destinationPayer: string;
  mintRecipient: string;
  amountRaw: bigint;
  transferSpeed?: "FAST" | "SLOW";
  maxFeeUSDC?: string;
  retryAttempts?: number;
}

export interface BridgeKitLegResult {
  state: BridgeResult["state"];
  txHashes: string[];
  steps: BridgeResult["steps"];
  retryable: boolean;
  result: BridgeResult;
}

export interface BridgeKitFeeEstimate {
  gasFees: EstimateResult["gasFees"];
  fees: EstimateResult["fees"];
  cctpProtocolFeeUSDC: number;
}

type SubEmit = (e: Partial<ProgressEvent> & { kind: ProgressEvent["kind"] }) => void;

const CHAIN_TO_BRIDGE: Record<Chain, BridgeChain> = {
  ethereum: BridgeChain.Ethereum,
  arbitrum: BridgeChain.Arbitrum,
  base: BridgeChain.Base,
  polygon: BridgeChain.Polygon,
  optimism: BridgeChain.Optimism,
  avalanche: BridgeChain.Avalanche,
  unichain: BridgeChain.Unichain,
  linea: BridgeChain.Linea,
  sonic: BridgeChain.Sonic,
  monad: BridgeChain.Monad,
  codex: BridgeChain.Codex,
  edge: BridgeChain.Edge,
  hyperevm: BridgeChain.HyperEVM,
  ink: BridgeChain.Ink,
  morph: BridgeChain.Morph,
  pharos: BridgeChain.Pharos,
  plume: BridgeChain.Plume,
  sei: BridgeChain.Sei,
  worldchain: BridgeChain.World_Chain,
  xdc: BridgeChain.XDC,
  solana: BridgeChain.Solana,
};

export async function bridgeUSDCWithBridgeKit(
  params: BridgeKitLegParams,
  emit: SubEmit = () => {}
): Promise<BridgeKitLegResult> {
  const kit = createKit(emit);
  const sourceAdapter = createAdapter(params.sourceChain, params.sourceOwner);
  const destAdapter = createAdapter(params.destChain, params.destinationPayer);
  const bridgeParams = {
    from: {
      adapter: sourceAdapter,
      chain: toBridgeChain(params.sourceChain),
    },
    to: {
      adapter: destAdapter,
      chain: toBridgeChain(params.destChain),
      recipientAddress: params.mintRecipient,
    },
    amount: formatUSDC(params.amountRaw),
    token: "USDC" as const,
    config: {
      transferSpeed:
        params.transferSpeed === "SLOW" ? TransferSpeed.SLOW : TransferSpeed.FAST,
      maxFee: params.maxFeeUSDC,
      batchTransactions: false,
    },
    invocationMeta: {
      callers: [{ type: "app", name: "Dust Sweeper", version: "0.1.0" }],
    },
  };

  let result = await kit.bridge(bridgeParams);
  const retryAttempts = params.retryAttempts ?? 1;
  for (let attempt = 0; result.state === "error" && attempt < retryAttempts; attempt++) {
    const provider = kit.providers.find((p) => p.name === result.provider);
    if (!provider?.supportsRetry(result)) break;
    result = await kit.retry(result, {
      from: sourceAdapter,
      to: destAdapter,
    });
  }

  if (result.state === "error") {
    const failed = result.steps.find((s) => s.state === "error");
    const message =
      failed?.errorMessage ??
      failed?.errorCategory ??
      "Bridge Kit CCTP transfer failed";
    const err = new Error(message) as Error & { bridgeResult?: BridgeResult };
    err.bridgeResult = result;
    throw err;
  }

  return {
    state: result.state,
    txHashes: txHashesFromSteps(result.steps),
    steps: result.steps,
    retryable: false,
    result,
  };
}

export async function estimateUSDCBridgeWithBridgeKit(
  params: Omit<BridgeKitLegParams, "amountRaw" | "retryAttempts"> & {
    amountUSDC: string;
  }
): Promise<BridgeKitFeeEstimate> {
  const kit = new BridgeKit();
  const estimate = await kit.estimate({
    from: {
      adapter: createAdapter(params.sourceChain, params.sourceOwner),
      chain: toBridgeChain(params.sourceChain),
    },
    to: {
      adapter: createAdapter(params.destChain, params.destinationPayer),
      chain: toBridgeChain(params.destChain),
      recipientAddress: params.mintRecipient,
    },
    amount: params.amountUSDC,
    token: "USDC",
    config: {
      transferSpeed:
        params.transferSpeed === "SLOW" ? TransferSpeed.SLOW : TransferSpeed.FAST,
      maxFee: params.maxFeeUSDC,
      batchTransactions: false,
    },
  });
  return {
    gasFees: estimate.gasFees,
    fees: estimate.fees,
    cctpProtocolFeeUSDC: estimate.fees.reduce(
      (sum, fee) => sum + (fee.amount ? Number(fee.amount) : 0),
      0
    ),
  };
}

export function toBridgeChain(chain: Chain): BridgeChain {
  return CHAIN_TO_BRIDGE[chain];
}

export function formatUSDC(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}

function createKit(emit: SubEmit): BridgeKit {
  const kit = new BridgeKit();
  kit.on("burn", (event) => {
    const hash = txHashFromEvent(event);
    emit({ kind: "cctp_burn_sent", txHash: hash });
    emit({ kind: "cctp_burn_confirmed", txHash: hash });
  });
  kit.on("fetchAttestation", () => {
    emit({ kind: "cctp_attestation_pending" });
    emit({ kind: "cctp_attestation_received" });
  });
  kit.on("mint", (event) => {
    emit({ kind: "cctp_mint_sent" });
    emit({ kind: "cctp_mint_confirmed", txHash: txHashFromEvent(event) });
  });
  return kit;
}

function createAdapter(chain: Chain, owner: string) {
  if (CHAINS[chain].isEVM) {
    return createViemAdapterFromPrivateKey({
      privateKey: getEvmPrivateKey(owner),
      getPublicClient: ({ chain }) =>
        createPublicClient({
          chain,
          transport: fallback(
            rpcUrlsForEvmChainId(chain.id).map((url) =>
              http(url, { retryCount: 3, timeout: 10_000 })
            )
          ),
        }),
      getWalletClient: ({ chain, account }) =>
        createWalletClient({
          account,
          chain,
          transport: fallback(
            rpcUrlsForEvmChainId(chain.id).map((url) =>
              http(url, { retryCount: 3, timeout: 10_000 })
            )
          ),
        }),
    });
  }

  return createSolanaAdapterFromPrivateKey({
    privateKey: getSolanaPrivateKey(owner),
    connection: new Connection(getRpcUrl("solana"), "confirmed"),
  });
}

function rpcUrlsForEvmChainId(chainId: number): string[] {
  const hit = Object.values(CHAINS).find((c) => c.isEVM && c.chainId === chainId);
  return hit ? [getRpcUrl(hit.chain)] : [];
}

function txHashesFromSteps(steps: BridgeResult["steps"]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (step.txHash && !out.includes(step.txHash)) out.push(step.txHash);
  }
  return out;
}

function txHashFromEvent(event: unknown): string | undefined {
  const value = event as { values?: { txHash?: unknown; hash?: unknown } };
  const hash = value.values?.txHash ?? value.values?.hash;
  return typeof hash === "string" ? hash : undefined;
}

export function isBridgeKitRetryableError(error: unknown): boolean {
  return isRetryableError(error);
}
