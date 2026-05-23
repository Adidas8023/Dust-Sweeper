import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  CCTP_FINALITY_THRESHOLD,
  DISCRIMINATORS,
  MESSAGE_TRANSMITTER_PROGRAM_ID,
  SOLANA_CCTP_DOMAIN,
  TOKEN_MESSENGER_MINTER_PROGRAM_ID,
  USDC_MINT,
} from "./constants.js";
import {
  denylistPda,
  eventAuthorityPda,
  localTokenPda,
  messageTransmitterAccountPda,
  remoteTokenMessengerPda,
  senderAuthorityPda,
  tokenMessengerAccountPda,
  tokenMinterAccountPda,
} from "./pdas.js";
import { getSolanaConnection, getSolanaKeypair } from "../signing/svm.js";

/**
 * Build the depositForBurn instruction for Circle CCTP on Solana.
 *
 * Account layout is derived from Circle's CCTP V2 Solana interface.
 * If the on-chain program layout changes, update here.
 */
function buildDepositForBurnIx(args: {
  payer: PublicKey;
  amount: bigint;
  destDomain: number;
  mintRecipient: Uint8Array; // 32 bytes
  messageSentEventData: PublicKey; // fresh keypair pubkey (signer)
}): TransactionInstruction {
  if (args.mintRecipient.length !== 32) {
    throw new Error("mintRecipient must be 32 bytes");
  }

  const burnTokenAta = getAssociatedTokenAddressSync(USDC_MINT, args.payer);

  const data = encodeDepositForBurn(
    args.amount,
    args.destDomain,
    args.mintRecipient
  );

  const keys = [
    { pubkey: args.payer, isSigner: true, isWritable: true }, // owner
    { pubkey: args.payer, isSigner: true, isWritable: true }, // event_rent_payer
    { pubkey: senderAuthorityPda(), isSigner: false, isWritable: false },
    { pubkey: burnTokenAta, isSigner: false, isWritable: true },
    { pubkey: denylistPda(args.payer), isSigner: false, isWritable: false },
    {
      pubkey: messageTransmitterAccountPda(),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: tokenMessengerAccountPda(), isSigner: false, isWritable: false },
    {
      pubkey: remoteTokenMessengerPda(args.destDomain),
      isSigner: false,
      isWritable: false,
    },
    { pubkey: tokenMinterAccountPda(), isSigner: false, isWritable: false },
    { pubkey: localTokenPda(), isSigner: false, isWritable: true },
    { pubkey: USDC_MINT, isSigner: false, isWritable: true },
    {
      pubkey: args.messageSentEventData,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: MESSAGE_TRANSMITTER_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    {
      pubkey: eventAuthorityPda(TOKEN_MESSENGER_MINTER_PROGRAM_ID),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: eventAuthorityPda(MESSAGE_TRANSMITTER_PROGRAM_ID),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: MESSAGE_TRANSMITTER_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    programId: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
    keys,
    data: Buffer.from(data),
  });
}

function encodeDepositForBurn(
  amount: bigint,
  destDomain: number,
  mintRecipient: Uint8Array
): Uint8Array {
  // Layout:
  // 8 bytes discriminator + amount + destination_domain + mint_recipient +
  // destination_caller + max_fee + min_finality_threshold.
  const buf = new Uint8Array(8 + 8 + 4 + 32 + 32 + 8 + 4);
  buf.set(DISCRIMINATORS.depositForBurn, 0);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(8, amount, true);
  dv.setUint32(16, destDomain, true);
  buf.set(mintRecipient, 20);
  dv.setBigUint64(84, 0n, true);
  dv.setUint32(92, CCTP_FINALITY_THRESHOLD.STANDARD, true);
  return buf;
}

/**
 * Execute CCTP burn on Solana. Returns the tx signature and the
 * MessageSent event data account pubkey; the event data account holds
 * the raw message bytes which Circle's attestation service indexes.
 */
export async function burnUSDCSolana(
  destDomain: number,
  amount: bigint,
  mintRecipientEvm: `0x${string}`,
  owner?: string
): Promise<{ txHash: string; messageEventAccount: string }> {
  const payer = getSolanaKeypair(owner);
  if (!payer) {
    throw new Error(
      owner
        ? `No Solana signer configured for ${owner}`
        : "PRIVATE_KEY_SOL not set"
    );
  }
  const connection = getSolanaConnection();

  // Pad EVM address to 32 bytes (left-pad with zeros)
  const clean = mintRecipientEvm.replace(/^0x/, "").toLowerCase();
  const recipient = new Uint8Array(32);
  const bytes = Buffer.from(clean, "hex");
  recipient.set(bytes, 32 - bytes.length);

  const messageSentEvent = Keypair.generate();

  const ix = buildDepositForBurnIx({
    payer: payer.publicKey,
    amount,
    destDomain,
    mintRecipient: recipient,
    messageSentEventData: messageSentEvent.publicKey,
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }))
    .add(ix);
  const sig = await sendAndConfirmTransaction(
    connection,
    tx,
    [payer, messageSentEvent],
    { commitment: "confirmed" }
  );
  return {
    txHash: sig,
    messageEventAccount: messageSentEvent.publicKey.toBase58(),
  };
}

/**
 * After burn, fetch the MessageSent event data account and extract the
 * raw message bytes for Circle attestation lookup.
 */
export async function fetchSolanaMessageBytes(
  messageEventAccount: string
): Promise<Uint8Array> {
  const connection = getSolanaConnection();
  const info = await connection.getAccountInfo(
    new PublicKey(messageEventAccount)
  );
  if (!info) throw new Error("MessageSent event data account not found");
  // Anchor account layout: 8-byte discriminator + borsh struct:
  //   rent_payer: Pubkey (32)
  //   created_at: i64 (8)
  //   message: Vec<u8> (4-byte length prefix + bytes)
  const data = info.data;
  const lengthOffset = 8 + 32 + 8;
  const len = data.readUInt32LE(lengthOffset);
  return new Uint8Array(data.slice(lengthOffset + 4, lengthOffset + 4 + len));
}
