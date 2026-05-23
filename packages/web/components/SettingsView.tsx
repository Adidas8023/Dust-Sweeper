"use client";

import { useEffect, useState } from "react";
import type { Chain, RuntimeRpcConfig, SweepSettings } from "@dust-sweeper/core";
import type { LocalSignerVault } from "@/lib/local-keys";
import { KeyVaultPanel } from "./KeyVaultPanel";
import { SettingsPanel } from "./SettingsPanel";
import { useI18n, type Locale } from "@/lib/i18n";

interface StatusInfo {
  demoMode: boolean;
  hasEvmKey: boolean;
  hasSolanaKey: boolean;
  hasOkxAuth: boolean;
  hasOkxProjectId?: boolean;
  hasAlchemyApiKey?: boolean;
}

interface ProxyInfo {
  configured: boolean;
  running: boolean;
  localUrl: string;
  error?: string;
}

const ALL_CHAINS: Chain[] = [
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

export function SettingsView({
  status,
  settings,
  onSettings,
  defaultDest,
  onDefaultDest,
  localEvmKeyCount,
  localSolanaKeyCount,
  signerVault,
  onSignerVault,
  rpcConfig,
  onRpcConfig,
}: {
  status: StatusInfo | null;
  settings: SweepSettings;
  onSettings: (s: SweepSettings) => void;
  defaultDest: Chain;
  onDefaultDest: (c: Chain) => void;
  localEvmKeyCount: number;
  localSolanaKeyCount: number;
  signerVault: LocalSignerVault;
  onSignerVault: (next: LocalSignerVault) => void;
  rpcConfig: RuntimeRpcConfig;
  onRpcConfig: (next: RuntimeRpcConfig) => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const [proxy, setProxy] = useState<ProxyInfo | null>(null);
  const [proxyBusy, setProxyBusy] = useState(false);
  const evmSignerLabel =
    localEvmKeyCount > 0
      ? t(
          localEvmKeyCount === 1
            ? "{count} browser key"
            : "{count} browser keys",
          { count: localEvmKeyCount }
        )
      : status?.hasEvmKey
        ? t(".env configured")
        : t("not imported");
  const solanaSignerLabel =
    localSolanaKeyCount > 0
      ? t(
          localSolanaKeyCount === 1
            ? "{count} browser key"
            : "{count} browser keys",
          { count: localSolanaKeyCount }
        )
      : status?.hasSolanaKey
        ? t(".env configured")
        : t("optional unless Solana is used");

  useEffect(() => {
    refreshProxy();
  }, []);

  async function refreshProxy() {
    try {
      const r = await fetch("/api/proxy");
      setProxy(await r.json());
    } catch {
      setProxy(null);
    }
  }

  async function toggleProxy(action: "start" | "stop" | "restart") {
    setProxyBusy(true);
    try {
      const r = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setProxy(await r.json());
    } finally {
      setProxyBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <KeyVaultPanel
        value={signerVault}
        onChange={onSignerVault}
        status={status}
      />

      <Section title={t("Runtime status")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Indicator
            label={t("EVM signing")}
            value={evmSignerLabel}
            tone={localEvmKeyCount > 0 || status?.hasEvmKey ? "ok" : "warn"}
          />
          <Indicator
            label={t("Solana signing")}
            value={solanaSignerLabel}
            tone={localSolanaKeyCount > 0 || status?.hasSolanaKey ? "ok" : "muted"}
          />
          <Indicator
            label={t("Data source")}
            value={t("OnchainOS CLI primary")}
            tone="ok"
          />
          <Indicator
            label={t("OKX API fallback")}
            value={status?.hasOkxAuth ? t("ready") : t("optional")}
            tone={status?.hasOkxAuth ? "ok" : "muted"}
          />
          <Indicator
            label={t("Alchemy RPC")}
            value={
              rpcConfig.alchemyApiKey
                ? t("browser key")
                : status?.hasAlchemyApiKey
                  ? t(".env configured")
                  : t("public fallback")
            }
            tone={
              rpcConfig.alchemyApiKey || status?.hasAlchemyApiKey
                ? "ok"
                : "muted"
            }
          />
        </div>
        <p className="text-xs text-[var(--dim)] mt-3">
          {t("Browser vault keys are used for live runs when imported; .env keys are still supported as a local fallback. OnchainOS handles portfolio, quote, and swap data; direct OKX API credentials are optional.")}
        </p>
      </Section>

      <Section title={t("Language")}>
        <LanguageSwitch
          value={locale}
          onChange={setLocale}
        />
      </Section>

      <Section title={t("Alchemy API key")}>
        <AlchemyKeyField
          value={rpcConfig.alchemyApiKey ?? ""}
          envConfigured={Boolean(status?.hasAlchemyApiKey)}
          onChange={(alchemyApiKey) =>
            onRpcConfig({
              ...rpcConfig,
              alchemyApiKey: alchemyApiKey.trim() || undefined,
            })
          }
        />
      </Section>

      <Section title={t("OKX proxy")}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-[var(--t2)]">
              {proxy?.configured
                ? t(proxy.running ? "Local proxy running" : "Local proxy stopped")
                : t("No upstream proxy configured")}
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--dim)]">
              {proxy?.localUrl ?? "http://127.0.0.1:7897"}
            </div>
            {proxy?.error && (
              <div className="mt-1 text-xs text-red-300">{proxy.error}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={proxyBusy || !proxy?.configured || proxy?.running}
              onClick={() => toggleProxy("start")}
              className="x-focus rounded-full border border-[var(--border-strong)] bg-black/32 px-4 py-2 text-sm text-[var(--t2)] transition hover:text-[var(--t1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Start")}
            </button>
            <button
              type="button"
              disabled={proxyBusy || !proxy?.running}
              onClick={() => toggleProxy("stop")}
              className="x-focus rounded-full border border-[var(--border-strong)] bg-black/32 px-4 py-2 text-sm text-[var(--t2)] transition hover:text-[var(--t1)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Stop")}
            </button>
            <button
              type="button"
              disabled={proxyBusy || !proxy?.configured}
              onClick={() => toggleProxy("restart")}
              className="x-focus rounded-full border border-[var(--green)] bg-[var(--hot)] px-4 py-2 text-sm text-[var(--green)] transition hover:bg-[rgba(188,255,47,0.14)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("Restart")}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--dim)]">
          {t("Uses")} <code className="rounded bg-[var(--panel-2)] px-1">OKX_UPSTREAM_PROXY_URL</code>{" "}
          {t("from the local .env. The upstream credential is never returned to the browser.")}
        </p>
      </Section>

      <Section title={t("Default destination chain")}>
        <div className="flex flex-wrap gap-2">
          {ALL_CHAINS.map((c) => (
            <button
              key={c}
              onClick={() => onDefaultDest(c)}
              className={`x-focus rounded-full border px-3 py-1.5 text-sm capitalize transition ${
                defaultDest === c
                  ? "border-[var(--green)] bg-[var(--green)] text-black"
                  : "border-[var(--border-strong)] bg-black/32 text-[var(--t3)] hover:bg-white/[0.04] hover:text-[var(--t1)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--dim)] mt-3">
          {t("The Sweep tab will pre-select this chain. Saved to this browser.")}
        </p>
      </Section>

      <Section title={t("Default sweep settings")}>
        <SettingsPanel settings={settings} onChange={onSettings} />
        <p className="text-xs text-[var(--dim)] mt-3">
          {t("Threshold + opt-in categories. Saved to this browser; Sweep tab starts with these.")}
        </p>
      </Section>

      <Section title={t("RPC strategy")}>
        <div className="text-sm text-[var(--muted)] space-y-1">
          <div>
            1. <code className="bg-[var(--panel-2)] px-1 rounded">RPC_&lt;CHAIN&gt;</code>{" "}
            {t("env var (highest priority - explicit override)")}
          </div>
          <div>
            2. <code className="bg-[var(--panel-2)] px-1 rounded">ALCHEMY_API_KEY</code>{" "}
            {t("(auto-builds URLs for chains hosted by Alchemy)")}
          </div>
          <div>3. {t("Public RPC fallback (last resort)")}</div>
        </div>
      </Section>
    </div>
  );
}

function AlchemyKeyField({
  value,
  envConfigured,
  onChange,
}: {
  value: string;
  envConfigured: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            envConfigured
              ? t("Using .env ALCHEMY_API_KEY unless you enter a browser override")
              : t("Alchemy API key")
          }
          className="x-input min-w-0 flex-1 px-3 py-2.5 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={!value}
          className="x-focus rounded-full border border-[var(--border-strong)] bg-black/32 px-4 py-2 text-sm text-[var(--t2)] transition hover:text-[var(--t1)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("Clear")}
        </button>
      </div>
      <p className="text-xs leading-5 text-[var(--dim)]">
        {t("Saved in this browser only and sent to local scan/plan/execute API calls. It overrides .env for chains supported by Alchemy.")}
      </p>
    </div>
  );
}

function LanguageSwitch({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (next: Locale) => void;
}) {
  const { t } = useI18n();
  const options: Array<{ value: Locale; label: string }> = [
    { value: "en", label: t("English") },
    { value: "zh", label: t("中文") },
  ];
  return (
    <div>
      <div className="flex w-fit rounded-full border border-[var(--border)] bg-black/48 p-1 text-xs">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`x-focus rounded-full px-4 py-1.5 transition ${
              value === option.value
                ? "bg-[var(--green)] text-black"
                : "text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--dim)]">
        {t("Language preference is saved in this browser.")}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="x-card p-5">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Indicator({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "amber" | "muted";
}) {
  const dotColor: Record<typeof tone, string> = {
    ok: "bg-[var(--green)]",
    warn: "bg-red-400",
    amber: "bg-[var(--pink)]",
    muted: "bg-neutral-500",
  };
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-[var(--border)] bg-black/32 p-3">
      <span className="text-sm text-[var(--t3)]">{label}</span>
      <span className="text-sm flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotColor[tone]}`} />
        {value}
      </span>
    </div>
  );
}
