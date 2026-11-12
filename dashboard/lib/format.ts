/** Formatting used on every page: Indian rupees and grouping, lakhs, percentages, dates, plurals. */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const grouped1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export const inr = (v: unknown) => (isNum(v) ? (v < 0 ? "-₹" : "₹") + grouped.format(Math.abs(Math.round(v))) : "–");
export const lakh = (v: unknown) => {
  if (!isNum(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e7) return `${v < 0 ? "-" : ""}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${v < 0 ? "-" : ""}₹${(a / 1e5).toFixed(2)} L`;
  return inr(v);
};
export const n0 = (v: unknown) => (isNum(v) ? grouped.format(Math.round(v)) : "–");
export const n1 = (v: unknown) => (isNum(v) ? grouped1.format(v) : "–");
export const pct = (v: unknown, d = 0) => (isNum(v) ? `${v.toFixed(d)}%` : "–");
export const num = (v: unknown) => (isNum(v) ? v : null);

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const parts = (d: string) => d.split("-").map(Number);
const valid = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d);

export const dshort = (d?: string | null) => (valid(d) ? `${parts(d)[2]} ${MON[parts(d)[1] - 1]}` : "");
export const drange = (a?: string | null, b?: string | null) => (!valid(a) ? "" : !valid(b) || a === b ? dshort(a) : `${dshort(a)} – ${dshort(b)}`);
export const dlong = (d?: string | null) => {
  if (!valid(d)) return "";
  const [y, m, dd] = parts(d);
  return `${DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}, ${dd} ${MONTH[m - 1]} ${y}`;
};
export const plural = (n: number | null | undefined, one: string, many?: string) => (n === 1 ? one : many ?? `${one}s`);

/** Change against the previous period, in words and as a number. */
export function change(cur: number | null | undefined, prev: number | null | undefined) {
  if (!isNum(cur) || !isNum(prev) || prev === 0) return { pct: null as number | null, label: "", dir: "flat" as const };
  const p = (100 * (cur - prev)) / prev;
  const dir = Math.abs(p) < 5 ? ("flat" as const) : p > 0 ? ("up" as const) : ("down" as const);
  return { pct: p, label: dir === "flat" ? "steady" : `${p > 0 ? "+" : "−"}${Math.round(Math.abs(p))}%`, dir };
}

export const PROJECT_VAR: Record<string, string> = {
  ivory: "var(--p-ivory)", clove: "var(--p-clove)", cocoa: "var(--p-cocoa)", jade: "var(--p-jade)", other: "var(--p-other)",
};
export const pcolor = (id: string) => PROJECT_VAR[id] ?? PROJECT_VAR.other;

export function priceLabel(p: { starting_price_cr: number | null; max_price_cr: number | null }) {
  if (isNum(p.starting_price_cr) && isNum(p.max_price_cr)) return `₹${p.starting_price_cr}–${p.max_price_cr} Cr`;
  if (isNum(p.starting_price_cr)) return `from ₹${p.starting_price_cr} Cr`;
  return "";
}
