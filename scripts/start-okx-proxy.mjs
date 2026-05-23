import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, redactUrl } from "proxy-chain";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv(path.join(root, ".env"));

const upstreamProxyUrl = process.env.OKX_UPSTREAM_PROXY_URL;
const host = process.env.OKX_LOCAL_PROXY_HOST || "127.0.0.1";
const port = Number(process.env.OKX_LOCAL_PROXY_PORT || "7897");
const rejectUnauthorized = parseBoolean(
  process.env.OKX_UPSTREAM_PROXY_TLS_REJECT_UNAUTHORIZED,
  true
);

if (!upstreamProxyUrl) {
  console.error("Missing OKX_UPSTREAM_PROXY_URL in .env");
  process.exit(1);
}

const server = new Server({
  host,
  port,
  prepareRequestFunction: () => ({
    upstreamProxyUrl,
    ignoreUpstreamProxyCertificate: !rejectUnauthorized,
  }),
});

server.on("requestFailed", ({ error }) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[okx-proxy] request failed: ${message}`);
});

await server.listen();
console.log(
  `[okx-proxy] listening http://${host}:${port} -> ${redactUrl(
    new URL(upstreamProxyUrl)
  )}`
);

const shutdown = async () => {
  await server.close(true);
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no"].includes(value.toLowerCase());
}

function loadDotenv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}
