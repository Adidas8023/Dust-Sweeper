import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SweepSettings } from "../src/types.js";

const getHoldings = vi.fn();
const getQuote = vi.fn();
const getEvmAddresses = vi.fn();
const getSolanaAddresses = vi.fn();
const getUSDCBalanceForOwner = vi.fn();
const getUSDCBalanceSolana = vi.fn();

vi.mock("../src/demo.js", () => ({
  isDemoMode: () => false,
  buildDemoInventory: vi.fn(),
}));

vi.mock("../src/signing/evm.js", () => ({
  getEvmAddresses,
}));

vi.mock("../src/signing/svm.js", () => ({
  getSolanaAddresses,
}));

vi.mock("../src/okx/portfolio.js", () => ({
  getHoldings,
}));

vi.mock("../src/okx/dex.js", () => ({
  getQuote,
}));

vi.mock("../src/cctp/evm.js", () => ({
  getUSDCBalanceForOwner,
}));

vi.mock("../src/cctp/svm.js", () => ({
  getUSDCBalanceSolana,
}));

const SETTINGS: SweepSettings = {
  sweepScope: "all",
  thresholdUSD: 0.5,
  includeNativeGas: false,
  gasReserveUSD: 0,
  includeStables: false,
  includeWrapped: false,
  excludeAddresses: [],
  chains: ["polygon"],
};

describe("scanDust live route annotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEvmAddresses.mockReturnValue(["0x1111111111111111111111111111111111111111"]);
    getSolanaAddresses.mockReturnValue([]);
    getUSDCBalanceForOwner.mockResolvedValue(0n);
    getUSDCBalanceSolana.mockResolvedValue(0n);
  });

  it("keeps all-eligible tokens visible when OKX cannot quote them", async () => {
    getHoldings.mockResolvedValueOnce([
      {
        tokenAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
        symbol: "AAVE",
        decimals: 18,
        balance: "0.01",
        rawBalance: "10000000000000000",
        priceUSD: 100,
        valueUSD: 1,
      },
    ]);
    getQuote.mockRejectedValueOnce(new Error("OKX quote: no route"));

    const { scanDust } = await import("../src/scan.js");
    const inv = await scanDust(SETTINGS);
    const token = inv.chains[0].tokens[0];

    expect(token.symbol).toBe("AAVE");
    expect(token.routeStatus).toBe("unavailable");
    expect(token.routeError).toMatch(/no route/i);
  });

  it("keeps tiny native gas visible but non-routable", async () => {
    getHoldings.mockResolvedValueOnce([
      {
        tokenAddress: "",
        symbol: "ETH",
        decimals: 18,
        balance: "0.000000659",
        rawBalance: "659000000000",
        priceUSD: 2276,
        valueUSD: 0.0015,
      },
    ]);

    const { scanDust } = await import("../src/scan.js");
    const inv = await scanDust({
      ...SETTINGS,
      includeNativeGas: true,
      chains: ["ethereum"],
    });
    const token = inv.chains[0].tokens[0];

    expect(token.symbol).toBe("ETH");
    expect(token.routeStatus).toBe("insufficient_gas");
    expect(token.routeError).toMatch(/gas budget/i);
    expect(getQuote).not.toHaveBeenCalled();
  });

  it("adds native USDC from a CCTP chain even when OKX portfolio is unsupported", async () => {
    getUSDCBalanceForOwner.mockResolvedValueOnce(12_300_000n);

    const { scanDust } = await import("../src/scan.js");
    const inv = await scanDust({
      ...SETTINGS,
      chains: ["unichain"],
    });
    const token = inv.chains[0].tokens[0];

    expect(getHoldings).not.toHaveBeenCalled();
    expect(token.symbol).toBe("USDC");
    expect(token.chain).toBe("unichain");
    expect(token.category).toBe("usdc");
    expect(token.quoteSource).toBe("direct");
    expect(token.routeStatus).toBe("ready");
    expect(token.balance).toBe("12.3");
    expect(token.usdValue).toBe(12.3);
  });

  it("keeps native USDC visible when portfolio scanning returns no tokens", async () => {
    getHoldings.mockResolvedValueOnce([]);
    getUSDCBalanceForOwner.mockResolvedValueOnce(1_500_000n);

    const { scanDust } = await import("../src/scan.js");
    const inv = await scanDust({
      ...SETTINGS,
      chains: ["polygon"],
    });
    const token = inv.chains[0].tokens[0];

    expect(getHoldings).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      "polygon"
    );
    expect(token.symbol).toBe("USDC");
    expect(token.address).toBe("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
    expect(token.quoteSource).toBe("direct");
    expect(token.usdValue).toBe(1.5);
  });

  it("does not duplicate native USDC when the portfolio already returned it", async () => {
    getHoldings.mockResolvedValueOnce([
      {
        tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        symbol: "USDC",
        decimals: 6,
        balance: "2.25",
        rawBalance: "2250000",
        priceUSD: 1,
        valueUSD: 2.25,
      },
    ]);
    getUSDCBalanceForOwner.mockResolvedValueOnce(2_250_000n);

    const { scanDust } = await import("../src/scan.js");
    const inv = await scanDust({
      ...SETTINGS,
      chains: ["polygon"],
    });

    expect(inv.chains[0].tokens.filter((t) => t.symbol === "USDC")).toHaveLength(1);
  });
});
