"use client";

import clsx from "clsx";
import { useI18n } from "@/lib/i18n";

const STEPS = [
  { title: "Select tokens", subtitle: "Choose your dust balances" },
  { title: "Swap to USDC", subtitle: "Convert via OKX DEX" },
  { title: "CCTP Bridge", subtitle: "Cross-chain transfer" },
  { title: "Review & Sweep", subtitle: "Confirm & execute" },
];

export function WizardSteps({
  current,
  maxReached,
  onJump,
}: {
  current: 1 | 2 | 3 | 4;
  maxReached?: 1 | 2 | 3 | 4;
  onJump?: (step: 1 | 2 | 3 | 4) => void;
}) {
  const { t } = useI18n();
  const reach = maxReached ?? current;
  return (
    <div className="mx-auto mb-6 mt-4 max-w-[1540px] px-6">
      <div className="x-card relative overflow-hidden p-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          {STEPS.map((s, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            const done = current > n;
            const active = current === n;
            const reachable = !!onJump && reach >= n;
            const Tag = reachable ? "button" : "div";
            return (
              <Tag
                key={s.title}
                onClick={reachable ? () => onJump!(n) : undefined}
                className={clsx(
                  "relative z-10 flex min-h-[96px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition",
                  done && "border-[rgba(188,255,47,0.18)] bg-[rgba(188,255,47,0.08)]",
                  active && "border-white/12 bg-white/[0.075] shadow-[0_18px_56px_rgba(0,0,0,.28)]",
                  !done && !active && "border-transparent bg-black/18",
                  reachable && "cursor-pointer hover:border-[var(--border-strong)] hover:bg-white/[0.055]"
                )}
              >
                <div
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-semibold",
                    done
                      ? "border-[var(--green)] bg-[var(--green)] text-black shadow-[0_0_22px_rgba(188,255,47,.16)]"
                      : active
                        ? "border-white bg-white text-black"
                        : "border-[var(--border-strong)] bg-black/70 text-[var(--t4)]"
                  )}
                >
                  {n}
                </div>
                <div className="min-w-0">
                  <div
                    className={clsx(
                      "text-sm font-semibold",
                      active || done ? "text-[var(--t1)]" : "text-[var(--t3)]"
                    )}
                  >
                    {t(s.title)}
                  </div>
                  <div className="mt-1 text-xs leading-snug text-[var(--t4)]">
                    {t(s.subtitle)}
                  </div>
                </div>
              </Tag>
            );
          })}
        </div>
      </div>
    </div>
  );
}
