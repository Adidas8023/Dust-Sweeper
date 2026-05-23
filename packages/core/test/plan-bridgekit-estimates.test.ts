import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SweepPlan } from "../src/types.js";

const estimateUSDCBridgeWithBridgeKit = vi.fn();

vi.mock("../src/cctp/bridge-kit.js", () => ({
  estimateUSDCBridgeWithBridgeKit,
}));

const OWNER = "0x1111111111111111111111111111111111111111";
const PAYER = "0x2222222222222222222222222222222222222222";

function mkPlan(): SweepPlan {
  return {
    destChain: "arbitrum",
    aggregationMode: "unified",
    destinationPayer: PAYER,
    totalCostUSD: 0.1,
    totalReceiveUSDC: 9.9,
    totalInputUSD: 10,
    totalSwapOutputUSDC: 9.9,
    totalRouteImpactUSD: 0.1,
    totalCctpProtocolFeeUSDC: 0,
    totalGasUSD: 0.1,
    createdAt: 0,
    perChain: [
      {
        chain: "base",
        owner: OWNER,
        mintRecipient: PAYER,
        estimatedCostUSD: 0.1,
        estimatedReceiveUSDC: 9.9,
        inputUSD: 10,
        swapOutputUSDC: 9.9,
        routeImpactUSD: 0.1,
        cctpProtocolFeeUSDC: 0,
        willAccumulate: false,
        steps: [
          {
            kind: "cctp_burn",
            chain: "base",
            owner: OWNER,
            estimatedGasUSD: 0.1,
            details: {
              destChain: "arbitrum",
              mintRecipient: PAYER,
              destinationPayer: PAYER,
              cctpProtocolFeeUSDC: 0,
            },
          },
        ],
      },
    ],
  };
}

describe("enrichPlanWithBridgeKitEstimates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estimateUSDCBridgeWithBridgeKit.mockResolvedValue({
      cctpProtocolFeeUSDC: 0.04,
      gasFees: [
        {
          name: "burn",
          token: "ETH",
          blockchain: "Base",
          fees: { amount: "0.0001" },
        },
      ],
      fees: [{ type: "provider", token: "USDC", amount: "0.04" }],
    });
  });

  it("uses Bridge Kit estimates to update bridge fee and net receive", async () => {
    const { enrichPlanWithBridgeKitEstimates } = await import("../src/plan.js");
    const plan = await enrichPlanWithBridgeKitEstimates(mkPlan());

    expect(estimateUSDCBridgeWithBridgeKit).toHaveBeenCalledWith({
      sourceChain: "base",
      destChain: "arbitrum",
      sourceOwner: OWNER,
      destinationPayer: PAYER,
      mintRecipient: PAYER,
      amountUSDC: "9.9",
    });
    expect(plan.perChain[0].cctpProtocolFeeUSDC).toBe(0.04);
    expect(plan.perChain[0].estimatedReceiveUSDC).toBeCloseTo(9.86);
    expect(plan.totalCctpProtocolFeeUSDC).toBe(0.04);
    expect(plan.totalReceiveUSDC).toBeCloseTo(9.86);
    expect((plan.perChain[0].steps[0].details as any).bridgeProvider).toBe(
      "circle-bridge-kit"
    );
  });

  it("keeps the fallback plan when Bridge Kit estimation fails", async () => {
    estimateUSDCBridgeWithBridgeKit.mockRejectedValueOnce(new Error("rpc down"));
    const { enrichPlanWithBridgeKitEstimates } = await import("../src/plan.js");
    const plan = await enrichPlanWithBridgeKitEstimates(mkPlan());

    expect(plan.totalReceiveUSDC).toBe(9.9);
    expect((plan.perChain[0].steps[0].details as any).bridgeEstimateError).toBe(
      "rpc down"
    );
  });
});
