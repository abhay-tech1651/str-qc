#!/usr/bin/env node
/**
 * Start County Search QC on any computer (Windows or Mac): the double-click files call this.
 *
 *   node scripts/start.mjs [--no-pull] [--no-open] [--port 3000]
 *
 * Steps, each skipped when not needed:
 *   1. checks Node.js is new enough (20.9 or later)
 *   2. gets the latest code and data from GitHub (git pull --ff-only; never merges, never prompts)
 *   3. opens the locked data (vault/) when this computer has none, or when GitHub has a newer saved copy and
 *      nothing changed here since; asks for the passphrase once
 *   4. installs the dashboard's packages (first run, or when package-lock.json changed)
 *   5. builds the dashboard (first run, or when its code changed)
 *   6. starts it on http://127.0.0.1:3000 (this computer only) and opens the browser when it is ready;
 *      if it is already running, just opens the browser
 * Set QC_NO_PULL=1 to skip step 2. Exit code 0 when the dashboard stopped normally.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { askExisting, bundleStatus, openBundle, ROOT, VaultError } from "./vault.mjs";

const DASH = path.join(ROOT, "dashboard");
// Next.js sends anonymous usage statistics to Vercel unless told not to; nothing leaves this computer uninvited
process.env.NEXT_TELEMETRY_DISABLED = "1";
const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf("--port") + 1]) || 3000;
const URL_ = `http://127.0.0.1:${PORT}`;
const say = (s) => process.stdout.write(`${s}\n`);
const isWin = process.platform === "win32";

function fail(msg) {
  say("");
  say(msg);
  process.exit(1);
}

/* 1. Node.js version */
function checkNode() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 20 || (maj === 20 && min < 9)) fail(`This needs Node.js 20.9 or newer (this computer has ${process.versions.node}). Install the LTS version from https://nodejs.org and start again.`);
}

/* 2. latest from GitHub */
function git(argv, timeout = 30000) {
  return spawnSync("git", argv, {
    cwd: ROOT, encoding: "utf8", timeout, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
}

function pullLatest() {
  if (args.includes("--no-pull") || process.env.QC_NO_PULL === "1") return;
  if (git(["rev-parse", "--is-inside-work-tree"], 5000).status !== 0) return;
  if (git(["remote", "get-url", "origin"], 5000).status !== 0) return;
  const before = git(["rev-parse", "HEAD"], 5000).stdout.trim();
  say("Checking GitHub for updates...");
  const r = git(["pull", "--ff-only", "--quiet"], 45000);
  if (r.status !== 0) {
    const why = `${r.stderr || ""}${r.error ? r.error.message : ""}`;
    if (/local changes|would be overwritten|diverg|not possible to fast-forward/i.test(why)) say("  Not updated: this computer has its own unsaved changes. Using what is here.");
    else say("  Could not reach GitHub (offline or not signed in). Using what is on this computer.");
    return;
  }
  const after = git(["rev-parse", "HEAD"], 5000).stdout.trim();
  say(after !== before ? "  Got the latest code and data from GitHub." : "  Already up to date.");
}

/* 3. the locked data */
async function openData() {
  const plan = [];
  for (const b of ["data", "archive"]) {
    let s;
    try {
      s = bundleStatus(ROOT, b);
    } catch (e) {
      say(`  Could not read the ${b} vault: ${e.message}`);
      continue;
    }
    if (!s.vault) continue;
    if (s.vault.damaged) {
      say(`  The saved ${b} file in vault/ is damaged; using what is on this computer.`);
      continue;
    }
    if (!s.local.files) plan.push({ b, replace: false, why: "this computer has none yet" });
    else if (s.vaultChanged && !s.localChanged) plan.push({ b, replace: true, why: `a newer copy was saved on ${String(s.vault.savedAt).slice(0, 10)}` });
    else if (s.vaultChanged && s.localChanged && b === "data") {
      say("  Note: GitHub has a different saved copy of the data, and this computer also has changes that were not saved.");
      say("  Keeping this computer's data. To combine them, ask Claude, or run Save data to GitHub on the computer whose data you want to keep.");
    }
  }
  if (!plan.length) return;
  say("");
  say(`Opening the locked data (${plan.map((p) => `${p.b}: ${p.why}`).join("; ")}).`);
  const pass = await askExisting(ROOT, plan.map((p) => p.b));
  for (const p of plan) {
    const r = openBundle(ROOT, p.b, pass, { replace: p.replace });
    if (r.opened) say(`  ${p.b}: ${r.files} files ready${p.replace ? " (the previous copy is in backups/)" : ""}.`);
  }
}

/* 4 and 5. packages and build */
function hashFiles(paths) {
  const h = crypto.createHash("sha256");
  const walk = (p) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) for (const n of fs.readdirSync(p).sort()) walk(path.join(p, n));
    else if (st.isFile()) {
      h.update(path.relative(DASH, p).split(path.sep).join("/"));
      h.update(fs.readFileSync(p));
    }
  };
  for (const p of paths) walk(path.join(DASH, p));
  return h.digest("hex");
}

