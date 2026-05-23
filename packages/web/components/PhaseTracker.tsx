"use client";

import type {
  Chain,
  ChainPhase,
  StepKind,
  SweepPlan,
  SweepResult,
} from "@dust-sweeper/core";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";

const PHASES: { key: ChainPhase; label: string; sub: string }[] = [
  { key: "approving", label: "Approve", sub: "ERC20 allowance" },
  { key: "swapping", label: "Swap", sub: "OKX DEX to USDC" },
  { key: "burning", label: "Burn", sub: "CCTP depositForBurn" },
  { key: "attesting", label: "Attest", sub: "Circle iris-api" },
  { key: "minting", label: "Mint", sub: "CCTP receiveMessage" },
  { key: "done", label: "Done", sub: "USDC delivered" },
];

const PHASE_RANK: Record<ChainPhase, number> = {
  idle: -1,
  approving: 0,
  swapping: 1,
  burning: 2,
  attesting: 3,
  minting: 4,
  done: 5,
  failed: -1,
  skipped: -1,
};

type RouteResult = SweepResult["perChain"][number];

export function PhaseTracker({
  plan,
  events,
  result,
}: {
  plan: SweepPlan;
  events: any[];
  result?: SweepResult;
}) {
  const { t } = useI18n();
  const routes = uniqueRoutes(plan);
  const routeByKey = new Map(routes.map((cp) => [routeKey(cp.chain, cp.owner), cp]));
  const phaseByRoute = new Map<string, ChainPhase>();
  const failedStepByRoute = new Map<string, StepKind>();
  const failedStepIndexByRoute = new Map<string, number>();
  const errorByRoute = new Map<string, string>();
  const statusByRoute = new Map<string, RouteResult>();

  for (const cp of routes) {
    phaseByRoute.set(routeKey(cp.chain, cp.owner), cp.willAccumulate ? "skipped" : "idle");
    if (cp.willAccumulate && cp.skipReason) {
      errorByRoute.set(routeKey(cp.chain, cp.owner), cp.skipReason);
    }
  }

  for (const route of result?.perChain ?? []) {
    statusByRoute.set(routeKey(route.chain, route.owner), route);
    if (route.error) errorByRoute.set(routeKey(route.chain, route.owner), route.error);
  }

  for (const e of events) {
    if (!e.chain) continue;
    const chain = e.chain as Chain;
    const owner = e.owner ?? routes.find((cp) => cp.chain === chain)?.owner ?? "";
    const key = routeKey(chain, owner);
    const route = routeByKey.get(key);
    const cur = phaseByRoute.get(key) ?? "idle";
    let next: ChainPhase = cur;

    switch (e.kind) {
      case "step_start": {
        const step = route?.steps[e.stepIdx];
        next = stepKindToPhase(step?.kind) ?? cur;
        break;
      }
      case "cctp_burn_sent":
      case "cctp_burn_confirmed":
        next = "burning";
        break;
      case "cctp_attestation_pending":
      case "cctp_attestation_received":
        next = "attesting";
        break;
      case "cctp_mint_sent":
      case "cctp_mint_confirmed":
        next = "minting";
        break;
      case "chain_complete":
        next = "done";
        break;
      case "step_failed": {
        const step = route?.steps[e.stepIdx];
        if (step?.kind) failedStepByRoute.set(key, step.kind);
        if (typeof e.stepIdx === "number") failedStepIndexByRoute.set(key, e.stepIdx);
        if (e.error) errorByRoute.set(key, e.error);
        next = "failed";
        break;
      }
    }
    phaseByRoute.set(key, next);
  }

  for (const [key, routeResult] of statusByRoute) {
    if (routeResult.status === "success") {
      phaseByRoute.set(key, "done");
    } else if (routeResult.status === "skipped") {
      phaseByRoute.set(key, "skipped");
    } else if ((routeResult.receivedUSDC ?? 0) > 0) {
      phaseByRoute.set(key, "done");
    } else {
      phaseByRoute.set(key, "failed");
    }
  }

  const rows = routes.map((cp) => {
    const key = routeKey(cp.chain, cp.owner);
    const status = statusByRoute.get(key);
    return {
      plan: cp,
      phase: phaseByRoute.get(key) ?? "idle",
      status,
      error: status?.error ?? errorByRoute.get(key),
      failedStep: failedStepByRoute.get(key),
      failedStepIdx: failedStepIndexByRoute.get(key),
    };
  });

  const deliveredCount = rows.filter((row) => (row.status?.receivedUSDC ?? 0) > 0 || row.status?.status === "success").length;
  const runningCount = rows.filter((row) =>
    ["approving", "swapping", "burning", "attesting", "minting"].includes(row.phase)
  ).length;
  const issueCount = rows.filter((row) =>
    row.status
      ? row.status.status !== "success"
      : row.phase === "failed" || row.phase === "skipped"
  ).length;

  if (routes.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-black/58 p-4 shadow-[0_24px_90px_rgba(0,0,0,.38)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(188,255,47,.1),transparent_28%),radial-gradient(circle_at_92%_14%,rgba(250,77,255,.11),transparent_30%)]" />
      <div className="relative mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h4 className="text-base font-semibold">{t("Route execution")}</h4>
          <p className="mt-1 text-xs text-[var(--t3)]">
            {t("Delivered, running, and blocked routes are tracked separately.")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <TimelineStat label={t("Delivered")} value={deliveredCount} tone="ok" />
          <TimelineStat label={t("Running")} value={runningCount} tone="live" />
          <TimelineStat label={t("Needs fix")} value={issueCount} tone="bad" />
        </div>
      </div>
      <div className="relative space-y-2">
        {rows.map((row) => (
          <ChainRow
            key={routeKey(row.plan.chain, row.plan.owner)}
            chain={row.plan.chain}
            owner={row.plan.owner}
            phase={row.phase}
            status={row.status}
            error={row.error}
            failedStep={row.failedStep}
            failedStepIdx={row.failedStepIdx}
          />
        ))}
      </div>
    </div>
  );
}

