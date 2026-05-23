import { PublicKey } from "@solana/web3.js";
import {
  MESSAGE_TRANSMITTER_PROGRAM_ID,
  TOKEN_MESSENGER_MINTER_PROGRAM_ID,
  USDC_MINT,
} from "./constants.js";

// All PDA seed strings come from Circle's Solana CCTP source:
// https://github.com/circlefin/solana-cctp-contracts

function findPda(seeds: (Buffer | Uint8Array)[], programId: PublicKey) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

export function messageTransmitterAccountPda(): PublicKey {
  const [pda] = findPda(
    [Buffer.from("message_transmitter")],
    MESSAGE_TRANSMITTER_PROGRAM_ID
  );
  return pda;
}

export function senderAuthorityPda(): PublicKey {
  const [pda] = findPda(
    [Buffer.from("sender_authority")],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function tokenMessengerAccountPda(): PublicKey {
  const [pda] = findPda(
    [Buffer.from("token_messenger")],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function tokenMinterAccountPda(): PublicKey {
  const [pda] = findPda(
    [Buffer.from("token_minter")],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function remoteTokenMessengerPda(remoteDomain: number): PublicKey {
  const [pda] = findPda(
    [Buffer.from("remote_token_messenger"), Buffer.from(remoteDomain.toString())],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function localTokenPda(mint: PublicKey = USDC_MINT): PublicKey {
  const [pda] = findPda(
    [Buffer.from("local_token"), mint.toBuffer()],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function tokenPairPda(
  remoteDomain: number,
  remoteTokenBytes32: Uint8Array
): PublicKey {
  const [pda] = findPda(
    [
      Buffer.from("token_pair"),
      Buffer.from(remoteDomain.toString()),
      Buffer.from(remoteTokenBytes32),
    ],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function custodyTokenAccountPda(mint: PublicKey = USDC_MINT): PublicKey {
  const [pda] = findPda(
    [Buffer.from("custody"), mint.toBuffer()],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function eventAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = findPda([Buffer.from("__event_authority")], programId);
  return pda;
}

export function denylistPda(sender: PublicKey): PublicKey {
  const [pda] = findPda(
    [Buffer.from("denylist_account"), sender.toBuffer()],
    TOKEN_MESSENGER_MINTER_PROGRAM_ID
  );
  return pda;
}

export function usedNoncePda(nonce: Uint8Array): PublicKey {
  const [pda] = findPda(
    [Buffer.from("used_nonce"), Buffer.from(nonce)],
    MESSAGE_TRANSMITTER_PROGRAM_ID
  );
  return pda;
}

export function authorityPda(programId: PublicKey): PublicKey {
  const [pda] = findPda(
    [Buffer.from("message_transmitter_authority"), programId.toBuffer()],
    MESSAGE_TRANSMITTER_PROGRAM_ID
  );
  return pda;
}
