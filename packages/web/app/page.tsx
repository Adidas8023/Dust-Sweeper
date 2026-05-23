"use client";

import { useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import type {
  AggregationMode,
  DustInventory,
  SweepPlan,
  SweepResult,
  Chain,
  RuntimeRpcConfig,
  SweepSettings,
} from "@dust-sweeper/core";
import { TopNav, type Tab, type WalletStatus } from "@/components/TopNav";
import { HistoryView } from "@/components/HistoryView";
import { SettingsView } from "@/components/SettingsView";
import {
  loadPreferences,
  savePreferences,
  PREFS_DEFAULTS,
} from "@/lib/preferences";
import { saveHistoryEntry, buildEntryFromResult } from "@/lib/history";
import { Hero } from "@/components/Hero";
import { WizardSteps } from "@/components/WizardSteps";
import { isSelectable, TokenTable } from "@/components/TokenTable";
import { SummaryPanel } from "@/components/SummaryPanel";
import { ProgressView } from "@/components/ProgressView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { FeatureCards } from "@/components/FeatureCards";
import { Footer } from "@/components/Footer";
import { PhaseTracker } from "@/components/PhaseTracker";
import { DoneState } from "@/components/DoneState";
import {
  countSignerVault,
  EMPTY_SIGNER_VAULT,
  loadSignerVault,
  saveSignerVault,
  signerVaultToRuntimeKeys,
  type LocalSignerVault,
} from "@/lib/local-keys";
import { loadRpcConfig, saveRpcConfig } from "@/lib/rpc-config";
import {
  I18nProvider,
  loadLocale,
  saveLocale,
  useI18n,
  type Locale,
} from "@/lib/i18n";

const DEST_CHOICES_ALL: Chain[] = [
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

const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
type BusyState = "idle" | "scanning" | "planning" | "executing";

function tokenKey(t: { owner: string; chain: Chain; address: string }) {
  return `${t.owner}:${t.chain}:${t.address}`.toLowerCase();
}

function isEvmChain(chain: Chain) {
  return chain !== "solana";
}

function shortAddr(addr: string) {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function hasAddress(addresses: string[], candidate: string) {
  return addresses.some((a) => a.toLowerCase() === candidate.toLowerCase());
}

export default function Home() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = loadLocale();
    setLocaleState(saved);
    saveLocale(saved);
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    saveLocale(next);
  }

  return (
    <I18nProvider locale={locale} setLocale={setLocale}>
      <HomeContent />
    </I18nProvider>
  );
}

function HomeContent() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("sweep");
  const [settings, setSettings] = useState<SweepSettings>(
    PREFS_DEFAULTS.defaultSettings
  );
  const [inv, setInv] = useState<DustInventory | null>(null);
  const [plan, setPlan] = useState<SweepPlan | null>(null);
  const [progress, setProgress] = useState<any[]>([]);
  const [dest, setDest] = useState<Chain>(PREFS_DEFAULTS.defaultDestChain);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aggregationMode, setAggregationMode] =
    useState<AggregationMode>("unified");
  const [recipientEvm, setRecipientEvm] = useState("");
  const [recipientSolana, setRecipientSolana] = useState("");
  const [destinationPayerEvm, setDestinationPayerEvm] = useState("");
  const [destinationPayerSolana, setDestinationPayerSolana] = useState("");
  const [signerVault, setSignerVault] =
    useState<LocalSignerVault>(EMPTY_SIGNER_VAULT);
  const [rpcConfig, setRpcConfig] = useState<RuntimeRpcConfig>({});
  const [clientReady, setClientReady] = useState(false);
  const [sweepStartedAt, setSweepStartedAt] = useState<number | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [maxStep, setMaxStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState<BusyState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<{
    demoMode: boolean;
    hasEvmKey: boolean;
    hasSolanaKey: boolean;
    hasOkxAuth: boolean;
    hasOkxProjectId?: boolean;
    hasAlchemyApiKey?: boolean;
  } | null>(null);

  const runtimeSignerKeys = useMemo(
    () => signerVaultToRuntimeKeys(signerVault),
    [signerVault]
  );
  const localSignerCount = countSignerVault(signerVault);
  const effectiveDemoMode =
    signerVault.demoMode || Boolean(status?.demoMode && !runtimeSignerKeys);
  const destIsEvm = isEvmChain(dest);
  const activeRecipient = destIsEvm ? recipientEvm.trim() : recipientSolana.trim();

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
    const p = loadPreferences();
    setSettings(p.defaultSettings);
    setDest(p.defaultDestChain);
    setSignerVault(loadSignerVault());
    setRpcConfig(loadRpcConfig());
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    saveSignerVault(signerVault);
  }, [clientReady, signerVault]);

  useEffect(() => {
    if (!clientReady) return;
    saveRpcConfig(rpcConfig);
  }, [clientReady, rpcConfig]);

  // persist preferences as user changes them
  useEffect(() => {
    savePreferences({ defaultDestChain: dest, defaultSettings: settings });
  }, [dest, settings]);

  // track furthest step reached so header lets user jump back freely
  useEffect(() => {
    if (step > maxStep) setMaxStep(step);
  }, [step, maxStep]);

  // reset furthest step when user re-scans (returns to step 1 with new state)
  useEffect(() => {
    if (!inv) {
      setStep(1);
      setMaxStep(1);
    }
  }, [inv]);

  useEffect(() => {
    if (!inv) return;
    if (isEvmChain(dest) && !recipientEvm && inv.wallets.evm[0]) {
      setRecipientEvm(inv.wallets.evm[0]);
    }
    if (!isEvmChain(dest) && !recipientSolana && inv.wallets.solana[0]) {
      setRecipientSolana(inv.wallets.solana[0]);
    }
  }, [dest, inv, recipientEvm, recipientSolana]);

  function sweepAgain() {
    setInv(null);
    setPlan(null);
    setProgress([]);
    setSelected(new Set());
    setSweepStartedAt(null);
    setCelebrated(false);
    setStep(1);
    setMaxStep(1);
    setErr(null);
  }

  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    const finalEvent = progress.find((e) => e.kind === "final");
    const completed =
      progress.some((e) => e.kind === "sweep_complete") &&
      finalEvent?.result;

    if (completed && !celebrated && finalEvent?.result) {
      setCelebrated(true);
      if (finalEvent.result.status === "success") celebrate();
      // persist to history
      const tokenSymbols = inv
        ? inv.chains.flatMap((c) =>
            c.tokens
              .filter((t) => selected.has(tokenKey(t)))
              .map((t) => t.symbol)
          )
        : [];
      const entry = buildEntryFromResult(
        finalEvent.result,
        dest,
        sweepStartedAt ?? Date.now(),
        tokenSymbols,
        effectiveDemoMode
      );
      saveHistoryEntry(entry);
    }
    if (progress.length === 0 && celebrated) setCelebrated(false);
  }, [
    progress,
    celebrated,
    dest,
    inv,
    selected,
    effectiveDemoMode,
    sweepStartedAt,
  ]);

  const allKeys = useMemo(
    () =>
      inv?.chains.flatMap((c) =>
        c.tokens
          .filter((t) =>
            isSelectable(t, dest, {
              aggregationMode,
              recipient: activeRecipient,
            })
          )
          .map((t) => tokenKey(t))
      ) ?? [],
    [activeRecipient, aggregationMode, dest, inv]
  );

  useEffect(() => {
    if (!inv) return;
    const allowed = new Set(allKeys);
    setSelected((prev) => {
      const next = new Set([...prev].filter((key) => allowed.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [allKeys, inv]);
  const selectedValue = useMemo(() => {
    if (!inv) return 0;
    let sum = 0;
    for (const c of inv.chains) {
      for (const t of c.tokens) {
        if (selected.has(tokenKey(t))) sum += t.usdValue;
      }
    }
    return sum;
  }, [inv, selected]);
  const selectedFamilies = useMemo(() => {
    const families = { evm: false, solana: false };
    if (!inv) return families;
    for (const c of inv.chains) {
      for (const t of c.tokens) {
        if (!selected.has(tokenKey(t))) continue;
        if (t.chain === "solana") families.solana = true;
        else families.evm = true;
      }
    }
    return families;
  }, [inv, selected]);
  const selectedNeedsBridge = useMemo(() => {
    if (!inv) return false;
    for (const c of inv.chains) {
      for (const t of c.tokens) {
        if (selected.has(tokenKey(t)) && t.chain !== dest) return true;
      }
    }
    return false;
  }, [dest, inv, selected]);
  const destinationPayerChoices = destIsEvm
    ? inv?.wallets.evm ?? []
    : inv?.wallets.solana ?? [];
  const activeDestinationPayer = destIsEvm
    ? destinationPayerEvm.trim()
    : destinationPayerSolana.trim();
  const destinationPayerReady =
    !selectedNeedsBridge ||
    (destIsEvm
      ? EVM_ADDR_RE.test(activeDestinationPayer) &&
        hasAddress(destinationPayerChoices, activeDestinationPayer)
      : SOL_ADDR_RE.test(activeDestinationPayer) &&
        hasAddress(destinationPayerChoices, activeDestinationPayer));
  const canUsePerWallet = destIsEvm
    ? !selectedFamilies.solana
    : !selectedFamilies.evm;
  const recipientReady =
    aggregationMode === "per-wallet"
      ? canUsePerWallet
      : destIsEvm
        ? EVM_ADDR_RE.test(activeRecipient)
        : SOL_ADDR_RE.test(activeRecipient);
  const currentStep = step;
  useEffect(() => {
    if (!inv) return;
    if (destIsEvm) {
      const first = inv.wallets.evm[0] ?? "";
      if (first && !hasAddress(inv.wallets.evm, destinationPayerEvm)) {
        setDestinationPayerEvm(first);
      }
    } else {
      const first = inv.wallets.solana[0] ?? "";
      if (first && !hasAddress(inv.wallets.solana, destinationPayerSolana)) {
        setDestinationPayerSolana(first);
      }
    }
  }, [destIsEvm, destinationPayerEvm, destinationPayerSolana, inv]);

  useEffect(() => {
    if (!canUsePerWallet && aggregationMode === "per-wallet") {
      setAggregationMode("unified");
    }
  }, [aggregationMode, canUsePerWallet]);

  function resetRunState() {
    setInv(null);
    setPlan(null);
    setSelected(new Set());
    setProgress([]);
    setErr(null);
    setStep(1);
    setMaxStep(1);
  }

  function updateSettings(next: SweepSettings) {
    setSettings(next);
    if (inv) resetRunState();
  }

  function updateSignerVault(next: LocalSignerVault) {
    setSignerVault(next);
    if (inv || plan || progress.length > 0) resetRunState();
  }

  function openSettingsKeys() {
    setActiveTab("settings");
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  useEffect(() => {
    setPlan(null);
    setProgress([]);
    setCelebrated(false);
    setSweepStartedAt(null);
    setStep((current) => (current > 2 ? 2 : current));
    setMaxStep((current) => (current > 2 ? 2 : current));
  }, [
    aggregationMode,
    dest,
    recipientEvm,
    recipientSolana,
    destinationPayerEvm,
    destinationPayerSolana,
    selected,
  ]);

  async function scan() {
    setErr(null);
    setBusy("scanning");
    setInv(null);
    setPlan(null);
    setProgress([]);
    setSelected(new Set());
    try {
      const r = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings,
          signerKeys: runtimeSignerKeys,
          rpcConfig,
          demoMode: effectiveDemoMode,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "scan failed");
      setInv(json);
      // preselect all found tokens
      const nextRecipientEvm = recipientEvm.trim() || json.wallets?.evm?.[0] || "";
      const nextRecipientSolana =
        recipientSolana.trim() || json.wallets?.solana?.[0] || "";
      const nextRecipient = isEvmChain(dest)
        ? nextRecipientEvm
        : nextRecipientSolana;
      const preset = new Set<string>();
      for (const c of json.chains) {
        for (const t of c.tokens) {
          if (
            isSelectable(t, dest, {
              aggregationMode,
              recipient: nextRecipient,
            })
          ) {
            preset.add(tokenKey(t));
          }
        }
      }
      setSelected(preset);
      if (nextRecipientEvm) setRecipientEvm(nextRecipientEvm);
      if (nextRecipientSolana) setRecipientSolana(nextRecipientSolana);
      if (json.wallets?.evm?.[0]) setDestinationPayerEvm(json.wallets.evm[0]);
      if (json.wallets?.solana?.[0])
        setDestinationPayerSolana(json.wallets.solana[0]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("idle");
    }
  }

  async function buildPlan() {
    if (!inv || selected.size === 0) return false;
    if (!recipientReady) {
      setErr(
        aggregationMode === "per-wallet"
          ? t("Per-wallet mode needs source and destination addresses in the same wallet family.")
          : t("Enter a valid {family} recipient for {dest}.", {
              family: destIsEvm ? "EVM" : "Solana",
              dest,
            })
      );
      return false;
    }
    if (!destinationPayerReady) {
      setErr(
        t("Choose a scanned {family} signer to pay the destination CCTP mint.", {
          family: destIsEvm ? "EVM" : "Solana",
        })
      );
      return false;
    }
    setErr(null);
    setBusy("planning");
    try {
      // filter inventory by selection
      const filtered: DustInventory = {
        ...inv,
        chains: inv.chains.map((c) => ({
          ...c,
          tokens: c.tokens.filter((t) =>
            selected.has(tokenKey(t))
          ),
          subtotalUSD: c.tokens
            .filter((t) => selected.has(tokenKey(t)))
            .reduce((s, t) => s + t.usdValue, 0),
        })),
      };
      filtered.grandTotalUSD = filtered.chains.reduce(
        (s, c) => s + c.subtotalUSD,
        0
      );
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory: filtered,
          destChain: dest,
          aggregationMode,
          recipientEvm,
          recipientSolana,
          destinationPayerEvm,
          destinationPayerSolana,
          requireDestinationPayer: true,
          signerKeys: runtimeSignerKeys,
          rpcConfig,
          demoMode: effectiveDemoMode,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "plan failed");
      setPlan(json);
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    } finally {
      setBusy("idle");
    }
  }

  async function execute() {
    if (!plan) {
      await buildPlan();
      return;
    }
    setErr(null);
    setBusy("executing");
    setProgress([]);
    setCelebrated(false);
    setSweepStartedAt(Date.now());
    try {
      const r = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          signerKeys: runtimeSignerKeys,
          rpcConfig,
          demoMode: effectiveDemoMode,
        }),
      });
      if (!r.body) throw new Error("no stream");
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const chunk of parts) {
          if (chunk.startsWith("data: ")) {
            try {
              const e = JSON.parse(chunk.slice(6));
              setProgress((p) => [...p, e]);
            } catch {}
          }
        }
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("idle");
    }
  }

  // Derived: are we in the post-sweep "done" state?
  const finalEvent = progress.find((e) => e.kind === "final");
  const finalResult = finalEvent?.result as SweepResult | undefined;
  const isDone = !!finalResult && finalResult.status === "success";
  const scannedWalletCount = inv
    ? inv.wallets.evm.length + inv.wallets.solana.length
    : 0;
  const navWalletStatus: WalletStatus = effectiveDemoMode
    ? { label: t("Demo mode"), tone: "demo" }
    : inv
      ? {
          label: t(
            scannedWalletCount === 1 ? "{count} wallet" : "{count} wallets",
            { count: scannedWalletCount }
          ),
          tone: scannedWalletCount > 0 ? "live" : "idle",
        }
      : localSignerCount > 0
        ? {
            label: t(
              localSignerCount === 1 ? "{count} local key" : "{count} local keys",
              { count: localSignerCount }
            ),
            tone: "live",
          }
        : status?.hasEvmKey || status?.hasSolanaKey
          ? { label: t("Live env keys"), tone: "live" }
          : { label: t("No local keys"), tone: "idle" };

  return (
    <>
      <TopNav
        activeChain={dest}
        onChain={setDest}
        walletStatus={navWalletStatus}
        activeTab={activeTab}
        onTab={setActiveTab}
      />
      {activeTab === "sweep" && step === 1 && <Hero />}
      {activeTab === "sweep" && (
        <DemoBanner
          vault={signerVault}
          effectiveDemoMode={effectiveDemoMode}
          localSignerCount={localSignerCount}
          status={status}
          onVault={updateSignerVault}
          onManageKeys={openSettingsKeys}
        />
      )}
      {activeTab === "sweep" && (
        <WizardSteps
          current={currentStep}
          maxReached={maxStep}
          onJump={(s) => setStep(s)}
        />
      )}

      {activeTab === "history" && (
        <div className="mx-auto mt-8 max-w-[1540px] px-6">
          <h2 className="text-xl font-semibold mb-4">{t("Sweep history")}</h2>
          <HistoryView />
        </div>
      )}

      {activeTab === "settings" && (
        <div className="mx-auto mt-8 max-w-[1120px] px-6">
          <h2 className="text-xl font-semibold mb-4">{t("Settings")}</h2>
          <SettingsView
            status={status}
            settings={settings}
            onSettings={updateSettings}
            defaultDest={dest}
            onDefaultDest={setDest}
            localEvmKeyCount={signerVault.evm.length}
            localSolanaKeyCount={signerVault.solana.length}
            signerVault={signerVault}
            onSignerVault={updateSignerVault}
            rpcConfig={rpcConfig}
            onRpcConfig={setRpcConfig}
          />
        </div>
      )}


      {err && (
        <div className="mx-auto mb-4 max-w-[1540px] rounded-[18px] border border-red-400/30 bg-black/62 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {activeTab === "sweep" && (
      <main className="mx-auto grid max-w-[1540px] grid-cols-[minmax(0,1fr)] gap-6 px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-6 min-w-0">
          {/* STEP 1 — Select tokens */}
          {step === 1 && (
            <StepShell
              title={t("Select dust tokens")}
              subtitle={
                (settings.sweepScope ?? "dust") === "all"
                  ? t("Pick any eligible priced token to consolidate. Default scan covers all supported chains.")
                  : t("Pick low-value tokens to consolidate. Default scan covers all supported chains.")
              }
              right={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => setShowSettings((v) => !v)}
                    className={`x-focus rounded-full border px-4 py-2 text-xs font-medium transition ${
                      showSettings
                        ? "border-[var(--green)] bg-[var(--hot)] text-[var(--green)]"
                        : "border-[var(--border-strong)] bg-black/36 text-[var(--t3)] hover:text-[var(--t1)]"
                    }`}
                  >
                    {t("Settings")}
                  </button>
                  {inv && (
                    <ScanButton
                      busy={busy}
                      hasInventory
                      demoMode={effectiveDemoMode}
                      onClick={scan}
                    />
                  )}
                </div>
              }
            >
              {showSettings && (
                <div className="mb-4">
                  <SettingsPanel
                    settings={settings}
                    onChange={updateSettings}
                  />
                </div>
              )}
              {!inv ? (
                <>
                  <EmptyScanState />
                  <div className="mt-2 flex justify-center">
                    <ScanButton
                      busy={busy}
                      hasInventory={false}
                      demoMode={effectiveDemoMode}
                      onClick={scan}
                    />
                  </div>
                </>
              ) : (
                <TokenTable
                  inventory={inv}
                  destinationChain={dest}
                  aggregationMode={aggregationMode}
                  recipient={activeRecipient}
                  selected={selected}
                  onToggle={(k) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(k) ? next.delete(k) : next.add(k);
                      return next;
                    })
                  }
                  onSelectAll={(keys) => setSelected(new Set(keys))}
                />
              )}
              {inv && allKeys.length > 0 && (
                <div className="mt-3 flex justify-between text-xs text-[var(--muted)]">
                  <span>
                    {t("{count} eligible tokens across supported chains", {
                      count: allKeys.length,
                    })}
                  </span>
                  <span>
                    {t("{count} selected", { count: selected.size })} ·{" "}
                    <strong className="text-[var(--text)]">
                      ${selectedValue.toFixed(2)}
                    </strong>
                  </span>
                </div>
              )}
              {inv && selected.size > 0 && (
                <StepNav
                  onNext={() => setStep(2)}
                  nextLabel={t("Continue · review swap")}
                />
              )}
            </StepShell>
          )}

          {/* STEP 2 — Swap preview */}
          {step === 2 && (
            <StepShell
              title={t("Destination & swap route")}
              subtitle={t("Confirm where USDC lands, then preview the OKX DEX conversion before CCTP.")}
            >
              <RecipientPanel
                inventory={inv}
                dest={dest}
                onDest={setDest}
                aggregationMode={aggregationMode}
                onAggregationMode={setAggregationMode}
                recipientEvm={recipientEvm}
                onRecipientEvm={setRecipientEvm}
                recipientSolana={recipientSolana}
                onRecipientSolana={setRecipientSolana}
                canUsePerWallet={canUsePerWallet}
                recipientReady={recipientReady}
                needsDestinationPayer={selectedNeedsBridge}
                destinationPayer={activeDestinationPayer}
                destinationPayerChoices={destinationPayerChoices}
                destinationPayerReady={destinationPayerReady}
                onDestinationPayer={
                  destIsEvm ? setDestinationPayerEvm : setDestinationPayerSolana
                }
                onManageKeys={openSettingsKeys}
              />
              <SwapPreview
                selectedValue={selectedValue}
                plan={plan}
              />
              <StepNav
                onBack={() => setStep(1)}
                onNext={async () => {
                  const ok = plan ? true : await buildPlan();
                  if (ok) setStep(3);
                }}
                nextLabel={
                  busy === "planning" ? t("Building plan…") : t("Continue · review bridge")
                }
                nextDisabled={
                  busy !== "idle" ||
                  selected.size === 0 ||
                  !recipientReady ||
                  !destinationPayerReady
                }
              />
            </StepShell>
          )}

          {/* STEP 3 — Bridge preview */}
          {step === 3 && (
            <StepShell
              title={t("Bridge USDC via CCTP")}
              subtitle={t("Native burn-and-mint via Circle CCTP V2 - no wrapped assets, no third-party custodian.")}
            >
              <BridgePreview plan={plan} dest={dest} />
              <StepNav
                onBack={() => setStep(2)}
                onNext={() => setStep(4)}
                nextLabel={t("Continue · final review")}
                nextDisabled={!plan}
              />
            </StepShell>
          )}

          {/* STEP 4 — Review & Sweep, OR Done */}
          {step === 4 && (() => {
            const finalEvent = progress.find((e) => e.kind === "final");
            const finalResult = finalEvent?.result as SweepResult | undefined;
            const isDone =
              !!finalResult && finalResult.status === "success";

            if (isDone) {
              return (
                <StepShell
                  title={t("Done")}
                  subtitle={t("USDC delivered. Pick what to do next.")}
                >
                  <DoneState
                    result={finalResult}
                    destChain={dest}
                    onSweepAgain={sweepAgain}
                  />
                </StepShell>
              );
            }

            return (
              <StepShell
                title={
                  finalResult?.status === "partial"
                    ? t("Partial delivery")
                    : finalResult?.status === "failed"
                      ? t("Run failed")
                      : t("Review & Sweep")
                }
                subtitle={
                  finalResult
                    ? t("Received USDC is kept. Review only the routes or steps that still need attention.")
                    : t("Check the numbers and execute. Different wallets/chains run in parallel; transactions for the same wallet on the same chain run in order.")
                }
              >
                <RunReviewPanel
                  plan={plan}
                  result={finalResult}
                  busy={busy}
                  selectedValue={selectedValue}
                  dest={dest}
                  canExecute={
                    busy === "idle" &&
                    selected.size > 0 &&
                    inv !== null &&
                    Boolean(plan) &&
                    (plan?.totalReceiveUSDC ?? 0) > 0
                  }
                  onExecute={execute}
                />
                {plan && (
                  <PhaseTracker
                    plan={plan}
                    events={progress}
                    result={finalResult}
                  />
                )}
                {progress.length > 0 && (
                  <div className="mt-4">
                    <ProgressView events={progress} />
                  </div>
                )}
                <StepNav onBack={() => setStep(3)} hideNext />
              </StepShell>
            );
          })()}
        </section>

        <aside>
          <SummaryPanel
            inventory={inv}
            plan={plan}
            destChain={dest}
            selectedCount={selected.size}
            selectedValue={selectedValue}
            isDone={isDone}
            receivedUSDC={
              isDone ? finalResult?.totalReceivedUSDC : undefined
            }
            runResult={finalResult}
            demoMode={effectiveDemoMode}
          />
        </aside>
      </main>
      )}

      {activeTab === "sweep" && step === 1 && !inv && <FeatureCards />}
      <Footer />
    </>
  );
}

