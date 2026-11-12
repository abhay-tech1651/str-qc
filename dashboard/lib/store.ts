import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModel, defaultConfig, mergeRows, parseAgencyTab, parseExport } from "./engine";
import type { LoadedFile, Model, ReviewRow } from "./types";

/**
 * The data store: plain JSON files on this computer (../data/app, never in git). Imports follow the same merge rules as
 * the engine's contract (docs/CONTRACT.md §2), so loading a file twice never double-counts.
 */
import { repoRoot } from "./root";
const ROOT = repoRoot();
const DATA = path.join(ROOT, "data", "app");
const TABLES = ["search_terms", "changes", "campaign_days", "keywords", "auction", "agency_calls"] as const;
type Table = (typeof TABLES)[number];
const MAX_BYTES = 15 * 1024 * 1024;

const tablePath = (t: Table) => path.join(DATA, `${t}.json`);
const filesPath = path.join(DATA, "files.json");
const settingsPath = path.join(DATA, "settings.json");
const SHEET_ID = /^[A-Za-z0-9_-]{25,100}$/;

function ensureDir() {
  fs.mkdirSync(DATA, { recursive: true });
}

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, v: unknown) {
  ensureDir();
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v));
  fs.renameSync(tmp, p); // atomic replace: a crash never leaves half a file
}

export function readTable(t: Table): Record<string, unknown>[] {
  return readJson<Record<string, unknown>[]>(tablePath(t), []);
}

export function loadedFiles(): LoadedFile[] {
  return readJson<LoadedFile[]>(filesPath, []);
}

