"use client";

import type { Chain } from "@dust-sweeper/core";
import { explorerUrl, shortHash } from "@/lib/explorers";
import { useI18n } from "@/lib/i18n";

type Evt = {
  kind: string;
  chain?: Chain;
  owner?: string;
  stepIdx?: number;
  txHash?: string;
  error?: string;
  result?: { status?: string; totalReceivedUSDC?: number };
  timestamp: number;
};

export function ProgressView({ events }: { events: Evt[] }) {
  const { t } = useI18n();
  return (
    <div className="x-card overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--t3)]">
        {t("Event log · {count} events", { count: events.length })}
      </div>
      <div className="max-h-72 overflow-auto font-mono text-xs scrollbar-thin">
        {events.length === 0 && (
          <div className="px-4 py-3 text-[var(--t4)]">{t("Awaiting progress…")}</div>
        )}
        {events.map((e, i) => {
          const isFailedFinal =
            e.kind === "final" && e.result?.status === "failed";
          const isPartialFinal =
            e.kind === "final" && e.result?.status === "partial";
          const isSuccessFinal =
            e.kind === "final" && e.result?.status === "success";
          const colorClass =
            e.kind === "step_failed" || e.kind === "fatal" || isFailedFinal
              ? "text-red-400"
              : isPartialFinal
                ? "text-[var(--pink)]"
              : e.kind === "step_success" ||
                  e.kind === "chain_complete" ||
                  e.kind === "cctp_mint_confirmed" ||
                  isSuccessFinal
                ? "text-[var(--green)]"
                : e.kind === "cctp_attestation_pending"
                  ? "text-[var(--pink)]"
                  : "text-neutral-300";
          const url = e.txHash && e.chain
            ? explorerUrl(e.chain, e.txHash.split(":")[0])
            : null;
          return (
            <div
              key={i}
              className={`px-4 py-1 ${colorClass} hover:bg-white/[0.03]`}
            >
              <span className="text-[var(--t4)]">
                [{formatEventTime(e.timestamp)}]
              </span>{" "}
              <span>{e.chain ?? "—"}</span>{" "}
              {e.owner && (
                <span className="text-[var(--t4)]">{shortAddr(e.owner)} </span>
              )}
              <span className="opacity-90">{eventLabel(e, t)}</span>
              {e.stepIdx != null && (
                <span className="text-[var(--t4)]"> #{e.stepIdx}</span>
              )}
              {e.txHash && (
                <>
                  {"  "}
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--green)] hover:underline"
                    >
                      {shortHash(e.txHash.split(":")[0])}
                    </a>
                  ) : (
                    <span className="text-[var(--t3)]">
                      {shortHash(e.txHash.split(":")[0])}
                    </span>
                  )}
                </>
              )}
              {e.error && (
                <span className="text-red-400"> — {readableError(e.error, t)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function eventLabel(
  e: Evt,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (e.kind === "sweep_complete") return t("run_finished");
  if (e.kind === "final" && e.result?.status) {
    const received =
      typeof e.result.totalReceivedUSDC === "number"
        ? ` · $${e.result.totalReceivedUSDC.toFixed(2)}`
        : "";
    return t("final_{status}{received}", {
      status: t(e.result.status),
      received,
    });
  }
  return e.kind;
}

function readableError(
  error: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (/skipped \(paired step failed/i.test(error)) {
    return error;
  }
  if (/insufficient funds|exceeds the balance/i.test(error)) {
    return t("not enough native gas for this transaction");
  }
  if (/nonce too low|nonce provided/i.test(error)) {
    return t("nonce already used; retry after pending txs settle");
  }
  if (/swap reverted/i.test(error)) {
    return t("swap reverted on-chain");
  }
  if (/no fresh USDC|no selected USDC/i.test(error)) {
    return t("no new USDC was produced, so bridge/transfer was skipped");
  }
  const cleaned = error.replace(/\s+/g, " ").trim();
  const detailsIndex = cleaned.search(/\b(?:Request Arguments:|Details:|Version:)\b/);
  const short = detailsIndex >= 0 ? cleaned.slice(0, detailsIndex).trim() : cleaned;
  return short.length > 180 ? `${short.slice(0, 177)}...` : short;
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function formatEventTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "--:--:--";
  return new Date(timestamp).toLocaleTimeString();
}
