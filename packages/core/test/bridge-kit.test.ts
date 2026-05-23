import { describe, expect, it } from "vitest";
import { BridgeChain } from "@circle-fin/bridge-kit";
import { formatUSDC, toBridgeChain } from "../src/cctp/bridge-kit.js";

describe("Bridge Kit helpers", () => {
  it("maps local chain ids to Circle Bridge Kit chain identifiers", () => {
    expect(toBridgeChain("ethereum")).toBe(BridgeChain.Ethereum);
    expect(toBridgeChain("optimism")).toBe(BridgeChain.Optimism);
    expect(toBridgeChain("polygon")).toBe(BridgeChain.Polygon);
    expect(toBridgeChain("solana")).toBe(BridgeChain.Solana);
  });

  it("formats raw USDC units for Bridge Kit human-readable amount input", () => {
    expect(formatUSDC(1n)).toBe("0.000001");
    expect(formatUSDC(1_000000n)).toBe("1");
    expect(formatUSDC(12_345678n)).toBe("12.345678");
  });
});
