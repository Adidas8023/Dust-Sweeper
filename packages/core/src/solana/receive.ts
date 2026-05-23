import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { getSolanaConnection, getSolanaKeypair } from "../signing/svm.js";
import {
  DISCRIMINATORS,
  MESSAGE_TRANSMITTER_PROGRAM_ID,
  TOKEN_MESSENGER_MINTER_PROGRAM_ID,
  USDC_MINT,
} from "./constants.js";
import {
  authorityPda,
  custodyTokenAccountPda,
  eventAuthorityPda,
  localTokenPda,
  messageTransmitterAccountPda,
  remoteTokenMessengerPda,
  tokenMessengerAccountPda,
  tokenMinterAccountPda,
  tokenPairPda,
  usedNoncePda,
} from "./pdas.js";

export const TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET =
  8 + // Anchor discriminator
  32 + // denylister
  32 + // owner
  32 + // pending_owner
  4 + // message_body_version
  1; // authority_bump

export function parseTokenMessengerFeeRecipient(data: Uint8Array): PublicKey {
  const end = TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET + 32;
  if (data.length < end) {
    throw new Error("TokenMessenger account data is too short");
  }
  return new PublicKey(
    data.slice(TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET, end)
  );
}

export async function getFeeRecipientAccounts(
  connection = getSolanaConnection()
): Promise<{
  feeRecipient: PublicKey;
  feeRecipientTokenAccount: PublicKey;
}> {
  const info = await connection.getAccountInfo(tokenMessengerAccountPda());
  if (!info) throw new Error("CCTP TokenMessenger account not found");
  const feeRecipient = parseTokenMessengerFeeRecipient(info.data);
  const feeRecipientTokenAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    feeRecipient,
    true
  );
  return { feeRecipient, feeRecipientTokenAccount };
}

export async function getFeeRecipientTokenAccount(
  connection = getSolanaConnection()
): Promise<PublicKey> {
  return (await getFeeRecipientAccounts(connection)).feeRecipientTokenAccount;
}

/**
 * Parse the critical fields from a CCTP message body.
 * Message layout is CCTP V2; nonce is bytes32 and TokenMessenger body
 * starts at byte 148.
 */
function parseMessage(message: Uint8Array) {
  const dv = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const sourceDomain = dv.getUint32(4, false);
  const nonce = message.slice(12, 44);
  const burnToken = message.slice(152, 184);
  const mintRecipient = message.slice(184, 216);
  return { sourceDomain, nonce, burnToken, mintRecipient };
}

function encodeReceiveMessage(
  message: Uint8Array,
  attestation: Uint8Array
): Uint8Array {
  // discriminator(8) + message(len-prefixed bytes) + attestation(len-prefixed bytes)
  const total = 8 + 4 + message.length + 4 + attestation.length;
  const buf = new Uint8Array(total);
  buf.set(DISCRIMINATORS.receiveMessage, 0);
  const dv = new DataView(buf.buffer);
  dv.setUint32(8, message.length, true);
  buf.set(message, 12);
  dv.setUint32(12 + message.length, attestation.length, true);
  buf.set(attestation, 16 + message.length);
  return buf;
}

/**
 * Execute receiveMessage on Solana MessageTransmitter — this mints USDC
 * into the recipient's associated token account.
 */
export async function receiveMessageSolana(
  message: Uint8Array,
  attestation: Uint8Array,
  payerOwner?: string,
  recipientOwner?: string
): Promise<string> {
  const payer = getSolanaKeypair(payerOwner);
  if (!payer) {
    throw new Error(
      payerOwner
        ? `No Solana signer configured for ${payerOwner}`
        : "PRIVATE_KEY_SOL not set"
    );
  }
  const connection = getSolanaConnection();

  const parsed = parseMessage(message);
  const mintRecipientTokenAccount = new PublicKey(parsed.mintRecipient);
  const { feeRecipient, feeRecipientTokenAccount } =
    await getFeeRecipientAccounts(connection);
  const setupIxs = [];
  setupIxs.push(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      feeRecipientTokenAccount,
      feeRecipient,
      USDC_MINT
    )
  );
  if (recipientOwner) {
    const recipientOwnerKey = new PublicKey(recipientOwner);
    const expectedAta = await getAssociatedTokenAddress(
      USDC_MINT,
      recipientOwnerKey,
      true
    );
    if (!expectedAta.equals(mintRecipientTokenAccount)) {
      throw new Error("CCTP message recipient does not match recipient owner ATA");
    }
    setupIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        mintRecipientTokenAccount,
        recipientOwnerKey,
        USDC_MINT
      )
    );
  }

  const ix = new TransactionInstruction({
    programId: MESSAGE_TRANSMITTER_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // caller
      {
        pubkey: authorityPda(TOKEN_MESSENGER_MINTER_PROGRAM_ID),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: messageTransmitterAccountPda(),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: usedNoncePda(parsed.nonce),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: TOKEN_MESSENGER_MINTER_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
      {
        pubkey: tokenMessengerAccountPda(),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: remoteTokenMessengerPda(parsed.sourceDomain),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: tokenMinterAccountPda(), isSigner: false, isWritable: true },
      { pubkey: localTokenPda(), isSigner: false, isWritable: true },
      {
        pubkey: tokenPairPda(parsed.sourceDomain, parsed.burnToken),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: feeRecipientTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: mintRecipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: custodyTokenAccountPda(), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
    ],
    data: Buffer.from(encodeReceiveMessage(message, attestation)),
  });

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })
  );
  for (const setupIx of setupIxs) tx.add(setupIx);
  tx.add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  return sig;
}
