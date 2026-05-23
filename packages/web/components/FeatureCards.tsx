"use client";

import { useI18n } from "@/lib/i18n";

const FEATURES = [
  {
    icon: "SCAN",
    title: "One Click Sweep",
    body:
      "Scan supported chains in parallel, consolidate everything into a single USDC output — no manual per-token swaps.",
  },
  {
    icon: "DEX",
    title: "Best Execution",
    body:
      "OKX DEX aggregator routes every swap across 400+ venues for minimal slippage on thin dust liquidity.",
  },
  {
    icon: "CCTP",
    title: "CCTP Bridge",
    body:
      "Circle's native burn-and-mint transfers — no wrapped assets, no custodial bridges, instant finality attestations.",
  },
  {
    icon: "LOCAL",
    title: "Non-Custodial",
    body:
      "Keys stay in the browser vault or local .env. Signing happens through the local app, never a hosted backend.",
  },
];

export function FeatureCards() {
  const { t } = useI18n();
  return (
    <section className="mx-auto mt-10 grid max-w-[1540px] grid-cols-1 gap-4 px-6 md:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="x-card p-5"
        >
          <div className="mb-4 inline-flex rounded-full border border-[var(--border)] bg-black/36 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--green)]">
            {f.icon}
          </div>
          <div className="mb-1 font-semibold">{t(f.title)}</div>
          <div className="text-sm leading-relaxed text-[var(--t3)]">
            {t(f.body.replace(/—/g, "-"))}
          </div>
        </div>
      ))}
    </section>
  );
}
