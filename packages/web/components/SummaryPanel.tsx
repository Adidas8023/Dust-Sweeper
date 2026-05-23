"use client";
import type { DustInventory, SweepPlan, Chain } from "@dust-sweeper/core";
import type { SweepResult } from "@dust-sweeper/core";
import { useI18n } from "@/lib/i18n";

export function SummaryPanel({
  inventory,
  plan,
  destChain,
  selectedCount,
  selectedValue,
  isDone,
  receivedUSDC,
  runResult,
  demoMode,
}: {
  inventory: DustInventory | null;
  plan: SweepPlan | null;
  destChain: Chain;
  selectedCount: number;
  selectedValue: number;
  isDone?: boolean;
  receivedUSDC?: number;
  runResult?: SweepResult;
  demoMode?: boolean;
}) {
  const { t } = useI18n();
  const source = plan?.quoteSource ?? (demoMode ? "demo" : undefined);
  const sourceLabel =
    source === "okx"
      ? t("live OKX quote")
      : source === "demo"
        ? t("simulated data")
        : source === "direct"
          ? t("native USDC direct")
        : source === "mixed"
          ? t("mixed sources")
          : source === "fallback"
            ? t("fallback estimate")
            : inventory
              ? t("scanned holdings")
              : t("not scanned");
  const inputBasis = demoMode
    ? t("Demo balances")
    : source === "direct"
      ? t("RPC native USDC")
      : source === "mixed"
        ? t("Portfolio + RPC")
        : inventory
          ? t("OKX portfolio USD")
      : "—";
  const swapBasis =
    source === "okx"
      ? t("OKX DEX quote")
      : source === "demo"
        ? t("Demo simulation")
        : source === "direct"
          ? t("No swap needed")
        : source === "mixed"
          ? t("Mixed quotes")
          : source === "fallback"
            ? t("Portfolio fallback")
            : "—";
  const swapOutput =
    plan?.totalSwapOutputUSDC ?? (plan ? plan.totalReceiveUSDC : undefined);
  const routeImpact =
    plan?.totalRouteImpactUSD ??
    (swapOutput !== undefined ? Math.max(0, selectedValue - swapOutput) : undefined);
  const cctpProtocolFee = plan?.totalCctpProtocolFeeUSDC;
  const gasBudget = plan?.totalGasUSD ?? plan?.totalCostUSD;
  const bridgeFeeSource = plan ? getBridgeFeeSource(plan) : undefined;
  const hasFinalResult = Boolean(runResult);
  const displayedReceive =
    runResult?.totalReceivedUSDC ??
    (plan ? plan.totalReceiveUSDC : undefined);
  const bridgeBasis =
    bridgeFeeSource === "bridge-kit"
      ? t("Circle Bridge Kit")
      : bridgeFeeSource === "fallback"
        ? t("Bridge Kit fallback")
        : bridgeFeeSource === "no-bridge"
          ? t("No bridge needed")
          : plan
            ? t("Pending estimate")
            : "—";

  if (isDone) {
    return (
      <div className="sticky top-24 overflow-hidden rounded-[24px] border border-[var(--green)] bg-[var(--hot)] backdrop-blur">
        <div className="p-5 text-center space-y-2">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--green)] font-mono text-xs font-semibold text-black">
            OK
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-[var(--t3)]">
            {t("Delivered")}
          </div>
          <div className="font-mono text-3xl font-bold text-[var(--green)]">
            ${(receivedUSDC ?? 0).toFixed(2)}
          </div>
          <div className="text-xs text-[var(--t3)]">
            {t("USDC on")}{" "}
            <span className="font-medium capitalize text-[var(--t1)]">
              {destChain}
            </span>
          </div>
        </div>
        <div className="border-t border-[rgba(188,255,47,0.18)] px-5 py-3 text-center text-[11px] text-[var(--t4)]">
          {t("Saved to History · entry persists across reloads")}
        </div>
      </div>
    );
  }

  return (
    <div className="x-card sticky top-24 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <div className="font-semibold">{t("Summary")}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t4)]">
            {sourceLabel}
          </div>
        </div>
        <div
          className={[
            "rounded-full border bg-black/36 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
            runResult?.status === "failed"
              ? "border-red-400/40 text-red-300"
              : runResult?.status === "partial"
                ? "border-[rgba(188,255,47,0.28)] text-[var(--green)]"
                : "border-[var(--border)] text-[var(--green)]",
          ].join(" ")}
        >
          {runResult?.status ? t(runResult.status) : plan ? t("planned") : t("waiting")}
        </div>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <Row
          label={t("Selected tokens")}
          value={inventory ? String(selectedCount) : "—"}
        />
        <Row
          label={t("Input value")}
          value={inventory ? `$${selectedValue.toFixed(2)}` : "—"}
          bold
        />
        <Row
          label={t("Destination")}
          value={destChain}
          capitalize
        />
        <Row
          label={t("Mint payer")}
          value={plan?.destinationPayer ? shortAddr(plan.destinationPayer) : "—"}
          muted
        />
        <div className="h-px bg-[var(--border)] my-2" />
        <Row
          label={t("Input source")}
          value={inputBasis}
          muted
        />
        <Row
          label={t("Swap source")}
          value={swapBasis}
          muted
        />
        <Row
          label={t("Bridge source")}
          value={bridgeBasis}
          muted
        />
        <div className="h-px bg-[var(--border)] my-2" />
        <Row
          label={t("USDC output")}
          value={swapOutput !== undefined ? `$${swapOutput.toFixed(2)}` : "—"}
          muted
        />
        <Row
          label={t("Route impact / reserve")}
          value={routeImpact !== undefined ? `$${routeImpact.toFixed(2)}` : "—"}
          muted
        />
        <Row
          label={t("CCTP protocol fee")}
          value={cctpProtocolFee !== undefined ? `$${cctpProtocolFee.toFixed(2)}` : "—"}
          muted
        />
        <Row
          label={t("Gas budget (rough)")}
          value={gasBudget !== undefined ? `$${gasBudget.toFixed(2)}` : "—"}
          muted
        />
        <div className="h-px bg-[var(--border)] my-2" />
        <Row
          label={t("Net receive (USDC)")}
          value={displayedReceive !== undefined ? `$${displayedReceive.toFixed(2)}` : "—"}
          highlight
          big
        />
      </div>

      <div className="border-t border-[var(--border)] px-5 py-3 text-center text-[11px] text-[var(--t4)]">
        {hasFinalResult
          ? t("Final receive amount is based on confirmed successful delivery steps. Failed or skipped chains are not counted as delivered.")
          : demoMode
          ? t("Demo mode uses synthetic balances and simulated prices. Switch to Live with local keys to request OKX portfolio balances, OKX swap quotes, and Bridge Kit CCTP estimates.")
          : t("Input value comes from OKX portfolio pricing; OKX quotes and Bridge Kit fees are refreshed during planning. Gas budget is a rough native-token spend estimate and is not deducted from USDC.")}
      </div>

      {plan && plan.perChain.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--border)] px-5 py-3 text-xs">
          <div className="mb-1 text-[var(--t3)]">{t("Per-chain breakdown")}</div>
          {plan.perChain.map((cp, i) => (
            <div
              key={`${cp.owner}:${cp.chain}:${i}`}
              className="flex justify-between text-[var(--text)]"
            >
              <span className="capitalize">
                {cp.chain}{" "}
                <span className="normal-case text-[var(--dim)]">
                  {shortAddr(cp.owner)}
                </span>
              </span>
              <span
                className={
                  cp.willAccumulate
                    ? "text-[var(--pink)]"
                    : "text-[var(--t3)]"
                }
              >
                {cp.willAccumulate
                  ? t("skip")
                  : chainActionLabel(cp, t)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function chainActionLabel(
  cp: SweepPlan["perChain"][number],
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const receive = `$${cp.estimatedReceiveUSDC.toFixed(2)}`;
  if (cp.routeKind === "cctp_only") return t("CCTP only · {receive}", { receive });
  if (cp.routeKind === "swap_then_cctp") return t("swap + CCTP · {receive}", { receive });
  if (cp.routeKind === "local_swap") return t("local swap · {receive}", { receive });
  if (cp.routeKind === "local_transfer") return t("local transfer · {receive}", { receive });
  if (cp.routeKind === "local_usdc") return t("already USDC · {receive}", { receive });
  if (cp.steps.length === 0) return t("already USDC · {receive}", { receive });
  return t("{count} tx · {receive}", { count: cp.steps.length, receive });
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function getBridgeFeeSource(plan: SweepPlan): "bridge-kit" | "fallback" | "no-bridge" | "pending" {
  const bridgeSteps = plan.perChain.flatMap((cp) =>
    cp.steps.filter((s) => s.kind === "cctp_burn")
  );
  if (bridgeSteps.length === 0) return "no-bridge";
  const sources = bridgeSteps.map((s) => (s.details as any).bridgeFeeSource);
  if (sources.some((s) => s === "bridge-kit")) return "bridge-kit";
  if (sources.some((s) => s === "fallback")) return "fallback";
  return "pending";
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
  capitalize,
  big,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  capitalize?: boolean;
  big?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[var(--t3)]">{label}</span>
      <span
        className={[
          big ? "text-lg" : "",
          bold ? "font-semibold" : "",
          muted ? "text-[var(--t3)]" : "",
          highlight ? "text-[var(--green)] font-semibold" : "",
          capitalize ? "capitalize" : "",
          "font-mono",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
