import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CHAINS } from "../chains/index.js";
import type { Chain } from "../types.js";
import type { RawHolding } from "./portfolio.js";
import type { SwapQuote, SwapTxData } from "./dex.js";

const execFileAsync = promisify(execFile);
const NATIVE_EVM_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NATIVE_SOL_SENTINEL = "11111111111111111111111111111111";
const DEFAULT_ONCHAINOS_MAX_RPS = 3;
const tokenInfoCache = new Map<string, Promise<TokenInfo | null>>();
let onchainOsQueue = Promise.resolve();
let nextOnchainOsStartAt = 0;

interface TokenInfo {
  decimals?: number;
  logoUrl?: string;
  symbol?: string;
}

export function shouldUseOnchainOsFallback(error: unknown): boolean {
  if (process.env.OKX_DATA_SOURCE === "onchainos") return true;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("50125") ||
    msg.includes("401") ||
    msg.includes("OKX_PROJECT_ID") ||
    msg.includes("OKX_API_KEY")
  );
}

export async function getHoldingsViaOnchainOS(
  address: string,
  chain: Chain
): Promise<RawHolding[]> {
  let json: any;
  try {
    json = await runOnchainOS([
      "portfolio",
      "all-balances",
      "--address",
      address,
      "--chains",
      chain,
    ]);
  } catch (e) {
    if (isUnsupportedOnchainOsPortfolioChain(e)) return [];
    throw e;
  }
  const list = (json.data?.[0]?.tokenAssets ?? []) as any[];
  const holdings = list.map((t: any): RawHolding => {
    const balance = String(t.balance ?? "0");
    const rawBalance = String(t.rawBalance ?? "0");
    const priceUSD = Number(t.tokenPrice ?? 0);
    const decimals = inferDecimals(balance, rawBalance);
    return {
      tokenAddress: String(t.tokenContractAddress ?? ""),
      symbol: String(t.symbol ?? "UNKNOWN"),
      decimals,
      balance,
      rawBalance,
      priceUSD,
      valueUSD: Number(balance) * priceUSD,
    };
  });
  await Promise.all(
    holdings.map(async (holding) => {
      if (!holding.tokenAddress) return;
      const info = await getTokenInfoViaOnchainOS(
        chain,
        holding.tokenAddress
      ).catch(() => null);
      if (!info) return;
      holding.logoUrl = info.logoUrl ?? holding.logoUrl;
      holding.symbol = holding.symbol || info.symbol || "UNKNOWN";
      holding.decimals = info.decimals ?? holding.decimals;
    })
  );
  return holdings;
}

export async function getQuoteViaOnchainOS(
  chain: Chain,
  fromToken: string,
  amount: string
): Promise<SwapQuote> {
  const cfg = CHAINS[chain];
  const json = await runOnchainOS([
    "swap",
    "quote",
    "--from",
    normalizeToken(chain, fromToken),
    "--to",
    cfg.usdcAddress,
    "--amount",
    amount,
    "--chain",
    chain,
  ]);
  const d = json.data?.[0];
  if (!d) throw new Error("Onchain OS quote: empty data");
  return {
    fromAmount: String(d.fromTokenAmount ?? amount),
    toAmount: String(d.toTokenAmount ?? "0"),
    priceImpactPct: Number(d.priceImpactPercent ?? d.priceImpactPercentage ?? 0),
    estimatedGasWei: String(d.estimateGasFee ?? d.estimatedGas ?? "0"),
    route: d.dexRouterList ?? null,
  };
}

