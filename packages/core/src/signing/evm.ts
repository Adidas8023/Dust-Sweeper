import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Chain } from "../types.js";
import { CHAINS, getRpcUrl } from "../chains/index.js";
import { getRuntimeSignerKeys } from "./runtime.js";

let cachedAccounts: PrivateKeyAccount[] | null = null;

function parseEnvKeys(): string[] {
  const multi = process.env.PRIVATE_KEYS_EVM;
  const single = process.env.PRIVATE_KEY_EVM;
  const raw = multi && multi.trim() ? multi : single ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeys(): string[] {
  const runtime = getRuntimeSignerKeys()?.evm ?? [];
  return [...runtime, ...parseEnvKeys()];
}

function normalizePrivateKey(key: string): `0x${string}` {
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

function parseAccounts(keys: string[]): PrivateKeyAccount[] {
  const accounts: PrivateKeyAccount[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    try {
      const acc = privateKeyToAccount(normalizePrivateKey(k));
      const lower = acc.address.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      accounts.push(acc);
    } catch {
      // skip malformed key — multi-key configs shouldn't take down the whole signer
    }
  }
  return accounts;
}

function loadAccounts(): PrivateKeyAccount[] {
  const runtime = getRuntimeSignerKeys();
  if (runtime?.evm?.length) return parseAccounts(parseKeys());
  if (cachedAccounts) return cachedAccounts;
  cachedAccounts = parseAccounts(parseEnvKeys());
  return cachedAccounts;
}

export function getEvmAccounts(): PrivateKeyAccount[] {
  return loadAccounts();
}

export function getEvmAddresses(): Address[] {
  return loadAccounts().map((a) => a.address);
}

/**
 * Backward-compatible single-address accessor — returns the first configured
 * EVM address, or the zero address if none. Prefer `getEvmAddresses()` for
 * multi-wallet flows.
 */
export function getEvmAddress(): Address {
  const all = getEvmAddresses();
  return (all[0] ?? "0x0000000000000000000000000000000000000000") as Address;
}

function findAccount(owner?: string): PrivateKeyAccount {
  const accounts = loadAccounts();
  if (accounts.length === 0) throw new Error("PRIVATE_KEY_EVM not set");
  if (!owner) return accounts[0];
  const target = owner.toLowerCase();
  const hit = accounts.find((a) => a.address.toLowerCase() === target);
  if (!hit) throw new Error(`No EVM signer configured for ${owner}`);
  return hit;
}

export function getEvmPrivateKey(owner?: string): `0x${string}` {
  const keys = parseKeys();
  if (keys.length === 0) throw new Error("PRIVATE_KEY_EVM not set");
  if (!owner) return normalizePrivateKey(keys[0]);
  const target = owner.toLowerCase();
  for (const key of keys) {
    try {
      const acc = privateKeyToAccount(normalizePrivateKey(key));
      if (acc.address.toLowerCase() === target) return normalizePrivateKey(key);
    } catch {
      // Ignore malformed keys so one bad import does not hide valid signers.
    }
  }
  throw new Error(`No EVM signer configured for ${owner}`);
}

function buildChain(chain: Chain) {
  const cfg = CHAINS[chain];
  const rpc = getRpcUrl(chain);
  return {
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: {
      name: cfg.nativeSymbol,
      symbol: cfg.nativeSymbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [rpc] } },
  } as const;
}

export function getWalletClient(chain: Chain, owner?: string): WalletClient {
  const cfg = CHAINS[chain];
  if (!cfg.isEVM) throw new Error(`${chain} is not EVM`);
  return createWalletClient({
    account: findAccount(owner),
    transport: http(getRpcUrl(chain)),
    chain: buildChain(chain),
  });
}

export function getPublicClient(chain: Chain): PublicClient {
  const cfg = CHAINS[chain];
  if (!cfg.isEVM) throw new Error(`${chain} is not EVM`);
  return createPublicClient({
    transport: http(getRpcUrl(chain)),
    chain: buildChain(chain),
  });
}

/** Test/seam helper — drops the cached accounts so a new env can take effect. */
export function _resetEvmAccountCache() {
  cachedAccounts = null;
}
