"use client";
/** Competitors page parts: impression share bars and the auction insights table. */
import * as React from "react";
import { Badge, Explain } from "./ui";
import { DataTable, type Column } from "./data-table";
import { HBars } from "./charts";
import { pct } from "@/lib/format";
import type { Competitors } from "@/lib/types";

type Raw = Competitors["rows"][number];
type Row = { r: Raw; name: string; us: boolean; portal: boolean; key: string };

const US = "County Group (us)";
const PORTALS = ["99acres.com", "housing.com"];
const toRow = (r: Raw, i: number): Row => {
  const d = r.domain ?? "";
  const us = d === "You";
  return { r, name: us ? US : d || "–", us, portal: PORTALS.includes(d.toLowerCase()), key: `${r.domain}|${i}` };
};

export function ShareBars({ rows }: { rows: Raw[] }) {
  const data = rows.map(toRow).filter((x) => x.r.impression_share !== null && x.r.impression_share !== undefined)
    .map((x) => ({ name: x.name, share: x.r.impression_share as number, color: x.us ? "var(--primary)" : x.portal ? "var(--p-other)" : "var(--info)" }))
    .sort((a, b) => b.share - a.share);
  if (!data.length) return <p className="text-sm text-muted-foreground">Google reported no advertiser above 10% for these dates.</p>;
  return <HBars data={data} valueKey="share" labelKey="name" color={(r) => String(r.color)} fmt={(v) => pct(v, 1)} />;
}

const cell = (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-muted-foreground">–</span> : pct(v, 1));

export function AuctionTable({ rows }: { rows: Raw[] }) {
  const data = rows.map(toRow);
  const columns: Column<Row>[] = [
    { key: "name", label: "Advertiser", value: (x) => x.name, render: (x) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className={x.us ? "font-semibold" : "font-medium"}>{x.name}</span>
        {x.portal ? <Badge tone="muted">property portal</Badge> : null}
      </span>
    ) },
    { key: "is", label: "Showed on our searches", align: "right", value: (x) => x.r.impression_share ?? (x.r.impression_share_raw ? 0 : null), render: (x) => x.r.impression_share_raw || "–" },
    { key: "overlap", label: "Same auction as us", align: "right", value: (x) => x.r.overlap_rate, render: (x) => cell(x.r.overlap_rate) },
    { key: "above", label: "Ad above ours", align: "right", value: (x) => x.r.position_above_rate, render: (x) => cell(x.r.position_above_rate) },
    { key: "top", label: "Top of page", align: "right", value: (x) => x.r.top_of_page_rate, render: (x) => cell(x.r.top_of_page_rate) },
    { key: "beat", label: "We beat them", align: "right", value: (x) => x.r.outranking_share, render: (x) => cell(x.r.outranking_share) },
  ];
  return (
    <>
      <DataTable rows={data} columns={columns} csvName="auction-insights" initialSort={{ key: "is", dir: "desc" }} searchable={data.length > 10} pageSize={20} />
      <Explain>Our own row has no “same auction”, “above ours” or “we beat them” figures: those compare another advertiser with us. “&lt; 10%” is how Google reports a share too small to state exactly.</Explain>
    </>
  );
}
