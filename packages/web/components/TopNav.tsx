"use client";

import { useState } from "react";
import type { Chain } from "@dust-sweeper/core";
import { useI18n } from "@/lib/i18n";

const CHAIN_DOTS: Record<Chain, string> = {
  ethereum: "#627EEA",
  arbitrum: "#28A0F0",
  base: "#0052FF",
  polygon: "#8247E5",
  optimism: "#FF0420",
  avalanche: "#E84142",
  unichain: "#FF007A",
  linea: "#61DFFF",
  sonic: "#FFFFFF",
  monad: "#9D5CFF",
  codex: "#71E4FF",
  edge: "#18F0B8",
  hyperevm: "#A0FF6B",
  ink: "#F6F4EA",
  morph: "#8AC8FF",
  pharos: "#D7FF5C",
  plume: "#FF7A59",
  sei: "#D64CFF",
  worldchain: "#7AA2FF",
  xdc: "#2ED3B7",
  solana: "#14F195",
};

const NAV_CHAINS: Chain[] = [
  "ethereum",
  "arbitrum",
  "base",
  "polygon",
  "optimism",
  "avalanche",
  "unichain",
  "linea",
  "sonic",
  "monad",
  "codex",
  "edge",
  "hyperevm",
  "ink",
  "morph",
  "pharos",
  "plume",
  "sei",
  "worldchain",
  "xdc",
  "solana",
];

const CHAIN_LABEL: Record<Chain, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
  polygon: "Polygon",
  optimism: "Optimism",
  avalanche: "Avalanche",
  unichain: "Unichain",
  linea: "Linea",
  sonic: "Sonic",
  monad: "Monad",
  codex: "Codex",
  edge: "Edge",
  hyperevm: "HyperEVM",
  ink: "Ink",
  morph: "Morph",
  pharos: "Pharos",
  plume: "Plume",
  sei: "Sei",
  worldchain: "World Chain",
  xdc: "XDC",
  solana: "Solana",
};

export type Tab = "sweep" | "history" | "settings";
export type WalletStatusTone = "demo" | "live" | "idle";

export interface WalletStatus {
  label: string;
  tone: WalletStatusTone;
}

export function TopNav({
  activeChain,
  onChain,
  walletStatus,
  activeTab,
  onTab,
}: {
  activeChain: Chain;
  onChain: (c: Chain) => void;
  walletStatus: WalletStatus;
  activeTab: Tab;
  onTab: (t: Tab) => void;
}) {
  const { t } = useI18n();
  const [chainOpen, setChainOpen] = useState(false);
  const statusTone: Record<WalletStatusTone, string> = {
    demo: "bg-[var(--green)] shadow-[0_0_14px_rgba(188,255,47,.75)]",
    live: "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.65)]",
    idle: "bg-[var(--t4)]",
  };

  return (
    <div className="sticky top-0 z-[80] border-b border-[var(--border)] bg-black/72 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto flex w-full min-w-0 max-w-[1540px] flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo-mark.png"
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover shadow-[0_0_38px_rgba(64,255,194,.36)]"
            />
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--t1)]">
                {t("Dust Sweeper")}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
                {t("Onchain OS")}
              </div>
            </div>
          </div>
          <nav className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-black/36 p-1 md:flex">
            {(["sweep", "history", "settings"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => onTab(tab)}
                className={`x-focus rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${
                  activeTab === tab
                    ? "bg-white text-black"
                    : "text-[var(--t3)] hover:text-[var(--t1)]"
                }`}
              >
                {tab === "sweep" ? t("Sweep") : tab === "history" ? t("History") : t("Settings")}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative">
            <button
              type="button"
              aria-expanded={chainOpen}
              onClick={() => setChainOpen((v) => !v)}
              className="x-focus flex w-full min-w-0 items-center justify-between gap-3 rounded-full border border-[var(--border-strong)] bg-[#050506]/90 px-3.5 py-2 text-sm shadow-[0_10px_40px_rgba(0,0,0,.32)] transition hover:border-[var(--green)] sm:min-w-[180px]"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="h-3 w-3 rounded-full shadow-[0_0_16px_currentColor]"
                  style={{
                    background: CHAIN_DOTS[activeChain],
                    color: CHAIN_DOTS[activeChain],
                  }}
                />
                <span className="truncate font-medium">{CHAIN_LABEL[activeChain]}</span>
              </span>
              <span className="text-[10px] text-[var(--t4)]">⌄</span>
            </button>
            {chainOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-[120] w-[280px] overflow-hidden rounded-[20px] border border-[rgba(188,255,47,0.22)] bg-[#050506] p-2 shadow-[0_28px_110px_rgba(0,0,0,.78),0_0_0_1px_rgba(255,255,255,.05)_inset]">
                <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
                  {t("Default destination")}
                </div>
                <div className="grid max-h-[340px] gap-1 overflow-y-auto pr-1 scrollbar-thin">
                  {NAV_CHAINS.map((c) => {
                    const active = activeChain === c;
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          onChain(c);
                          setChainOpen(false);
                        }}
                        className={`x-focus flex items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-[var(--green)] text-black"
                            : "text-[var(--t2)] hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: CHAIN_DOTS[c] }}
                          />
                          {CHAIN_LABEL[c]}
                        </span>
                        <span className="font-mono text-[10px] uppercase opacity-60">
                          {c === "solana" ? "SVM" : "EVM"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--border)] bg-black/52 px-3.5 py-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone[walletStatus.tone]}`} />
            <span className="truncate font-mono text-xs text-[var(--t2)]">
              {walletStatus.label}
            </span>
          </div>
        </div>
        <nav className="grid w-full min-w-0 grid-cols-1 gap-1 rounded-[18px] border border-[var(--border)] bg-black/36 p-1 sm:grid-cols-3 md:hidden">
          {(["sweep", "history", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => onTab(tab)}
              className={`x-focus min-w-0 rounded-full px-2 py-1.5 text-xs font-medium capitalize transition ${
                activeTab === tab
                  ? "bg-white text-black"
                  : "text-[var(--t3)] hover:text-[var(--t1)]"
              }`}
            >
              {tab === "sweep" ? t("Sweep") : tab === "history" ? t("History") : t("Settings")}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
