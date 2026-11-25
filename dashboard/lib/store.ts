import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModel, defaultConfig, engineHelpers, mergeRows, parseAgencyTab, parseExport } from "./engine";
import { isInventory, parseInventory, type Inventory } from "./neg-inventory-core";
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

const SHARE_FIELDS = ["is_pct", "lost_budget_pct", "lost_rank_pct", "top_is_pct", "abs_top_is_pct"] as const;

/** Split one line of a Google Ads export (tab-separated, or comma-separated with quotes). */
function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Campaigns in a campaign report whose "Campaign type" is not Search, with their type. Empty when there is no such column. */
export function nonSearchCampaigns(text: string): Map<string, string> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const hi = lines.findIndex((l) => /(^|[\t,])"?Campaign type"?([\t,]|$)/.test(l) && /(^|[\t,])"?Campaign"?([\t,]|$)/.test(l));
  const out = new Map<string, string>();
  if (hi < 0) return out;
  const sep = lines[hi].includes("\t") ? "\t" : ",";
  const head = splitLine(lines[hi], sep);
  const ci = head.indexOf("Campaign"), ti = head.indexOf("Campaign type");
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const c = splitLine(l, sep);
    const name = c[ci] ?? "", type = c[ti] ?? "";
    if (name && type && type !== "Search" && !/^total/i.test(c[0] ?? "")) out.set(name, type);
  }
  return out;
}

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

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * The last complete day a Google Ads export covers: the end of the period on its second line ("6 November 2026 - 13 November 2026"),
 * but never the day it was downloaded (that day was not over yet). Used for the change history, whose rows stop at the last change.
 */
export function periodEnd(text: string, exportedOn: string): string | null {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/)[1] ?? "";
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(line.trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  if (mi < 0) return null;
  const end = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const [y, mo, d] = exportedOn.split("-").map(Number);
  const dayBefore = new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
  return end < dayBefore ? end : dayBefore;
}

