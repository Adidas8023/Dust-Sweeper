import { AsyncLocalStorage } from "node:async_hooks";

export interface RuntimeSignerKeys {
  evm?: string[];
  solana?: string[];
}

const runtimeSignerKeys = new AsyncLocalStorage<RuntimeSignerKeys>();

function normalizeKeys(keys?: RuntimeSignerKeys): RuntimeSignerKeys | undefined {
  const evm = keys?.evm?.map((k) => k.trim()).filter(Boolean) ?? [];
  const solana = keys?.solana?.map((k) => k.trim()).filter(Boolean) ?? [];
  if (evm.length === 0 && solana.length === 0) return undefined;
  return { evm, solana };
}

export function getRuntimeSignerKeys(): RuntimeSignerKeys | undefined {
  return runtimeSignerKeys.getStore();
}

export function withRuntimeSignerKeys<T>(
  keys: RuntimeSignerKeys | undefined,
  fn: () => T
): T {
  const normalized = normalizeKeys(keys);
  if (!normalized) return fn();
  return runtimeSignerKeys.run(normalized, fn);
}
