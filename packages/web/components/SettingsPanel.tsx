"use client";

import type { SweepSettings } from "@dust-sweeper/core";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";

const PRESETS = [0.5, 1, 5, 10, 25];
const RESERVE_PRESETS = [0, 1, 5, 20];
const ALL_ELIGIBLE_SLIDER_VALUE = 101;

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: SweepSettings;
  onChange: (s: SweepSettings) => void;
}) {
  const { t } = useI18n();
  const scope = settings.sweepScope ?? "dust";
  const allMode = scope === "all";
  const sliderValue = allMode
    ? ALL_ELIGIBLE_SLIDER_VALUE
    : Math.min(settings.thresholdUSD, 100);
  const thresholdLabel = allMode
    ? t("All eligible")
    : t("Dust under ${value}", { value: formatUsd(settings.thresholdUSD) });

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[rgba(188,255,47,0.22)] bg-[#060407]/88 p-5 shadow-[0_22px_90px_rgba(0,0,0,.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(188,255,47,.16),transparent_26%),radial-gradient(circle_at_88%_18%,rgba(250,77,255,.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.045),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--green)] to-transparent" />
      <div className="relative space-y-5">
      {/* Threshold row */}
      <div>
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">{t("Sweep threshold")}</div>
            <div className="mt-0.5 text-xs text-[var(--t3)]">
              {t("Drag to the end to sweep every eligible priced token.")}
            </div>
          </div>
          <div className="rounded-full border border-[rgba(188,255,47,0.28)] bg-[var(--hot)] px-3 py-1.5 font-mono text-xs text-[var(--green)]">
            {thresholdLabel}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              onClick={() =>
                onChange({ ...settings, sweepScope: "dust", thresholdUSD: v })
              }
              className={clsx(
                "x-focus rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed",
                !allMode && settings.thresholdUSD === v
                  ? "border-[var(--green)] bg-[var(--green)] text-black shadow-[0_0_24px_rgba(188,255,47,.18)]"
                  : "border-[var(--border-strong)] bg-black/42 text-[var(--t3)] hover:border-[var(--t1)] hover:text-[var(--t1)]"
              )}
            >
              ${formatUsd(v)}
            </button>
          ))}
          <input
            type="range"
            min={0.5}
            max={ALL_ELIGIBLE_SLIDER_VALUE}
            step={0.5}
            value={sliderValue}
            onChange={(e) => {
              const value = Number(e.target.value);
              onChange(
                value >= ALL_ELIGIBLE_SLIDER_VALUE
                  ? { ...settings, sweepScope: "all" }
                  : {
                      ...settings,
                      sweepScope: "dust",
                      thresholdUSD: value,
                    }
              );
            }}
            className="ml-2 flex-1 accent-[var(--green)]"
            aria-label={t("Sweep threshold")}
          />
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--green)]">
            {t("all")}
          </span>
        </div>
        <div className="mt-2 rounded-[16px] border border-[var(--border)] bg-black/34 px-3 py-2 text-xs leading-5 text-[var(--t3)]">
          {allMode
            ? t("All eligible skips the dust cap. Tokens still need a live route before execution.")
            : t("Dust mode keeps the scan focused on balances below the selected USD value.")}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />

      {/* Opt-ins */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-semibold">{t("Advanced opt-ins")}</div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--t4)]">
            {t("default: all off")}
          </span>
        </div>
        <div className="space-y-2">
          <ToggleRow
            icon="gas"
            title={t("Native gas tokens")}
            description={t("The chain gas coin itself: ETH on Base/Arbitrum, POL/MATIC on Polygon, AVAX, SOL.")}
            checked={settings.includeNativeGas}
            onChange={(v) => onChange({ ...settings, includeNativeGas: v })}
          />
          {settings.includeNativeGas && (
            <div className="ml-12 mt-2 mb-1 rounded-[16px] border border-[var(--border)] bg-black/34 p-3 text-xs text-[var(--t3)]">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span>{t("Keep native gas reserve")}</span>
                {RESERVE_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ ...settings, gasReserveUSD: v })}
                    className={clsx(
                      "x-focus rounded-full border px-2.5 py-1 font-mono text-[11px] transition",
                      settings.gasReserveUSD === v
                        ? "border-[var(--green)] bg-[var(--green)] text-black"
                        : "border-[var(--border-strong)] bg-black/42 text-[var(--t3)] hover:text-[var(--t1)]"
                    )}
                  >
                    {v === 0 ? t("sweep all") : `$${v}`}
                  </button>
                ))}
              </div>
              <div className="leading-5">
                {t("We leave this USD-equivalent amount unswept on each chain for future gas. If the native balance is below the reserve, it will not appear as sweepable.")}
              </div>
            </div>
          )}
          <ToggleRow
            icon="stable"
            title={t("Other stablecoins")}
            description={t("USDC.e, USDbC, USDT, DAI, FRAX, LUSD. Native Circle USDC is handled separately.")}
            checked={settings.includeStables}
            onChange={(v) => onChange({ ...settings, includeStables: v })}
          />
          <ToggleRow
            icon="wrapped"
            title={t("Wrapped natives")}
            description={t("Wrapped gas-token contracts like WETH, WMATIC, WAVAX, and wSOL.")}
            checked={settings.includeWrapped}
            onChange={(v) => onChange({ ...settings, includeWrapped: v })}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

