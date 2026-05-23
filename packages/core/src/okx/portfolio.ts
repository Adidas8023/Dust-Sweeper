import { buildAuthHeaders } from "./auth.js";
import type { Chain } from "../types.js";
import { CHAINS } from "../chains/index.js";
import { getAllTokens } from "./tokens.js";
import { okxFetch } from "./http.js";
import {
  getHoldingsViaOnchainOS,
  shouldUseOnchainOsFallback,
} from "./onchainos-cli.js";

const BASE = "https://web3.okx.com";

export interface RawHolding {
  tokenAddress: string;
  symbol: string;
  decimals: number;
  balance: string;     // human-readable
  rawBalance: string;  // raw base units
  priceUSD: number;
  valueUSD: number;
  logoUrl?: string;
}

/**
 * Fetch all token balances for a wallet on one chain via OKX V6
 * `/dex/balance/all-token-balances-by-address`, then enrich with decimals
 * and logoUrl from the V6 `aggregator/all-tokens` catalog.
 */
export async function getHoldings(
  address: string,
  chain: Chain
): Promise<RawHolding[]> {
  try {
    return await getHoldingsViaOkxApi(address, chain);
  } catch (e) {
    if (!shouldUseOnchainOsFallback(e)) throw e;
    return getHoldingsViaOnchainOS(address, chain);
  }
}

async function getHoldingsViaOkxApi(
  address: string,
  chain: Chain
): Promise<RawHolding[]> {
  const cfg = CHAINS[chain];
  const path =
    `/api/v6/dex/balance/all-token-balances-by-address?` +
    `address=${address}&chains=${cfg.okxChainId}&excludeRiskToken=1`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) {
    throw new Error(
      `OKX portfolio HTTP ${res.status} on ${chain}: ${await readError(res)}`
    );
  }
  const json = (await res.json()) as any;
  if (json.code !== "0") {
    throw new Error(`OKX portfolio error on ${chain}: ${json.msg ?? "unknown"}`);
  }
  const list = (json.data?.[0]?.tokenAssets ?? []) as any[];
  if (list.length === 0) return [];

  // Enrich with the chain's token catalog (cached per chain).
  let catalog: Map<string, { decimals: number; logoUrl?: string; symbol: string }>;
  try {
    catalog = await getAllTokens(chain);
  } catch {
    catalog = new Map();
  }

  return list.map((t: any): RawHolding => {
    const addr = String(t.tokenContractAddress ?? "").toLowerCase();
    const info = catalog.get(addr);
    const balanceStr = t.balance ?? "0";
    const rawBalance = t.rawBalance ?? "0";
    const priceUSD = Number(t.tokenPrice ?? 0);
    const balanceNum = Number(balanceStr);
    return {
      tokenAddress: t.tokenContractAddress ?? "",
      symbol: t.symbol ?? info?.symbol ?? "UNKNOWN",
      decimals: info?.decimals ?? 18,
      balance: balanceStr,
      rawBalance,
      priceUSD,
      valueUSD: balanceNum * priceUSD,
      logoUrl: info?.logoUrl,
    };
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || "request failed";
    try {
      const json = JSON.parse(text);
      return [json.code, json.msg].filter(Boolean).join(" ") || text.slice(0, 240);
    } catch {
      return text.replace(/\s+/g, " ").slice(0, 240);
    }
  } catch {
    return res.statusText || "request failed";
  }
}