function ChainRow({
  chain,
  owner,
  phase,
  status,
  error,
  failedStep,
  failedStepIdx,
}: {
  chain: Chain;
  owner: string;
  phase: ChainPhase;
  status?: RouteResult;
  error?: string;
  failedStep?: StepKind;
  failedStepIdx?: number;
}) {
  const { t } = useI18n();
  const rank = PHASE_RANK[phase];
  const isSkipped = status?.status === "skipped" || phase === "skipped";
  const isPartial = status?.status === "partial";
  const isFailed = status
    ? status.status === "failed"
    : phase === "failed";
  const delivered = status?.receivedUSDC ?? 0;
  const issue = error
    ? routeIssue(error, t)
      : isSkipped
        ? {
          reason: t("Skipped"),
          action: t("Fix the earlier route issue, then rescan before retrying."),
        }
      : null;
  const failedPhase = failedStep ? stepKindToPhase(failedStep) : undefined;

  return (
    <div
      className={clsx(
        "rounded-[20px] border bg-black/42 p-3",
        status?.status === "success"
          ? "border-[rgba(188,255,47,0.28)]"
          : isPartial && delivered > 0
            ? "border-[rgba(188,255,47,0.18)]"
            : isFailed
              ? "border-red-400/25"
              : isSkipped
                ? "border-[rgba(250,77,255,0.28)]"
                : "border-[var(--border)]"
      )}
    >
      <div className="grid gap-4 md:grid-cols-[150px_minmax(0,1fr)_112px] md:items-center">
        <div className="flex items-center justify-between gap-3 md:block">
          <div className="text-sm font-semibold capitalize text-[var(--t1)]">
            {chain}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-[var(--t4)]">
            {shortAddr(owner)}
          </div>
          <div className="mt-0 md:mt-2">
            <StatusPill phase={phase} status={status} />
          </div>
        </div>
        <div className="relative min-w-0 overflow-x-auto pb-1">
          <div className="absolute left-6 right-6 top-3.5 h-px bg-gradient-to-r from-[rgba(188,255,47,.3)] via-[rgba(255,255,255,.14)] to-[rgba(250,77,255,.18)]" />
          <div className="relative grid min-w-[560px] grid-cols-6 gap-2">
            {PHASES.map((p) => {
              const reached = !isSkipped && rank >= PHASE_RANK[p.key];
              const active = !status && !isFailed && !isSkipped && rank === PHASE_RANK[p.key];
              const failedHere = failedPhase === p.key;
              return (
                <div key={p.key} className="text-center">
                  <div
                    className={clsx(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-[10px] transition",
                      failedHere
                        ? "border-red-300 bg-red-500/25 text-red-100"
                        : isSkipped
                          ? "border-[rgba(250,77,255,0.42)] bg-[rgba(250,77,255,0.12)] text-[var(--pink)]"
                          : reached
                            ? "border-[var(--green)] bg-[var(--green)] text-black"
                            : "border-[var(--border-strong)] bg-[#060407] text-[var(--t4)]",
                      active && "shadow-[0_0_0_6px_rgba(188,255,47,.12)]"
                    )}
                    title={`${t(p.label)} - ${p.sub}`}
                  >
                    {failedHere ? (
                      <span>!</span>
                    ) : active ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                    ) : (
                      <span>{PHASE_RANK[p.key] + 1}</span>
                    )}
                  </div>
                  <div
                    className={clsx(
                      "mt-2 truncate text-[11px] font-medium",
                      failedHere
                        ? "text-red-200"
                        : reached || active
                          ? "text-[var(--t1)]"
                          : "text-[var(--t4)]"
                    )}
                  >
                    {failedHere && typeof failedStepIdx === "number"
                      ? `${t(p.label)} #${failedStepIdx}`
                      : t(p.label)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              "rounded-full border px-3 py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em]",
              status?.status === "success"
                ? "border-[var(--green)] bg-[var(--green)] text-black"
                : isPartial
                  ? "border-[rgba(188,255,47,0.34)] bg-[rgba(188,255,47,0.1)] text-[var(--green)]"
                  : isFailed
                    ? "border-red-400/40 bg-red-500/10 text-red-300"
                    : isSkipped
                      ? "border-[rgba(250,77,255,0.38)] bg-[rgba(250,77,255,0.1)] text-[var(--pink)]"
                      : phase === "idle"
                        ? "border-[var(--border)] bg-black/44 text-[var(--t4)]"
                        : "border-white/18 bg-white/[0.07] text-[var(--t1)]"
            )}
          >
            {status ? statusLabel(status, t) : labelFor(phase, t)}
          </div>
          {delivered > 0 && (
            <div className="mt-1 font-mono text-[11px] text-[var(--green)]">
              {t("${amount} delivered", { amount: delivered.toFixed(2) })}
            </div>
          )}
        </div>
      </div>
      {issue && (
        <div className="mt-3 rounded-[14px] border border-red-400/18 bg-red-500/[0.07] px-3 py-2 text-xs leading-5 text-red-100">
          {issue.reason}
          <span className="text-[var(--t4)]"> · {issue.action}</span>
        </div>
      )}
    </div>
  );
}

function TimelineStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "live" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--green)]"
      : tone === "bad"
        ? "text-red-300"
        : "text-[var(--t1)]";
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-black/28 px-3 py-2 text-right">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t4)]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-base font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function routeKey(chain: Chain, owner: string) {
  return `${chain}:${owner}`.toLowerCase();
}

