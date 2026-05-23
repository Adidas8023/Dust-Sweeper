import { buildAuthHeaders } from "./auth.js";
import { CHAINS } from "../chains/index.js";
import type { Chain } from "../types.js";
import { okxFetch } from "./http.js";
import {
  getApproveTxViaOnchainOS,
  getQuoteViaOnchainOS,
  getSwapTxViaOnchainOS,
  shouldUseOnchainOsFallback,
} from "./onchainos-cli.js";

const BASE = "https://web3.okx.com";
const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface SwapQuote {
  fromAmount: string;
  toAmount: string;
  priceImpactPct: number;
  estimatedGasWei: string;
  route: unknown;
}

export interface SwapTxData {
  to: string;
  data: `0x${string}`;
  value: string;
  gas: string;
}

function normalizeToken(address: string): string {
  return address === "" ? NATIVE_SENTINEL : address;
}

export async function getQuote(
  chain: Chain,
  fromToken: string,
  amount: string
): Promise<SwapQuote> {
  try {
    return await getQuoteViaOkxApi(chain, fromToken, amount);
  } catch (e) {
    if (!shouldUseOnchainOsFallback(e)) throw e;
    return getQuoteViaOnchainOS(chain, fromToken, amount);
  }
}

async function getQuoteViaOkxApi(
  chain: Chain,
  fromToken: string,
  amount: string
): Promise<SwapQuote> {
  const cfg = CHAINS[chain];
  const from = normalizeToken(fromToken);
  const path =
    `/api/v6/dex/aggregator/quote?` +
    `chainIndex=${cfg.okxChainId}&amount=${amount}` +
    `&fromTokenAddress=${from}&toTokenAddress=${cfg.usdcAddress}`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX quote HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX quote: ${json.msg}`);
  const d = json.data?.[0];
  if (!d) throw new Error("OKX quote: empty data");
  return {
    fromAmount: d.fromTokenAmount,
    toAmount: d.toTokenAmount,
    priceImpactPct: Number(d.priceImpactPercentage ?? 0),
    estimatedGasWei: d.estimatedGas ?? "0",
    route: d.dexRouterList ?? null,
  };
}

export async function getSwapTx(
  chain: Chain,
  fromToken: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<SwapTxData> {
  try {
    return await getSwapTxViaOkxApi(
      chain,
      fromToken,
      amount,
      userAddress,
      slippageBps
    );
  } catch (e) {
    if (!shouldUseOnchainOsFallback(e)) throw e;
    return getSwapTxViaOnchainOS(
      chain,
      fromToken,
      amount,
      userAddress,
      slippageBps
    );
  }
}

async function getSwapTxViaOkxApi(
  chain: Chain,
  fromToken: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<SwapTxData> {
  const cfg = CHAINS[chain];
  const from = normalizeToken(fromToken);
  const slippage = (slippageBps / 10000).toString();
  const path =
    `/api/v6/dex/aggregator/swap?` +
    `chainIndex=${cfg.okxChainId}&amount=${amount}` +
    `&fromTokenAddress=${from}&toTokenAddress=${cfg.usdcAddress}` +
    `&userWalletAddress=${userAddress}&slippage=${slippage}`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX swap HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX swap: ${json.msg}`);
  const tx = json.data?.[0]?.tx;
  if (!tx) throw new Error("OKX swap: empty tx");
  return {
    to: tx.to,
    data: tx.data as `0x${string}`,
    value: tx.value ?? "0",
    gas: tx.gas ?? "0",
  };
}

export async function getApproveTx(
  chain: Chain,
  tokenAddress: string,
  amount: string
): Promise<SwapTxData> {
  try {
    return await getApproveTxViaOkxApi(chain, tokenAddress, amount);
  } catch (e) {
    if (!shouldUseOnchainOsFallback(e)) throw e;
    return getApproveTxViaOnchainOS(chain, tokenAddress, amount);
  }
}

async function getApproveTxViaOkxApi(
  chain: Chain,
  tokenAddress: string,
  amount: string
): Promise<SwapTxData> {
  const cfg = CHAINS[chain];
  const path =
    `/api/v6/dex/aggregator/approve-transaction?` +
    `chainIndex=${cfg.okxChainId}&tokenContractAddress=${tokenAddress}` +
    `&approveAmount=${amount}`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX approve HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0") throw new Error(`OKX approve: ${json.msg}`);
  const d = json.data?.[0];
  if (!d) throw new Error("OKX approve: empty data");
  return {
    to: tokenAddress,
    data: d.data,
    value: "0",
    gas: d.gasLimit ?? "0",
  };
}
