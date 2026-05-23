import type {
  Chain,
  ChainPlan,
  ProgressEvent,
  SweepPlan,
  SweepResult,
  SweepStep,
} from "./types.js";
import { CHAINS } from "./chains/index.js";
import { getWalletClient, getPublicClient } from "./signing/evm.js";
import { getSwapTx, getApproveTx } from "./okx/dex.js";
import { executeSolanaSwap } from "./okx/solana-swap.js";
import {
  getUSDCBalance,
} from "./cctp/evm.js";
import {
  getUSDCBalanceSolana,
} from "./cctp/svm.js";
import { bridgeUSDCWithBridgeKit } from "./cctp/bridge-kit.js";
import { getSolanaConnection, getSolanaKeypair } from "./signing/svm.js";
import { USDC_MINT } from "./solana/constants.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { encodeFunctionData, formatUnits, parseUnits } from "viem";
import { randomUUID } from "node:crypto";
import { isDemoMode, runDemoExecution } from "./demo.js";

type OnProgress = (e: ProgressEvent) => void;

export async function executeSweep(
  plan: SweepPlan,
  onProgress: OnProgress = () => {}
): Promise<SweepResult> {
  if (isDemoMode()) return runDemoExecution(plan, onProgress);

  const grouped = new Map<string, Array<{ cp: ChainPlan; index: number }>>();
  plan.perChain.forEach((cp, index) => {
    const key = `${cp.chain}:${cp.owner}`.toLowerCase();
    const items = grouped.get(key) ?? [];
    items.push({ cp, index });
    grouped.set(key, items);
  });

  const indexedResults = await Promise.all(
    Array.from(grouped.values()).map(async (items) => {
      const groupResults: Array<{
        index: number;
        result: SweepResult["perChain"][number];
      }> = [];
      for (const item of items) {
        groupResults.push({
          index: item.index,
          result: await runChainPlan(
            item.cp,
            plan.destChain,
            plan.destinationPayer,
            onProgress
          ),
        });
      }
      return groupResults;
    })
  );
  const results = indexedResults
    .flat()
    .sort((a, b) => a.index - b.index)
    .map(({ result }) => result);
  const allSuccess = results.every((r) => r.status === "success");
  const anyDelivered = results.some(
    (r) =>
      r.status === "success" ||
      (r.status === "partial" && (r.receivedUSDC ?? 0) > 0)
  );
  const allFailed = results.every(
    (r) => r.status === "failed" || r.status === "skipped"
  );
  const status: SweepResult["status"] = allSuccess
    ? "success"
    : allFailed || !anyDelivered
      ? "failed"
      : "partial";
  onProgress({ kind: "sweep_complete", timestamp: Date.now() });
  return {
    planId: randomUUID(),
    status,
    perChain: results,
    totalReceivedUSDC: results.reduce((s, r) => s + (r.receivedUSDC ?? 0), 0),
    completedAt: Date.now(),
  };
}