export async function getSwapTxViaOnchainOS(
  chain: Chain,
  fromToken: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<SwapTxData> {
  const cfg = CHAINS[chain];
  const json = await runOnchainOS([
    "swap",
    "swap",
    "--from",
    normalizeToken(chain, fromToken),
    "--to",
    cfg.usdcAddress,
    "--amount",
    amount,
    "--chain",
    chain,
    "--wallet",
    userAddress,
    "--slippage",
    String(slippageBps / 100),
  ]);
  return parseSwapTx(json, "Onchain OS swap");
}

export async function getApproveTxViaOnchainOS(
  chain: Chain,
  tokenAddress: string,
  amount: string
): Promise<SwapTxData> {
  const json = await runOnchainOS([
    "swap",
    "approve",
    "--token",
    tokenAddress,
    "--amount",
    amount,
    "--chain",
    chain,
  ]);
  const d = json.data?.[0];
  if (!d) throw new Error("Onchain OS approve: empty data");
  return {
    to: tokenAddress,
    data: d.data,
    value: "0",
    gas: String(d.gasLimit ?? "0"),
  };
}

export async function getSolanaSwapTxViaOnchainOS(
  fromTokenMint: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<{ txBase64: string }> {
  const json = await runOnchainOS([
    "swap",
    "swap",
    "--from",
    normalizeToken("solana", fromTokenMint),
    "--to",
    CHAINS.solana.usdcAddress,
    "--amount",
    amount,
    "--chain",
    "solana",
    "--wallet",
    userAddress,
    "--slippage",
    String(slippageBps / 100),
  ]);
  const tx = json.data?.[0]?.tx;
  if (!tx?.data) throw new Error("Onchain OS Solana swap: empty tx");
  return { txBase64: String(tx.data) };
}

function parseSwapTx(json: any, label: string): SwapTxData {
  const tx = json.data?.[0]?.tx;
  if (!tx) throw new Error(`${label}: empty tx`);
  return {
    to: tx.to,
    data: tx.data,
    value: String(tx.value ?? "0"),
    gas: String(tx.gas ?? tx.gasLimit ?? "0"),
  };
}

async function runOnchainOS(args: string[]): Promise<any> {
  const maxAttempts = 4;
  let attempt = 0;
  while (true) {
    try {
      return await runOnchainOSOnce(args);
    } catch (e) {
      attempt += 1;
      if (!isOnchainOsRateLimited(e) || attempt >= maxAttempts) throw e;
      await sleep(750 * attempt);
    }
  }
}

async function runOnchainOSOnce(args: string[]): Promise<any> {
  const bins = [
    process.env.ONCHAINOS_BIN,
    "onchainos",
    path.join(os.homedir(), ".local/bin/onchainos"),
  ].filter(Boolean) as string[];

  let lastError: unknown;
  for (const bin of bins) {
    try {
      await waitForOnchainOsSlot();
      const { stdout, stderr } = await execFileAsync(bin, args, {
        timeout: 45_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const text = [stdout, stderr].filter(Boolean).join("\n").trim();
      const json = parseOnchainOsJson(text);
      if (json.ok === false) {
        throw new Error(formatOnchainOsError(args, json));
      }
      return json;
    } catch (e: any) {
      const output = [e?.stdout, e?.stderr].filter(Boolean).join("\n").trim();
      if (output) {
        try {
          const json = parseOnchainOsJson(output);
          if (json.ok === false) {
            throw new Error(formatOnchainOsError(args, json));
          }
          return json;
        } catch (parseError) {
          lastError = parseError;
          break;
        }
      }
      lastError = e;
      if (e?.code !== "ENOENT") break;
    }
  }
  throw new Error(
    lastError instanceof Error ? lastError.message : String(lastError)
  );
}

async function waitForOnchainOsSlot(): Promise<void> {
  const previous = onchainOsQueue;
  let release: () => void = () => {};
  onchainOsQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const intervalMs = Math.ceil(1000 / getOnchainOsMaxRps());
    const waitMs = Math.max(0, nextOnchainOsStartAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    nextOnchainOsStartAt = Date.now() + intervalMs;
  } finally {
    release();
  }
}

function getOnchainOsMaxRps(): number {
  const parsed = Number(process.env.ONCHAINOS_MAX_RPS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ONCHAINOS_MAX_RPS;
  return Math.max(1, Math.floor(parsed));
}

async function getTokenInfoViaOnchainOS(
  chain: Chain,
  tokenAddress: string
): Promise<TokenInfo | null> {
  const key = `${chain}:${tokenAddress.toLowerCase()}`;
  let cached = tokenInfoCache.get(key);
  if (!cached) {
    cached = (async () => {
      const json = await runOnchainOS([
        "token",
        "info",
        "--address",
        tokenAddress,
        "--chain",
        chain,
      ]);
      const d = json.data?.[0];
      if (!d) return null;
      const decimals = d.decimals ?? d.decimal;
      const symbol = d.symbol ?? d.tokenSymbol;
      return {
        decimals:
          decimals === undefined || decimals === null
            ? undefined
            : Number(decimals),
        logoUrl: d.tokenLogoUrl ? String(d.tokenLogoUrl) : undefined,
        symbol: symbol ? String(symbol) : undefined,
      };
    })();
    tokenInfoCache.set(key, cached);
  }
  return cached;
}

function parseOnchainOsJson(text: string): any {
  const compact = text.replace(/\s+/g, " ").slice(0, 240);
  const starts = findJsonObjectStarts(text);
  if (starts.length === 0) {
    throw new Error(
      `Onchain OS did not return JSON: ${compact}`
    );
  }

  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const candidate = sliceBalancedObject(text, starts[i]);
    if (!candidate) continue;
    try {
      const json = JSON.parse(candidate);
      if (isOnchainOsPayload(json)) return json;
    } catch {
      // Keep looking: debug logs can contain Rust-style `Object {"x": ...}`
      // fragments before the final machine-readable JSON payload.
    }
  }

  throw new Error(`Onchain OS did not return parseable JSON: ${compact}`);
}

function findJsonObjectStarts(text: string): number[] {
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === "{") starts.push(i);
  }
  return starts;
}

function sliceBalancedObject(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
}

function isOnchainOsPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    "ok" in value ||
    "error" in value ||
    ("data" in value && Array.isArray((value as { data?: unknown }).data))
  );
}

function formatOnchainOsError(args: string[], json: any): string {
  const payload = json.data ?? json.error ?? json;
  const message =
    typeof payload === "string"
      ? payload
      : payload?.message
        ? String(payload.message)
        : JSON.stringify(payload);
  return `Onchain OS ${args.slice(0, 2).join(" ")} failed: ${message}`;
}

function isUnsupportedOnchainOsPortfolioChain(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("allTokenBalancesByAddress.chains") &&
    msg.includes("chains is invalid")
  );
}

function isOnchainOsRateLimited(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /rate limited|rate limit|too many requests/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeToken(chain: Chain, address: string): string {
  if (address) return address.toLowerCase();
  return chain === "solana" ? NATIVE_SOL_SENTINEL : NATIVE_EVM_SENTINEL;
}

function inferDecimals(balance: string, rawBalance: string): number {
  try {
    const raw = BigInt(rawBalance);
    const [wholeRaw, fracRaw = ""] = balance.split(".");
    const whole = wholeRaw.replace(/^[-+]/, "") || "0";
    const frac = fracRaw.replace(/0+$/, "");
    for (let decimals = 0; decimals <= 36; decimals++) {
      if (frac.length > decimals) continue;
      const base = 10n ** BigInt(decimals);
      const wholePart = BigInt(whole || "0") * base;
      const fracPart = frac
        ? BigInt(frac.padEnd(decimals, "0"))
        : 0n;
      if (wholePart + fracPart === raw) return decimals;
    }
  } catch {
    // fall through to common default
  }
  return rawBalance.length <= 12 ? 6 : 18;
}
