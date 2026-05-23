"use client";

import type { RuntimeSignerKeys } from "@dust-sweeper/core";

export interface LocalSignerVault {
  evm: string[];
  solana: string[];
  demoMode: boolean;
}

const STORAGE_KEY = "dust-sweeper:local-signer-vault:v1";

export const EMPTY_SIGNER_VAULT: LocalSignerVault = {
  evm: [],
  solana: [],
  demoMode: true,
};

export function parseKeyTextarea(value: string): string[] {
  const keys: string[] = [];
  let current = "";
  let bracketDepth = 0;

  for (const char of value) {
    if (char === "[") bracketDepth += 1;
    if (char === "]" && bracketDepth > 0) bracketDepth -= 1;

    const shouldSplit = (char === "\n" || char === ",") && bracketDepth === 0;
    if (shouldSplit) {
      const key = current.trim();
      if (key) keys.push(key);
      current = "";
    } else {
      current += char;
    }
  }

  const key = current.trim();
  if (key) keys.push(key);

  return Array.from(new Set(keys));
}

export function loadSignerVault(): LocalSignerVault {
  if (typeof window === "undefined") return EMPTY_SIGNER_VAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SIGNER_VAULT;
    const parsed = JSON.parse(raw) as Partial<LocalSignerVault>;
    return {
      evm: Array.isArray(parsed.evm) ? parsed.evm.filter(Boolean) : [],
      solana: Array.isArray(parsed.solana) ? parsed.solana.filter(Boolean) : [],
      demoMode: typeof parsed.demoMode === "boolean" ? parsed.demoMode : true,
    };
  } catch {
    return EMPTY_SIGNER_VAULT;
  }
}

export function saveSignerVault(vault: LocalSignerVault) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export function signerVaultToRuntimeKeys(
  vault: LocalSignerVault
): RuntimeSignerKeys | undefined {
  if (vault.demoMode) return undefined;
  const keys: RuntimeSignerKeys = {};
  if (vault.evm.length) keys.evm = vault.evm;
  if (vault.solana.length) keys.solana = vault.solana;
  return keys.evm?.length || keys.solana?.length ? keys : undefined;
}

export function countSignerVault(vault: LocalSignerVault): number {
  return vault.evm.length + vault.solana.length;
}