async function runChainPlan(
  cp: ChainPlan,
  destChain: Chain,
  destinationPayer: string | undefined,
  onProgress: OnProgress
): Promise<SweepResult["perChain"][number]> {
  if (cp.willAccumulate) {
    return {
      chain: cp.chain,
      owner: cp.owner,
      status: "skipped",
      txHashes: [],
      error: cp.skipReason,
    };
  }

  // Snapshot pre-existing USDC so post-swap actions only move selected native
  // USDC plus the delta produced by this sweep, not unrelated idle USDC.
  let preBalance = 0n;
  try {
    if (CHAINS[cp.chain].isEVM)
      preBalance = await getUSDCBalance(cp.chain, cp.owner);
    else preBalance = await getUSDCBalanceSolana(cp.owner);
  } catch {
    /* ignore — snapshot is best-effort */
  }
  cp.steps.forEach((s) => {
    if (s.kind === "cctp_burn" || s.kind === "usdc_transfer") {
      (s.details as any)._preUsdcBalance = preBalance.toString();
    }
  });

  onProgress({
    kind: "chain_start",
    chain: cp.chain,
    owner: cp.owner,
    timestamp: Date.now(),
  });
  const txHashes: string[] = [];
  const stepErrors: string[] = [];
  let deliveredUSDC = 0;
  let fatalError: string | undefined;
  let skipUntilNextToken: string | null = null; // address of failing token

  for (let i = 0; i < cp.steps.length; i++) {
    const step = cp.steps[i];

    if (
      skipUntilNextToken &&
      step.token &&
      step.token.address.toLowerCase() === skipUntilNextToken.toLowerCase()
    ) {
      onProgress({
        kind: "step_failed",
        chain: cp.chain,
        owner: cp.owner,
        stepIdx: i,
        error: `skipped (paired step failed for ${step.token.symbol})`,
        timestamp: Date.now(),
      });
      continue;
    }
    skipUntilNextToken = null;

    onProgress({
      kind: "step_start",
      chain: cp.chain,
      owner: cp.owner,
      stepIdx: i,
      timestamp: Date.now(),
    });
    try {
      const outcome = await runStep(
        step,
        destChain,
        cp.mintRecipient,
        destinationPayer,
        (sub) =>
          onProgress({
            ...sub,
            chain: cp.chain,
            owner: cp.owner,
            stepIdx: i,
            timestamp: Date.now(),
          })
      );
      const hash = outcome.txHash;
      if (hash) txHashes.push(hash);
      if (typeof outcome.receivedUSDC === "number") {
        deliveredUSDC += outcome.receivedUSDC;
      } else if (
        step.kind === "swap" &&
        cp.chain === destChain &&
        sameAddress(cp.owner, cp.mintRecipient) &&
        typeof step.estimatedReceiveUSDC === "number"
      ) {
        deliveredUSDC += step.estimatedReceiveUSDC;
      }
      onProgress({
        kind: "step_success",
        chain: cp.chain,
        owner: cp.owner,
        stepIdx: i,
        txHash: hash ?? undefined,
        timestamp: Date.now(),
      });
    } catch (e: any) {
      const msg = e.message ?? String(e);
      stepErrors.push(msg);
      onProgress({
        kind: "step_failed",
        chain: cp.chain,
        owner: cp.owner,
        stepIdx: i,
        error: msg,
        timestamp: Date.now(),
      });
      if (step.kind === "approve" && step.token) {
        skipUntilNextToken = step.token.address;
      } else if (step.kind === "cctp_burn") {
        fatalError = msg;
        break;
      }
    }
  }
  const fatal = Boolean(fatalError);

  if (fatal) {
    return {
      chain: cp.chain,
      owner: cp.owner,
      status: txHashes.length > 0 || deliveredUSDC > 0 ? "partial" : "failed",
      txHashes,
      ...(deliveredUSDC > 0 ? { receivedUSDC: deliveredUSDC } : {}),
      error: fatalError,
    };
  }
  if (stepErrors.length > 0) {
    return {
      chain: cp.chain,
      owner: cp.owner,
      status: txHashes.length > 0 || deliveredUSDC > 0 ? "partial" : "failed",
      txHashes,
      ...(deliveredUSDC > 0 ? { receivedUSDC: deliveredUSDC } : {}),
      error: stepErrors.join("; "),
    };
  }
  onProgress({
    kind: "chain_complete",
    chain: cp.chain,
    owner: cp.owner,
    timestamp: Date.now(),
  });
  return {
    chain: cp.chain,
    owner: cp.owner,
    status: "success",
    txHashes,
    receivedUSDC: deliveredUSDC > 0 ? deliveredUSDC : cp.estimatedReceiveUSDC,
  };
}

type SubEmit = (e: Partial<ProgressEvent> & { kind: ProgressEvent["kind"] }) => void;

interface StepRunResult {
  txHash: string | null;
  receivedUSDC?: number;
}

