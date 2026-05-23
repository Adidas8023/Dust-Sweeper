import { describe, it, expect } from "vitest";
import { planSweep } from "../src/plan.js";
import { CHAINS } from "../src/chains/index.js";
import type { DustInventory, DustToken } from "../src/types.js";

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const DEST_PAYER = "0x4444444444444444444444444444444444444444";
const SOL_OWNER = "FwYRk5VnQ2X6kqQbAwUW1uPbNECkx5R9MEz1pPQfDhZf";
const SOL_RECIPIENT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function mkToken(over: Partial<DustToken> = {}): DustToken {
  return {
    owner: OWNER_A,
    chain: "base",
    address: "0xaaa",
    symbol: "A",
    decimals: 18,
    balance: "1000",
    usdValue: 5,
    priceUSD: 0.005,
    category: "normal",
    needsApproval: true,
    ...over,
  };
}

function mkInventory(tokens: DustToken[]): DustInventory {
  const byChain = new Map<string, DustToken[]>();
  for (const t of tokens) {
    const arr = byChain.get(t.chain) ?? [];
    arr.push(t);
    byChain.set(t.chain, arr);
  }
  const ownerTotals = new Map<string, number>();
  for (const t of tokens) {
    ownerTotals.set(t.owner, (ownerTotals.get(t.owner) ?? 0) + t.usdValue);
  }
  const evmOwners = new Set<string>();
  const solOwners = new Set<string>();
  for (const t of tokens) {
    if (t.chain === "solana") solOwners.add(t.owner);
    else evmOwners.add(t.owner);
  }
  evmOwners.add(DEST_PAYER);
  solOwners.add(SOL_RECIPIENT);
  return {
    wallets: { evm: [...evmOwners], solana: [...solOwners] },
    chains: Array.from(byChain.entries()).map(([chain, ts]) => ({
      chain: chain as DustToken["chain"],
      tokens: ts,
      subtotalUSD: ts.reduce((s, t) => s + t.usdValue, 0),
    })),
    byOwner: Array.from(ownerTotals.entries()).map(([owner, totalUSD]) => ({
      owner,
      totalUSD,
    })),
    grandTotalUSD: tokens.reduce((s, t) => s + t.usdValue, 0),
    scannedAt: 0,
  };
}

describe("planSweep — single wallet (legacy)", () => {
  it("builds per-chain plan with approve + swap + cctp_burn steps", () => {
    const inv = mkInventory([
      mkToken({ address: "0xaaa", usdValue: 5 }),
      mkToken({ address: "0xbbb", usdValue: 3 }),
    ]);
    const plan = planSweep(inv, "arbitrum");
    expect(plan.destChain).toBe("arbitrum");
    expect(plan.aggregationMode).toBe("per-wallet");
    expect(plan.perChain.length).toBe(1);
    const base = plan.perChain[0];
    expect(base.owner).toBe(OWNER_A);
    expect(base.mintRecipient).toBe(OWNER_A); // per-wallet → mint back to source
    expect(base.steps.length).toBe(5); // 2 approve + 2 swap + 1 burn
    expect(base.willAccumulate).toBe(false);
    expect(base.estimatedReceiveUSDC).toBeGreaterThan(7);
  });

  it("still bridges small CCTP amounts instead of applying an app-side minimum", () => {
    const inv = mkInventory([mkToken({ usdValue: 0.5 })]);
    const plan = planSweep(inv, "arbitrum");
    expect(plan.perChain[0].willAccumulate).toBe(false);
    expect(plan.perChain[0].skipReason).toBeUndefined();
    expect(plan.perChain[0].steps.some((s) => s.kind === "cctp_burn")).toBe(
      true
    );
  });

  it("skips cctp_burn when source == dest", () => {
    const inv = mkInventory([mkToken({ chain: "arbitrum", usdValue: 10 })]);
    const plan = planSweep(inv, "arbitrum");
    const steps = plan.perChain[0].steps;
    expect(steps.find((s) => s.kind === "cctp_burn")).toBeUndefined();
    expect(plan.perChain[0].willAccumulate).toBe(false);
  });
});