/** Today's date in India (the account's time zone). */
export function todayIST(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Google Ads exports are UTF-16 with a byte-order mark; files re-saved by Excel are UTF-8 or Windows-1252. */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder("utf-8").decode(buf.subarray(3));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

const span = (rows: Record<string, unknown>[]) => {
  const days = rows.map((r) => String(r.day || "")).filter(Boolean).sort();
  return { first_day: days[0] ?? null, last_day: days[days.length - 1] ?? null };
};

function recordFile(f: Omit<LoadedFile, "loaded_at">) {
  const list = loadedFiles().filter((x) => x.sha !== f.sha);
  list.unshift({ ...f, loaded_at: new Date().toISOString() });
  writeJson(filesPath, list.slice(0, 500));
}

export type ImportResult = { name: string; kind: string; rows: number; first_day: string | null; last_day: string | null; note?: string; skipped?: boolean };

/**
 * Import one export. `exportedOn` is the date the file was downloaded: a campaign report's rows for that day (or later)
 * are incomplete, so they are left out and arrive with the next report.
 */
const snapshotsPath = path.join(DATA, "snapshots.json");
type Snapshots = Record<string, { day: string; exported_ms: number; name: string }>;

/**
 * Keyword and auction reports are snapshots of a whole period. When two exports cover the same period, keep the one
 * exported last: an older file found later (for example "Search keyword report (4).csv") must not replace a newer one.
 */
function staleSnapshot(kind: string, rows: Record<string, unknown>[], exportedMs: number): string | null {
  if (kind !== "keywords" && kind !== "auction") return null;
  const day = rows.map((r) => String(r.day || "")).sort().pop() || "";
  const key = kind === "auction" ? `auction:${String(rows[0]?.period_start || "")}:${day}` : "keywords";
  const snaps = readJson<Snapshots>(snapshotsPath, {});
  const prev = snaps[key];
  if (prev && (kind === "keywords" ? prev.day > day || (prev.day === day && prev.exported_ms > exportedMs) : prev.exported_ms > exportedMs)) {
    return `a newer export of this report is already loaded (${prev.name})`;
  }
  snaps[key] = { day, exported_ms: exportedMs, name: "" };
  return null;
}

function rememberSnapshot(kind: string, rows: Record<string, unknown>[], exportedMs: number, name: string) {
  if (kind !== "keywords" && kind !== "auction") return;
  const day = rows.map((r) => String(r.day || "")).sort().pop() || "";
  const key = kind === "auction" ? `auction:${String(rows[0]?.period_start || "")}:${day}` : "keywords";
  const snaps = readJson<Snapshots>(snapshotsPath, {});
  snaps[key] = { day, exported_ms: exportedMs, name };
  writeJson(snapshotsPath, snaps);
}

export function importCsv(name: string, buf: Buffer, exportedOn: string, exportedMs = Date.now()): ImportResult {
  if (buf.length > MAX_BYTES) return { name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "larger than 15 MB" };
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (loadedFiles().some((f) => f.sha === sha)) return { name, kind: "already loaded", rows: 0, first_day: null, last_day: null, skipped: true, note: "this exact file is already loaded" };
  const text = decodeText(buf);
  const { kind, rows } = parseExport(text);
  if (kind === "unknown" || !rows.length) return { name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "not a Google Ads export this dashboard reads" };
  if (kind === "search_terms") {
    // a search terms report has no Day column: one covering several days cannot be split into days, so it is refused
    const period = text.replace(/^\uFEFF/, "").split(/\r?\n/)[1] ?? "";
    const ends = period.split(" - ").map((x) => x.trim()).filter(Boolean);
    if (ends.length === 2 && ends[0] !== ends[1]) {
      return { name, kind, rows: 0, first_day: null, last_day: null, skipped: true,
        note: `this report covers several days (${period.trim()}); download one day at a time so each day's numbers stay right` };
    }
  }
  const stale = staleSnapshot(kind, rows, exportedMs);
  if (stale) {
    recordFile({ name, kind, rows: 0, first_day: null, last_day: null, sha, note: `skipped: ${stale}` });
    return { name, kind, rows: 0, first_day: null, last_day: null, skipped: true, note: stale };
  }
  let keep = rows;
  let note: string | undefined;
  if (kind === "search_terms") {
    // a report downloaded from inside one campaign has no Campaign column: its rows cannot be told apart from the
    // full report's rows of the same campaign, so they would be counted twice. Such a file is refused.
    if (!rows.some((r) => String(r.campaign || "").trim())) {
      return { name, kind, rows: 0, first_day: null, last_day: null, skipped: true,
        note: "this report has no Campaign column (it was downloaded from inside one campaign); download the Search terms report for all campaigns instead" };
    }
    const named = rows.filter((r) => String(r.campaign || "").trim());
    keep = named.filter((r) => Number(r.clicks) > 0); // the review covers searches that got a click
    const parts = [];
    if (named.length < rows.length) parts.push(`${rows.length - named.length} rows without a campaign`);
    if (keep.length < named.length) parts.push(`${named.length - keep.length} rows with no clicks`);
    if (parts.length) note = `left out ${parts.join(" and ")}`;
  }
  if (kind === "campaign_days") {
    keep = rows.filter((r) => String(r.day) < exportedOn);
    if (keep.length < rows.length) note = `left out ${rows.length - keep.length} rows for ${exportedOn} or later (that day was not complete when the report was exported)`;
  }
  const t = kind as Table;
  writeJson(tablePath(t), mergeRows(t, readTable(t), keep));
  rememberSnapshot(kind, keep, exportedMs, name);
  const s = span(keep);
  recordFile({ name, kind, rows: keep.length, ...s, sha, note });
  return { name, kind, rows: keep.length, ...s, note };
}

type CellValue = string | number | boolean | Date | null | undefined | { [k: string]: unknown };

function cellToPlain(v: CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((p) => p.text).join("");
  if ("result" in o) return cellToPlain(o.result as CellValue);
  if ("text" in o) return String(o.text ?? "");
  if ("error" in o) return "";
  return "";
}

/** The agency STR workbook (.xlsx): one tab per day; read every tab with the engine's agency parser. */
export async function importAgencyWorkbook(buf: Buffer, name: string): Promise<ImportResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const rows: Record<string, unknown>[] = [];
  wb.eachSheet((ws) => {
    const values: unknown[][] = [];
    const cols = ws.columnCount;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const out: unknown[] = [];
      for (let c = 1; c <= cols; c++) out.push(cellToPlain(row.getCell(c).value as CellValue));
      values.push(out);
    }
    rows.push(...parseAgencyTab(ws.name, values));
  });
  if (!rows.length) return { name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "no agency STR tabs found in this workbook" };
  writeJson(tablePath("agency_calls"), rows);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const s = span(rows);
  recordFile({ name, kind: "agency_sheet", rows: rows.length, ...s, sha });
  return { name, kind: "agency_sheet", rows: rows.length, ...s };
}

/** The SEO month-to-month snapshot (data/app/seo.json, private; written from Search Console, GA4 and the CRM). */
export function seoSnapshot<T>(): T | null {
  return readJson<T | null>(path.join(DATA, "seo.json"), null);
}

/**
 * The agency STR sheet's ID. It lives in data/app/settings.json, private data that never goes into git as a plain
 * file (it travels only inside the encrypted vault), because anyone who has the ID of a sheet shared by link can read it.
 */
