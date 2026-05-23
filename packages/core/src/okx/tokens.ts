import { buildAuthHeaders } from "./auth.js";
import type { Chain } from "../types.js";
import { CHAINS } from "../chains/index.js";
import { okxFetch } from "./http.js";

const BASE = "https://web3.okx.com";

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

// In-memory cache, 5 min TTL
const cache = new Map<Chain, { at: number; map: Map<string, TokenInfo> }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Fetch the full token catalog for a chain from OKX V6 DEX aggregator.
 * Returns a Map keyed by lowercased contract address.
 *
 * Used to enrich portfolio balances (which only carry contract address +
 * raw balance + price) with decimals + logo URL.
 */
export async function getAllTokens(chain: Chain): Promise<Map<string, TokenInfo>> {
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  const cfg = CHAINS[chain];
  const path = `/api/v6/dex/aggregator/all-tokens?chainIndex=${cfg.okxChainId}`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX all-tokens HTTP ${res.status} on ${chain}`);
  const json = (await res.json()) as any;
  if (json.code !== "0")
    throw new Error(`OKX all-tokens error on ${chain}: ${json.msg ?? "unknown"}`);
  const list = (json.data ?? []) as any[];
  const map = new Map<string, TokenInfo>();
  for (const t of list) {
    const addr = (t.tokenContractAddress ?? "").toLowerCase();
    if (!addr) continue;
    map.set(addr, {
      address: addr,
      symbol: t.tokenSymbol ?? "UNKNOWN",
      name: t.tokenName ?? "",
      decimals: Number(t.decimals ?? 18),
      logoUrl: t.tokenLogoUrl,
    });
  }
  cache.set(chain, { at: Date.now(), map });
  return map;
}
