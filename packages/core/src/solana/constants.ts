import { PublicKey } from "@solana/web3.js";

// Circle CCTP V2 (Solana mainnet) programs — verified against
// https://developers.circle.com/cctp/references/solana-programs
export const TOKEN_MESSENGER_MINTER_PROGRAM_ID = new PublicKey(
  "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"
);
export const MESSAGE_TRANSMITTER_PROGRAM_ID = new PublicKey(
  "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"
);
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const SOLANA_CCTP_DOMAIN = 5;

export const CCTP_FINALITY_THRESHOLD = {
  FAST: 1000,
  STANDARD: 2000,
} as const;

// Anchor instruction discriminator: sha256("global:<snake_case_name>")[0:8]
export const DISCRIMINATORS = {
  depositForBurn: new Uint8Array([215, 60, 61, 46, 114, 55, 128, 176]),
  receiveMessage: new Uint8Array([38, 144, 127, 225, 31, 225, 238, 25]),
} as const;