export function agencySheetId(): string | null {
  const id = String(readJson<{ agency_sheet_id?: unknown }>(settingsPath, {}).agency_sheet_id ?? "").trim();
  return SHEET_ID.test(id) ? id : null;
}

/** Save the agency sheet from a pasted Google Sheets link (or a bare ID). Returns the ID, or null when it is not one. */
export function setAgencySheet(linkOrId: string): string | null {
  const text = String(linkOrId ?? "").trim().slice(0, 500);
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{25,100})/.exec(text);
  const id = m ? m[1] : text;
  if (!SHEET_ID.test(id)) return null;
  writeJson(settingsPath, { ...readJson<Record<string, unknown>>(settingsPath, {}), agency_sheet_id: id });
  return id;
}

/** Download the agency's STR Google Sheet (works while it is shared by link) and load every tab. */
export async function refreshAgencySheet(): Promise<ImportResult> {
  const id = agencySheetId();
  if (!id) {
    return { name: "Agency STR sheet", kind: "agency_sheet", rows: 0, first_day: null, last_day: null,
      note: "the agency sheet's link is not saved on this computer yet: paste it in the box under the buttons" };
  }
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return { name: "Agency STR sheet", kind: "agency_sheet", rows: 0, first_day: null, last_day: null,
      note: "Google did not send the sheet. If its sharing was restricted, download it (File › Download › .xlsx) and drop the file on this page." };
  }
  return importAgencyWorkbook(buf, "Agency STR sheet (Google Sheets)");
}

const EXPORT_EXT = /\.(csv|tsv|xlsx)$/i;

/** Import every Google Ads export in a folder that has not been loaded yet (by content, not by name). */
export async function importFolder(dir: string, maxAgeDays = 21): Promise<ImportResult[]> {
  if (!fs.existsSync(dir)) return [];
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const known = new Set(loadedFiles().map((f) => f.sha));
  const files = fs.readdirSync(dir)
    .filter((n) => EXPORT_EXT.test(n))
    .map((n) => ({ n, p: path.join(dir, n), st: fs.statSync(path.join(dir, n)) }))
    .filter((f) => f.st.isFile() && f.st.mtimeMs >= cutoff && f.st.size <= MAX_BYTES)
    .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
  const out: ImportResult[] = [];
  for (const f of files) {
    const buf = fs.readFileSync(f.p);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (known.has(sha)) continue;
    if (/\.xlsx$/i.test(f.n)) {
      // only the agency STR workbook is read from .xlsx; other spreadsheets in Downloads are left alone
      if (!/str|search term/i.test(f.n)) continue;
      out.push(await importAgencyWorkbook(buf, f.n));
    } else {
      const r = importCsv(f.n, buf, todayIST(f.st.mtime), f.st.mtimeMs);
      if (r.kind !== "unknown") out.push(r);
    }
    known.add(sha);
  }
  return out;
}

export const downloadsDir = () => path.join(os.homedir(), "Downloads");
export const inboxDir = () => path.join(ROOT, "inbox");

/* ---------------------------------------------------------------- the model, rebuilt only when data changes */
let cache: { key: string; model: Model; review: ReviewRow[] } | null = null;

function dataKey(): string {
  const parts = [...TABLES.map((t) => tablePath(t)), filesPath, path.join(DATA, "projects.json")].map((p) => {
    try {
      return String(fs.statSync(p).mtimeMs);
    } catch {
      return "0";
    }
  });
  return parts.join("|") + "|" + todayIST();
}

export function config(): Record<string, unknown> {
  const cfg = defaultConfig();
  const overrides = readJson<Record<string, Record<string, unknown>> | null>(path.join(DATA, "projects.json"), null);
  if (overrides && Array.isArray(cfg.projects)) {
    cfg.projects = (cfg.projects as Record<string, unknown>[]).map((p) => ({ ...p, ...(overrides[String(p.id)] || {}) }));
  }
  return cfg;
}

export function getData(): { model: Model; review: ReviewRow[] } {
  const key = dataKey();
  if (cache && cache.key === key) return cache;
  const T: Record<string, unknown[]> = {};
  for (const t of TABLES) T[t] = readTable(t);
  const { model, review } = buildModel(T, config(), todayIST());
  cache = { key, model: model as Model, review: review as ReviewRow[] };
  return cache;
}

export const getModel = () => getData().model;
export const hasData = () => TABLES.some((t) => fs.existsSync(tablePath(t)));
