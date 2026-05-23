import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  getFeeRecipientTokenAccount,
  parseTokenMessengerFeeRecipient,
  TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET,
} from "../src/solana/receive.js";
import { USDC_MINT } from "../src/solana/constants.js";

describe("Solana CCTP receive fee recipient", () => {
  it("derives the fee recipient ATA from TokenMessenger state instead of a constant", async () => {
    const feeRecipient = PublicKey.unique();
    const data = Buffer.alloc(TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET + 32);
    data.set(feeRecipient.toBytes(), TOKEN_MESSENGER_FEE_RECIPIENT_OFFSET);
    const expectedAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      feeRecipient,
      true
    );
    const connection = {
      getAccountInfo: vi.fn(async () => ({ data })),
    };

    expect(parseTokenMessengerFeeRecipient(data).equals(feeRecipient)).toBe(
      true
    );
    await expect(
      getFeeRecipientTokenAccount(connection as any)
    ).resolves.toEqual(expectedAta);
  });
});
