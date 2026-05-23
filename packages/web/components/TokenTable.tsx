"use client";

import { useState } from "react";
import type { Chain, DustInventory } from "@dust-sweeper/core";
import clsx from "clsx";
import { okxAddressUrl, okxTokenUrl } from "@/lib/explorers";
import { useI18n } from "@/lib/i18n";

function tokenKey(t: { owner: string; chain: string; address: string }) {
  return `${t.owner}:${t.chain}:${t.address}`.toLowerCase();
}

interface SelectableContext {
  aggregationMode?: "per-wallet" | "unified";
  recipient?: string;
}

type TokenRowModel = DustInventory["chains"][number]["tokens"][number] & {
  key: string;
};

export function TokenTable({
  inventory,
  destinationChain,
  aggregationMode,
  recipient,
  selected,
  onToggle,
  onSelectAll,
}: {
  inventory: DustInventory;
  destinationChain: Chain;
  aggregationMode?: "per-wallet" | "unified";
  recipient?: string;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: (allKeys: string[]) => void;
}) {
  const { t } = useI18n();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const allTokens = inventory.chains
    .flatMap((c) => c.tokens.map((t) => ({ ...t, key: tokenKey(t) })))
    .sort(compareTokenValue);
  const selectableContext = { aggregationMode, recipient };
  const readyTokens = allTokens.filter((t) =>
    isSelectable(t, destinationChain, selectableContext)
  );
  const unavailableTokens = allTokens.filter(
    (t) => !isSelectable(t, destinationChain, selectableContext)
  );
  const chainsWithError = inventory.chains.filter((c) => c.error);
  const allChecked =
    readyTokens.length > 0 && readyTokens.every((t) => selected.has(t.key));
  const unavailableValue = unavailableTokens.reduce(
    (sum, token) => sum + token.usdValue,
    0
  );

  return (
    <div className="x-card overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-[34px_1.55fr_1fr_1.05fr_1.18fr] border-b border-[var(--border)] px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--t4)]">
        <div>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() =>
              onSelectAll(allChecked ? [] : readyTokens.map((t) => t.key))
            }
            disabled={readyTokens.length === 0}
            className="h-4 w-4 accent-[var(--green)]"
          />
        </div>
        <div>{t("Token")}</div>
        <div>{t("Wallet")}</div>
        <div>{t("Contract")}</div>
        <div className="text-right">{t("Holdings")}</div>
      </div>
      {allTokens.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--t3)]">
          {t("No dust found. Try lowering the threshold or enabling opt-in categories.")}
        </div>
      ) : (
        <>
          {readyTokens.length > 0 ? (
            readyTokens.map((t) => (
              <TokenRow
                key={t.key}
                token={t}
                destinationChain={destinationChain}
                selectableContext={selectableContext}
                checked={selected.has(t.key)}
                onToggle={onToggle}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-[var(--t3)]">
              {t("No routable holdings are currently eligible for this destination.")}
            </div>
          )}

          {unavailableTokens.length > 0 && (
            <div className="border-t border-[var(--border)] bg-black/32">
              <button
                type="button"
                onClick={() => setShowUnavailable((v) => !v)}
                className="x-focus flex min-w-[820px] items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.03]"
              >
                <span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t4)]">
                    {t("Unavailable assets")}
                  </span>
                  <span className="ml-3 text-xs text-[var(--t3)]">
                    {t("{count} hidden · ≈ ${value}", {
                      count: unavailableTokens.length,
                      value: formatUSD(unavailableValue),
                    })}
                  </span>
                </span>
                <span className="font-mono text-xs text-[var(--green)]">
                  {showUnavailable ? t("Hide") : t("Show")}
                </span>
              </button>
              {showUnavailable &&
                unavailableTokens.map((t) => (
                  <TokenRow
                    key={t.key}
                    token={t}
                    destinationChain={destinationChain}
                    selectableContext={selectableContext}
                    checked={false}
                    onToggle={onToggle}
                  />
                ))}
            </div>
          )}
        </>
      )}
      {chainsWithError.length > 0 && (
        <div className="space-y-1 border-t border-[var(--border)] bg-black/40 px-4 py-3 text-xs text-red-300">
          {chainsWithError.map((c) => (
            <div
              key={c.chain}
              title={c.error}
              className="flex min-w-0 items-start gap-2"
            >
              <span className="shrink-0 font-mono uppercase tracking-[0.12em]">
                {c.chain}
              </span>
              <span className="min-w-0 truncate">{shortError(c.error)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TokenRow({
  token,
  destinationChain,
  selectableContext,
  checked,
  onToggle,
}: {
  token: TokenRowModel;
  destinationChain: Chain;
  selectableContext: SelectableContext;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  const { t: tr } = useI18n();
  const selectable = isSelectable(token, destinationChain, selectableContext);
  const category = categoryLabel(token.category, tr);
  const walletUrl = okxAddressUrl(token.chain, token.owner);
  const tokenUrl = okxTokenUrl(token.chain, token.address);
  const alreadyOnDestination =
    token.category === "usdc" &&
    token.chain === destinationChain &&
    !selectable;
  const sameChainUsdcTransfer =
    token.category === "usdc" &&
    token.chain === destinationChain &&
    !alreadyOnDestination;
  const cctpOnly = token.category === "usdc" && token.chain !== destinationChain;
  const insufficientGas = token.routeStatus === "insufficient_gas";
  const reason = unavailableReason(token, alreadyOnDestination, tr);

  return (
    <label
      aria-disabled={!selectable}
      className={clsx(
        "grid min-w-[820px] grid-cols-[34px_1.55fr_1fr_1.05fr_1.18fr] items-center border-b border-[var(--border)] px-3 py-1.5 transition",
        selectable
          ? "cursor-pointer hover:bg-white/[0.02]"
          : "cursor-not-allowed bg-white/[0.012] opacity-52 grayscale",
        checked && selectable && "bg-[var(--hot)]"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!selectable}
        onChange={() => {
          if (selectable) onToggle(token.key);
        }}
        className="h-4 w-4 accent-[var(--green)]"
      />
      <div className="flex items-center gap-3">
        <TokenBadge symbol={token.symbol} logoUrl={token.logoUrl} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{token.symbol}</span>
            <span className="rounded-full border border-[rgba(188,255,47,0.22)] bg-black/28 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--green)]">
              {chainLabel(token.chain)}
            </span>
          </div>
          {category && (
            <div
              className={clsx(
                "mt-1 text-xs",
                selectable ? "text-[var(--dim)]" : "text-[var(--t4)]"
              )}
            >
              {insufficientGas
                ? token.category === "native"
                  ? tr("native gas · keep for fees")
                  : tr("not economical")
                : cctpOnly
                  ? tr("native USDC · CCTP only")
                  : sameChainUsdcTransfer
                    ? tr("native USDC · local transfer")
                    : category}
            </div>
          )}
        </div>
      </div>
      <div
        className="font-mono text-xs text-[var(--t3)]"
        title={tr("Source wallet: {owner}", { owner: token.owner })}
      >
        <ExplorerLink href={walletUrl} label={shortAddr(token.owner)} />
      </div>
      <div
        className="font-mono text-xs text-[var(--t3)]"
        title={token.address || tr("Native gas token")}
      >
        <ExplorerLink href={tokenUrl} label={shortContract(token.address, tr)} />
      </div>
      <div className="text-right">
        <div className="font-mono text-sm text-[var(--t1)]">
          {fmtBalance(token.balance)}{" "}
          <span className="text-[10px] uppercase text-[var(--t4)]">
            {token.symbol}
          </span>
        </div>
        <div
          className={clsx(
            "mt-0.5 font-mono text-xs",
            selectable ? "text-[var(--green)]" : "text-[var(--t4)]"
          )}
        >
          ≈ ${formatUSD(token.usdValue)}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--t4)]">
          {quoteLabel(token.quoteSource, cctpOnly, tr)}
        </div>
        {!selectable && (
          <div
            className="mt-0.5 truncate text-[10px] text-[var(--t4)]"
            title={token.routeError ?? reason}
          >
            {reason}
          </div>
        )}
      </div>
    </label>
  );
}

export function isSelectable(
  token: { routeStatus?: string; category: string; chain: Chain; owner: string },
  destinationChain: Chain,
  context: SelectableContext = {}
) {
  if (token.routeStatus === "unavailable") return false;
  if (token.routeStatus === "insufficient_gas") return false;
  if (token.category === "usdc" && token.chain === destinationChain) {
    if (
      context.aggregationMode === "unified" &&
      context.recipient &&
      !sameAddress(token.owner, context.recipient)
    ) {
      return true;
    }
    return false;
  }
  return true;
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function compareTokenValue(a: TokenRowModel, b: TokenRowModel) {
  if (b.usdValue !== a.usdValue) return b.usdValue - a.usdValue;
  return `${a.chain}:${a.symbol}`.localeCompare(`${b.chain}:${b.symbol}`);
}

function unavailableReason(
  token: TokenRowModel,
  alreadyOnDestination: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (alreadyOnDestination) return t("Already at destination");
  if (token.routeStatus === "unavailable") return t("No OKX route");
  if (token.routeStatus === "insufficient_gas") {
    return token.routeError?.includes("gas reserve")
      ? t("Reserved for gas")
      : t("Not economical");
  }
  return t("Unavailable");
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function shortContract(
  addr: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (!addr) return t("native");
  return shortAddr(addr);
}

function chainLabel(chain: string) {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

function categoryLabel(
  category: string,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (category === "native") return t("native gas");
  if (category === "stable") return t("stablecoin");
  if (category === "wrapped") return t("wrapped native");
  if (category === "usdc") return t("native USDC");
  return "";
}

function TokenBadge({
  symbol,
  logoUrl,
}: {
  symbol: string;
  logoUrl?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={symbol}
        onError={() => setBroken(true)}
        className="w-7 h-7 rounded-full shrink-0 object-cover bg-neutral-800"
        loading="lazy"
      />
    );
  }
  const initials = symbol.slice(0, 3).toUpperCase();
  const hue = Array.from(symbol).reduce(
    (a, c) => (a * 31 + c.charCodeAt(0)) % 360,
    0
  );
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 50%), hsl(${(hue + 40) % 360} 70% 40%))`,
      }}
    >
      {initials}
    </div>
  );
}

function ExplorerLink({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  const { t } = useI18n();
  if (!href) return <span>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="rounded-sm transition hover:text-[var(--green)] hover:underline hover:decoration-[var(--green)] hover:underline-offset-4"
      title={t("Open in OKX Explorer")}
    >
      {label}
    </a>
  );
}

function fmtBalance(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n === 0) return "0";
  if (n < 0.001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6);
  if (n < 1000) return n.toFixed(4);
  return n.toFixed(2);
}

function formatUSD(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  if (n > 0 && n < 0.01) return n.toFixed(4);
  return n.toFixed(2);
}

function quoteLabel(
  source: string | undefined,
  cctpOnly: boolean | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (source === "okx") return t("Live OKX quote");
  if (source === "demo") return t("Simulated value");
  if (source === "fallback") return t("Price fallback");
  if (source === "direct") return cctpOnly ? t("CCTP-only USDC") : t("Native USDC");
  return t("Portfolio value");
}

function shortError(error?: string) {
  if (!error) return "";
  const cleaned = error.replace(/\s+/g, " ").trim();
  const detailsIndex = cleaned.search(/\b(?:Contract Call|Docs:|Details:|Version:)\b/);
  const short = detailsIndex >= 0 ? cleaned.slice(0, detailsIndex).trim() : cleaned;
  return short.length > 160 ? `${short.slice(0, 157)}...` : short;
}