function formatUsd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: "gas" | "stable" | "wrapped";
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        "x-focus flex w-full items-center gap-3 rounded-[18px] border p-3 text-left transition",
        checked
          ? "border-[var(--green)] bg-[var(--hot)]"
          : "border-[var(--border)] bg-black/44 hover:border-[var(--border-strong)] hover:bg-white/[0.035]"
      )}
    >
      <div
        className={clsx(
          "flex h-9 w-12 shrink-0 items-center justify-center rounded-[14px] border",
          checked
            ? "border-[var(--green)] bg-[var(--green)] text-black"
            : "border-[var(--border)] bg-black/54 text-[var(--t3)]"
        )}
      >
        <ToggleIcon icon={icon} checked={checked} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-[var(--t3)]">
          {description}
        </div>
      </div>
      <Switch checked={checked} />
    </button>
  );
}

function ToggleIcon({
  icon,
  checked,
}: {
  icon: "gas" | "stable" | "wrapped";
  checked: boolean;
}) {
  const stroke = checked ? "#050506" : "currentColor";
  if (icon === "gas") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M9.5 20h5.2c1.8 0 3.3-1.5 3.3-3.3 0-1.3-.8-2.6-2-3.1.2 2-1 3.4-2.8 3.4 1-3.8-.5-6.7-4.6-9.9.4 3.2-.8 4.7-2.4 6.3A4.5 4.5 0 0 0 9.5 20Z"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.5 4.5c1.7.9 2.9 2.1 3.5 3.7"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (icon === "stable") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M5 9.2c0-1.5 3.1-2.8 7-2.8s7 1.3 7 2.8-3.1 2.8-7 2.8-7-1.3-7-2.8Z"
          stroke={stroke}
          strokeWidth="1.7"
        />
        <path
          d="M5 9.2v5.6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V9.2M8.6 13.2c1 .4 2.2.6 3.4.6s2.4-.2 3.4-.6"
          stroke={stroke}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7.2 8.3A6 6 0 0 1 17 6.4l1.1 1.1"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17.8 6.2v4.1h-4.1M16.8 15.7A6 6 0 0 1 7 17.6l-1.1-1.1"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 17.8v-4.1h4.1"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Switch({ checked }: { checked: boolean }) {
  return (
    <div
      className={clsx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-[var(--green)]" : "bg-[var(--border-strong)]"
      )}
    >
      <div
        className={clsx(
          "absolute top-0.5 h-4 w-4 rounded-full bg-black transition-transform shadow",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </div>
  );
}