function uniqueRoutes(plan: SweepPlan) {
  const seen = new Set<string>();
  return plan.perChain.filter((cp) => {
    const key = routeKey(cp.chain, cp.owner);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function StatusPill({
  phase,
  status,
}: {
  phase: ChainPhase;
  status?: RouteResult;
}) {
  const { t } = useI18n();
  const live = !status && !["idle", "done", "failed", "skipped"].includes(phase);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium",
        status?.status === "success"
          ? "bg-[rgba(188,255,47,0.12)] text-[var(--green)]"
          : status?.status === "partial"
            ? "bg-[rgba(188,255,47,0.1)] text-[var(--green)]"
            : status?.status === "failed" || phase === "failed"
              ? "bg-red-500/12 text-red-300"
              : status?.status === "skipped" || phase === "skipped"
                ? "bg-[rgba(250,77,255,0.12)] text-[var(--pink)]"
                : "bg-white/[0.06] text-[var(--t3)]"
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          live ? "animate-pulse bg-[var(--green)]" : "bg-current"
        )}
      />
      {status ? statusLabel(status, t) : phase === "idle" ? t("queued") : labelFor(phase, t)}
    </span>
  );
}

function statusLabel(
  status: RouteResult,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (status.status === "success") return t("delivered");
  if (status.status === "partial") return (status.receivedUSDC ?? 0) > 0 ? t("partial") : t("blocked");
  return t(status.status);
}

function stepKindToPhase(kind?: StepKind): ChainPhase | undefined {
  switch (kind) {
    case "approve":
      return "approving";
    case "swap":
      return "swapping";
    case "usdc_transfer":
      return "done";
    case "cctp_burn":
      return "burning";
    case "cctp_mint":
      return "minting";
    default:
      return undefined;
  }
}

function labelFor(
  p: ChainPhase,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  switch (p) {
    case "approving":
      return t("approving");
    case "swapping":
      return t("swapping");
    case "burning":
      return t("burning");
    case "attesting":
      return t("attesting");
    case "minting":
      return t("minting");
    case "done":
      return t("done");
    case "failed":
      return t("failed");
    case "skipped":
      return t("skipped");
    default:
      return t("idle");
  }
}

function routeIssue(
  error: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): { reason: string; action: string } {
  if (/insufficient funds|exceeds the balance|not enough native gas/i.test(error)) {
    return {
      reason: t("Not enough native gas"),
      action: t("Top up this source wallet on that chain."),
    };
  }
  if (/nonce too low|nonce provided|nonce already used/i.test(error)) {
    return {
      reason: t("Nonce already used"),
      action: t("Wait for pending txs to settle, then rescan before retrying."),
    };
  }
  if (/swap reverted/i.test(error)) {
    return {
      reason: t("Swap reverted on-chain"),
      action: t("Refresh the plan or retry with fewer volatile tokens."),
    };
  }
  if (/no fresh USDC|no selected USDC|no new USDC/i.test(error)) {
    return {
      reason: t("No new USDC to bridge"),
      action: t("The paired swap did not produce USDC, so bridge/transfer was skipped."),
    };
  }
  if (/skipped/i.test(error)) {
    return {
      reason: t("Skipped after a paired step failed"),
      action: t("Fix the earlier token step first."),
    };
  }
  const cleaned = error.replace(/\s+/g, " ").trim();
  const detailsIndex = cleaned.search(/\b(?:Request Arguments:|Details:|Version:)\b/);
  const short = detailsIndex >= 0 ? cleaned.slice(0, detailsIndex).trim() : cleaned;
  return {
    reason: short.length > 96 ? `${short.slice(0, 93)}...` : short,
    action: t("Open the event log for raw tx context."),
  };
}
