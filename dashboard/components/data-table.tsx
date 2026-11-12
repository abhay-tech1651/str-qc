"use client";
/** A table with search, sorting, paging and a safe CSV download. Every cell is rendered as React text (escaped). */
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button, Input } from "./ui";
import { cn } from "@/lib/format";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  render?: (row: T) => React.ReactNode;
  value?: (row: T) => string | number | null | undefined; // used for sorting, searching and CSV
  sortable?: boolean;
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // never let a spreadsheet run a search term as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable<T extends Record<string, unknown>>({
  rows, columns, pageSize = 10, searchable = true, csvName, onRowClick, empty = "Nothing here.", initialSort, toolbar,
}: {
  rows: T[]; columns: Column<T>[]; pageSize?: number; searchable?: boolean; csvName?: string;
  onRowClick?: (row: T) => void; empty?: React.ReactNode; initialSort?: { key: string; dir: "asc" | "desc" }; toolbar?: React.ReactNode;
}) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [page, setPage] = React.useState(0);
  const val = React.useCallback((c: Column<T>, r: T) => (c.value ? c.value(r) : (r[c.key] as string | number | null | undefined)), []);

  const filtered = React.useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter((r) => columns.some((c) => String(val(c, r) ?? "").toLowerCase().includes(s)));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) {
        out = [...out].sort((a, b) => {
          const x = val(c, a), y = val(c, b);
          const cmp = typeof x === "number" || typeof y === "number" ? (Number(x ?? -Infinity) - Number(y ?? -Infinity)) : String(x ?? "").localeCompare(String(y ?? ""));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, q, sort, columns, val]);

  React.useEffect(() => setPage(0), [q, sort, rows]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);

  const download = () => {
    const text = [columns.map((c) => csvCell(c.label)).join(","), ...filtered.map((r) => columns.map((c) => csvCell(val(c, r))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${csvName ?? "table"}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {(searchable || csvName || toolbar) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this table" className="pl-9" aria-label="Search this table" />
            </div>
          ) : null}
          {toolbar}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular">{filtered.length.toLocaleString("en-IN")} rows</span>
            {csvName ? (
              <Button variant="outline" size="sm" onClick={download} disabled={!filtered.length}><Download /> CSV</Button>
            ) : null}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((c) => {
                const canSort = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}
                    className={cn("whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground", c.align === "right" ? "text-right" : "text-left")}>
                    {canSort ? (
                      <button type="button" className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                        onClick={() => setSort(active && sort?.dir === "desc" ? { key: c.key, dir: "asc" } : { key: c.key, dir: "desc" })}>
                        {c.label}
                        {active ? (sort?.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : null}
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length ? shown.map((r, i) => (
              <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn("border-b last:border-0 transition-colors hover:bg-muted/40", onRowClick && "cursor-pointer")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-2.5 align-top", c.align === "right" && "text-right tabular whitespace-nowrap")}>
                    {c.render ? c.render(r) : String(val(c, r) ?? "")}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular">Page {page + 1} of {pages}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page"><ChevronLeft /></Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page"><ChevronRight /></Button>
        </div>
      ) : null}
    </div>
  );
}
