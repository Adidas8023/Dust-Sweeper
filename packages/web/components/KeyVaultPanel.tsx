"use client";

import { useEffect, useMemo, useState } from "react";
import type { LocalSignerVault } from "@/lib/local-keys";
import { EMPTY_SIGNER_VAULT, parseKeyTextarea } from "@/lib/local-keys";
import { useI18n } from "@/lib/i18n";

interface StatusInfo {
  hasOkxAuth: boolean;
  hasOkxProjectId?: boolean;
}

export function KeyVaultPanel({
  value,
  onChange,
  status,
}: {
  value: LocalSignerVault;
  onChange: (next: LocalSignerVault) => void;
  status: StatusInfo | null;
}) {
  const { t } = useI18n();
  const [evmText, setEvmText] = useState(value.evm.join("\n"));
  const [solanaText, setSolanaText] = useState(value.solana.join("\n"));

  useEffect(() => setEvmText(value.evm.join("\n")), [value.evm]);
  useEffect(() => setSolanaText(value.solana.join("\n")), [value.solana]);

  const parsed = useMemo(
    () => ({
      evm: parseKeyTextarea(evmText),
      solana: parseKeyTextarea(solanaText),
    }),
    [evmText, solanaText]
  );
  const total = value.evm.length + value.solana.length;

  function save() {
    onChange({
      evm: parsed.evm,
      solana: parsed.solana,
      demoMode: parsed.evm.length + parsed.solana.length === 0,
    });
  }

  return (
    <div className="x-card x-card-hot overflow-hidden p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--green)]">
            {t("Local signer vault")}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-[var(--t1)]">
            {t("Import multiple private keys")}
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--t3)]">
            {t("Keys are saved in this browser's localStorage and sent only to the local Next.js API route when you run live mode.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[var(--border)] bg-black/36 px-3 py-1 text-[var(--t3)]">
            {t("{count} saved", { count: total })}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              status?.hasOkxAuth
                ? "border-[rgba(188,255,47,0.34)] bg-[var(--hot)] text-[var(--green)]"
                : "border-[var(--border)] bg-black/36 text-[var(--t3)]"
            }`}
          >
            {t(status?.hasOkxAuth ? "OKX API fallback ready" : "OKX API optional")}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <KeyBox
          label={t("EVM private keys")}
          hint={t("Paste multiple EVM private keys with one key per line. Commas also work for EVM keys.")}
          detail={t("Used for EVM scan, swap approval, swap signing, CCTP burn, and EVM destination mint gas.")}
          placeholder={"0xabc...private-key\n0xdef...private-key"}
          value={evmText}
          onChange={setEvmText}
          count={parsed.evm.length}
        />
        <KeyBox
          label={t("Solana secret keys")}
          hint={t("Paste one Solana secret key per line. Base58 strings and JSON arrays are both accepted.")}
          detail={t("Used for Solana scan, swap signing, CCTP burn, ATA creation, and Solana destination mint gas.")}
          placeholder={"base58-secret-key\n[12,34,56,...]"}
          value={solanaText}
          onChange={setSolanaText}
          count={parsed.solana.length}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--t4)]">
          {t("Use dedicated sweep wallets. Browser localStorage is convenient, not a hardware-wallet security boundary.")}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onChange(EMPTY_SIGNER_VAULT)}
            className="x-focus rounded-full border border-[var(--border)] bg-black/34 px-4 py-2 text-xs text-[var(--t3)] transition hover:text-[var(--t1)]"
          >
            {t("Clear keys")}
          </button>
          <button
            onClick={save}
            className="x-focus rounded-full bg-[var(--green)] px-5 py-2 text-xs font-semibold text-black transition hover:brightness-110"
          >
            {t("Save local keys")}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyBox({
  label,
  hint,
  detail,
  placeholder,
  value,
  onChange,
  count,
}: {
  label: string;
  hint: string;
  detail: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  count: number;
}) {
  const { t } = useI18n();
  return (
    <label className="block rounded-[20px] border border-[var(--border)] bg-black/34 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 font-mono text-[10px] text-[var(--green)]">
          {t("{count} parsed", { count })}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--t3)]">
        {hint}
      </p>
      <p className="mt-1 min-h-[40px] text-xs leading-5 text-[var(--t4)]">
        {detail}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        className="x-input mt-3 w-full resize-y px-3 py-2 font-mono text-[11px] leading-5"
        placeholder={placeholder}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-[var(--border)] bg-black/28 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--green)]">
          {t("one line = one wallet")}
        </span>
        <span className="rounded-full border border-[var(--border)] bg-black/28 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--t3)]">
          {t("parsed locally")}
        </span>
      </div>
    </label>
  );
}
