#!/usr/bin/env node
/**
 * County Search QC vault: the private data travels inside the git repository as encrypted
 * files, so a fresh copy on another computer opens the dashboard with everything, while
 * GitHub only ever stores scrambled bytes.
 *
 * Usage (from the repository folder):
 *   node scripts/vault.mjs status [--json]                     what is saved and what changed
 *   node scripts/vault.mjs save [data|archive|all] [--new-passphrase]
 *   node scripts/vault.mjs open [data|archive|all] [--replace]
 *
 * Bundles
 *   data     vault/data.qcvault     data/app: the dashboard's tables and settings (save after imports)
 *   archive  vault/archive.qcvault  test fixtures, the old database, raw exports in inbox/, and
 *                                   history/ (this project's chat history, notes and earlier audits)
 *
 * Security
 *   AES-256-GCM with a 256-bit key from scrypt(passphrase, random 16-byte salt, N=2^17, r=8, p=1).
 *   The plain header (format, bundle, KDF settings, salt, IV, file count, saved-at) is bound to
 *   the ciphertext as additional authenticated data, so a change to any byte is detected.
 *   The passphrase is typed by the owner in the terminal: it stays in memory, is never written,
 *   logged, put in an environment variable or on a command line. Opening decrypts everything in
 *   memory first (a wrong passphrase never touches the disk), refuses any path outside the
 *   bundle's folders, and moves existing folders to backups/ before replacing them.
 *
 * Output: plain sentences; `status --json` prints one JSON object.
 * Exit codes: 0 done, 1 usage or file error, 2 wrong passphrase or damaged vault file.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BUNDLES = {
  data: { file: "vault/data.qcvault", roots: ["data/app"] },
  archive: {
    file: "vault/archive.qcvault",
    roots: ["data/fixtures", "data/strqc.sqlite", "data/County_Search_QC_Feed_READY.js", "inbox", "history"],
  },
};
const STATE = "data/.vault-state.json";
const MAGIC = Buffer.from("QCVAULT1", "ascii");
const KDF = { N: 2 ** 17, r: 8, p: 1 };
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.tmp$/i;
export const MIN_PASSPHRASE = 12;

export class VaultError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ files <-> one buffer */

const abs = (root, rel) => path.join(root, ...rel.split("/"));

/** Every regular file under the bundle's roots (symlinks are never followed), sorted by path. */
export function collect(root, bundle) {
  const out = [];
  const walk = (rel) => {
    const p = abs(root, rel);
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p).sort()) walk(`${rel}/${name}`);
    } else if (st.isFile() && !SKIP.test(rel)) {
      out.push({ path: rel, mtimeMs: st.mtimeMs, data: fs.readFileSync(p) });
    }
  };
  for (const r of BUNDLES[bundle].roots) walk(r);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** One fingerprint for a set of files: changes when any path or content changes (not on a mere touch). */
export function fingerprint(files) {
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(f.path, "utf8");
    h.update("\0");
    h.update(crypto.createHash("sha256").update(f.data).digest());
  }
  return h.digest("hex");
}

export function encodeFiles(files) {
  const parts = [];
  const count = Buffer.alloc(4);
  count.writeUInt32BE(files.length);
  parts.push(count);
  for (const f of files) {
    const name = Buffer.from(f.path, "utf8");
    const head = Buffer.alloc(16);
    head.writeUInt32BE(name.length, 0);
    head.writeDoubleBE(f.mtimeMs, 4);
    head.writeUInt32BE(f.data.length, 12);
    parts.push(head, name, f.data);
  }
  return Buffer.concat(parts);
}

export function decodeFiles(buf) {
  const need = (at, n) => {
    if (at + n > buf.length) throw new VaultError("The vault file is damaged (it ends too early).", 2);
  };
  need(0, 4);
  const count = buf.readUInt32BE(0);
  const files = [];
  let at = 4;
  for (let i = 0; i < count; i++) {
    need(at, 16);
    const nameLen = buf.readUInt32BE(at);
    const mtimeMs = buf.readDoubleBE(at + 4);
    const size = buf.readUInt32BE(at + 12);
    at += 16;
    need(at, nameLen + size);
    const name = buf.subarray(at, at + nameLen).toString("utf8");
    at += nameLen;
    files.push({ path: name, mtimeMs, data: buf.subarray(at, at + size) });
    at += size;
  }
  if (at !== buf.length) throw new VaultError("The vault file is damaged (unexpected bytes at the end).", 2);
  return files;
}

