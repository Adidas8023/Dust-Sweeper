import { describe, expect, it } from "vitest";
import {
  applyNativeGasReserve,
  classifyToken,
  nativeGasBlockReason,
} from "../src/filter.js";
import type { DustToken, SweepSettings } from "../src/types.js";

const settings: SweepSettings = {
  thresholdUSD: 5,
  includeNativeGas: true,
  gasReserveUSD: 1,
  includeStables: false,
  includeWrapped: false,
  excludeAddresses: [],
};

describe("token filtering", () => {
  it("classifies empty and sentinel token addresses as native gas", () => {
    expect(classifyToken("base", "", "ETH")).toBe("native");
    expect(
      classifyToken(
        "base",
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "ETH"
      )
    ).toBe("native");
    expect(
      classifyToken("solana", "11111111111111111111111111111111", "SOL")
    ).toBe("native");
  });

  it("keeps native gas reserve before exposing sweepable balance", () => {
    const token: DustToken = {
      owner: "0x0000000000000000000000000000000000000001",
      chain: "base",
      address: "",
      symbol: "ETH",
      decimals: 18,
      balance: "0.00036",
      rawBalance: "360000000000000",
      usdValue: 0.82,
      priceUSD: 2280,
      category: "native",
      needsApproval: false,
    };

    const swept = applyNativeGasReserve(token, settings);

    expect(swept.rawBalance).toBe("0");
    expect(swept.usdValue).toBe(0);
  });

  it("blocks tiny native gas balances before they become sweep candidates", () => {
    const token: DustToken = {
      owner: "0x0000000000000000000000000000000000000001",
      chain: "ethereum",
      address: "",
      symbol: "ETH",
      decimals: 18,
      balance: "0.000000659",
      rawBalance: "659000000000",
      usdValue: 0.0015,
      priceUSD: 2276,
      category: "native",
      needsApproval: false,
    };

    expect(nativeGasBlockReason(token, settings, 2.5)).toMatch(/reserve/i);
    expect(
      nativeGasBlockReason(token, { ...settings, gasReserveUSD: 0 }, 2.5)
    ).toMatch(/gas budget/i);
  });
});
