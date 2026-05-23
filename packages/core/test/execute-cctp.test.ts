import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SweepPlan } from "../src/types.js";

const approveUSDCForCCTP = vi.fn();
const burnUSDC = vi.fn();
const getUSDCBalance = vi.fn();
const mintUSDC = vi.fn();
const pollAttestation = vi.fn();
const pollAttestationByTx = vi.fn();
const burnFromSolana = vi.fn();
const getUSDCBalanceSolana = vi.fn();
const mintOnSolana = vi.fn();
const solanaATAToBytes32 = vi.fn();
const bridgeUSDCWithBridgeKit = vi.fn();
const getApproveTx = vi.fn();
const getSwapTx = vi.fn();
const sendTransaction = vi.fn();
const waitForTransactionReceipt = vi.fn();

const EVM_OWNER = "0x1111111111111111111111111111111111111111";
const EVM_PAYER = "0x2222222222222222222222222222222222222222";
const SOL_OWNER = "FwYRk5VnQ2X6kqQbAwUW1uPbNECkx5R9MEz1pPQfDhZf";
const SOL_PAYER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

vi.mock("../src/demo.js", () => ({
  isDemoMode: () => false,
  runDemoExecution: vi.fn(),
}));

vi.mock("../src/signing/evm.js", () => ({
  getWalletClient: vi.fn(() => ({
    account: { address: "0x1111111111111111111111111111111111111111" },
    chain: {},
    sendTransaction,
    writeContract: vi.fn(),
  })),
  getPublicClient: vi.fn(() => ({
    waitForTransactionReceipt,
  })),
}));

vi.mock("../src/cctp/evm.js", async () => {
  const actual = await vi.importActual<typeof import("../src/cctp/evm.js")>(
    "../src/cctp/evm.js"
  );
  return {
    ...actual,
    approveUSDCForCCTP,
    burnUSDC,
    getUSDCBalance,
    mintUSDC,
    pollAttestation,
    pollAttestationByTx,
  };
});

vi.mock("../src/cctp/svm.js", () => ({
  burnFromSolana,
  getUSDCBalanceSolana,
  mintOnSolana,
  solanaATAToBytes32,
}));

vi.mock("../src/cctp/bridge-kit.js", () => ({
  bridgeUSDCWithBridgeKit,
}));

vi.mock("../src/okx/dex.js", () => ({
  getApproveTx,
  getSwapTx,
}));

vi.mock("../src/okx/solana-swap.js", () => ({
  executeSolanaSwap: vi.fn(),
}));

