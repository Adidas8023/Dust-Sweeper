import { parseAbi, type Address, type Hash } from "viem";
import { getWalletClient, getPublicClient } from "../signing/evm.js";
import { CHAINS } from "../chains/index.js";
import type { Chain } from "../types.js";

export const CCTP_ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const CCTP_FINALITY_THRESHOLD = {
  FAST: 1000,
  STANDARD: 2000,
} as const;

export const TOKEN_MESSENGER_V2_ABI = parseAbi([
  "function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold) returns (uint64)",
]);

export const MESSAGE_TRANSMITTER_V2_ABI = parseAbi([
  "function receiveMessage(bytes message,bytes attestation) returns (bool)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// keccak256("MessageSent(bytes)")
const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";

export function addressToBytes32(addr: string): `0x${string}` {
  const clean = addr.toLowerCase().replace(/^0x/, "");
  return `0x${"0".repeat(64 - clean.length)}${clean}` as `0x${string}`;
}

export function rawBytesToHex32(bytes: Uint8Array): `0x${string}` {
  if (bytes.length !== 32) throw new Error("expected 32 bytes");
  return `0x${Buffer.from(bytes).toString("hex")}` as `0x${string}`;
}

export function buildDepositForBurnArgs({
  amount,
  destinationDomain,
  mintRecipient32,
  burnToken,
  destinationCaller = CCTP_ZERO_BYTES32,
  maxFee = 0n,
  minFinalityThreshold = CCTP_FINALITY_THRESHOLD.STANDARD,
}: {
  amount: bigint;
  destinationDomain: number;
  mintRecipient32: `0x${string}`;
  burnToken: `0x${string}`;
  destinationCaller?: `0x${string}`;
  maxFee?: bigint;
  minFinalityThreshold?: number;
}) {
  return [
    amount,
    destinationDomain,
    mintRecipient32,
    burnToken,
    destinationCaller,
    maxFee,
    minFinalityThreshold,
  ] as const;
}

export async function approveUSDCForCCTP(
  sourceChain: Chain,
  amount: bigint,
  owner?: string
): Promise<Hash | null> {
  const src = CHAINS[sourceChain];
  const wc = getWalletClient(sourceChain, owner);
  const pc = getPublicClient(sourceChain);
  const ownerAddr = wc.account!.address;

  const current = (await pc.readContract({
    address: src.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [ownerAddr, src.tokenMessengerAddress as Address],
  })) as bigint;
  if (current >= amount) return null;

  return await wc.writeContract({
    address: src.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [src.tokenMessengerAddress as Address, amount],
    account: wc.account!,
    chain: wc.chain,
  });
}

export async function getUSDCBalance(
  chain: Chain,
  owner?: string
): Promise<bigint> {
  const wc = getWalletClient(chain, owner);
  return getUSDCBalanceForOwner(chain, wc.account!.address);
}

export async function getUSDCBalanceForOwner(
  chain: Chain,
  owner: string
): Promise<bigint> {
  const cfg = CHAINS[chain];
  const pc = getPublicClient(chain);
  return (await pc.readContract({
    address: cfg.usdcAddress as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner as Address],
  })) as bigint;
}

/**
 * depositForBurn on EVM source. `mintRecipient32` must be the 32-byte padded
 * recipient: for EVM dest use addressToBytes32(evmAddress); for Solana dest
 * pass the Solana USDC ATA pubkey bytes.
 */
export async function burnUSDC(
  sourceChain: Chain,
  destChain: Chain,
  amount: bigint,
  mintRecipient32: `0x${string}`,
  owner?: string
): Promise<{ txHash: Hash; messageBody: `0x${string}` }> {
  const src = CHAINS[sourceChain];
  const dst = CHAINS[destChain];
  const wc = getWalletClient(sourceChain, owner);
  const pc = getPublicClient(sourceChain);

  const txHash = await wc.writeContract({
    address: src.tokenMessengerAddress as Address,
    abi: TOKEN_MESSENGER_V2_ABI,
    functionName: "depositForBurn",
    args: buildDepositForBurnArgs({
      amount,
      destinationDomain: dst.cctpDomain,
      mintRecipient32,
      burnToken: src.usdcAddress as Address,
    }),
    account: wc.account!,
    chain: wc.chain,
  });

  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`CCTP burn reverted: ${txHash}`);
  const sent = receipt.logs.find((l) => l.topics[0] === MESSAGE_SENT_TOPIC);
  if (!sent) throw new Error("CCTP burn: MessageSent log missing");
  return { txHash, messageBody: sent.data };
}

export async function pollAttestationByTx(
  sourceChain: Chain,
  sourceTxHash: string,
  timeoutMs = 180_000
): Promise<{ message: `0x${string}`; attestation: `0x${string}` }> {
  const sourceDomain = CHAINS[sourceChain].cctpDomain;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `https://iris-api.circle.com/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(sourceTxHash)}`
    );
    if (res.ok) {
      const json = (await res.json()) as {
        messages?: Array<{
          status?: string;
          message?: string;
          attestation?: string;
        }>;
      };
      const msg = json.messages?.find(
        (m) =>
          m.status === "complete" &&
          m.message &&
          m.message !== "0x" &&
          m.attestation &&
          m.attestation !== "PENDING"
      );
      if (msg?.message && msg.attestation) {
        return {
          message: msg.message as `0x${string}`,
          attestation: msg.attestation as `0x${string}`,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("CCTP attestation timeout");
}

/**
 * Poll Circle's attestation service. messageHash = keccak256(messageBody).
 * Kept for compatibility with callers that still pass message hashes directly;
 * new CCTP V2 flows should prefer pollAttestationByTx().
 */
export async function pollAttestation(
  messageHash: `0x${string}`,
  timeoutMs = 180_000
): Promise<`0x${string}`> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `https://iris-api.circle.com/attestations/${messageHash}`
    );
    if (res.ok) {
      const json = (await res.json()) as { status: string; attestation: string };
      if (json.status === "complete" && json.attestation) {
        return json.attestation as `0x${string}`;
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("CCTP attestation timeout");
}

/**
 * Submit `receiveMessage` on the destination chain. Any configured EVM signer
 * can pay for this — it's a permissionless mint and the recipient is encoded
 * inside the message itself.
 */
export async function mintUSDC(
  destChain: Chain,
  messageBody: `0x${string}`,
  attestation: `0x${string}`,
  owner?: string
): Promise<Hash> {
  const dst = CHAINS[destChain];
  const wc = getWalletClient(destChain, owner);
  const pc = getPublicClient(destChain);
  const txHash = await wc.writeContract({
    address: dst.messageTransmitterAddress as Address,
    abi: MESSAGE_TRANSMITTER_V2_ABI,
    functionName: "receiveMessage",
    args: [messageBody, attestation],
    account: wc.account!,
    chain: wc.chain,
  });
  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`CCTP mint reverted: ${txHash}`);
  return txHash;
}
