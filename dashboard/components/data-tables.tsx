"use client";
/** The two lists on the Import data page: every file loaded, and the agency sheet checked against Google's report. */
import * as React from "react";
import { Badge } from "./ui";
import { DataTable, type Column } from "./data-table";
import { dshort, inr, n0 } from "@/lib/format";
import { istTime, kindLabel } from "./data-kinds";

export interface FileRow extends Record<string, unknown> { name: string; kind: string; rows: number; first_day: string | null; last_day: string | null; loaded_at: string; note: string }
export interface CoverageRow extends Record<string, unknown> { day: string; report_rows: number; report_cost: number; sheet_rows: number; sheet_cost: number; cost_matches: boolean }

const fileCols: Column<FileRow>[] = [
  { key: "name", label: "File", sortable: true, render: (r) => <span className="block max-w-[280px] truncate font-medium" title={r.name}>{r.name}</span> },
  { key: "kind", label: "What it is", sortable: true, value: (r) => kindLabel(r.kind) },
  { key: "rows", label: "Rows", align: "right", sortable: true, render: (r) => <span className="tabular">{n0(r.rows)}</span> },
  { key: "first_day", label: "From", sortable: true, render: (r) => <span className="tabular">{dshort(r.first_day) || "–"}</span>, value: (r) => r.first_day ?? "" },
  { key: "last_day", label: "To", sortable: true, render: (r) => <span className="tabular">{dshort(r.last_day) || "–"}</span>, value: (r) => r.last_day ?? "" },
  { key: "loaded_at", label: "Loaded at (IST)", sortable: true, render: (r) => <span className="tabular">{istTime(r.loaded_at)}</span>, value: (r) => r.loaded_at },
  { key: "note", label: "Note", render: (r) => <span className="text-xs text-muted-foreground">{r.note || "–"}</span> },
];

export function FilesTable({ rows }: { rows: FileRow[] }) {
  return <DataTable rows={rows} columns={fileCols} csvName="files-loaded" initialSort={{ key: "loaded_at", dir: "desc" }} empty="No files loaded yet." />;
}

const covCols: Column<CoverageRow>[] = [
  { key: "day", label: "Day", sortable: true, render: (r) => <span className="tabular">{dshort(r.day) || "–"}</span> },
  { key: "report_rows", label: "Rows in Google", align: "right", sortable: true, render: (r) => <span className="tabular">{n0(r.report_rows)}</span> },
  { key: "sheet_rows", label: "Rows in sheet", align: "right", sortable: true, render: (r) => <span className="tabular">{n0(r.sheet_rows)}</span> },
  { key: "report_cost", label: "Cost in Google", align: "right", sortable: true, render: (r) => <span className="tabular">{inr(r.report_cost)}</span> },
  { key: "sheet_cost", label: "Cost in sheet", align: "right", sortable: true, render: (r) => <span className="tabular">{inr(r.sheet_cost)}</span> },
  { key: "cost_matches", label: "Match", sortable: true, value: (r) => (r.cost_matches ? "yes" : "no"),
    render: (r) => (r.cost_matches ? <Badge tone="good">Matches</Badge> : <Badge tone="bad">Does not match</Badge>) },
];

export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return <DataTable rows={rows} columns={covCols} csvName="agency-sheet-vs-google" initialSort={{ key: "day", dir: "desc" }} searchable={false} empty="No days to compare yet." />;
}
