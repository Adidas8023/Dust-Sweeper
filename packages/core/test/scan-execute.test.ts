import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scanDust } from "../src/scan.js";
import { planSweep } from "../src/plan.js";
import { executeSweep } from "../src/execute.js";
import type { SweepSettings } from "../src/types.js";

const SAVED: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "DEMO_MODE",
  "PRIVATE_KEY_EVM",
  "PRIVATE_KEYS_EVM",
  "PRIVATE_KEY_SOL",
  "PRIVATE_KEYS_SOL",
  "DEMO_EXECUTION_DELAY_SCALE",
];

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.DEMO_MODE = "1";
  process.env.DEMO_EXECUTION_DELAY_SCALE = "0";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

const DEFAULT_SETTINGS: SweepSettings = {
  thresholdUSD: 5,
  includeNativeGas: false,
  gasReserveUSD: 0,
  includeStables: false,
  includeWrapped: false,
  excludeAddresses: [],
};

describe("scan → plan → execute pipeline (demo mode)", () => {
  it("scan emits inventory shape with wallets[] and tokens tagged with owner", async () => {
    const inv = await scanDust(DEFAULT_SETTINGS);
    expect(inv.wallets.evm.length).toBeGreaterThan(0);
    expect(inv.wallets.solana.length).toBeGreaterThan(0);
    expect(inv.byOwner.length).toBeGreaterThan(0);
    for (const c of inv.chains) {
      for (const t of c.tokens) {
        expect(t.owner).toBeTruthy();
      }
    }
  });

  it("demo scan respects the configured dust threshold", async () => {
    const inv = await scanDust({ ...DEFAULT_SETTINGS, thresholdUSD: 1 });
    const symbols = inv.chains.flatMap((c) => c.tokens.map((t) => t.symbol));
    expect(symbols).not.toContain("PEPE");
    expect(
      inv.chains
        .flatMap((c) => c.tokens)
        .every((t) => t.usdValue < 1)
    ).toBe(true);
  });

  it("per-wallet plan keeps every step's owner aligned with its ChainPlan", async () => {
    const inv = await scanDust(DEFAULT_SETTINGS);
    const plan = planSweep(inv, "arbitrum", { aggregationMode: "per-wallet" });
    for (const cp of plan.perChain) {
      expect(cp.mintRecipient).toBe(cp.owner);
      for (const step of cp.steps) {
        expect(step.owner).toBe(cp.owner);
      }
    }
  });

  it("unified plan routes every chain plan to the recipient", async () => {
    const inv = await scanDust(DEFAULT_SETTINGS);
    const recipient = "0x9999999999999999999999999999999999999999";
    const plan = planSweep(inv, "arbitrum", {
      aggregationMode: "unified",
      recipientEvm: recipient,
    });
    for (const cp of plan.perChain) {
      expect(cp.mintRecipient).toBe(recipient);
    }
  });

  it("execute returns SweepResult tagged with owner per chain", async () => {
    const inv = await scanDust(DEFAULT_SETTINGS);
    // narrow to a single source chain so demo execution stays under timeout
    const trimmed = {
      ...inv,
      chains: inv.chains.filter((c) => c.chain === "base"),
    };
    const plan = planSweep(trimmed, "arbitrum");
    const result = await executeSweep(plan);
    expect(result.status).toBe("success");
    expect(result.perChain.length).toBeGreaterThan(0);
    for (const r of result.perChain) {
      expect(r.owner).toBeTruthy();
      expect(r.chain).toBeTruthy();
    }
  }, 15000);

  it("progress events carry chain + owner for multi-wallet runs", async () => {
    const inv = await scanDust(DEFAULT_SETTINGS);
    const trimmed = {
      ...inv,
      chains: inv.chains.filter((c) => c.chain === "base"),
    };
    const plan = planSweep(trimmed, "arbitrum");
    const events: Array<{ chain?: string; owner?: string; kind: string }> = [];
    await executeSweep(plan, (e) =>
      events.push({ chain: e.chain, owner: e.owner, kind: e.kind })
    );
    const chainStarts = events.filter((e) => e.kind === "chain_start");
    expect(chainStarts.length).toBeGreaterThan(0);
    for (const e of chainStarts) {
      expect(e.owner).toBeTruthy();
      expect(e.chain).toBeTruthy();
    }
  }, 15000);
});
