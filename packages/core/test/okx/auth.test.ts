import { describe, it, expect, beforeEach } from "vitest";
import { buildAuthHeaders } from "../../src/okx/auth.js";

describe("buildAuthHeaders", () => {
  beforeEach(() => {
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_PASSPHRASE;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
    process.env.OKX_API_KEY = "key";
    process.env.OKX_SECRET_KEY = "c2VjcmV0";
    process.env.OKX_PASSPHRASE = "pass";
    process.env.OKX_PROJECT_ID = "proj";
  });

  it("produces all required OKX headers", () => {
    const h = buildAuthHeaders("GET", "/api/v5/dex/aggregator/quote?x=1", "");
    expect(h["OK-ACCESS-KEY"]).toBe("key");
    expect(h["OK-ACCESS-PASSPHRASE"]).toBe("pass");
    expect(h["OK-ACCESS-PROJECT"]).toBe("proj");
    expect(h["OK-ACCESS-SIGN"]).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(h["OK-ACCESS-TIMESTAMP"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("throws when credentials missing", () => {
    delete process.env.OKX_API_KEY;
    expect(() => buildAuthHeaders("GET", "/", "")).toThrow();
  });

  it("throws when project id is missing", () => {
    delete process.env.OKX_PROJECT_ID;
    expect(() => buildAuthHeaders("GET", "/", "")).toThrow(/OKX_PROJECT_ID/);
  });

  it("accepts the official OKX_API_PASSPHRASE alias", () => {
    delete process.env.OKX_PASSPHRASE;
    process.env.OKX_API_PASSPHRASE = "api-pass";
    const h = buildAuthHeaders("GET", "/", "");
    expect(h["OK-ACCESS-PASSPHRASE"]).toBe("api-pass");
    expect(h["OK-ACCESS-PROJECT"]).toBe("proj");
  });
});