function RunReviewPanel({
  plan,
  result,
  busy,
  selectedValue,
  dest,
  canExecute,
  onExecute,
}: {
  plan: SweepPlan | null;
  result?: SweepResult;
  busy: BusyState;
  selectedValue: number;
  dest: Chain;
  canExecute: boolean;
  onExecute: () => void;
}) {
  const { t } = useI18n();
  const deliveredRoutes =
    result?.perChain.filter((c) => c.status === "success" || (c.receivedUSDC ?? 0) > 0) ?? [];
  const issues =
    result?.perChain.filter((c) => c.status !== "success" || Boolean(c.error)) ?? [];
  const partialDelivered = deliveredRoutes.filter((c) => c.status !== "success").length;
  const expectedReceive = plan?.totalReceiveUSDC ?? selectedValue * 0.99;
  const delivered = result?.totalReceivedUSDC ?? 0;
  const resultTone =
    result?.status === "failed"
      ? "border-red-400/30 bg-red-500/10"
      : result?.status === "partial"
        ? "border-[rgba(188,255,47,0.28)] bg-[rgba(188,255,47,0.08)]"
        : "border-[var(--border)] bg-black/34";
  const headline = result
    ? result.status === "partial"
      ? t("Partially complete")
      : t("No delivery confirmed")
    : t("Ready to sweep");
  const detail = result
    ? result.status === "partial"
      ? t("Received USDC is final. A route can still need attention if a later step or another token failed.")
      : t("No route delivered USDC. Fix the blocking issues, then retry.")
    : t("Routes execute independently. Same wallet on the same chain is sent in order to avoid nonce collisions.");

  return (
    <div className={`mb-6 rounded-[20px] border p-4 ${resultTone}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-[var(--t1)]">
            {headline}
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--t3)]">
            {detail}
          </div>
        </div>
        {result && (
          <span
            className={`w-fit rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
              result.status === "partial"
                ? "border-[rgba(188,255,47,0.32)] text-[var(--green)]"
                : "border-red-400/40 text-red-300"
            }`}
          >
            {result.status}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <RunStat
          label={result ? t("Delivered") : t("Expected receive")}
          value={`$${(result ? delivered : expectedReceive).toFixed(2)}`}
          tone={result?.status === "failed" ? "muted" : "ok"}
          sub={
            result
              ? `${t(
                  deliveredRoutes.length === 1
                    ? "{count} route with received USDC"
                    : "{count} routes with received USDC",
                  { count: deliveredRoutes.length }
                )}${
                  partialDelivered > 0
                    ? ` · ${t("{count} partial", { count: partialDelivered })}`
                    : ""
                }`
              : t(
                  (plan?.perChain.length ?? 0) === 1
                    ? "{count} prepared route"
                    : "{count} prepared routes",
                  { count: plan?.perChain.length ?? 0 }
                )
          }
        />
        <RunStat
          label={result ? t("Needs attention") : t("Destination")}
          value={result ? String(issues.length) : dest}
          tone={result && issues.length > 0 ? "bad" : "muted"}
          sub={
            result
              ? t("failed / skipped / partial routes")
              : t("native USDC landing chain")
          }
        />
        <RunStat
          label={result ? t("Expected before run") : t("Execution")}
          value={result ? `$${expectedReceive.toFixed(2)}` : t("ordered")}
          tone="muted"
          sub={
            result
              ? t("planned receive estimate")
              : t("same wallet + chain is serialized")
          }
        />
      </div>

      {result ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <RouteResultList
            title={t("Received USDC")}
            tone="ok"
            empty={t("No USDC delivery confirmed.")}
            routes={deliveredRoutes}
          />
          <RouteResultList
            title={t("Needs attention")}
            tone="bad"
            empty={t("No failed routes.")}
            routes={issues}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-[16px] border border-[var(--border)] bg-black/24 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-[var(--t3)]">
            {t("A route can fail without undoing other confirmed deliveries. Review the live timeline below during execution.")}
          </div>
          <button
            onClick={onExecute}
            disabled={!canExecute}
            className="x-focus w-full rounded-full bg-[var(--green)] px-8 py-3 font-semibold text-black shadow-[0_18px_60px_rgba(188,255,47,.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {busy === "executing" ? t("Sweeping…") : t("Sweep Now")}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onExecute}
            disabled={!canExecute}
            className="x-focus rounded-full border border-[var(--border-strong)] bg-black/36 px-5 py-2 text-sm font-semibold text-[var(--t1)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "executing" ? t("Retrying…") : t("Retry after fixes")}
          </button>
        </div>
      )}
    </div>
  );
}

function RunStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "bad" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "text-[var(--green)]"
      : tone === "bad"
        ? "text-red-300"
        : "text-[var(--t1)]";
  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-black/24 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t4)]">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl font-semibold ${toneClass}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--t3)]">{sub}</div>
    </div>
  );
}

function RouteResultList({
  title,
  tone,
  empty,
  routes,
}: {
  title: string;
  tone: "ok" | "bad";
  empty: string;
  routes: SweepResult["perChain"];
}) {
  const { t } = useI18n();
  const border =
    tone === "ok"
      ? "border-[rgba(188,255,47,0.18)]"
      : "border-red-400/20";
  const titleColor = tone === "ok" ? "text-[var(--green)]" : "text-red-300";
  return (
    <div className={`rounded-[16px] border ${border} bg-black/24 p-3`}>
      <div
        className={`mb-2 font-mono text-[10px] uppercase tracking-[0.14em] ${titleColor}`}
      >
        {title}
      </div>
      {routes.length > 0 ? (
        <div className="space-y-2 text-xs">
          {routes.slice(0, 8).map((route, i) => {
            const issue = route.error
              ? routeIssue(route.error, t)
              : { reason: t(route.status), action: t("No action needed.") };
            return (
              <div
                key={`${route.chain}:${route.owner}:${route.status}:${i}`}
                className="rounded-[12px] border border-white/[0.06] bg-black/24 px-3 py-2"
              >
                <div className="flex justify-between gap-3">
                  <span className="capitalize text-[var(--t1)]">
                    {route.chain}{" "}
                    <span className="normal-case text-[var(--t4)]">
                      {shortAddr(route.owner)}
                    </span>
                  </span>
                  <span
                    className={
                      tone === "ok"
                        ? "font-mono text-[var(--green)]"
                        : "font-mono text-red-300"
                    }
                  >
                    {tone === "ok"
                      ? `$${(route.receivedUSDC ?? 0).toFixed(2)}`
                      : route.status}
                  </span>
                </div>
                {tone === "bad" && (
                  <div className="mt-1 leading-5 text-red-100">
                    {issue.reason}
                    <span className="text-[var(--t4)]"> · {issue.action}</span>
                  </div>
                )}
                {tone === "ok" && route.status !== "success" && (
                  <div className="mt-1 leading-5 text-[var(--t3)]">
                    {t("USDC was received, but this route still has an item under Needs attention.")}
                  </div>
                )}
              </div>
            );
          })}
          {routes.length > 8 && (
            <div className="text-[var(--t4)]">
              {t(
                routes.length - 8 === 1
                  ? "+{count} more route"
                  : "+{count} more routes",
                { count: routes.length - 8 }
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-[var(--t4)]">{empty}</div>
      )}
    </div>
  );
}

function routeIssue(
  error: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): { reason: string; action: string } {
  if (/insufficient funds|exceeds the balance/i.test(error)) {
    return {
      reason: t("Not enough native gas"),
      action: t("Top up the source wallet on this chain, then retry."),
    };
  }
  if (/nonce too low|nonce provided/i.test(error)) {
    return {
      reason: t("Nonce already used"),
      action: t("Wait for pending txs to settle, then retry."),
    };
  }
  if (/swap reverted/i.test(error)) {
    return {
      reason: t("Swap reverted on-chain"),
      action: t("Refresh the plan or retry with fewer volatile tokens."),
    };
  }
  if (/no fresh USDC|no selected USDC/i.test(error)) {
    return {
      reason: t("No new USDC to bridge"),
      action: t("The paired swap did not produce USDC, so this bridge was skipped."),
    };
  }
  if (/skipped/i.test(error)) {
    return {
      reason: t("Skipped after paired step failed"),
      action: t("Fix the earlier token step first."),
    };
  }
  const cleaned = error.replace(/\s+/g, " ").trim();
  const detailsIndex = cleaned.search(/\b(?:Request Arguments:|Details:|Version:)\b/);
  const short = detailsIndex >= 0 ? cleaned.slice(0, detailsIndex).trim() : cleaned;
  return {
    reason: short.length > 96 ? `${short.slice(0, 93)}...` : short,
    action: t("Open the event log below for the raw tx context."),
  };
}

function celebrate() {
  const duration = 2200;
  const end = Date.now() + duration;
  const colors = ["#23d98d", "#2775ca", "#FFD700", "#FF6B6B", "#9D5CFF"];
  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  // single big burst at start
  confetti({
    particleCount: 120,
    spread: 100,
    origin: { x: 0.5, y: 0.4 },
    colors,
    scalar: 1.1,
  });
}

function DemoBanner({
  vault,
  effectiveDemoMode,
  localSignerCount,
  status,
  onVault,
  onManageKeys,
}: {
  vault: LocalSignerVault;
  effectiveDemoMode: boolean;
  localSignerCount: number;
  status: {
    demoMode: boolean;
    hasEvmKey: boolean;
    hasSolanaKey: boolean;
    hasOkxAuth: boolean;
    hasOkxProjectId?: boolean;
  } | null;
  onVault: (next: LocalSignerVault) => void;
  onManageKeys: () => void;
}) {
  const { t } = useI18n();
  const liveReady =
    localSignerCount > 0 ||
    Boolean(status?.hasEvmKey || status?.hasSolanaKey);
  return (
    <div className="mx-auto mt-2 max-w-[1540px] px-6">
      <div className="x-card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor] ${
              effectiveDemoMode
                ? "bg-[var(--green)] text-[var(--green)]"
                : "bg-sky-400 text-sky-400"
            }`}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--t1)]">
              {effectiveDemoMode
                ? t("Demo mode is showing simulated balances.")
                : t("Live mode uses local signers for this run.")}
            </div>
            <div className="mt-1 text-xs leading-5 text-[var(--t3)]">
              {localSignerCount > 0
                ? t(
                    localSignerCount === 1
                      ? "{count} browser key saved locally."
                      : "{count} browser keys saved locally.",
                    { count: localSignerCount }
                  )
                : t("Import EVM or Solana keys here, or keep using the simulated workflow.")}{" "}
              {t("OnchainOS is the primary data source; OKX API is optional fallback.")}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-full border border-[var(--border)] bg-black/48 p-1 text-xs">
            <button
              onClick={() => onVault({ ...vault, demoMode: true })}
              className={`x-focus rounded-full px-3 py-1 transition ${
                effectiveDemoMode ? "bg-[var(--green)] text-black" : "text-[var(--t3)]"
              }`}
            >
              {t("Demo")}
            </button>
            <button
              onClick={() => onVault({ ...vault, demoMode: false })}
              disabled={!liveReady}
              className={`x-focus rounded-full px-3 py-1 transition disabled:opacity-40 ${
                !effectiveDemoMode ? "bg-white text-black" : "text-[var(--t3)]"
              }`}
            >
              {t("Live")}
            </button>
          </div>
          <button
            onClick={onManageKeys}
            className="x-focus whitespace-nowrap rounded-full border border-[var(--border-strong)] bg-black/36 px-3 py-1.5 text-xs text-[var(--t2)] transition hover:text-[var(--t1)]"
          >
            {t("Manage keys")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="x-card overflow-hidden p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-mono text-sm font-medium uppercase tracking-[0.14em] text-[var(--t1)]">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-2 max-w-full break-words text-sm leading-6 text-[var(--t3)] sm:max-w-xl">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ScanButton({
  busy,
  hasInventory,
  demoMode,
  onClick,
}: {
  busy: BusyState;
  hasInventory: boolean;
  demoMode: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      disabled={busy !== "idle"}
      className={`x-focus flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition disabled:opacity-40 ${
        hasInventory
          ? "border-[var(--border-strong)] bg-black/36 text-[var(--t1)] hover:bg-white/[0.04]"
          : "border-[var(--green)] bg-[var(--green)] text-black hover:brightness-110"
      }`}
    >
      {busy === "scanning" ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {t("Scanning…")}
        </>
      ) : hasInventory ? (
        <>{demoMode ? t("Re-scan demo") : t("Re-scan live")}</>
      ) : (
        <>{demoMode ? t("Scan demo balances") : t("Scan live balances")}</>
      )}
    </button>
  );
}

