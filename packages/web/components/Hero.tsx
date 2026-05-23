"use client";

import { useI18n } from "@/lib/i18n";

const ROUTES = [
  { from: "ETH", to: "USDC", route: "OKX DEX", value: "$8.12" },
  { from: "BASE", to: "USDC", route: "OKX DEX", value: "$12.60" },
  { from: "SOL", to: "USDC", route: "CCTP V2", value: "$4.82" },
];

export function Hero() {
  const { locale, t } = useI18n();
  return (
    <section className="mx-auto grid max-w-[1540px] grid-cols-[minmax(0,1fr)] gap-8 overflow-hidden px-6 pb-8 pt-10 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-end">
      <div className="min-w-0 max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-black/46 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--t3)] backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-[var(--green)] shadow-[0_0_14px_rgba(188,255,47,.9)]" />
          {t("CCTP V2 / OKX DEX / ONCHAIN OS")}
        </div>
        <h1 className="max-w-full text-[40px] font-bold leading-[0.98] tracking-[-0.02em] text-[var(--t1)] sm:text-[54px] md:text-[76px] lg:text-[88px]">
          <span className="block sm:hidden">
            {locale === "zh" ? "把小额资产" : "Sweep dust"}
            <br />
            {locale === "zh" ? "清扫成原生" : "into native"}
            <br />
            <span className="text-[var(--green)]">USDC.</span>
          </span>
          <span className="hidden sm:block">
            {locale === "zh" ? "把小额资产清扫成" : t("Sweep dust into")}
            <br />
            <span className="text-[var(--green)]">
              {locale === "zh" ? "原生 USDC。" : t("native USDC.")}
            </span>
          </span>
        </h1>
        <p className="mt-6 max-w-[330px] break-words text-sm leading-7 text-[var(--t2)] sm:max-w-2xl sm:text-base">
          {t("Scan every configured wallet, choose dust by owner, swap through OKX DEX, then mint USDC on the destination chain with Circle CCTP V2.")}
        </p>
      </div>

      <div className="x-card relative hidden min-h-[360px] overflow-hidden p-5 lg:block">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--green)] to-transparent opacity-80" />
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t4)]">
              {t("Live route model")}
            </div>
            <div className="mt-1 text-lg font-semibold">{t("Dust to USDC")}</div>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--green)]">
            {t("supported chains")}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-[1fr_56px_1fr] items-center gap-3">
          <HeroNode label={t("Source wallets")} value="EVM + SVM" />
          <div className="relative h-px bg-[var(--border-strong)]">
            <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--green)] shadow-[0_0_18px_rgba(188,255,47,.9)]" />
          </div>
          <HeroNode label={t("Destination")} value="USDC" hot />
        </div>

        <div className="mt-8 space-y-2.5">
          {ROUTES.map((item) => (
            <div
              key={`${item.from}-${item.value}`}
              className="grid grid-cols-[68px_1fr_auto] items-center gap-3 rounded-[18px] border border-[var(--border)] bg-black/42 px-3 py-3"
            >
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-center font-mono text-xs text-[var(--t2)]">
                {item.from}
              </div>
              <div>
                <div className="flex items-center gap-2 font-mono text-xs text-[var(--t3)]">
                  <span>{item.route}</span>
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  <span>{item.to}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--purple)] via-[var(--pink)] to-[var(--green)]" />
                </div>
              </div>
              <div className="font-mono text-sm text-[var(--green)]">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-2 text-center">
          {["Scan", "Swap", "Mint"].map((label, index) => (
            <div
              key={label}
              className="rounded-[16px] border border-[var(--border)] bg-black/36 p-3"
            >
              <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--green)] font-mono text-xs font-semibold text-black">
                {index + 1}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--t3)]">
                {t(label)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroNode({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div
      className={`rounded-[22px] border p-4 ${
        hot
          ? "border-[var(--green)] bg-[var(--hot)]"
          : "border-[var(--border)] bg-black/40"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