async function runStep(
  step: SweepStep,
  destChain: Chain,
  mintRecipient: string,
  destinationPayer: string | undefined,
  emit: SubEmit
): Promise<StepRunResult> {
  const sourceIsEVM = CHAINS[step.chain].isEVM;
  const destIsEVM = CHAINS[destChain].isEVM;
  const owner = step.owner;

  // ── Solana source path ────────────────────────────────────────
  if (!sourceIsEVM) {
    if (step.kind === "approve") {
      // SPL tokens don't use ERC20-style approvals; OKX Solana swap handles
      // token account creation/delegation inside its returned tx.
      return { txHash: null };
    }
    if (step.kind === "swap" && step.token) {
      const rawAmount = step.token.rawBalance ?? toRawAmount(step.token.balance, step.token.decimals);
      return { txHash: await executeSolanaSwap(step.token.address, rawAmount, owner) };
    }
    if (step.kind === "cctp_burn") {
      const mintPayer = getDestinationPayer(step, destinationPayer);
      const balance = await waitForSelectedUsdcActionAmount(step, owner);
      if (balance === 0n)
        throw new Error("no fresh USDC on Solana to bridge after waiting for swap output");
      if (!destIsEVM) throw new Error("Solana→Solana bridge is not meaningful");
      const bridge = await bridgeUSDCWithBridgeKit(
        {
          sourceChain: step.chain,
          destChain,
          sourceOwner: owner,
          destinationPayer: mintPayer,
          mintRecipient,
          amountRaw: balance,
        },
        emit
      );
      return {
        txHash: bridge.txHashes.length > 0 ? bridge.txHashes.join(":") : null,
        receivedUSDC: receivedUsdcFromRaw(balance, step),
      };
    }
    if (step.kind === "usdc_transfer") {
      const amount = await waitForSelectedUsdcActionAmount(step, owner);
      if (amount === 0n)
        throw new Error("no selected USDC on Solana to transfer after waiting for swap output");
      return {
        txHash: await transferSolanaUSDC(owner, mintRecipient, amount),
        receivedUSDC: Number(formatUnits(amount, 6)),
      };
    }
    return { txHash: null };
  }

  // ── EVM source path ───────────────────────────────────────────
  const wc = getWalletClient(step.chain, owner);
  const pc = getPublicClient(step.chain);

  if (step.kind === "approve" && step.token) {
    const rawAmount = step.token.rawBalance ?? toRawAmount(step.token.balance, step.token.decimals);
    const tx = await getApproveTx(step.chain, step.token.address, rawAmount);
    if (!tx.data) {
      throw new Error(`approve transaction missing calldata for ${step.token.symbol}`);
    }
    const hash = await wc.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data,
      value: 0n,
      account: wc.account!,
      chain: wc.chain,
    });
    const rcpt = await pc.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`approve reverted: ${hash}`);
    return { txHash: hash };
  }

  if (step.kind === "swap" && step.token) {
    const rawAmount = step.token.rawBalance ?? toRawAmount(step.token.balance, step.token.decimals);
    const tx = await getSwapTx(
      step.chain,
      step.token.address,
      rawAmount,
      wc.account!.address
    );
    const hash = await wc.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data,
      value: BigInt(tx.value || "0"),
      account: wc.account!,
      chain: wc.chain,
    });
    const rcpt = await pc.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`swap reverted: ${hash}`);
    return { txHash: hash };
  }

  if (step.kind === "cctp_burn") {
    const mintPayer = getDestinationPayer(step, destinationPayer);
    const balance = await waitForSelectedUsdcActionAmount(step, owner);
    if (balance === 0n)
      throw new Error("no fresh USDC to bridge after waiting for swap output (swap output check)");
    const bridge = await bridgeUSDCWithBridgeKit(
      {
        sourceChain: step.chain,
        destChain,
        sourceOwner: owner,
        destinationPayer: mintPayer,
        mintRecipient,
        amountRaw: balance,
      },
      emit
    );
    return {
      txHash: bridge.txHashes.length > 0 ? bridge.txHashes.join(":") : null,
      receivedUSDC: receivedUsdcFromRaw(balance, step),
    };
  }

  if (step.kind === "usdc_transfer") {
    const amount = await waitForSelectedUsdcActionAmount(step, owner);
    if (amount === 0n)
      throw new Error("no selected USDC to transfer after waiting for swap output");
    const hash = await wc.sendTransaction({
      to: CHAINS[step.chain].usdcAddress as `0x${string}`,
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [mintRecipient as `0x${string}`, amount],
      }),
      value: 0n,
      account: wc.account!,
      chain: wc.chain,
    });
    const rcpt = await pc.waitForTransactionReceipt({ hash });
    if (rcpt.status !== "success") throw new Error(`USDC transfer reverted: ${hash}`);
    return {
      txHash: hash,
      receivedUSDC: Number(formatUnits(amount, 6)),
    };
  }

  return { txHash: null };
}

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