describe("planSweep — multi-wallet aggregation", () => {
  it("emits one ChainPlan per (owner, chain) in per-wallet mode", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, address: "0xaaa", usdValue: 5 }),
      mkToken({ owner: OWNER_B, address: "0xbbb", usdValue: 5 }),
    ]);
    const plan = planSweep(inv, "arbitrum", { aggregationMode: "per-wallet" });
    expect(plan.perChain.length).toBe(2);
    const ownerA = plan.perChain.find((p) => p.owner === OWNER_A)!;
    const ownerB = plan.perChain.find((p) => p.owner === OWNER_B)!;
    expect(ownerA.mintRecipient).toBe(OWNER_A);
    expect(ownerB.mintRecipient).toBe(OWNER_B);
  });

  it("unified mode + EVM dest uses recipientEvm for every plan", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, address: "0xaaa", usdValue: 5 }),
      mkToken({ owner: OWNER_B, address: "0xbbb", usdValue: 5 }),
    ]);
    const plan = planSweep(inv, "arbitrum", {
      aggregationMode: "unified",
      recipientEvm: RECIPIENT,
    });
    expect(plan.aggregationMode).toBe("unified");
    expect(plan.perChain.every((p) => p.mintRecipient === RECIPIENT)).toBe(true);
    // CCTP burn step also carries the unified recipient in details
    for (const cp of plan.perChain) {
      const burn = cp.steps.find((s) => s.kind === "cctp_burn");
      expect((burn!.details as any).mintRecipient).toBe(RECIPIENT);
    }
  });

  it("unified mode + Solana dest uses recipientSolana", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, chain: "ethereum", usdValue: 12 }),
    ]);
    const plan = planSweep(inv, "solana", {
      aggregationMode: "unified",
      recipientSolana: SOL_RECIPIENT,
    });
    expect(plan.perChain[0].mintRecipient).toBe(SOL_RECIPIENT);
  });

  it("unified mode + EVM dest without recipientEvm throws", () => {
    const inv = mkInventory([mkToken({ usdValue: 5 })]);
    expect(() =>
      planSweep(inv, "arbitrum", { aggregationMode: "unified" })
    ).toThrowError(/recipientEvm/);
  });

  it("unified mode + Solana dest without recipientSolana throws", () => {
    const inv = mkInventory([mkToken({ usdValue: 5 })]);
    expect(() =>
      planSweep(inv, "solana", { aggregationMode: "unified" })
    ).toThrowError(/recipientSolana/);
  });

  it("rejects malformed recipientEvm", () => {
    const inv = mkInventory([mkToken({ usdValue: 5 })]);
    expect(() =>
      planSweep(inv, "arbitrum", {
        aggregationMode: "unified",
        recipientEvm: "not-an-address",
      })
    ).toThrowError(/recipientEvm/);
  });

  it("rejects malformed recipientSolana", () => {
    const inv = mkInventory([mkToken({ chain: "ethereum", usdValue: 12 })]);
    expect(() =>
      planSweep(inv, "solana", {
        aggregationMode: "unified",
        recipientSolana: "0x1234",
      })
    ).toThrowError(/recipientSolana/);
  });

  it("mixed EVM + Solana sources collapse to one plan each in unified mode", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, chain: "ethereum", usdValue: 8 }),
      mkToken({ owner: SOL_OWNER, chain: "solana", usdValue: 6 }),
    ]);
    const plan = planSweep(inv, "arbitrum", {
      aggregationMode: "unified",
      recipientEvm: RECIPIENT,
    });
    expect(plan.perChain.length).toBe(2);
    expect(plan.perChain.every((p) => p.mintRecipient === RECIPIENT)).toBe(true);
    const owners = plan.perChain.map((p) => p.owner).sort();
    expect(owners).toEqual([OWNER_A, SOL_OWNER].sort());
  });

  it("steps inherit owner from their chain plan", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, address: "0xaaa", usdValue: 5 }),
      mkToken({ owner: OWNER_B, address: "0xbbb", usdValue: 5 }),
    ]);
    const plan = planSweep(inv, "arbitrum");
    for (const cp of plan.perChain) {
      for (const step of cp.steps) {
        expect(step.owner).toBe(cp.owner);
      }
    }
  });

  it("uses quoted USDC output for plan totals instead of adding gas costs to receive", () => {
    const inv = mkInventory([
      mkToken({
        chain: "arbitrum",
        address: "0xaaa",
        usdValue: 10,
        ...({ quoteToUSDC: 8, quoteSource: "okx" } as any),
      }),
    ]);

    const plan = planSweep(inv, "arbitrum");

    expect(plan.totalInputUSD).toBe(10);
    expect(plan.totalSwapOutputUSDC).toBeCloseTo(7.92);
    expect(plan.totalRouteImpactUSD).toBeCloseTo(2.08);
    expect(plan.totalCctpProtocolFeeUSDC).toBe(0);
    expect(plan.totalReceiveUSDC).toBeCloseTo(7.92);
    expect(plan.totalReceiveUSDC).toBeLessThan(plan.totalInputUSD!);
    expect(plan.quoteSource).toBe("okx");
  });

  it("passes native USDC directly into CCTP without OKX swap or slippage", () => {
    const inv = mkInventory([
      mkToken({
        chain: "polygon",
        address: CHAINS.polygon.usdcAddress,
        symbol: "USDC",
        decimals: 6,
        balance: "17",
        rawBalance: "17000000",
        usdValue: 17,
        priceUSD: 1,
        category: "usdc",
        needsApproval: false,
        ...({ quoteToUSDC: 17, quoteSource: "direct" } as any),
      }),
    ]);

    const plan = planSweep(inv, "base", {
      aggregationMode: "unified",
      recipientEvm: RECIPIENT,
      destinationPayerEvm: DEST_PAYER,
      requireDestinationPayer: true,
    });
    const cp = plan.perChain[0];

    expect(cp.steps.map((s) => s.kind)).toEqual(["cctp_burn"]);
    expect(cp.swapOutputUSDC).toBe(17);
    expect(cp.estimatedReceiveUSDC).toBe(17);
    expect(cp.quoteSource).toBe("direct");
    expect(cp.routeKind).toBe("cctp_only");
    expect(cp.steps[0].details.directUsdcRaw).toBe("17000000");
  });

  it("marks swap routes that cross chains separately from CCTP-only routes", () => {
    const inv = mkInventory([
      mkToken({
        chain: "polygon",
        usdValue: 8,
        ...({ quoteToUSDC: 7.5, quoteSource: "okx" } as any),
      }),
    ]);

    const plan = planSweep(inv, "base", {
      aggregationMode: "unified",
      recipientEvm: RECIPIENT,
      destinationPayerEvm: DEST_PAYER,
      requireDestinationPayer: true,
    });

    expect(plan.perChain[0].routeKind).toBe("swap_then_cctp");
  });

  it("marks same-chain swap routes as local swaps", () => {
    const inv = mkInventory([
      mkToken({
        chain: "base",
        usdValue: 8,
        ...({ quoteToUSDC: 7.5, quoteSource: "okx" } as any),
      }),
    ]);

    const plan = planSweep(inv, "base");

    expect(plan.perChain[0].routeKind).toBe("local_swap");
  });

  it("rejects selected tokens that scanned but do not have an OKX route", () => {
    const inv = mkInventory([
      mkToken({
        symbol: "AAVE",
        usdValue: 1,
        ...({
          routeStatus: "unavailable",
          routeError: "OKX quote: no route",
        } as any),
      }),
    ]);

    expect(() => planSweep(inv, "arbitrum")).toThrowError(/AAVE.*no route/i);
  });

  it("records an explicit EVM destination payer for bridged mints", () => {
    const inv = mkInventory([
      mkToken({ owner: SOL_OWNER, chain: "solana", usdValue: 12 }),
    ]);

    const plan = planSweep(inv, "arbitrum", {
      aggregationMode: "unified",
      recipientEvm: RECIPIENT,
      destinationPayerEvm: DEST_PAYER,
      requireDestinationPayer: true,
    });

    expect(plan.destinationPayer).toBe(DEST_PAYER);
    const burn = plan.perChain[0].steps.find((s) => s.kind === "cctp_burn");
    expect((burn!.details as any).destinationPayer).toBe(DEST_PAYER);
  });

  it("requires an explicit destination payer in strict UI planning mode", () => {
    const inv = mkInventory([
      mkToken({ owner: SOL_OWNER, chain: "solana", usdValue: 12 }),
    ]);

    expect(() =>
      planSweep(inv, "arbitrum", {
        aggregationMode: "unified",
        recipientEvm: RECIPIENT,
        requireDestinationPayer: true,
      })
    ).toThrowError(/destinationPayerEvm/);
  });

  it("rejects malformed or unscanned Solana destination payers", () => {
    const inv = mkInventory([
      mkToken({ owner: OWNER_A, chain: "ethereum", usdValue: 12 }),
    ]);

    expect(() =>
      planSweep(inv, "solana", {
        aggregationMode: "unified",
        recipientSolana: SOL_RECIPIENT,
        destinationPayerSolana: "not-solana",
        requireDestinationPayer: true,
      })
    ).toThrowError(/destinationPayerSolana/);
  });
});
