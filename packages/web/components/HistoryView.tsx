"use client";

import { useEffect, useState } from "react";
import { clearHistory, loadHistory, type HistoryEntry } from "@/lib/history";
import { EXPLORERS } from "@/lib/explorers";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";

export function HistoryView() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  if (entries.length === 0) {
    return (
      <div className="x-card p-10 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-black/36 font-mono text-[10px] uppercase text-[var(--green)]">
          log
        </div>
        <h3 className="text-lg font-semibold mb-1">{t("No sweep history yet")}</h3>
        <p className="text-sm text-[var(--t3)]">
          {t("Once you finish your first sweep, it'll show up here with all the tx hashes per chain.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--t3)]">
          {t(
            entries.length === 1
              ? "{count} sweep · stored in this browser"
              : "{count} sweeps · stored in this browser",
            { count: entries.length }
          )}
        </div>
        <button
          onClick={() => setConfirmClear(true)}
          className="x-focus rounded-full border border-[var(--border)] bg-black/32 px-3 py-1 text-xs text-[var(--t3)] hover:border-red-400/40 hover:text-red-300"
        >
          {t("Clear all")}
        </button>
      </div>
      {confirmClear && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 px-6 backdrop-blur-md">
          <div className="w-full max-w-[420px] overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.16)] bg-[#08050c] shadow-[0_30px_120px_rgba(0,0,0,.7)]">
            <div className="border-b border-[var(--border)] p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
                {t("History")}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-[var(--t1)]">
                {t("Clear sweep history?")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--t3)]">
                {t("This removes all saved history entries from this browser. It does not affect on-chain transactions or balances.")}
              </p>
            </div>
            <div className="flex justify-end gap-2 p-4">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="x-focus rounded-full border border-[var(--border)] bg-black/38 px-4 py-2 text-sm text-[var(--t2)] transition hover:text-[var(--t1)]"
              >
                {t("Keep history")}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setEntries([]);
                  setConfirmClear(false);
                }}
                className="x-focus rounded-full border border-red-400/40 bg-red-500/16 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/24"
              >
                {t("Clear all")}
              </button>
            </div>
          </div>
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          className="x-card overflow-hidden"
        >
          <button
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
            className="w-full grid grid-cols-[1fr_auto_auto_120px_30px] items-center gap-4 px-4 py-3 hover:bg-white/[0.02]"
          >
            <div className="text-left">
              <div className="text-sm font-medium flex items-center gap-2">
                <StatusBadge status={e.status} />
                {e.tokenSymbols.length > 0 ? (
                  <span>
                    {e.tokenSymbols.slice(0, 4).join(" · ")}
                    {e.tokenSymbols.length > 4 ? ` +${e.tokenSymbols.length - 4}` : ""}
                  </span>
                ) : (
                  <span className="text-[var(--t3)]">—</span>
                )}
                {e.isDemo && (
                  <span className="rounded-full border border-[var(--green)] bg-[var(--hot)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--green)]">
                    {t("demo")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-[var(--t4)]">
                {new Date(e.startedAt).toLocaleString()} ·{" "}
                {t(e.perChain.length === 1 ? "{count} chain" : "{count} chains", {
                  count: e.perChain.length,
                })}
              </div>
            </div>
            <div className="text-xs capitalize text-[var(--t3)]">
              {t("to {chain}", { chain: e.destChain })}
            </div>
            <div className="text-xs text-[var(--t3)]">
              {Math.round((e.completedAt - e.startedAt) / 1000)}s
            </div>
            <div className="text-right font-mono font-semibold text-[var(--green)]">
              ${e.totalReceivedUSDC.toFixed(2)}
            </div>
            <div className="text-[var(--t4)]">{openId === e.id ? "▾" : "▸"}</div>
          </button>
          {openId === e.id && (
            <div className="space-y-3 border-t border-[var(--border)] bg-black/42 p-4">
              {e.perChain.map((c) => (
                <div
                  key={c.chain}
                  className="rounded-[18px] border border-[var(--border)] bg-black/24 p-3"
                >
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="capitalize font-medium">{c.chain}</span>
                    <span
                      className={clsx(
                        c.status === "success" && "text-[var(--green)]",
                        c.status === "skipped" && "text-[var(--pink)]",
                        c.status === "failed" && "text-red-400"
                      )}
                    >
                      {c.status}
                      {c.receivedUSDC != null && c.status !== "skipped" && (
                        <span className="ml-2 font-mono text-[var(--t3)]">
                          ${c.receivedUSDC.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </div>
                  {c.txHashes.length > 0 && (
                    <div className="space-y-1 font-mono text-xs">
                      {c.txHashes.flatMap((h, i) =>
                        h.split(":").map((part, j) => (
                          <div
                            key={`${i}-${j}`}
                            className="flex items-center gap-2"
                          >
                            <span className="w-12 text-[var(--t4)]">
                              {t("tx {index}", {
                                index: `${i + 1}${h.includes(":") ? `.${j + 1}` : ""}`,
                              })}
                            </span>
                            {EXPLORERS[c.chain] && !part.startsWith("0xDEMO") ? (
                              <a
                                href={`${EXPLORERS[c.chain]}${part}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--green)] hover:underline"
                              >
                                {part.slice(0, 14)}…{part.slice(-8)}
                              </a>
                            ) : (
                              <span className="text-[var(--t3)]">
                                {part.slice(0, 14)}…{part.slice(-8)}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {c.error && (
                    <div className="text-xs text-red-400 mt-1">{c.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: HistoryEntry["status"] }) {
  const { t } = useI18n();
  const map: Record<string, string> = {
    success: "bg-[var(--hot)] text-[var(--green)] border-[var(--green)]",
    partial: "bg-[rgba(250,77,255,0.06)] text-[var(--pink)] border-[rgba(250,77,255,0.3)]",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={clsx(
        "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
        map[status] ?? ""
      )}
    >
      {t(status)}
    </span>
  );
}