function npm(argv) {
  // npm is a .cmd file on Windows, which Node only runs through a shell; every argument here is a fixed word.
  // CI=1 keeps npm and Next.js from stopping to ask questions (such as an upgrade prompt) that nobody is there to answer.
  const env = { ...process.env, CI: "1" };
  const r = isWin
    ? spawnSync(`npm ${argv.join(" ")}`, { cwd: DASH, stdio: "inherit", shell: true, env })
    : spawnSync("npm", argv, { cwd: DASH, stdio: "inherit", env });
  if (r.status !== 0) fail(`"npm ${argv.join(" ")}" did not finish. Check the internet connection and start again.`);
}

function ensurePackages() {
  const stampFile = path.join(DASH, "node_modules", ".qc-lock-hash");
  const lock = hashFiles(["package-lock.json"]);
  const have = fs.existsSync(path.join(DASH, "node_modules", "next", "package.json"));
  const stamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8").trim() : null;
  if (have && (stamp === lock || stamp === null)) {
    if (stamp === null) fs.writeFileSync(stampFile, lock);
    return;
  }
  say(have ? "The dashboard's packages changed: updating them (about 2 minutes)..." : "First run on this computer: installing the dashboard (about 2 minutes)...");
  npm(["ci", "--no-audit", "--no-fund"]);
  fs.writeFileSync(stampFile, lock);
}

const BUILD_INPUTS = ["app", "components", "lib", "public", "proxy.ts", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "package.json", "package-lock.json"];

function ensureBuild() {
  const stampFile = path.join(DASH, ".next", "qc-build-hash");
  const want = hashFiles(BUILD_INPUTS);
  const built = fs.existsSync(path.join(DASH, ".next", "BUILD_ID"));
  if (built && fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8").trim() === want) return;
  say(built ? "The dashboard's code changed: rebuilding (about 1 minute)..." : "Preparing the dashboard (about 1 minute)...");
  npm(["run", "build"]);
  fs.writeFileSync(stampFile, want);
}

/* 6. run */
async function probe() {
  try {
    const res = await fetch(`${URL_}/`, { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    return /Search QC/.test(text) ? "ours" : "other";
  } catch {
    return "free";
  }
}

function openBrowser() {
  if (args.includes("--no-open")) return;
  const cmd = isWin ? ["cmd", ["/c", "start", "", URL_]] : process.platform === "darwin" ? ["open", [URL_]] : ["xdg-open", [URL_]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch {
    /* the address is printed anyway */
  }
}

async function run() {
  const state = await probe();
  if (state === "ours") {
    say(`The dashboard is already running: opening ${URL_}`);
    openBrowser();
    return 0;
  }
  if (state === "other") fail(`Port ${PORT} is used by another program. Close it, or start with: node scripts/start.mjs --port 3001`);
  say("");
  say(`Starting the dashboard at ${URL_} (only this computer can open it). Close this window to stop it.`);
  const next = path.join(DASH, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(PORT)], { cwd: DASH, stdio: "inherit" });
  const ready = (async () => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (child.exitCode !== null) return false;
      if ((await probe()) === "ours") return true;
    }
    return false;
  })();
  ready.then((ok) => {
    if (ok) {
      say(`Ready: ${URL_}`);
      openBrowser();
    }
  });
  return new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 0)));
}

async function main() {
  checkNode();
  if (!fs.existsSync(path.join(ROOT, "apps-script", "20_Model.js"))) fail("This file must stay in the str-qc folder (next to apps-script/ and dashboard/).");
  pullLatest();
  try {
    await openData();
  } catch (e) {
    if (e instanceof VaultError) fail(`${e.message} The dashboard was not started. Start again to retry.`);
    throw e;
  }
  ensurePackages();
  ensureBuild();
  return run();
}

main().then((code) => process.exit(code), (e) => fail(`Something went wrong: ${e?.stack || e}`));