/** A path inside the vault is accepted only if it is plainly relative and inside one of the bundle's roots. */
export function safePath(p, roots) {
  if (typeof p !== "string" || !p || p.length > 400) return false;
  if (p.includes("\\") || p.includes("\0") || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  const segs = p.split("/");
  for (const s of segs) {
    if (!s || s === "." || s === "..") return false;
    if (/[<>:"|?*\u0000-\u001f]/.test(s) || /[. ]$/.test(s)) return false;
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) return false;
  }
  return roots.some((r) => p === r || p.startsWith(`${r}/`));
}

/* ------------------------------------------------------------------ sealing */

function deriveKey(passphrase, salt, kdf) {
  const { N, r, p } = kdf;
  return crypto.scryptSync(Buffer.from(String(passphrase).normalize("NFC"), "utf8"), salt, 32, {
    N, r, p, maxmem: 128 * N * r * p + 64 * 1024 * 1024,
  });
}

/** Encrypt files into one vault buffer. `kdf` is only lowered by the tests. */
export function seal(files, passphrase, bundle, { kdf = KDF, savedAt = new Date().toISOString() } = {}) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const header = Buffer.from(JSON.stringify({
    format: "county-search-qc-vault", v: 1, bundle,
    kdf: { name: "scrypt", N: kdf.N, r: kdf.r, p: kdf.p, salt: salt.toString("base64") },
    cipher: { name: "aes-256-gcm", iv: iv.toString("base64") },
    files: files.length, savedAt,
  }), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  const aad = Buffer.concat([MAGIC, len, header]);
  const key = deriveKey(passphrase, salt, kdf);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const body = Buffer.concat([c.update(zlib.gzipSync(encodeFiles(files), { level: 9 })), c.final()]);
  key.fill(0);
  return Buffer.concat([aad, body, c.getAuthTag()]);
}

/** Read the plain header without the passphrase (used by status). */
export function readHeader(buf) {
  if (buf.length < MAGIC.length + 4 + 16 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new VaultError("This is not a County Search QC vault file.", 2);
  }
  const len = buf.readUInt32BE(MAGIC.length);
  if (len < 2 || len > 65536 || MAGIC.length + 4 + len + 16 > buf.length) throw new VaultError("The vault file is damaged (bad header).", 2);
  let header;
  try {
    header = JSON.parse(buf.subarray(MAGIC.length + 4, MAGIC.length + 4 + len).toString("utf8"));
  } catch {
    throw new VaultError("The vault file is damaged (unreadable header).", 2);
  }
  if (header?.format !== "county-search-qc-vault" || header.v !== 1) throw new VaultError("This vault was made by a newer version of the tool: get the latest code first.", 2);
  return { header, headerEnd: MAGIC.length + 4 + len };
}

/** Decrypt a vault buffer. Throws VaultError(code 2) on a wrong passphrase or any change to the file. */
export function unseal(buf, passphrase, expectedBundle) {
  const { header, headerEnd } = readHeader(buf);
  const k = header.kdf || {};
  const pow2 = (n) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
  if (k.name !== "scrypt" || !pow2(k.N) || k.N < 2 ** 10 || k.N > 2 ** 20 || !(k.r >= 1 && k.r <= 16) || !(k.p >= 1 && k.p <= 4)) {
    throw new VaultError("The vault file is damaged (bad key settings).", 2);
  }
  const salt = Buffer.from(String(k.salt || ""), "base64");
  const iv = Buffer.from(String(header.cipher?.iv || ""), "base64");
  if (header.cipher?.name !== "aes-256-gcm" || salt.length !== 16 || iv.length !== 12) throw new VaultError("The vault file is damaged (bad cipher settings).", 2);
  if (expectedBundle && header.bundle !== expectedBundle) throw new VaultError(`This file holds the "${header.bundle}" bundle, not "${expectedBundle}".`, 2);
  const key = deriveKey(passphrase, salt, k);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(buf.subarray(0, headerEnd));
  d.setAuthTag(buf.subarray(buf.length - 16));
  let zipped;
  try {
    zipped = Buffer.concat([d.update(buf.subarray(headerEnd, buf.length - 16)), d.final()]);
  } catch {
    throw new VaultError("Wrong passphrase, or the vault file was changed.", 2);
  } finally {
    key.fill(0);
  }
  const files = decodeFiles(zlib.gunzipSync(zipped, { maxOutputLength: 2 ** 31 - 1 }));
  const roots = BUNDLES[header.bundle]?.roots;
  if (!roots) throw new VaultError(`Unknown bundle "${header.bundle}".`, 2);
  for (const f of files) if (!safePath(f.path, roots)) throw new VaultError(`The vault holds a path that is not allowed: ${JSON.stringify(f.path)}.`, 2);
  if (files.length !== header.files) throw new VaultError("The vault file is damaged (file count).", 2);
  return { header, files };
}

/* ------------------------------------------------------------------ state (what was last saved or opened here) */

export function readState(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(abs(root, STATE), "utf8"));
  } catch {
    return {};
  }
}

