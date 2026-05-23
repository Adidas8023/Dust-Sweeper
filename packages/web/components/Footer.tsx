"use client";

import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-14 border-t border-[var(--border)] bg-black/48 backdrop-blur">
      <div className="mx-auto max-w-[1540px] px-6 py-8 text-sm">
        <div>
          <div className="mb-3 flex items-center gap-3 font-semibold">
            <img
              src="/logo-mark.png"
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover shadow-[0_0_34px_rgba(64,255,194,.26)]"
            />
            <div className="leading-none">
              <div>{t("Dust Sweeper")}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
                {t("Onchain OS")}
              </div>
            </div>
          </div>
          <p className="max-w-sm leading-relaxed text-[var(--t3)]">
            {t("Consolidate dust across supported chains into a single USDC position. Built on OKX DEX + Circle CCTP V2.")}
          </p>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1540px] justify-between border-t border-[var(--border)] px-6 py-4 text-xs text-[var(--t4)]">
        <div>{t("© 2026 Dust Sweeper · MIT License")}</div>
        <div>{t("v0.1.0 · Built for OKX Hackathon")}</div>
      </div>
    </footer>
  );
}
