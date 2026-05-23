"use client";

import type { Chain, SweepSettings } from "@dust-sweeper/core";

export interface Preferences {
  defaultDestChain: Chain;
  defaultSettings: SweepSettings;
}

const KEY = "dust-sweeper:prefs:v1";

export const PREFS_DEFAULTS: Preferences = {
  defaultDestChain: "arbitrum",
  defaultSettings: {
    sweepScope: "dust",
    thresholdUSD: 5,
    includeNativeGas: false,
    gasReserveUSD: 20,
    includeStables: false,
    includeWrapped: false,
    excludeAddresses: [],
  },
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return PREFS_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return PREFS_DEFAULTS;
    const p = JSON.parse(raw) as Partial<Preferences>;
    return {
      defaultDestChain: p.defaultDestChain ?? PREFS_DEFAULTS.defaultDestChain,
      defaultSettings: { ...PREFS_DEFAULTS.defaultSettings, ...(p.defaultSettings ?? {}) },
    };
  } catch {
    return PREFS_DEFAULTS;
  }
}

export function savePreferences(p: Preferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}
