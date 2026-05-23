import type { Chain } from "../types.js";
import { CHAINS } from "../chains/index.js";
import { burnUSDCSolana, fetchSolanaMessageBytes } from "../solana/burn.js";
import { receiveMessageSolana } from "../solana/receive.js";
import { getSolanaAddress, getSolanaConnection } from "../signing/svm.js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT } from "../solana/constants.js";
import { keccak256 } from "viem";

/**
 * Bridge Solana USDC → destination chain (EVM).
 * Returns tx hash + raw message bytes (for attestation lookup).
 */
export async function burnFromSolana(
  destChain: Chain,
  amount: bigint,
  evmRecipient: `0x${string}`,
  owner?: string
): Promise<{ txHash: string; messageBytes: Uint8Array; messageHash: `0x${string}` }> {
  const dst = CHAINS[destChain];
  const { txHash, messageEventAccount } = await burnUSDCSolana(
    dst.cctpDomain,
    amount,
    evmRecipient,
    owner
  );
  const messageBytes = await fetchSolanaMessageBytes(messageEventAccount);
  const messageHash = keccak256(`0x${Buffer.from(messageBytes).toString("hex")}` as `0x${string}`);
  return { txHash, messageBytes, messageHash };
}

/**
 * Mint USDC on Solana given a CCTP message + attestation from an EVM source chain.
 * Any configured Solana signer can submit; the recipient is encoded in the message.
 */
export async function mintOnSolana(
  messageBytes: Uint8Array,
  attestationHex: `0x${string}`,
  payer?: string,
  recipientOwner?: string
): Promise<string> {
  const attestation = Buffer.from(attestationHex.replace(/^0x/, ""), "hex");
  return receiveMessageSolana(
    messageBytes,
    new Uint8Array(attestation),
    payer,
    recipientOwner
  );
}

/**
 * Get current USDC balance for a specific Solana owner (defaults to first signer).
 */
export async function getUSDCBalanceSolana(owner?: string): Promise<bigint> {
  if (!owner) {
    const first = getSolanaAddress();
    if (!first) return 0n;
    owner = first;
  }
  const connection = getSolanaConnection();
  const ownerKey = new PublicKey(owner);
  const ata = await getAssociatedTokenAddress(USDC_MINT, ownerKey);
  try {
    const info = await connection.getTokenAccountBalance(ata);
    return BigInt(info.value.amount);
  } catch {
    return 0n;
  }
}

/**
 * Convert a Solana pubkey (base58) to 32-byte array for EVM CCTP mintRecipient.
 * Callers bridging EVM→Solana must pass the destination USDC ATA, not the owner pubkey.
 */
export async function solanaATAToBytes32(
  owner: string
): Promise<Uint8Array> {
  const ata = await getAssociatedTokenAddress(
    USDC_MINT,
    new PublicKey(owner),
    true
  );
  return ata.toBytes();
}
