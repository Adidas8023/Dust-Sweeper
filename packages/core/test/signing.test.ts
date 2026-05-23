import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getEvmAccounts,
  getEvmAddresses,
  getEvmAddress,
  _resetEvmAccountCache,
} from "../src/signing/evm.js";
import {
  getSolanaAddresses,
  getSolanaAddress,
  getSolanaKeypair,
  _resetSolanaKeypairCache,
} from "../src/signing/svm.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const SAVED_ENV: Record<string, string | undefined> = {};
const KEYS = ["PRIVATE_KEY_EVM", "PRIVATE_KEYS_EVM", "PRIVATE_KEY_SOL", "PRIVATE_KEYS_SOL"];

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

describe("EVM signer parsing", () => {
  it("returns zero address when nothing configured", () => {
    expect(getEvmAddress()).toBe("0x0000000000000000000000000000000000000000");
    expect(getEvmAddresses().length).toBe(0);
  });

  it("loads single PRIVATE_KEY_EVM", () => {
    const pk = generatePrivateKey();
    const expected = privateKeyToAccount(pk).address.toLowerCase();
    process.env.PRIVATE_KEY_EVM = pk;
    _resetEvmAccountCache();
    const addrs = getEvmAddresses().map((a) => a.toLowerCase());
    expect(addrs).toEqual([expected]);
    expect(getEvmAddress().toLowerCase()).toBe(expected);
  });

  it("loads comma-separated PRIVATE_KEYS_EVM and dedupes", () => {
    const a = generatePrivateKey();
    const b = generatePrivateKey();
    const aa = privateKeyToAccount(a).address.toLowerCase();
    const bb = privateKeyToAccount(b).address.toLowerCase();
    process.env.PRIVATE_KEYS_EVM = `${a}, ${b}, ${a}`; // dup + whitespace
    _resetEvmAccountCache();
    const addrs = getEvmAddresses().map((x) => x.toLowerCase()).sort();
    expect(addrs).toEqual([aa, bb].sort());
  });

  it("PRIVATE_KEYS_EVM takes precedence over PRIVATE_KEY_EVM", () => {
    const a = generatePrivateKey();
    const b = generatePrivateKey();
    process.env.PRIVATE_KEY_EVM = a;
    process.env.PRIVATE_KEYS_EVM = b;
    _resetEvmAccountCache();
    const addrs = getEvmAddresses();
    expect(addrs.length).toBe(1);
    expect(addrs[0].toLowerCase()).toBe(privateKeyToAccount(b).address.toLowerCase());
  });

  it("skips malformed keys instead of crashing the whole loader", () => {
    const good = generatePrivateKey();
    process.env.PRIVATE_KEYS_EVM = `${good},0xnot-a-key,deadbeef-still-bad`;
    _resetEvmAccountCache();
    const addrs = getEvmAddresses();
    expect(addrs.length).toBe(1);
    expect(addrs[0].toLowerCase()).toBe(privateKeyToAccount(good).address.toLowerCase());
  });

  it("getEvmAccounts returns same addresses as getEvmAddresses", () => {
    const a = generatePrivateKey();
    const b = generatePrivateKey();
    process.env.PRIVATE_KEYS_EVM = `${a},${b}`;
    _resetEvmAccountCache();
    expect(getEvmAccounts().map((x) => x.address)).toEqual(getEvmAddresses());
  });
});

describe("Solana signer parsing", () => {
  function newKey(): { sk: string; pub: string } {
    const kp = Keypair.generate();
    return {
      sk: bs58.encode(kp.secretKey),
      pub: kp.publicKey.toBase58(),
    };
  }

  it("returns nothing when no env set", () => {
    expect(getSolanaAddress()).toBeUndefined();
    expect(getSolanaAddresses()).toEqual([]);
    expect(getSolanaKeypair()).toBeNull();
  });

  it("loads single PRIVATE_KEY_SOL", () => {
    const { sk, pub } = newKey();
    process.env.PRIVATE_KEY_SOL = sk;
    _resetSolanaKeypairCache();
    expect(getSolanaAddress()).toBe(pub);
    expect(getSolanaAddresses()).toEqual([pub]);
  });

  it("loads comma-separated PRIVATE_KEYS_SOL and dedupes", () => {
    const a = newKey();
    const b = newKey();
    process.env.PRIVATE_KEYS_SOL = `${a.sk},${b.sk},${a.sk}`;
    _resetSolanaKeypairCache();
    const addrs = getSolanaAddresses().sort();
    expect(addrs).toEqual([a.pub, b.pub].sort());
  });

  it("getSolanaKeypair(owner) returns the keypair matching that pubkey", () => {
    const a = newKey();
    const b = newKey();
    process.env.PRIVATE_KEYS_SOL = `${a.sk},${b.sk}`;
    _resetSolanaKeypairCache();
    const kpB = getSolanaKeypair(b.pub);
    expect(kpB?.publicKey.toBase58()).toBe(b.pub);
    expect(getSolanaKeypair("nonexistent")).toBeNull();
  });

  it("getSolanaKeypair() with no owner returns first signer", () => {
    const a = newKey();
    const b = newKey();
    process.env.PRIVATE_KEYS_SOL = `${a.sk},${b.sk}`;
    _resetSolanaKeypairCache();
    expect(getSolanaKeypair()?.publicKey.toBase58()).toBe(a.pub);
  });
});
