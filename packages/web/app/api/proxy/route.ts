import { NextRequest, NextResponse } from "next/server";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function GET() {
  return NextResponse.json(await proxyStatus());
}

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();
    if (action === "start") await startProxy();
    else if (action === "stop") await stopProxy();
    else if (action === "restart") {
      await stopProxy();
      await startProxy();
    } else {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json(await proxyStatus());
  } catch (e: any) {
    return NextResponse.json(
      { ...(await proxyStatus()), error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

async function proxyStatus() {
  const root = workspaceRoot();
  loadDotenv(path.join(root, ".env"));
  const host = process.env.OKX_LOCAL_PROXY_HOST || "127.0.0.1";
  const port = Number(process.env.OKX_LOCAL_PROXY_PORT || "7897");
  const running = await isPortOpen(host, port);
  return {
    configured: Boolean(process.env.OKX_UPSTREAM_PROXY_URL),
    running,
    localUrl: `http://${host}:${port}`,
  };
}

async function startProxy() {
  const root = workspaceRoot();
  loadDotenv(path.join(root, ".env"));
  if (!process.env.OKX_UPSTREAM_PROXY_URL) {
    throw new Error("OKX_UPSTREAM_PROXY_URL is not configured in .env");
  }
  const host = process.env.OKX_LOCAL_PROXY_HOST || "127.0.0.1";
  const port = Number(process.env.OKX_LOCAL_PROXY_PORT || "7897");
  if (await isPortOpen(host, port)) return;

  const child = spawn("pnpm", ["proxy:okx"], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  await waitForPort(host, port, 5000);
}

async function stopProxy() {
  const root = workspaceRoot();
  loadDotenv(path.join(root, ".env"));
  const host = process.env.OKX_LOCAL_PROXY_HOST || "127.0.0.1";
  const port = Number(process.env.OKX_LOCAL_PROXY_PORT || "7897");
  const pids = await pidsListeningOnPort(port);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // best effort
    }
  }
  if (pids.length) await waitForPortClose(host, port, 5000);
}

function workspaceRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "scripts", "start-okx-proxy.mjs"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function loadDotenv(file: string) {
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

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(600);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) return;
    await delay(150);
  }
  throw new Error(`proxy did not start on ${host}:${port}`);
}

async function waitForPortClose(host: string, port: number, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortOpen(host, port))) return;
    await delay(150);
  }
}

async function pidsListeningOnPort(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return stdout
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
