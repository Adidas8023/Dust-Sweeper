import fs from "node:fs";
import path from "node:path";

let loaded = false;

export function loadServerEnv() {
  if (loaded) return;
  const file = findEnvFile();
  if (!file) {
    loaded = true;
    return;
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = unquote(trimmed.slice(idx + 1).trim());
    if (!process.env[key]) process.env[key] = value;
  }
  loaded = true;
}

function findEnvFile() {
  let dir = process.cwd();
  while (true) {
    const file = path.join(dir, ".env");
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