function EmptyScanState() {
  const { t } = useI18n();
  const items = [
    ["01", t("Scan configured wallets"), t("Reads EVM and Solana balances from local signer addresses.")],
    ["02", t("Select by owner"), t("Every token row includes the wallet owner to avoid multi-address mistakes.")],
    ["03", t("Continue to route"), t("Set recipient mode, preview OKX swaps, then CCTP mint on destination.")],
  ];
  return (
    <div className="grid gap-3 py-3 md:grid-cols-3">
      {items.map(([n, title, body]) => (
        <div
          key={n}
          className="rounded-[18px] border border-[var(--border)] bg-black/34 p-4"
        >
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
            {n}
          </div>
          <div className="text-sm font-semibold text-[var(--t1)]">{title}</div>
          <div className="mt-2 text-xs leading-5 text-[var(--t3)]">{body}</div>
        </div>
      ))}
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  hideNext,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideNext?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between mt-8 pt-5 border-t border-[var(--border)]">
      {onBack ? (
        <button
          onClick={onBack}
          className="x-focus rounded-full border border-[var(--border)] bg-black/34 px-4 py-2 text-sm text-[var(--t3)] transition hover:text-[var(--t1)]"
        >
          {t("Back")}
        </button>
      ) : (
        <div />
      )}
      {!hideNext && onNext && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="x-focus rounded-full bg-[var(--green)] px-5 py-2 font-medium text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel ?? t("Continue")}
        </button>
      )}
    </div>
  );
}

