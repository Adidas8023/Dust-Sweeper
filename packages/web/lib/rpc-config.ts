"use client";

import type { RuntimeRpcConfig } from "@dust-sweeper/core";

const KEY = "dust-sweeper:rpc-config:v1";

export function loadRpcConfig(): RuntimeRpcConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<RuntimeRpcConfig>;
    return {
      alchemyApiKey:
        typeof parsed.alchemyApiKey === "string"
          ? parsed.alchemyApiKey.trim()
          : undefined,
    };
  } catch {
    return {};
  }
}

export function saveRpcConfig(config: RuntimeRpcConfig) {
  if (typeof window === "undefined") return;
  const clean: RuntimeRpcConfig = {
    alchemyApiKey: config.alchemyApiKey?.trim() || undefined,
  };
  window.localStorage.setItem(KEY, JSON.stringify(clean));
}
