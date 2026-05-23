import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getRpcUrl } from "../chains/index.js";
import { getRuntimeSignerKeys } from "./runtime.js";

let cachedKeypairs: Keypair[] | null = null;

function parseEnvKeys(): string[] {
  const multi = process.env.PRIVATE_KEYS_SOL;
  const single = process.env.PRIVATE_KEY_SOL;
  if (!multi?.trim() && single?.trim()) return [single.trim()];
  const raw = multi && multi.trim() ? multi : "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeys(): string[] {
  const runtime = getRuntimeSignerKeys()?.solana ?? [];
  return [...runtime, ...parseEnvKeys()];
}

function decodeSecretKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("invalid Solana secret key");
    return Uint8Array.from(parsed);
  }
  return bs58.decode(trimmed);
}

function parseKeypairs(keys: string[]): Keypair[] {
  const out: Keypair[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    try {
      const kp = Keypair.fromSecretKey(decodeSecretKey(k));
      const pub = kp.publicKey.toBase58();
      if (seen.has(pub)) continue;
      seen.add(pub);
      out.push(kp);
    } catch {
      // skip malformed
    }
  }
  return out;
}

function loadKeypairs(): Keypair[] {
  const runtime = getRuntimeSignerKeys();
  if (runtime?.solana?.length) return parseKeypairs(parseKeys());
  if (cachedKeypairs) return cachedKeypairs;
  cachedKeypairs = parseKeypairs(parseEnvKeys());
  return cachedKeypairs;
}

export function getSolanaPrivateKey(owner?: string): string {
  const keys = parseKeys();
  if (keys.length === 0) throw new Error("PRIVATE_KEY_SOL not set");
  if (!owner) return keys[0];
  for (const key of keys) {
    try {
      const kp = Keypair.fromSecretKey(decodeSecretKey(key));
      if (kp.publicKey.toBase58() === owner) return key;
    } catch {
      // Ignore malformed keys so one bad import does not hide valid signers.
    }
  }
  throw new Error(`No Solana signer configured for ${owner}`);
}

export function getSolanaKeypairs(): Keypair[] {
  return loadKeypairs();
}

export function getSolanaAddresses(): string[] {
  return loadKeypairs().map((kp) => kp.publicKey.toBase58());
}

/**
 * Get a Solana keypair by owner address. If `owner` is omitted, returns the
 * first configured keypair (or null if none configured).
 */
export function getSolanaKeypair(owner?: string): Keypair | null {
  const all = loadKeypairs();
  if (all.length === 0) return null;
  if (!owner) return all[0];
  return all.find((kp) => kp.publicKey.toBase58() === owner) ?? null;
}

/** Backward-compatible accessor for the first Solana address. */
export function getSolanaAddress(): string | undefined {
  return getSolanaAddresses()[0];
}

export function getSolanaConnection(): Connection {
  return new Connection(getRpcUrl("solana"), "confirmed");
}

/** Test/seam helper — drops the cached keypairs so a new env can take effect. */
export function _resetSolanaKeypairCache() {
  cachedKeypairs = null;
}