function RecipientPanel({
  inventory,
  dest,
  onDest,
  aggregationMode,
  onAggregationMode,
  recipientEvm,
  onRecipientEvm,
  recipientSolana,
  onRecipientSolana,
  canUsePerWallet,
  recipientReady,
  needsDestinationPayer,
  destinationPayer,
  destinationPayerChoices,
  destinationPayerReady,
  onDestinationPayer,
  onManageKeys,
}: {
  inventory: DustInventory | null;
  dest: Chain;
  onDest: (c: Chain) => void;
  aggregationMode: AggregationMode;
  onAggregationMode: (m: AggregationMode) => void;
  recipientEvm: string;
  onRecipientEvm: (v: string) => void;
  recipientSolana: string;
  onRecipientSolana: (v: string) => void;
  canUsePerWallet: boolean;
  recipientReady: boolean;
  needsDestinationPayer: boolean;
  destinationPayer: string;
  destinationPayerChoices: string[];
  destinationPayerReady: boolean;
  onDestinationPayer: (v: string) => void;
  onManageKeys: () => void;
}) {
  const { t } = useI18n();
  const destIsEvm = isEvmChain(dest);
  const walletChoices = destIsEvm
    ? inventory?.wallets.evm ?? []
    : inventory?.wallets.solana ?? [];
  const activeRecipient = destIsEvm ? recipientEvm : recipientSolana;
  const setActiveRecipient = destIsEvm ? onRecipientEvm : onRecipientSolana;

  return (
    <div className="mb-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr_1fr]">
      <div className="rounded-[20px] border border-[var(--border)] bg-black/38 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
              {t("Step 2A")}
            </div>
            <div className="mt-1 text-sm font-semibold">{t("Destination chain")}</div>
          </div>
          <div className="rounded-full border border-[var(--border)] bg-black/42 px-2.5 py-1 font-mono text-[10px] uppercase text-[var(--t4)]">
            {t("output USDC")}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEST_CHOICES_ALL.map((c) => (
            <button
              key={c}
              onClick={() => onDest(c)}
              className={`x-focus rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                dest === c
                  ? "border-[var(--green)] bg-[var(--green)] text-black"
                  : "border-[var(--border-strong)] bg-black/30 text-[var(--t3)] hover:text-[var(--t1)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[20px] border border-[var(--border)] bg-black/38 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
              {t("Step 2B")}
            </div>
            <div className="mt-1 text-sm font-semibold">
              {t("Recipient and aggregation")}
            </div>
            <div className="mt-1 text-xs text-[var(--t4)]">
              {destIsEvm ? t("EVM address") : t("Solana owner address")} {t("for minted USDC")}
            </div>
          </div>
          <div className="flex rounded-full border border-[var(--border)] bg-black/48 p-1 text-xs">
            <button
              onClick={() => canUsePerWallet && onAggregationMode("per-wallet")}
              disabled={!canUsePerWallet}
              className={`x-focus rounded-full px-3 py-1 transition disabled:opacity-40 ${
                aggregationMode === "per-wallet"
                  ? "bg-white text-black"
                  : "text-[var(--t3)]"
              }`}
            >
              {t("Per wallet")}
            </button>
            <button
              onClick={() => onAggregationMode("unified")}
              className={`x-focus rounded-full px-3 py-1 transition ${
                aggregationMode === "unified"
                  ? "bg-white text-black"
                  : "text-[var(--t3)]"
              }`}
            >
              {t("One recipient")}
            </button>
          </div>
        </div>

        {aggregationMode === "unified" ? (
          <>
            <input
              value={activeRecipient}
              onChange={(e) => setActiveRecipient(e.target.value.trim())}
              placeholder={destIsEvm ? "0x…" : t("Solana address…")}
              className={`mt-3 w-full px-3 py-2.5 font-mono text-xs transition x-input ${
                activeRecipient && !recipientReady
                  ? "border-red-400/60"
                  : ""
              }`}
            />
            {walletChoices.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {walletChoices.map((w) => (
                  <button
                    key={w}
                    onClick={() => setActiveRecipient(w)}
                    className="x-focus rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-[var(--t3)] hover:text-[var(--t1)]"
                  >
                    {t("Import {address}", { address: shortAddr(w) })}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-3 rounded-[14px] border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--t3)]">
            {t("Each source wallet receives USDC on the same address family. Switch to one recipient for EVM ↔ Solana mixed sweeps.")}
          </div>
        )}
      </div>

      <div
        className={`rounded-[20px] border p-4 ${
          needsDestinationPayer && !destinationPayerReady
            ? "border-red-400/35 bg-red-400/10"
            : "border-[var(--border)] bg-black/38"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
              {t("Step 2C")}
            </div>
            <div className="mt-1 text-sm font-semibold">{t("Destination payer")}</div>
            <div className="mt-1 text-xs text-[var(--t4)]">
              {t("Pays the CCTP receive/mint tx on {dest}.", { dest })}
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase ${
              needsDestinationPayer
                ? destinationPayerReady
                  ? "border-[rgba(188,255,47,0.34)] bg-[var(--hot)] text-[var(--green)]"
                  : "border-red-400/40 bg-red-400/10 text-red-200"
                : "border-[var(--border)] bg-black/36 text-[var(--t4)]"
            }`}
          >
            {needsDestinationPayer
              ? destinationPayerReady
                ? t("ready")
                : t("needed")
              : t("not needed")}
          </span>
        </div>

        {needsDestinationPayer ? (
          destinationPayerChoices.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {destinationPayerChoices.map((w) => {
                const active = w.toLowerCase() === destinationPayer.toLowerCase();
                return (
                  <button
                    key={w}
                    onClick={() => onDestinationPayer(w)}
                    className={`x-focus flex items-center justify-between rounded-[14px] border px-3 py-2 text-left text-xs transition ${
                      active
                        ? "border-[var(--green)] bg-[var(--hot)] text-[var(--t1)]"
                        : "border-[var(--border)] bg-white/[0.03] text-[var(--t3)] hover:text-[var(--t1)]"
                    }`}
                  >
                    <span className="font-mono">{shortAddr(w)}</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--t4)]">
                      {t("{family} signer", { family: destIsEvm ? "EVM" : "Solana" })}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-[14px] border border-red-400/30 bg-black/28 p-3">
              <div className="text-xs text-red-100">
                {t("Import a {family} private key so the destination mint can be submitted after burn.", {
                  family: destIsEvm ? "EVM" : "Solana",
                })}
              </div>
              <button
                onClick={onManageKeys}
                className="x-focus mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black"
              >
                {t("Manage keys")}
              </button>
            </div>
          )
        ) : (
          <div className="mt-3 rounded-[14px] border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--t3)]">
            {t("All selected dust is already on the destination chain, so no CCTP receive payer is needed.")}
          </div>
        )}
      </div>
    </div>
  );
}

function SwapPreview({
  selectedValue,
  plan,
}: {
  selectedValue: number;
  plan: SweepPlan | null;
}) {
  const { t } = useI18n();
  const afterSwap = plan?.totalSwapOutputUSDC ?? selectedValue * 0.99;
  const routeImpact = Math.max(0, selectedValue - afterSwap);
  const source =
    plan?.quoteSource === "okx"
      ? t("OKX quoted route")
      : plan?.quoteSource === "demo"
        ? t("simulated route")
        : plan?.quoteSource === "direct"
          ? t("native USDC, no swap")
        : plan?.quoteSource === "mixed"
          ? t("mixed quote sources")
          : t("pre-plan estimate");
  const isDirectOnly = plan?.quoteSource === "direct";
  return (
    <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-[18px] border border-[var(--border)] bg-black/34 p-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
          {t("Input dust")}
        </div>
        <div className="text-2xl font-mono font-semibold">
          ${selectedValue.toFixed(2)}
        </div>
        <div className="mt-1 text-xs text-[var(--t4)]">
          {t("mixed across selected chains")}
        </div>
      </div>
      <div className="flex flex-col items-center text-[var(--t3)]">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--green)] shadow-[0_0_16px_rgba(188,255,47,.9)]" />
        <span className="mt-2 font-mono text-[10px] uppercase tracking-wider">
          {isDirectOnly ? t("No swap") : "OKX DEX"}
        </span>
      </div>
      <div className="rounded-[18px] border border-[var(--green)] bg-[var(--hot)] p-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
          {t("Output USDC")}
        </div>
        <div className="text-2xl font-mono font-semibold text-[var(--green)]">
          ${afterSwap.toFixed(2)}
        </div>
        <div className="mt-1 text-xs text-[var(--t4)]">
          {t("{source} · ${impact} impact/reserve", {
            source,
            impact: routeImpact.toFixed(2),
          })}
        </div>
      </div>
    </div>
  );
}

function BridgePreview({
  plan,
  dest,
}: {
  plan: SweepPlan | null;
  dest: Chain;
}) {
  const { t } = useI18n();
  if (!plan) {
    return (
      <div className="rounded-[18px] border border-[var(--border)] bg-black/34 p-4 text-xs text-[var(--t3)]">
        {t("Build the plan first to see which chains burn USDC and which one mints it.")}
      </div>
    );
  }
  const bridging = plan.perChain.filter(
    (cp) => !cp.willAccumulate && cp.chain !== dest
  );
  const sameChains = plan.perChain.filter((cp) => cp.chain === dest);
  const accumulating = plan.perChain.filter((cp) => cp.willAccumulate);
  const bridgedTotal = bridging.reduce(
    (sum, cp) => sum + cp.estimatedReceiveUSDC,
    0
  );
  const sameChainTotal = sameChains.reduce(
    (sum, cp) => sum + cp.estimatedReceiveUSDC,
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[var(--border)] bg-black/34 p-4 text-sm text-[var(--t2)]">
        {bridging.length === 0 && sameChains.length === 0
          ? t("Nothing to bridge to {dest} from selected dust.", { dest })
          : t(
              bridging.length === 1
                ? "{count} source crossing CCTP → {dest}{same}"
                : "{count} sources crossing CCTP → {dest}{same}",
              {
                count: bridging.length,
                dest,
                same: sameChains.length
                  ? t(" · {count} already on {dest}", {
                      count: sameChains.length,
                      dest,
                    })
                  : "",
              }
            )}
      </div>

      {bridging.length > 0 && (
        <div className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-black/36 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
              {t("CCTP source chains")}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {bridging.map((cp) => (
                <div
                  key={`${cp.owner}:${cp.chain}`}
                  className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-black/42 px-3 py-2.5 text-xs"
                >
                  <span className="min-w-0">
                    <span className="capitalize text-[var(--t1)]">
                      {cp.chain}
                    </span>
                    <span className="ml-2 rounded-full border border-[rgba(188,255,47,0.22)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--green)]">
                      {cp.routeKind === "cctp_only" ? t("CCTP only") : t("swap + CCTP")}
                    </span>
                  </span>
                  <span className="font-mono text-[var(--t3)]">
                    ${cp.estimatedReceiveUSDC.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[20px] border border-[var(--green)] bg-[var(--hot)] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--t4)]">
              {t("Destination")}
            </div>
            <div className="mt-2 text-2xl font-semibold capitalize text-[var(--t1)]">
              {dest}
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-[rgba(188,255,47,0.22)] pt-3">
              <span className="text-xs text-[var(--t3)]">{t("bridged USDC")}</span>
              <span className="font-mono text-lg text-[var(--green)]">
                ${bridgedTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {sameChains.length > 0 && (
        <div className="flex items-center gap-3 rounded-[18px] border border-[var(--green)] bg-[var(--hot)] p-3 text-xs">
          <span className="rounded-full bg-[var(--green)] px-2 py-0.5 font-mono text-[10px] text-black">
            {t("no bridge")}
          </span>
          <div>
            <div className="text-[var(--t1)]">
              {t("{dest} source balances settle on the destination without CCTP.", {
                dest,
              })}
            </div>
            <div className="mt-0.5 text-[var(--t3)]">
              {t("Estimated {amount} USDC from same-chain swaps or native USDC direct transfer.", {
                amount: `$${sameChainTotal.toFixed(2)}`,
              })}
            </div>
          </div>
        </div>
      )}

      {accumulating.length > 0 && (
        <div className="rounded-[18px] border border-[rgba(250,77,255,0.3)] bg-[rgba(250,77,255,0.06)] p-3 text-xs">
          <div className="text-[var(--pink)]">
            {t(
              accumulating.length === 1
                ? "{count} chain skipped:"
                : "{count} chains skipped:",
              { count: accumulating.length }
            )}
          </div>
          {accumulating.map((cp) => (
            <div key={`${cp.owner}:${cp.chain}`} className="mt-0.5 text-[var(--t3)]">
              <span className="capitalize">{cp.chain}</span>: {cp.skipReason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
