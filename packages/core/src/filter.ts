import type { Chain, DustToken, SweepSettings } from "./types.js";
import { STABLES, WRAPPED_NATIVES } from "./chains/tokens.js";
import { CHAINS } from "./chains/index.js";
import { formatUnits, parseUnits } from "viem";

const NATIVE_EVM_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const NATIVE_SOL_SENTINEL = "11111111111111111111111111111111";

export function classifyToken(
  chain: Chain,
  tokenAddress: string,
  symbol: string
): DustToken["category"] {
  if (!tokenAddress) return "native";
  const lc = tokenAddress.toLowerCase();
  if (lc === NATIVE_EVM_SENTINEL || tokenAddress === NATIVE_SOL_SENTINEL) {
    return "native";
  }
  if (lc === CHAINS[chain].usdcAddress.toLowerCase()) return "usdc";
  if (STABLES[chain]?.includes(lc)) return "stable";
  if (isKnownStableSymbol(symbol)) return "stable";
  if (WRAPPED_NATIVES[chain]?.map((a) => a.toLowerCase()).includes(lc))
    return "wrapped";
  return "normal";
}

export function isDust(
  token: DustToken,
  settings: SweepSettings,
  estimatedGasCostUSD: number
): boolean {
  if (token.usdValue <= 0) return false;
  const excluded = settings.excludeAddresses
    .map((a) => a.toLowerCase())
    .includes(token.address.toLowerCase());
  if (excluded) return false;

  if (!categoryEnabled(token, settings)) return false;
  if ((settings.sweepScope ?? "dust") === "all") return true;

  if (token.usdValue >= settings.thresholdUSD) return false;
  if (estimatedGasCostUSD * 1.5 >= token.usdValue) return false;
  return true;
}

export function applyNativeGasReserve(
  token: DustToken,
  settings: SweepSettings
): DustToken {
  if (token.category !== "native" || !settings.includeNativeGas) return token;
  if (settings.gasReserveUSD <= 0) return token;
  if (!token.rawBalance || token.priceUSD <= 0) {
    return { ...token, balance: "0", rawBalance: "0", usdValue: 0 };
  }

  const reserveNative = settings.gasReserveUSD / token.priceUSD;
  const reserveRaw = parseUnits(
    decimalAmount(reserveNative, token.decimals),
    token.decimals
  );
  const totalRaw = BigInt(token.rawBalance);
  const sweepRaw = totalRaw > reserveRaw ? totalRaw - reserveRaw : 0n;
  const balance = trimDecimal(formatUnits(sweepRaw, token.decimals));
  return {
    ...token,
    rawBalance: sweepRaw.toString(),
    balance,
    usdValue: Number(balance) * token.priceUSD,
  };
}

export function nativeGasBlockReason(
  token: DustToken,
  settings: SweepSettings,
  estimatedGasCostUSD: number
): string | undefined {
  if (token.category !== "native" || !settings.includeNativeGas) return;
  if (token.usdValue <= 0) return;

  if (settings.gasReserveUSD > 0 && token.usdValue <= settings.gasReserveUSD) {
    return `Below the $${formatUSD(settings.gasReserveUSD)} gas reserve`;
  }

  const minimumExecutionBudget = estimatedGasCostUSD * 1.5;
  if (token.usdValue <= minimumExecutionBudget) {
    return `Below estimated gas budget (~$${formatUSD(minimumExecutionBudget)})`;
  }
}

function categoryEnabled(token: DustToken, settings: SweepSettings): boolean {
  switch (token.category) {
    case "native":
      return settings.includeNativeGas;
    case "stable":
      return settings.includeStables;
    case "wrapped":
      return settings.includeWrapped;
    case "usdc":
      return true;
    default:
      return true;
  }
}

function isKnownStableSymbol(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase();
  return (
    normalized === "USDC.E" ||
    normalized === "USDBC" ||
    normalized === "USDT" ||
    normalized === "DAI" ||
    normalized === "FRAX" ||
    normalized === "LUSD"
  );
}

function decimalAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return trimDecimal(value.toFixed(Math.min(decimals, 12)));
}

function trimDecimal(value: string): string {
  return value.replace(/\.?0+$/, "") || "0";
}

function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value > 0 && value < 0.01) return value.toFixed(4);
  return trimDecimal(value.toFixed(2));
}
