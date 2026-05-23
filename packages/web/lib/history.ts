"use client";

import type { Chain, SweepResult } from "@dust-sweeper/core";

export interface HistoryEntry {
  id: string;
  startedAt: number;
  completedAt: number;
  destChain: Chain;
  status: "success" | "partial" | "failed";
  totalReceivedUSDC: number;
  totalSpentUSD?: number;
  perChain: Array<{
    chain: Chain;
    status: string;
    txHashes: string[];
    receivedUSDC?: number;
    error?: string;
  }>;
  tokenSymbols: string[];
  isDemo: boolean;
}

const KEY = "dust-sweeper:history:v1";
const MAX = 50;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  const existing = loadHistory();
  const next = [entry, ...existing].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function buildEntryFromResult(
  result: SweepResult,
  destChain: Chain,
  startedAt: number,
  tokenSymbols: string[],
  isDemo: boolean
): HistoryEntry {
  return {
    id: result.planId,
    startedAt,
    completedAt: result.completedAt,
    destChain,
    status: result.status,
    totalReceivedUSDC: result.totalReceivedUSDC,
    perChain: result.perChain.map((c) => ({
      chain: c.chain,
      status: c.status,
      txHashes: c.txHashes,
      receivedUSDC: c.receivedUSDC,
      error: c.error,
    })),
    tokenSymbols,
    isDemo,
  };
}