export function importCsv(name: string, buf: Buffer, exportedOn: string, exportedMs = Date.now()): ImportResult {
  if (buf.length > MAX_BYTES) return { name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "larger than 15 MB" };
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (loadedFiles().some((f) => f.sha === sha)) return { name, kind: "already loaded", rows: 0, first_day: null, last_day: null, skipped: true, note: "this exact file is already loaded" };
  const text = decodeText(buf);
  if (isInventory(text)) return importInventory(name, text, sha, exportedOn, exportedMs);
  const { kind, rows } = parseExport(text);
  // a keyword report for "All time" has no period end: it is the keyword list as it stood when it was downloaded
  let allTime = false;
  if (kind === "keywords") for (const r of rows) if (!r.day) { r.day = exportedOn; allTime = true; }
  if (kind === "unknown" || !rows.length) {
    const head = text.slice(0, 3000);
    const campaignTotals = /	Campaign	|^Campaign	/m.test(head) && /Search impr\. share/.test(head) && !/	Day	|^Day	/m.test(head);
    return { name, kind: "unknown", rows: 0, first_day: null, last_day: null,
      note: campaignTotals ? "this campaign report has no Day column: in Google Ads › Campaigns, use Segment › Time › Day, then download again" : "not a Google Ads export this dashboard reads" };
  }
  if (kind === "search_terms") {
    // a search terms report has no Day column: one covering several days cannot be split into days, so it is refused
    const period = text.replace(/^\uFEFF/, "").split(/\r?\n/)[1] ?? "";
    const ends = period.split(" - ").map((x) => x.trim()).filter(Boolean);
    const hasDay = /^Day[\t,]Search term/m.test(text.slice(0, 3000));
    if (ends.length === 2 && ends[0] !== ends[1] && !hasDay) {
      return { name, kind, rows: 0, first_day: null, last_day: null, skipped: true,
        note: `this report covers several days (${period.trim()}); in Google Ads add Segment › Time › Day before downloading, so each day's numbers stay right` };
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
    const clicked = named.filter((r) => Number(r.clicks) > 0); // the review covers searches that got a click
    // the day the report was downloaded was not finished yet: its rows would show a part day as if it were whole
    keep = clicked.filter((r) => !r.day || String(r.day) < exportedOn);
    const parts = [];
    if (named.length < rows.length) parts.push(`${rows.length - named.length} rows without a campaign`);
    if (clicked.length < named.length) parts.push(`${named.length - clicked.length} rows with no clicks`);
    if (keep.length < clicked.length) parts.push(`${clicked.length - keep.length} rows for ${exportedOn} or later (that day was not complete when the report was exported)`);
    if (parts.length) note = `left out ${parts.join(" and ")}`;
  }
  if (kind === "campaign_days") {
    // this dashboard checks search campaigns: Performance Max, Display and Video rows would add their spend and
    // conversions to the projects, so a report downloaded for all campaign types keeps only its Search rows
    const other = nonSearchCampaigns(text);
    const search = rows.filter((r) => !other.has(String(r.campaign)));
    const whole = search.filter((r) => String(r.day) < exportedOn);
    // a report without the impression-share columns must not wipe the shares an earlier report brought for the same day
    const old = new Map(readTable("campaign_days").map((r) => [`${r.day}|${r.campaign}`, r]));
    keep = whole.map((r) => {
      const o = old.get(`${r.day}|${r.campaign}`);
      if (!o) return r;
      const out = { ...r };
      for (const k of SHARE_FIELDS) if ((out[k] === null || out[k] === undefined) && o[k] !== null && o[k] !== undefined) out[k] = o[k];
      return out;
    });
    const parts = [];
    if (search.length < rows.length) parts.push(`${rows.length - search.length} rows of ${other.size} campaigns that are not search campaigns (${[...new Set([...other.values()])].join(", ")})`);
    if (whole.length < search.length) parts.push(`${search.length - whole.length} rows for ${exportedOn} or later (that day was not complete when the report was exported)`);
    if (parts.length) note = `left out ${parts.join(" and ")}`;
  }
  if (allTime) note = `covers all time: dated ${exportedOn}, the day it was downloaded (costs are all-time totals)`;
  const t = kind as Table;
  writeJson(tablePath(t), mergeRows(t, readTable(t), keep));
  rememberSnapshot(kind, keep, exportedMs, name);
  const s = span(keep);
  const covers_to = kind === "changes" ? periodEnd(text, exportedOn) : null;
  recordFile({ name, kind, rows: keep.length, ...s, sha, note, ...(covers_to ? { covers_to } : {}) });
  return { name, kind, rows: keep.length, ...s, note };
}

/* ---------------------------------------------------------------- every negative in the account today */
const inventoryPath = path.join(DATA, "negative_inventory.json");

/** The last "Negative keyword report" loaded: every negative in the account when it was downloaded. */
export function readInventory(): Inventory | null {
  return readJson<Inventory | null>(inventoryPath, null);
}

/** The negative keyword report is a snapshot of the whole account: the newest download replaces the one before. */
function importInventory(name: string, text: string, sha: string, exportedOn: string, exportedMs: number): ImportResult {
  const prev = readInventory();
  if (prev && (prev.exported_ms ?? 0) > exportedMs) {
    recordFile({ name, kind: "negative_inventory", rows: 0, first_day: null, last_day: null, sha, note: `skipped: a newer negative keyword report is already loaded (${prev.name})` });
    return { name, kind: "negative_inventory", rows: 0, first_day: null, last_day: null, skipped: true, note: `a newer negative keyword report is already loaded (${prev.name})` };
  }
  const inv = parseInventory(engineHelpers(), text, exportedOn, name);
  if (!inv.negatives.length) return { name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "no negatives found in this negative keyword report" };
  writeJson(inventoryPath, { ...inv, exported_ms: exportedMs });
  const note = `${inv.negatives.length.toLocaleString("en-IN")} negatives and ${inv.lists.length} shared-list links, as of ${exportedOn}`;
  recordFile({ name, kind: "negative_inventory", rows: inv.negatives.length, first_day: exportedOn, last_day: exportedOn, sha, note });
  return { name, kind: "negative_inventory", rows: inv.negatives.length, first_day: exportedOn, last_day: exportedOn, note };
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
const cache = new Map<string, { key: string; model: Model; review: ReviewRow[] }>();

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
  const through = loadedFiles().filter((f) => f.kind === "changes" && f.covers_to).map((f) => String(f.covers_to)).sort().pop();
  if (through) cfg.changes_through = through;
  return cfg;
}

/* ---------------------------------------------------------------- the period filter */
export type Period = { key: string; from: string; to: string } | null;
export const PERIOD_KEYS = ["all", "last7", "last14", "last30", "month", "lastmonth"] as const;

const addDay = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The last day with complete data: the newest campaign or search-term day, never today. */
export function lastCompleteDay(): string {
  const yesterday = addDay(todayIST(), -1);
  const days = [...readTable("campaign_days"), ...readTable("search_terms")].map((r) => String(r.day ?? "")).filter((d) => ISO.test(d));
  const max = days.sort().pop() ?? yesterday;
  return max < yesterday ? max : yesterday;
}

/** A period key ("last14", "month", "custom:2026-11-01:2026-11-12", ...) as dates; "all" or anything unknown is null. */
export function resolvePeriod(key: string | undefined | null): Period {
  const k = String(key ?? "all");
  const last = lastCompleteDay();
  const n = /^last(7|14|30)$/.exec(k);
  if (n) return { key: k, from: addDay(last, -(Number(n[1]) - 1)), to: last };
  if (k === "month") return { key: k, from: `${last.slice(0, 8)}01`, to: last };
  if (k === "lastmonth") {
    const end = addDay(`${last.slice(0, 8)}01`, -1);
    return { key: k, from: `${end.slice(0, 8)}01`, to: end };
  }
  const c = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(k);
  if (c && c[1] <= c[2]) return { key: k, from: c[1], to: c[2] < last ? c[2] : last };
  return null;
}

const PERIOD_NAME: Record<string, string> = { last7: "the last 7 days", last14: "the last 14 days", last30: "the last 30 days", month: "this month so far", lastmonth: "last month" };

/**
 * The model for a period. With a period, the agency sheet and the search terms are cut to its days, and the engine's
 * "last 7 days" becomes the period (compared with the same number of days just before). Without one, nothing changes.
 */
export function getData(period: Period = null): { model: Model; review: ReviewRow[] } {
  const key = `${dataKey()}|${period ? `${period.from}:${period.to}` : "all"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const T: Record<string, unknown[]> = {};
  for (const t of TABLES) T[t] = readTable(t);
  const cfg = config();
  if (period) {
    const inP = (r: unknown) => { const d = String((r as { day?: unknown }).day ?? ""); return d >= period.from && d <= period.to; };
    T.search_terms = T.search_terms.filter(inP);
    T.agency_calls = T.agency_calls.filter(inP);
    cfg.period = { from: period.from, to: period.to };
  }
  const { model, review } = buildModel(T, cfg, todayIST());
  const m = model as Model;
  const w = m.windows.last7;
  const days = w && w.from && w.to ? Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86400000) + 1 : 7;
  m.period = period
    ? { key: period.key, from: period.from, to: period.to, name: PERIOD_NAME[period.key] ?? "the chosen days", prev: `the ${days} days before` }
    : { key: "all", from: null, to: null, name: "the last 7 days", prev: "the 7 days before" };
  const entry = { key, model: m, review: review as ReviewRow[] };
  if (cache.size > 12) cache.clear();
  cache.set(key, entry);
  return entry;
}

export const getModel = () => getData().model;
export const hasData = () => TABLES.some((t) => fs.existsSync(tablePath(t)));
