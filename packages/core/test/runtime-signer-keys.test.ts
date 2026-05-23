import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  getEvmAddresses,
  _resetEvmAccountCache,
} from "../src/signing/evm.js";
import {
  getSolanaAddresses,
  _resetSolanaKeypairCache,
} from "../src/signing/svm.js";
import { isDemoMode, withRuntimeDemoMode } from "../src/demo.js";
import { withRuntimeSignerKeys } from "../src/signing/runtime.js";

const SAVED_ENV: Record<string, string | undefined> = {};
const KEYS = [
  "PRIVATE_KEY_EVM",
  "PRIVATE_KEYS_EVM",
  "PRIVATE_KEY_SOL",
  "PRIVATE_KEYS_SOL",
  "DEMO_MODE",
];

beforeEach(() => {
  for (const k of KEYS) SAVED_ENV[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  _resetEvmAccountCache();
  _resetSolanaKeypairCache();
});

afterEach(() => {
  for (const k of KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
  _resetEvmAccountCache();
  _resetSolanaKeypairCache();
});

describe("runtime signer keys", () => {
  it("loads EVM and Solana keys supplied for the current request", async () => {
    const evmKey = generatePrivateKey();
    const evmAddress = privateKeyToAccount(evmKey).address.toLowerCase();
    const solana = Keypair.generate();
    const solanaKey = bs58.encode(solana.secretKey);

    await withRuntimeSignerKeys(
      { evm: [evmKey], solana: [solanaKey] },
      async () => {
        expect(getEvmAddresses().map((a) => a.toLowerCase())).toContain(
          evmAddress
        );
        expect(getSolanaAddresses()).toContain(solana.publicKey.toBase58());
        expect(isDemoMode()).toBe(false);
      }
    );
  });

  it("scopes browser-supplied keys to the active async request", async () => {
    const evmKey = generatePrivateKey();
    expect(getEvmAddresses()).toEqual([]);

    await withRuntimeSignerKeys({ evm: [evmKey] }, async () => {
      expect(getEvmAddresses()).toHaveLength(1);
    });

    expect(getEvmAddresses()).toEqual([]);
  });

  it("can force demo mode per browser request without mutating process env", async () => {
    const evmKey = generatePrivateKey();

    await withRuntimeSignerKeys({ evm: [evmKey] }, async () => {
      expect(isDemoMode()).toBe(false);
      await withRuntimeDemoMode(true, async () => {
        expect(isDemoMode()).toBe(true);
      });
      expect(isDemoMode()).toBe(false);
    });
  });
});