function writeState(root, bundle, entry) {
  const s = readState(root);
  s[bundle] = entry;
  fs.mkdirSync(path.dirname(abs(root, STATE)), { recursive: true });
  fs.writeFileSync(abs(root, STATE), JSON.stringify(s, null, 1));
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Where one bundle stands on this computer. */
export function bundleStatus(root, bundle) {
  const vaultPath = abs(root, BUNDLES[bundle].file);
  const files = collect(root, bundle);
  const local = files.length ? fingerprint(files) : null;
  const st = readState(root)[bundle] || null;
  let vault = null;
  if (fs.existsSync(vaultPath)) {
    const buf = fs.readFileSync(vaultPath);
    let header = null;
    try {
      header = readHeader(buf).header;
    } catch {
      /* reported as damaged below */
    }
    vault = { id: sha(buf), savedAt: header?.savedAt ?? null, files: header?.files ?? null, damaged: !header, bytes: buf.length };
  }
  return {
    bundle,
    vault,
    local: { files: files.length, bytes: files.reduce((n, f) => n + f.data.length, 0), fingerprint: local },
    vaultChanged: !!vault && (!st || st.vaultId !== vault.id),
    localChanged: !!local && (!st || st.local !== local),
    lastSync: st,
  };
}

/* ------------------------------------------------------------------ save and open */

/** Encrypt one bundle into its vault file (atomic write). Returns {saved, files, bytes} or {saved:false, reason}. */
export function saveBundle(root, bundle, passphrase, opts = {}) {
  const files = collect(root, bundle);
  if (!files.length) return { bundle, saved: false, reason: "nothing on this computer to save" };
  const local = fingerprint(files);
  const target = abs(root, BUNDLES[bundle].file);
  const st = readState(root)[bundle];
  if (!opts.force && st && st.local === local && fs.existsSync(target) && st.vaultId === sha(fs.readFileSync(target))) {
    return { bundle, saved: false, reason: "already saved, nothing changed" };
  }
  const out = seal(files, passphrase, bundle, opts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, target);
  writeState(root, bundle, { vaultId: sha(out), local, savedAt: readHeader(out).header.savedAt, by: "save" });
  return { bundle, saved: true, files: files.length, bytes: out.length };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/**
 * Decrypt one bundle and put its folders in place. Existing non-empty folders are kept unless `replace`,
 * in which case they are first moved to backups/<time>/ (nothing is ever deleted).
 */
export function openBundle(root, bundle, passphrase, { replace = false } = {}) {
  const target = abs(root, BUNDLES[bundle].file);
  if (!fs.existsSync(target)) return { bundle, opened: false, reason: "no vault file for this bundle" };
  const buf = fs.readFileSync(target);
  const { header, files } = unseal(buf, passphrase, bundle);
  const stage = fs.mkdtempSync(path.join(root, ".vault-restore-"));
  const placed = [];
  const kept = [];
  try {
    for (const f of files) {
      const dest = abs(stage, f.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
      const t = new Date(f.mtimeMs);
      if (!Number.isNaN(t.getTime())) fs.utimesSync(dest, t, t);
    }
    const when = stamp();
    for (const r of BUNDLES[bundle].roots) {
      const src = abs(stage, r);
      if (!fs.existsSync(src)) continue;
      const dest = abs(root, r);
      if (fs.existsSync(dest)) {
        const empty = fs.statSync(dest).isDirectory() && fs.readdirSync(dest).length === 0;
        if (!empty && !replace) {
          kept.push(r);
          continue;
        }
        const backup = abs(root, `backups/${when}/${r}`);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(dest, backup);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
      placed.push(r);
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  // "local" records what the vault holds, so a folder kept as it was still shows up as a change to save
  if (placed.length) writeState(root, bundle, { vaultId: sha(buf), local: fingerprint(files), savedAt: header.savedAt, by: "open" });
  return { bundle, opened: true, placed, kept, files: files.length, savedAt: header.savedAt };
}

/** True when the passphrase opens this bundle's existing vault (used to stop a typo from re-locking with a new passphrase). */
export function checkPassphrase(root, bundle, passphrase) {
  const target = abs(root, BUNDLES[bundle].file);
  if (!fs.existsSync(target)) return null;
  try {
    unseal(fs.readFileSync(target), passphrase, bundle);
    return true;
  } catch (e) {
    if (e instanceof VaultError && /Wrong passphrase/.test(e.message)) return false;
    throw e;
  }
}

/* ------------------------------------------------------------------ typing the passphrase */

/** Ask for a passphrase in the terminal, showing * for each character. Without a terminal, reads one line from stdin. */
export function askPassphrase(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buf = "";
      const onData = (d) => {
        buf += d;
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          stdin.removeListener("data", onData);
          stdin.pause();
          resolve(buf.slice(0, nl).replace(/\r$/, ""));
        }
      };
      stdin.setEncoding("utf8");
      stdin.on("data", onData);
      stdin.once("end", () => resolve(buf.replace(/\r?\n$/, "")));
      stdin.resume();
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    const done = (v) => {
      stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      stdin.pause();
      process.stdout.write("\n");
      resolve(v);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(value);
        if (ch === "\u0003") {
          done("");
          process.exit(130);
        }
        if (ch === "\u0008" || ch === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (ch === "\u001b") return; // arrow keys and other escape sequences: ignore the rest of this key press
        if (ch < " ") continue;
        value += ch;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

/** Ask for the passphrase that opens the existing vault files (up to `tries` attempts). */
export async function askExisting(root, bundles, tries = 5) {
  const probe = bundles.find((b) => fs.existsSync(abs(root, BUNDLES[b].file)));
  if (!probe) return null;
  for (let i = 1; i <= tries; i++) {
    const pass = await askPassphrase("Type the data passphrase and press Enter: ");
    if (!pass) throw new VaultError("No passphrase typed.", 1);
    process.stdout.write("Checking...\n");
    if (checkPassphrase(root, probe, pass)) return pass;
    process.stdout.write(i < tries ? "That passphrase does not open the data. Try again.\n" : "\n");
  }
  throw new VaultError("The passphrase did not match after several tries.", 2);
}

/** Ask for a new passphrase twice. */
export async function askNew() {
  process.stdout.write(
    `Choose a passphrase to lock the data: at least ${MIN_PASSPHRASE} characters, for example four or five words you will remember.\n` +
    "Save it in your password manager. Without it the copy on GitHub cannot be opened, and nobody can reset it.\n",
  );
  for (;;) {
    const a = await askPassphrase("New passphrase: ");
    if (a.length < MIN_PASSPHRASE) {
      process.stdout.write(`Too short: use at least ${MIN_PASSPHRASE} characters.\n`);
      continue;
    }
    const b = await askPassphrase("Type it again: ");
    if (a === b) return a;
    process.stdout.write("The two did not match. Once more.\n");
  }
}

/* ------------------------------------------------------------------ command line */

const pickBundles = (arg) => (arg === "data" || arg === "archive" ? [arg] : ["data", "archive"]);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

async function main(argv) {
  const [cmd = "status", ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const which = pickBundles(rest.find((a) => !a.startsWith("--")));

  if (cmd === "status") {
    const s = which.map((b) => bundleStatus(ROOT, b));
    if (flags.has("--json")) {
      process.stdout.write(`${JSON.stringify({ root: ROOT, bundles: s })}\n`);
      return 0;
    }
    for (const b of s) {
      const v = b.vault ? `saved ${b.vault.savedAt?.slice(0, 16).replace("T", " ")} UTC (${mb(b.vault.bytes)})` : "not saved yet";
      const l = b.local.files ? `${b.local.files} files here` : "nothing here";
      const note = b.localChanged && b.vaultChanged ? "both changed" : b.localChanged ? "changes here are not saved yet" : b.vaultChanged ? "the saved copy is newer" : "in step";
      process.stdout.write(`${b.bundle}: ${v}; ${l}; ${note}\n`);
    }
    return 0;
  }

  if (cmd === "save") {
    let pass;
    const haveVault = which.some((b) => fs.existsSync(abs(ROOT, BUNDLES[b].file)));
    if (haveVault && !flags.has("--new-passphrase")) pass = await askExisting(ROOT, which);
    else pass = await askNew();
    process.stdout.write("Locking...\n");
    for (const b of which) {
      const r = saveBundle(ROOT, b, pass, { force: flags.has("--new-passphrase") });
      process.stdout.write(r.saved ? `${b}: locked ${r.files} files into ${BUNDLES[b].file} (${mb(r.bytes)})\n` : `${b}: ${r.reason}\n`);
    }
    pass = null;
    return 0;
  }

  if (cmd === "open") {
    const pass = await askExisting(ROOT, which);
    if (!pass) {
      process.stdout.write("There is no vault file to open.\n");
      return 1;
    }
    for (const b of which) {
      const r = openBundle(ROOT, b, pass, { replace: flags.has("--replace") });
      if (!r.opened) process.stdout.write(`${b}: ${r.reason}\n`);
      else {
        process.stdout.write(`${b}: opened ${r.files} files (saved ${String(r.savedAt).slice(0, 16).replace("T", " ")} UTC)\n`);
        if (r.kept.length) process.stdout.write(`  kept what is already here for ${r.kept.join(", ")} (use --replace to swap, the old copy goes to backups/)\n`);
      }
    }
    return 0;
  }

  process.stdout.write("Usage: node scripts/vault.mjs status [--json] | save [data|archive|all] [--new-passphrase] | open [data|archive|all] [--replace]\n");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${e instanceof VaultError ? e.message : e?.stack || e}\n`);
      process.exit(e instanceof VaultError ? e.code : 1);
    },
  );
}
