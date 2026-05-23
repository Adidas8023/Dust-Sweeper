"use client";

import { useState } from "react";
import type { Chain, ConvertResult, SweepResult } from "@dust-sweeper/core";
import { explorerUrl, shortHash } from "@/lib/explorers";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";

const NATIVE_BY_CHAIN: Record<Chain, string> = {
  ethereum: "ETH",
  arbitrum: "ETH",
  base: "ETH",
  polygon: "MATIC",
  optimism: "ETH",
  avalanche: "AVAX",
  unichain: "ETH",
  linea: "ETH",
  sonic: "S",
  monad: "MON",
  codex: "ETH",
  edge: "ETH",
  hyperevm: "HYPE",
  ink: "ETH",
  morph: "ETH",
  pharos: "PHAROS",
  plume: "PLUME",
  sei: "SEI",
  worldchain: "ETH",
  xdc: "XDC",
  solana: "SOL",
};

export function DoneState({
  result,
  destChain,
}: {
  result: SweepResult;
  destChain: Chain;
  /** retained for backward compat — sweep again CTA lives in the right SummaryPanel now */
  onSweepAgain?: () => void;
}) {
  const { t } = useI18n();
  const successCount = result.perChain.filter((c) => c.status === "success").length;
  const nativeSymbol = NATIVE_BY_CHAIN[destChain];

  // Convert-to-gas state
  const total = result.totalReceivedUSDC;
  const [gasAmount, setGasAmount] = useState<number>(
    Math.min(5, Math.max(1, Math.round(total * 0.1)))
  );
  const [gasBusy, setGasBusy] = useState(false);
  const [gasResult, setGasResult] = useState<ConvertResult | null>(null);
  const [gasErr, setGasErr] = useState<string | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);

  async function convertToGas() {
    setGasErr(null);
    setGasBusy(true);
    setGasResult(null);
    try {
      const r = await fetch("/api/convert-to-gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: destChain, amountUSDC: gasAmount }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "convert failed");
      setGasResult(json);
    } catch (e: any) {
      setGasErr(e.message);
    } finally {
      setGasBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Compact success strip (right panel already shows the big $ display) */}
      <div className="flex items-center justify-between rounded-[20px] border border-[var(--green)] bg-[var(--hot)] px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--green)] font-mono text-[10px] font-semibold text-black">
            OK
          </span>
          <div>
            <div className="font-medium">{t("Sweep complete")}</div>
            <div className="text-xs text-[var(--t3)]">
              {t("{success}/{total} chains successful · saved to History", {
                success: successCount,
                total: result.perChain.length,
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Optional: convert some USDC to gas */}
      <div className="x-card p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h4 className="font-semibold">{t("Top up gas with USDC")}</h4>
          <span className="text-xs text-[var(--t3)]">
            {t("optional · USDC → {symbol}", { symbol: nativeSymbol })}
          </span>
        </div>
        <p className="mb-4 text-xs text-[var(--t3)]">
          {t("Swap a portion of your fresh USDC into {symbol} so the dest wallet has gas for future txs. Skip if you don't need it.", {
            symbol: nativeSymbol,
          })}
        </p>
        {gasResult ? (
          <div className="text-sm space-y-2">
            <div className="text-[var(--green)]">
              {t("Swapped ${amount} to {received} {symbol}", {
                amount: gasResult.amountUSDC.toFixed(2),
                received: gasResult.estimatedGasReceived.toFixed(6),
                symbol: gasResult.nativeSymbol,
              })}
            </div>
            <TxLink chain={destChain} hash={gasResult.swapTxHash} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={Math.min(total, 50)}
              step={0.5}
              value={gasAmount}
              onChange={(e) => setGasAmount(Number(e.target.value))}
              className="flex-1 accent-[var(--green)]"
            />
            <input
              type="number"
              value={gasAmount}
              min={1}
              max={Math.min(total, 50)}
              step={0.5}
              onChange={(e) => setGasAmount(Number(e.target.value) || 1)}
              className="x-input w-16 px-2 py-1.5 text-right font-mono text-sm"
            />
            <span className="w-10 text-xs text-[var(--t3)]">USDC</span>
            <button
              onClick={convertToGas}
              disabled={gasBusy || gasAmount <= 0}
              className="x-focus whitespace-nowrap rounded-full bg-[var(--t1)] px-4 py-1.5 text-sm font-medium text-black transition disabled:opacity-40"
            >
              {gasBusy ? t("Converting…") : t("Convert to {symbol}", { symbol: nativeSymbol })}
            </button>
          </div>
        )}
        {gasErr && (
          <div className="text-xs text-red-400 mt-2">{gasErr}</div>
        )}
      </div>

      {/* Per-chain results with clickable tx hashes */}
      <div className="x-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h4 className="text-sm font-semibold">{t("Per-chain transactions")}</h4>
          <span className="text-xs text-[var(--t3)]">
            {t("click a row to expand tx hashes")}
          </span>
        </div>
        {result.perChain.map((c, i) => {
          const route = `${c.chain}:${c.owner}:${i}`;
          const isOpen = openRoute === route;
          const txCount = c.txHashes.flatMap((h) => h.split(":")).length;
          return (
            <div
              key={route}
              className="border-b border-[var(--border)] last:border-0"
            >
              <button
                onClick={() => setOpenRoute(isOpen ? null : route)}
                className="w-full grid grid-cols-[1fr_120px_80px_120px_30px] items-center gap-4 px-5 py-3 hover:bg-white/[0.02] text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="capitalize font-medium">
                    {c.chain}{" "}
                    <span className="normal-case font-mono text-[10px] text-[var(--t4)]">
                      {shortAddr(c.owner)}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      c.status === "success" &&
                        "border-[var(--green)] bg-[var(--hot)] text-[var(--green)]",
                      c.status === "skipped" &&
                        "border-[rgba(250,77,255,0.3)] bg-[rgba(250,77,255,0.06)] text-[var(--pink)]",
                      c.status === "failed" &&
                        "border-red-500/30 text-red-400 bg-red-500/10",
                      c.status === "partial" &&
                        "border-[rgba(250,77,255,0.3)] bg-[rgba(250,77,255,0.06)] text-[var(--pink)]"
                    )}
                  >
                    {t(c.status)}
                  </span>
                </div>
                <span className="text-right text-xs text-[var(--t3)]">
                  {t("{count} tx", { count: txCount })}
                </span>
                <span className="text-right text-xs text-[var(--t3)]">
                  {c.chain === destChain ? t("in-place") : t("via CCTP")}
                </span>
                <span
                  className={clsx(
                    "text-right font-mono",
                    c.status === "success"
                      ? "text-[var(--green)]"
                      : "text-[var(--t3)]"
                  )}
                >
                  {c.receivedUSDC != null && c.status !== "skipped"
                    ? `$${c.receivedUSDC.toFixed(2)}`
                    : "—"}
                </span>
                <span className="text-right text-[var(--t4)]">
                  {isOpen ? "▾" : "▸"}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-1.5 bg-black/42 px-5 py-3">
                  {c.txHashes.length === 0 && (
                    <div className="text-xs text-[var(--t3)]">
                      {c.error ?? t("No transactions.")}
                    </div>
                  )}
                  {c.txHashes.flatMap((compound, i) =>
                    compound.split(":").map((hash, j) => (
                      <TxLink
                        key={`${i}-${j}`}
                        chain={c.chain as Chain}
                        hash={hash}
                        label={
                          compound.includes(":")
                            ? j === 0
                              ? t("burn")
                              : t("mint")
                            : t("tx {index}", { index: i + 1 })
                        }
                      />
                    ))
                  )}
                  {c.error && (
                    <div className="text-xs text-red-400 pt-1">
                      {c.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TxLink({
  chain,
  hash,
  label,
}: {
  chain: Chain;
  hash: string;
  label?: string;
}) {
  const url = explorerUrl(chain, hash);
  return (
    <div className="flex items-center gap-3 text-xs font-mono">
      {label && (
        <span className="w-12 shrink-0 text-[var(--t4)]">{label}</span>
      )}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--green)] hover:underline"
        >
          {shortHash(hash)}
        </a>
      ) : (
        <span className="text-[var(--t3)]">{shortHash(hash)}</span>
      )}
    </div>
  );
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
