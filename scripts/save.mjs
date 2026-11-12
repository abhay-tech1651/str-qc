#!/usr/bin/env node
/**
 * Save data to GitHub: lock the private data into vault/ with the passphrase, commit only those files, and push.
 * The double-click files "Save data to GitHub.cmd" (Windows) and save-data-to-github.command (Mac) call this.
 *
 *   node scripts/save.mjs [--no-push]
 *
 * Code changes are never committed here: only vault/data.qcvault and vault/archive.qcvault.
 * Exit codes: 0 saved (or nothing new), 1 something failed (the message says what), 2 wrong passphrase.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { askExisting, askNew, BUNDLES, ROOT, saveBundle, VaultError } from "./vault.mjs";

const say = (s) => process.stdout.write(`${s}\n`);
const push = !process.argv.includes("--no-push");

function git(argv, timeout = 120000) {
  return spawnSync("git", argv, {
    cwd: ROOT, encoding: "utf8", timeout, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
}

function fail(msg, code = 1) {
  say("");
  say(msg);
  process.exit(code);
}

async function main() {
  if (git(["rev-parse", "--is-inside-work-tree"], 5000).status !== 0) fail("This folder is not a git copy of the repository, so there is nowhere to save to.");
  const bundles = Object.keys(BUNDLES);
  const anyVault = bundles.some((b) => fs.existsSync(path.join(ROOT, ...BUNDLES[b].file.split("/"))));
  const pass = anyVault ? await askExisting(ROOT, bundles) : await askNew();
  say("Locking the data...");
  const changed = [];
  for (const b of bundles) {
    const r = saveBundle(ROOT, b, pass);
    say(r.saved ? `  ${b}: ${r.files} files locked (${(r.bytes / 1048576).toFixed(1)} MB)` : `  ${b}: ${r.reason}`);
    if (r.saved) changed.push(BUNDLES[b].file);
  }

  if (changed.length) {
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date());
    git(["add", "--", ...changed]);
    const id = git(["config", "user.email"], 5000).stdout.trim() ? [] : ["-c", "user.name=County Search QC", "-c", "user.email=search-qc@users.noreply.github.com"];
    const c = git([...id, "commit", "--quiet", "-m", `Save dashboard data (${when} IST)`, "--", ...changed]);
    if (c.status !== 0) fail(`Could not record the save in git:\n${c.stderr || c.stdout}`);
    say("  Recorded in git.");
  }

  if (!push) return 0;
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], 5000);
  const ahead = upstream.status === 0 ? Number(git(["rev-list", "--count", "@{u}..HEAD"], 5000).stdout.trim() || 0) : 1;
  if (!ahead) {
    say(changed.length ? "" : "Nothing new to save: GitHub already has this data.");
    return 0;
  }
  say("Sending to GitHub...");
  const p = upstream.status === 0 ? git(["push", "--quiet"]) : git(["push", "--quiet", "-u", "origin", "HEAD"]);
  if (p.status !== 0) {
    const why = `${p.stderr || ""}`;
    if (/rejected|fetch first|non-fast-forward/i.test(why)) fail("GitHub has newer changes from another computer. Start the dashboard once (it gets them), then save again.");
    fail(`Could not reach GitHub (offline or not signed in). The data is locked and recorded here; run this again later.\n${why.trim()}`);
  }
  say("Done: the locked data is on GitHub. Other computers get it the next time they start the dashboard.");
  return 0;
}

main().then((code) => process.exit(code), (e) => {
  if (e instanceof VaultError) fail(e.message, e.code);
  fail(`Something went wrong: ${e?.stack || e}`);
});
