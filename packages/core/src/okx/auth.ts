import { createHmac } from "node:crypto";

export function buildAuthHeaders(
  method: "GET" | "POST",
  path: string,
  body: string
): Record<string, string> {
  const apiKey = process.env.OKX_API_KEY;
  const secret = process.env.OKX_SECRET_KEY;
  const pass = process.env.OKX_PASSPHRASE || process.env.OKX_API_PASSPHRASE;
  const proj = process.env.OKX_PROJECT_ID;
  if (!apiKey || !secret || !pass || !proj) {
    throw new Error(
      "OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE / OKX_PROJECT_ID must be set in env"
    );
  }
  const ts = new Date().toISOString();
  const prehash = ts + method + path + body;
  const sign = createHmac("sha256", secret).update(prehash).digest("base64");
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": pass,
    "OK-ACCESS-PROJECT": proj,
    "Content-Type": "application/json",
  };
  return headers;
}