describe("executeSweep CCTP live path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTransaction.mockResolvedValue(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    getApproveTx.mockResolvedValue({
      to: "0x3333333333333333333333333333333333333333",
      data: "0x095ea7b3",
      value: "0",
      gas: "0",
    });
    getSwapTx.mockResolvedValue({
      to: "0x3333333333333333333333333333333333333333",
      data: "0x",
      value: "0",
      gas: "0",
    });
    getUSDCBalance.mockResolvedValueOnce(0n).mockResolvedValueOnce(50_000000n);
    approveUSDCForCCTP.mockResolvedValue(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    burnUSDC.mockResolvedValue({
      txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      messageBody: "0x1234",
    });
    pollAttestation.mockResolvedValue("0xabcd");
    pollAttestationByTx.mockResolvedValue({
      message: "0x1234",
      attestation: "0xabcd",
    });
    mintUSDC.mockResolvedValue(
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    );
    burnFromSolana.mockResolvedValue({
      txHash: "sol-burn-tx",
      messageBytes: new Uint8Array([1, 2, 3]),
      messageHash: "0xdddd",
    });
    getUSDCBalanceSolana
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(50_000000n);
    mintOnSolana.mockResolvedValue("sol-mint-tx");
    solanaATAToBytes32.mockResolvedValue(new Uint8Array(32).fill(2));
    bridgeUSDCWithBridgeKit.mockResolvedValue({
      txHashes: ["0xbridge-approve", "0xbridge-burn", "0xbridge-mint"],
      state: "success",
      steps: [],
      retryable: false,
    });
  });

  it("delegates the EVM CCTP leg to Bridge Kit instead of hand-rolled approve/burn/mint", async () => {
    const { executeSweep } = await import("../src/execute.js");
    const plan: SweepPlan = {
      destChain: "arbitrum",
      aggregationMode: "per-wallet",
      destinationPayer: EVM_PAYER,
      createdAt: 0,
      totalCostUSD: 0,
      totalReceiveUSDC: 49.5,
      perChain: [
        {
          chain: "base",
          owner: EVM_OWNER,
          mintRecipient: EVM_OWNER,
          estimatedCostUSD: 0,
          estimatedReceiveUSDC: 49.5,
          willAccumulate: false,
          steps: [
            {
              kind: "cctp_burn",
              chain: "base",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 49.5,
              details: {
                destChain: "arbitrum",
                mintRecipient: EVM_OWNER,
              },
            },
          ],
        },
      ],
    };

    await executeSweep(plan);

    expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChain: "base",
        destChain: "arbitrum",
        sourceOwner: EVM_OWNER,
        destinationPayer: EVM_PAYER,
        mintRecipient: EVM_OWNER,
        amountRaw: 50_000000n,
      }),
      expect.any(Function)
    );
    expect(approveUSDCForCCTP).not.toHaveBeenCalled();
    expect(burnUSDC).not.toHaveBeenCalled();
    expect(mintUSDC).not.toHaveBeenCalled();
  });

  it("uses the explicit EVM destination payer for Solana → EVM mints", async () => {
    const { executeSweep } = await import("../src/execute.js");
    const plan: SweepPlan = {
      destChain: "arbitrum",
      aggregationMode: "unified",
      destinationPayer: EVM_PAYER,
      createdAt: 0,
      totalCostUSD: 0,
      totalReceiveUSDC: 49.5,
      perChain: [
        {
          chain: "solana",
          owner: SOL_OWNER,
          mintRecipient: EVM_OWNER,
          estimatedCostUSD: 0,
          estimatedReceiveUSDC: 49.5,
          willAccumulate: false,
          steps: [
            {
              kind: "cctp_burn",
              chain: "solana",
              owner: SOL_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 49.5,
              details: {
                destChain: "arbitrum",
                mintRecipient: EVM_OWNER,
              },
            },
          ],
        },
      ],
    };

    await executeSweep(plan);

    expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChain: "solana",
        destChain: "arbitrum",
        sourceOwner: SOL_OWNER,
        destinationPayer: EVM_PAYER,
        mintRecipient: EVM_OWNER,
        amountRaw: 50_000000n,
      }),
      expect.any(Function)
    );
    expect(burnFromSolana).not.toHaveBeenCalled();
    expect(mintUSDC).not.toHaveBeenCalled();
  });

  it("uses the explicit Solana destination payer for EVM → Solana mints", async () => {
    const { executeSweep } = await import("../src/execute.js");
    const plan: SweepPlan = {
      destChain: "solana",
      aggregationMode: "unified",
      destinationPayer: SOL_PAYER,
      createdAt: 0,
      totalCostUSD: 0,
      totalReceiveUSDC: 49.5,
      perChain: [
        {
          chain: "base",
          owner: EVM_OWNER,
          mintRecipient: SOL_OWNER,
          estimatedCostUSD: 0,
          estimatedReceiveUSDC: 49.5,
          willAccumulate: false,
          steps: [
            {
              kind: "cctp_burn",
              chain: "base",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 49.5,
              details: {
                destChain: "solana",
                mintRecipient: SOL_OWNER,
              },
            },
          ],
        },
      ],
    };

    await executeSweep(plan);

    expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChain: "base",
        destChain: "solana",
        sourceOwner: EVM_OWNER,
        destinationPayer: SOL_PAYER,
        mintRecipient: SOL_OWNER,
        amountRaw: 50_000000n,
      }),
      expect.any(Function)
    );
    expect(burnUSDC).not.toHaveBeenCalled();
    expect(mintOnSolana).not.toHaveBeenCalled();
  });

  it("bridges selected native USDC even when it existed before the sweep", async () => {
    getUSDCBalance.mockReset();
    getUSDCBalance
      .mockResolvedValueOnce(100_000000n)
      .mockResolvedValueOnce(100_000000n);
    const { executeSweep } = await import("../src/execute.js");
    const plan: SweepPlan = {
      destChain: "arbitrum",
      aggregationMode: "unified",
      destinationPayer: EVM_PAYER,
      createdAt: 0,
      totalCostUSD: 0,
      totalReceiveUSDC: 17,
      perChain: [
        {
          chain: "base",
          owner: EVM_OWNER,
          mintRecipient: EVM_OWNER,
          estimatedCostUSD: 0,
          estimatedReceiveUSDC: 17,
          willAccumulate: false,
          steps: [
            {
              kind: "cctp_burn",
              chain: "base",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 17,
              details: {
                destChain: "arbitrum",
                mintRecipient: EVM_OWNER,
                directUsdcRaw: "17000000",
              },
            },
          ],
        },
      ],
    };

    await executeSweep(plan);

    expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountRaw: 17_000000n,
      }),
      expect.any(Function)
    );
  });

  it("does not mark a run successful when only an approval landed before CCTP found no USDC", async () => {
    const oldAttempts = process.env.USDC_BALANCE_POLL_ATTEMPTS;
    const oldDelay = process.env.USDC_BALANCE_POLL_MS;
    process.env.USDC_BALANCE_POLL_ATTEMPTS = "3";
    process.env.USDC_BALANCE_POLL_MS = "0";
    getUSDCBalance.mockReset();
    getUSDCBalance.mockResolvedValue(0n);

    try {
      const { executeSweep } = await import("../src/execute.js");
      const plan: SweepPlan = {
        destChain: "base",
        aggregationMode: "unified",
        destinationPayer: EVM_PAYER,
        createdAt: 0,
        totalCostUSD: 0,
        totalReceiveUSDC: 1,
        perChain: [
          {
            chain: "polygon",
            owner: EVM_OWNER,
            mintRecipient: EVM_OWNER,
            estimatedCostUSD: 0,
            estimatedReceiveUSDC: 1,
            willAccumulate: false,
            steps: [
              {
                kind: "approve",
                chain: "polygon",
                owner: EVM_OWNER,
                estimatedGasUSD: 0,
                token: {
                  owner: EVM_OWNER,
                  chain: "polygon",
                  address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
                  symbol: "AAVE",
                  decimals: 18,
                  balance: "0.01",
                  rawBalance: "10000000000000000",
                  usdValue: 1,
                  priceUSD: 100,
                  category: "normal",
                  needsApproval: true,
                },
                details: {},
              },
              {
                kind: "cctp_burn",
                chain: "polygon",
                owner: EVM_OWNER,
                estimatedGasUSD: 0,
                estimatedReceiveUSDC: 1,
                details: {
                  destChain: "base",
                  mintRecipient: EVM_OWNER,
                },
              },
            ],
          },
        ],
      };

      const result = await executeSweep(plan);

      expect(result.status).toBe("failed");
      expect(result.totalReceivedUSDC).toBe(0);
      expect(result.perChain[0].status).toBe("partial");
      expect(result.perChain[0].error).toMatch(/no fresh USDC/i);
      expect(bridgeUSDCWithBridgeKit).not.toHaveBeenCalled();
    } finally {
      if (oldAttempts === undefined) delete process.env.USDC_BALANCE_POLL_ATTEMPTS;
      else process.env.USDC_BALANCE_POLL_ATTEMPTS = oldAttempts;
      if (oldDelay === undefined) delete process.env.USDC_BALANCE_POLL_MS;
      else process.env.USDC_BALANCE_POLL_MS = oldDelay;
    }
  });

  it("marks the chain partial when one selected token fails but direct USDC still bridges", async () => {
    sendTransaction.mockReset();
    sendTransaction.mockRejectedValueOnce(new Error("approval rejected"));
    getUSDCBalance.mockReset();
    getUSDCBalance.mockResolvedValue(20_000000n);

    const { executeSweep } = await import("../src/execute.js");
    const plan: SweepPlan = {
      destChain: "base",
      aggregationMode: "unified",
      destinationPayer: EVM_PAYER,
      createdAt: 0,
      totalCostUSD: 0,
      totalReceiveUSDC: 18,
      perChain: [
        {
          chain: "polygon",
          owner: EVM_OWNER,
          mintRecipient: EVM_OWNER,
          estimatedCostUSD: 0,
          estimatedReceiveUSDC: 18,
          willAccumulate: false,
          steps: [
            {
              kind: "approve",
              chain: "polygon",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              token: {
                owner: EVM_OWNER,
                chain: "polygon",
                address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
                symbol: "AAVE",
                decimals: 18,
                balance: "0.01",
                rawBalance: "10000000000000000",
                usdValue: 1,
                priceUSD: 100,
                category: "normal",
                needsApproval: true,
              },
              details: {},
            },
            {
              kind: "swap",
              chain: "polygon",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 1,
              token: {
                owner: EVM_OWNER,
                chain: "polygon",
                address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
                symbol: "AAVE",
                decimals: 18,
                balance: "0.01",
                rawBalance: "10000000000000000",
                usdValue: 1,
                priceUSD: 100,
                category: "normal",
                needsApproval: true,
              },
              details: {},
            },
            {
              kind: "cctp_burn",
              chain: "polygon",
              owner: EVM_OWNER,
              estimatedGasUSD: 0,
              estimatedReceiveUSDC: 18,
              details: {
                destChain: "base",
                mintRecipient: EVM_OWNER,
                directUsdcRaw: "17000000",
              },
            },
          ],
        },
      ],
    };

    const result = await executeSweep(plan);

    expect(result.status).toBe("partial");
    expect(result.totalReceivedUSDC).toBe(17);
    expect(result.perChain[0].status).toBe("partial");
    expect(result.perChain[0].receivedUSDC).toBe(17);
    expect(result.perChain[0].error).toMatch(/approval rejected/i);
    expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountRaw: 17_000000n,
      }),
      expect.any(Function)
    );
  });

  it("waits for fresh native USDC after a successful swap before bridging", async () => {
    const oldAttempts = process.env.USDC_BALANCE_POLL_ATTEMPTS;
    const oldDelay = process.env.USDC_BALANCE_POLL_MS;
    process.env.USDC_BALANCE_POLL_ATTEMPTS = "3";
    process.env.USDC_BALANCE_POLL_MS = "0";
    getUSDCBalance.mockReset();
    getUSDCBalance
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(17_750000n);

    try {
      const { executeSweep } = await import("../src/execute.js");
      const plan: SweepPlan = {
        destChain: "base",
        aggregationMode: "unified",
        destinationPayer: EVM_PAYER,
        createdAt: 0,
        totalCostUSD: 0,
        totalReceiveUSDC: 17.75,
        perChain: [
          {
            chain: "polygon",
            owner: EVM_OWNER,
            mintRecipient: EVM_OWNER,
            estimatedCostUSD: 0,
            estimatedReceiveUSDC: 17.75,
            willAccumulate: false,
            steps: [
              {
                kind: "approve",
                chain: "polygon",
                owner: EVM_OWNER,
                estimatedGasUSD: 0,
                token: {
                  owner: EVM_OWNER,
                  chain: "polygon",
                  address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
                  symbol: "AAVE",
                  decimals: 18,
                  balance: "0.01",
                  rawBalance: "10000000000000000",
                  usdValue: 17.75,
                  priceUSD: 1775,
                  category: "normal",
                  needsApproval: true,
                },
                details: {},
              },
              {
                kind: "swap",
                chain: "polygon",
                owner: EVM_OWNER,
                estimatedGasUSD: 0,
                estimatedReceiveUSDC: 17.75,
                token: {
                  owner: EVM_OWNER,
                  chain: "polygon",
                  address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
                  symbol: "AAVE",
                  decimals: 18,
                  balance: "0.01",
                  rawBalance: "10000000000000000",
                  usdValue: 17.75,
                  priceUSD: 1775,
                  category: "normal",
                  needsApproval: true,
                },
                details: {},
              },
              {
                kind: "cctp_burn",
                chain: "polygon",
                owner: EVM_OWNER,
                estimatedGasUSD: 0,
                estimatedReceiveUSDC: 17.75,
                details: {
                  destChain: "base",
                  mintRecipient: EVM_OWNER,
                },
              },
            ],
          },
        ],
      };

      const result = await executeSweep(plan);

      expect(result.status).toBe("success");
      expect(bridgeUSDCWithBridgeKit).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceChain: "polygon",
          destChain: "base",
          amountRaw: 17_750000n,
        }),
        expect.any(Function)
      );
      expect(getUSDCBalance).toHaveBeenCalledTimes(3);
    } finally {
      if (oldAttempts === undefined) delete process.env.USDC_BALANCE_POLL_ATTEMPTS;
      else process.env.USDC_BALANCE_POLL_ATTEMPTS = oldAttempts;
      if (oldDelay === undefined) delete process.env.USDC_BALANCE_POLL_MS;
      else process.env.USDC_BALANCE_POLL_MS = oldDelay;
    }
  });
});