async function waitForSelectedUsdcActionAmount(
  step: SweepStep,
  owner: string
): Promise<bigint> {
  const attempts = getUSDCBalancePollAttempts();
  const delayMs = getUSDCBalancePollDelayMs();

  for (let attempt = 0; attempt < attempts; attempt++) {
    const total = CHAINS[step.chain].isEVM
      ? await getUSDCBalance(step.chain, owner)
      : await getUSDCBalanceSolana(owner);
    const amount = selectedUsdcActionAmount(total, step);
    if (amount > 0n) return amount;
    if (attempt < attempts - 1 && delayMs > 0) await sleep(delayMs);
  }

  return 0n;
}

function selectedUsdcActionAmount(total: bigint, step: SweepStep): bigint {
  const pre = BigInt(String((step.details as any)?._preUsdcBalance ?? "0"));
  const fresh = total > pre ? total - pre : 0n;
  const direct = BigInt(String((step.details as any)?.directUsdcRaw ?? "0"));
  const amount = fresh + direct;
  return amount > total ? total : amount;
}

function getUSDCBalancePollAttempts(): number {
  const value = Number(process.env.USDC_BALANCE_POLL_ATTEMPTS ?? "20");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20;
}

function getUSDCBalancePollDelayMs(): number {
  const value = Number(process.env.USDC_BALANCE_POLL_MS ?? "1500");
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transferSolanaUSDC(
  owner: string,
  recipient: string,
  amount: bigint
): Promise<string> {
  const payer = getSolanaKeypair(owner);
  if (!payer) throw new Error(`No Solana signer configured for ${owner}`);
  const connection = getSolanaConnection();
  const ownerKey = payer.publicKey;
  const recipientKey = new PublicKey(recipient);
  const sourceAta = await getAssociatedTokenAddress(USDC_MINT, ownerKey);
  const recipientAta = await getAssociatedTokenAddress(
    USDC_MINT,
    recipientKey,
    true
  );
  const tx = new Transaction();
  const recipientInfo = await connection.getAccountInfo(recipientAta);
  if (!recipientInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        ownerKey,
        recipientAta,
        recipientKey,
        USDC_MINT
      )
    );
  }
  tx.add(
    createTransferCheckedInstruction(
      sourceAta,
      USDC_MINT,
      recipientAta,
      ownerKey,
      amount,
      6
    )
  );
  return await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
}

function getDestinationPayer(
  step: SweepStep,
  planDestinationPayer: string | undefined
): string {
  const fromStep = (step.details as any)?.destinationPayer;
  const payer =
    typeof planDestinationPayer === "string" && planDestinationPayer
      ? planDestinationPayer
      : typeof fromStep === "string"
        ? fromStep
        : undefined;
  if (!payer) {
    throw new Error(
      "destination payer is required before CCTP burn; rebuild the plan with an explicit mint payer"
    );
  }
  return payer;
}

function receivedUsdcFromRaw(amount: bigint, step: SweepStep): number {
  const gross = Number(formatUnits(amount, 6));
  const fee = Number((step.details as any)?.cctpProtocolFeeUSDC ?? 0);
  return Math.max(0, gross - (Number.isFinite(fee) ? fee : 0));
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function toRawAmount(balance: string, decimals: number): string {
  const n = Number(balance);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return parseUnits(decimalAmount(n, decimals), decimals).toString();
}

function decimalAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return trimDecimal(value.toFixed(Math.min(decimals, 18)));
}

function trimDecimal(value: string): string {
  return value.replace(/\.?0+$/, "") || "0";
}
