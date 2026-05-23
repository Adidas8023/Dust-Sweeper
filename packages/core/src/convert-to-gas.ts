import type { Chain } from "./types.js";
import { CHAINS } from "./chains/index.js";
import {
  getWalletClient,
  getPublicClient,
} from "./signing/evm.js";
import { buildAuthHeaders } from "./okx/auth.js";
import { isDemoMode } from "./demo.js";
import { parseAbi, type Address, type Hash } from "viem";

const OKX_BASE = "https://web3.okx.com";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
]);

export interface ConvertResult {
  chain: Chain;
  approveTxHash?: string;
  swapTxHash: string;
  amountUSDC: number;
  estimatedGasReceived: number; // human-readable units of native token
  nativeSymbol: string;
}

/**
 * Convert a portion of USDC on `chain` into the chain's native gas token via
 * OKX V6 DEX aggregator. Single-chain operation; does not touch CCTP.
 *
 * `amountUSDC` is in human-readable USDC units (e.g., 5 = $5 USDC).
 */
export async function convertUSDCToGas(
  chain: Chain,
  amountUSDC: number
): Promise<ConvertResult> {
  const cfg = CHAINS[chain];
  const nativeSymbol = cfg.nativeSymbol;

  if (isDemoMode()) {
    // Pretend rate of 1 ETH ≈ $3500, 1 MATIC ≈ $0.5, 1 AVAX ≈ $35, 1 SOL ≈ $200
    const rate: Record<string, number> = {
      ETH: 3500, MATIC: 0.5, AVAX: 35, SOL: 200, S: 0.6, MON: 1, BNB: 600,
    };
    const r = rate[nativeSymbol] ?? 100;
    const fakeHash = `0xDEMO${chain.slice(0, 3)}gas${Math.random().toString(16).slice(2, 10)}`;
    await new Promise((res) => setTimeout(res, 800));
    return {
      chain,
      swapTxHash: fakeHash,
      amountUSDC,
      estimatedGasReceived: amountUSDC / r,
      nativeSymbol,
    };
  }

  if (!cfg.isEVM) {
    throw new Error(`convert-to-gas not yet implemented for ${chain}`);
  }

  // Live EVM path
  const wc = getWalletClient(chain);
  const pc = getPublicClient(chain);
  const owner = wc.account!.address;
  const usdcRaw = BigInt(Math.floor(amountUSDC * 1_000_000)); // USDC has 6 decimals

  // 1. quote (so we can estimate received native)
  const quote = await getOkxSwapQuote(
    chain,
    cfg.usdcAddress,
    NATIVE_SENTINEL,
    usdcRaw.toString()
  );

  // 2. approve if necessary (USDC → OKX router)
  const approveTx = await getOkxApproveTx(
    chain,
    cfg.usdcAddress,
    usdcRaw.toString()
  );
  const currentAllowance = (await pc.readContract({
    address: cfg.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, approveTx.to as Address],
  })) as bigint;

  let approveTxHash: Hash | undefined;
  if (currentAllowance < usdcRaw) {
    approveTxHash = await wc.sendTransaction({
      to: approveTx.to as `0x${string}`,
      data: approveTx.data,
      value: 0n,
      account: wc.account!,
      chain: wc.chain,
    });
    const r = await pc.waitForTransactionReceipt({ hash: approveTxHash });
    if (r.status !== "success")
      throw new Error("USDC approve for gas swap reverted");
  }

  // 3. swap USDC → native
  const swapTx = await getOkxSwapTx(
    chain,
    cfg.usdcAddress,
    NATIVE_SENTINEL,
    usdcRaw.toString(),
    owner,
    100
  );
  const swapTxHash = await wc.sendTransaction({
    to: swapTx.to as `0x${string}`,
    data: swapTx.data,
    value: BigInt(swapTx.value || "0"),
    account: wc.account!,
    chain: wc.chain,
  });
  const r = await pc.waitForTransactionReceipt({ hash: swapTxHash });
  if (r.status !== "success") throw new Error("USDC→native swap reverted");

  // estimate received from quote toAmount (raw, 18 decimals for native)
  const received = Number(quote.toAmount) / 1e18;
  return {
    chain,
    approveTxHash,
    swapTxHash,
    amountUSDC,
    estimatedGasReceived: received,
    nativeSymbol,
  };
}

// ── thin in-line OKX clients (fixed for arbitrary from/to, unlike the
// USDC-only version in okx/dex.ts) ───────────────────────────────────

async function getOkxSwapQuote(
  chain: Chain,
  fromToken: string,
  toToken: string,
  amount: string
): Promise<{ toAmount: string }> {
  const cfg = CHAINS[chain];
  const path =
    `/api/v6/dex/aggregator/quote?` +
    `chainIndex=${cfg.okxChainId}&amount=${amount}` +
    `&fromTokenAddress=${fromToken}&toTokenAddress=${toToken}`;
  const res = await fetch(OKX_BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX quote HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX quote: ${json.msg}`);
  return { toAmount: json.data?.[0]?.toTokenAmount ?? "0" };
}

async function getOkxSwapTx(
  chain: Chain,
  fromToken: string,
  toToken: string,
  amount: string,
  user: string,
  slippageBps: number
) {
  const cfg = CHAINS[chain];
  const slippage = (slippageBps / 10000).toString();
  const path =
    `/api/v6/dex/aggregator/swap?` +
    `chainIndex=${cfg.okxChainId}&amount=${amount}` +
    `&fromTokenAddress=${fromToken}&toTokenAddress=${toToken}` +
    `&userWalletAddress=${user}&slippage=${slippage}`;
  const res = await fetch(OKX_BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX swap HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX swap: ${json.msg}`);
  const tx = json.data?.[0]?.tx;
  return {
    to: tx.to,
    data: tx.data as `0x${string}`,
    value: tx.value ?? "0",
  };
}

async function getOkxApproveTx(
  chain: Chain,
  tokenAddress: string,
  amount: string
) {
  const cfg = CHAINS[chain];
  const path =
    `/api/v6/dex/aggregator/approve-transaction?` +
    `chainIndex=${cfg.okxChainId}&tokenContractAddress=${tokenAddress}` +
    `&approveAmount=${amount}`;
  const res = await fetch(OKX_BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX approve HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX approve: ${json.msg}`);
  const d = json.data?.[0];
  return { to: d.dexContractAddress, data: d.data };
}
