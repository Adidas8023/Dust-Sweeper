import { AsyncLocalStorage } from "node:async_hooks";

export interface RuntimeRpcConfig {
  alchemyApiKey?: string;
}

const runtimeRpcConfig = new AsyncLocalStorage<RuntimeRpcConfig>();

function normalizeConfig(config?: RuntimeRpcConfig): RuntimeRpcConfig | undefined {
  const alchemyApiKey = config?.alchemyApiKey?.trim();
  if (!alchemyApiKey) return undefined;
  return { alchemyApiKey };
}

export function getRuntimeRpcConfig(): RuntimeRpcConfig | undefined {
  return runtimeRpcConfig.getStore();
}

export function withRuntimeRpcConfig<T>(
  config: RuntimeRpcConfig | undefined,
  fn: () => T
): T {
  const normalized = normalizeConfig(config);
  if (!normalized) return fn();
  return runtimeRpcConfig.run(normalized, fn);
}
