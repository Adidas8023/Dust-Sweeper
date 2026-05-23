import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRpcUrl } from "../src/chains/index.js";

const RESET_KEYS = [
  "ALCHEMY_API_KEY",
  "RPC_ETHEREUM",
  "RPC_POLYGON",
  "POLYGON_RPC_URL",
  "RPC_SONIC",
  "RPC_MONAD",
];

describe("getRpcUrl priority", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of RESET_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of RESET_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("explicit RPC_<CHAIN> overrides everything", () => {
    process.env.ALCHEMY_API_KEY = "abc";
    process.env.RPC_ETHEREUM = "https://my.private.rpc/";
    expect(getRpcUrl("ethereum")).toBe("https://my.private.rpc/");
  });

  it("accepts <CHAIN>_RPC_URL as an explicit per-chain override", () => {
    process.env.ALCHEMY_API_KEY = "abc";
    process.env.POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/poly";
    expect(getRpcUrl("polygon")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/poly"
    );
  });

  it("uses Alchemy when key set and chain supported", () => {
    process.env.ALCHEMY_API_KEY = "abc";
    expect(getRpcUrl("ethereum")).toBe(
      "https://eth-mainnet.g.alchemy.com/v2/abc"
    );
    expect(getRpcUrl("solana")).toBe(
      "https://solana-mainnet.g.alchemy.com/v2/abc"
    );
  });

  it("reuses an Alchemy key from a chain-specific Alchemy RPC URL", () => {
    process.env.POLYGON_RPC_URL = "https://polygon-mainnet.g.alchemy.com/v2/abc";
    expect(getRpcUrl("base")).toBe(
      "https://base-mainnet.g.alchemy.com/v2/abc"
    );
  });

  it("falls back to public when Alchemy key set but chain unsupported", () => {
    process.env.ALCHEMY_API_KEY = "abc";
    expect(getRpcUrl("sonic")).toBe("https://rpc.soniclabs.com");
  });

  it("falls back to public when no Alchemy key", () => {
    expect(getRpcUrl("ethereum")).toBe("https://eth.llamarpc.com");
  });
});
