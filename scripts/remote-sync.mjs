#!/usr/bin/env node
/**
 * The shared, read-only copy of the dashboard (docs/REMOTE_ACCESS.md). Runs inside the Docker container:
 *   1. downloads vault/data.qcvault from the private GitHub repository (a read-only token, never the owner's login);
 *   2. unlocks it with the passphrase from a Docker secret file and places data/app;
 *   3. starts the dashboard on 127.0.0.1:3000 inside the container (only the Tailscale sidecar can reach it);
 *   4. checks GitHub again every QC_SYNC_MINUTES and swaps in the new data when the owner has saved a newer copy.
 *
 * The copy never imports or changes data (QC_READ_ONLY=1): the owner imports on their own computer and runs
 * "Save data to GitHub"; this copy follows within the sync interval.
 *
 * Environment
 *   QC_REPO              owner/name of the private repository, e.g. abhay-tech1651/str-qc
 *   QC_TOKEN_FILE        file holding a fine-grained GitHub token with read-only "Contents" on that one repository
 *   QC_PASSPHRASE_FILE   file holding the vault passphrase (a Docker secret, mounted read-only)
 *   QC_SYNC_MINUTES      how often to look for new data (default 10)
 *   QC_ROOT              the str-qc folder (default: this script's parent folder; /app in the container)
 *
 *   node scripts/remote-sync.mjs --once   download and unlock one time, then stop: a setup check that starts no server
 * Output: one plain line per event; secrets are never printed. Exit code: 1 when the first download or unlock fails.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT as SCRIPT_ROOT, unseal } from "./vault.mjs";

const say = (s) => console.log(`[sync ${new Date().toISOString().slice(0, 19)}Z] ${s}`);
const fail = (s) => { console.error(s); process.exit(1); };
const readSecret = (file) => {
  let v;
  try {
    v = fs.readFileSync(file, "utf8").replace(/\r?\n$/, "");
  } catch {
    fail(`Cannot read the secret file ${file}. Create it as docs/REMOTE_ACCESS.md says.`);
  }
  if (!v) fail(`${file} is empty`);
  return v;
};

const REPO = String(process.env.QC_REPO ?? "");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) fail("QC_REPO must be owner/name");
// GitHub only. A local address is accepted solely so the tests can stand in for GitHub; the token goes nowhere else.
const API = String(process.env.QC_GITHUB_API ?? "https://api.github.com").replace(/\/$/, "");
if (API !== "https://api.github.com" && !/^http:\/\/127\.0\.0\.1:\d+$/.test(API)) fail("QC_GITHUB_API must be https://api.github.com");
const TOKEN = readSecret(process.env.QC_TOKEN_FILE ?? "/run/secrets/github_token");
const PASS = readSecret(process.env.QC_PASSPHRASE_FILE ?? "/run/secrets/qc_passphrase");
const MINUTES = Math.min(120, Math.max(2, Number(process.env.QC_SYNC_MINUTES) || 10));
const ROOT = process.env.QC_ROOT ? path.resolve(process.env.QC_ROOT) : SCRIPT_ROOT;
const DATA = path.join(ROOT, "data", "app");
let lastSha = "";

async function download() {
  const res = await fetch(`${API}/repos/${REPO}/contents/vault/data.qcvault`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github.raw", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "county-search-qc-sync" },
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 401 || res.status === 403) throw new Error(`GitHub refused the token (${res.status}): check it can read ${REPO} and has not expired`);
  if (res.status === 404) throw new Error(`GitHub found no vault/data.qcvault in ${REPO}: run "Save data to GitHub" on the laptop first, or check the token covers this repository`);
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Unlock in memory, write to a new folder, then swap it in, so a page never reads half-written data. */
function place(buf) {
  let opened;
  try {
    opened = unseal(buf, PASS, "data");
  } catch (e) {
    throw new Error(`could not unlock the saved data (${e.message}) Check that qc_passphrase holds the passphrase used for "Save data to GitHub".`);
  }
  const { header, files } = opened;
  const stage = fs.mkdtempSync(path.join(ROOT, "data", ".incoming-"));
  for (const f of files) {
    const rel = f.path.replace(/^data\/app\/?/, "");
    if (!rel) continue;
    const dest = path.join(stage, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.data, { mode: 0o600 });
  }
  const old = `${DATA}.old`;
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(DATA)) fs.renameSync(DATA, old);
  fs.renameSync(stage, DATA);
  fs.rmSync(old, { recursive: true, force: true });
  return header.savedAt;
}

async function syncOnce() {
  const buf = await download();
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha === lastSha) return false;
  const savedAt = place(buf);
  lastSha = sha;
  say(`data updated (saved by the owner at ${savedAt})`);
  return true;
}

async function main() {
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  try {
    await syncOnce();
  } catch (e) {
    fail(`First sync failed: ${e.message}`);
  }
  if (process.argv.includes("--once")) { say("setup check passed: the data downloads and unlocks"); return; }
  const next = path.join(ROOT, "dashboard", "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", "3000"], {
    cwd: path.join(ROOT, "dashboard"), stdio: "inherit", env: { ...process.env, QC_READ_ONLY: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  setInterval(() => { syncOnce().catch((e) => say(`sync skipped: ${e.message}`)); }, MINUTES * 60000);
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => child.kill(sig));
}

main();
