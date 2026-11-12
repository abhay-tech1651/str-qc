"use client";
/** The import card on the Import data page: pull new exports from Downloads, refresh the agency sheet, or drop files. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, FolderDown, Loader2, MinusCircle, RefreshCw, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input } from "./ui";
import { cn, drange, n0, plural } from "@/lib/format";
import { kindLabel } from "./data-kinds";

interface Result { name: string; kind: string; rows: number; first_day: string | null; last_day: string | null; note?: string; skipped?: boolean }
type Job = "downloads" | "agency" | "files";

const BUSY_TEXT: Record<Job, string> = {
  downloads: "Looking in your Downloads folder for new Google Ads reports…",
  agency: "Downloading the agency's STR sheet from Google…",
  files: "Reading the files you added…",
};

const DONE_EMPTY: Record<Job, string> = {
  downloads: "No new reports found in Downloads. Only Google Ads exports from the last 21 days that are not loaded yet are picked up.",
  agency: "Google sent nothing back.",
  files: "No files were read.",
};

export function DataImport({ agencyLinkSet }: { agencyLinkSet: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Job | null>(null);
  const [last, setLast] = React.useState<{ job: Job; results: Result[]; error?: string } | null>(null);
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = React.useState(!agencyLinkSet);
  const [link, setLink] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [linkMsg, setLinkMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setLinkMsg(null);
    try {
      const res = await fetch("/api/import?source=agency-link", {
        method: "POST", headers: { "x-qc": "1", "content-type": "application/json" }, body: JSON.stringify({ link }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setLink("");
        setLinkOpen(false);
        setLinkMsg({ ok: true, text: "Link saved. Press Refresh the agency sheet to read it." });
        router.refresh();
      } else {
        setLinkMsg({ ok: false, text: body.error === "refused" ? "The dashboard refused the request. Reload the page and try again." : body.error || `The link was not saved (error ${res.status}).` });
      }
    } catch (err) {
      setLinkMsg({ ok: false, text: err instanceof Error ? err.message : "The dashboard could not be reached." });
    } finally {
      setSaving(false);
    }
  }

  async function run(job: Job, init: RequestInit, url: string) {
    setBusy(job);
    setLast(null);
    try {
      const res = await fetch(url, { method: "POST", ...init, headers: { "x-qc": "1", ...(init.headers || {}) } });
      const body = (await res.json().catch(() => ({}))) as { results?: Result[]; error?: string };
      if (!res.ok) {
        setLast({ job, results: [], error: body.error === "refused" ? "The dashboard refused the request. Reload the page and try again." : body.error || `The import failed (error ${res.status}).` });
      } else {
        const results = Array.isArray(body.results) ? body.results : [];
        setLast({ job, results });
        if (results.some((r) => r.rows > 0)) router.refresh();
      }
    } catch (e) {
      setLast({ job, results: [], error: e instanceof Error ? e.message : "The dashboard could not be reached." });
    } finally {
      setBusy(null);
    }
  }

  function sendFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
      form.append("lastModified", String(f.lastModified));
    }
    run("files", { body: form }, "/api/import");
  }

  const loaded = last?.results.filter((r) => r.rows > 0).length ?? 0;

  return (
    <Card>
      <CardHeader title="Bring in new data" description="Press the first button every morning after downloading the two reports. The other two are for the agency sheet and for files saved somewhere else." />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={!!busy} onClick={() => run("downloads", {}, "/api/import?source=downloads")}
            className="group flex items-start gap-3 rounded-xl border bg-primary p-4 text-left text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">{busy === "downloads" ? <Loader2 className="size-4 animate-spin" /> : <FolderDown className="size-4" />}</span>
            <span>
              <span className="block text-sm font-semibold">Import new reports from Downloads</span>
              <span className="mt-0.5 block text-xs opacity-80">Reads every Google Ads export in your Downloads folder that is not loaded yet.</span>
            </span>
          </button>
          <button type="button" disabled={!!busy} onClick={() => run("agency", {}, "/api/import?source=agency")}
            className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted disabled:opacity-60">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">{busy === "agency" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</span>
            <span>
              <span className="block text-sm font-semibold">Refresh the agency sheet</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Downloads the agency&apos;s STR Google Sheet and reads every day&apos;s tab.</span>
            </span>
          </button>
        </div>

        {linkOpen ? (
          <form onSubmit={saveLink} className="rounded-xl border bg-muted/30 p-4">
            <label htmlFor="agency-link" className="text-sm font-medium">Agency sheet link</label>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              Open the agency&apos;s STR sheet in Google Sheets, copy the address from the browser bar and paste it here. It is kept only on this computer and inside your locked data file, never in the code.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input id="agency-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"
                autoComplete="off" spellCheck={false} className="flex-1" />
              <Button type="submit" disabled={saving || !link.trim()}>{saving ? <Loader2 className="animate-spin" /> : null}Save link</Button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => { setLinkOpen(true); setLinkMsg(null); }}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Change the agency sheet link
          </button>
        )}
        {linkMsg ? <p className={cn("text-[13px]", linkMsg.ok ? "text-good" : "text-bad")} role="status">{linkMsg.text}</p> : null}

        <div
          onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) sendFiles(e.dataTransfer.files); }}
          className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors", over ? "border-primary bg-primary/5" : "bg-muted/30")}>
          <Upload className="mb-2 size-6 text-muted-foreground" />
          <div className="text-sm font-medium">Drop Google Ads exports here</div>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">CSV reports from Google Ads, or the agency sheet saved as .xlsx. The type is read from inside each file. Up to 20 files, each under 15 MB.</p>
          <Button variant="outline" size="sm" className="mt-3" disabled={!!busy} onClick={() => input.current?.click()}><FileSpreadsheet /> Choose files</Button>
          <input ref={input} type="file" multiple hidden accept=".csv,.tsv,.xlsx,text/csv"
            onChange={(e) => { sendFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {busy ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm" role="status">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>{BUSY_TEXT[busy]}</span>
            <div className="ml-auto h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
          </div>
        ) : null}

        {last ? (
          <div className="rounded-lg border" role="status">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm">
              {last.error ? <AlertCircle className="size-4 text-bad" /> : loaded ? <CheckCircle2 className="size-4 text-good" /> : <MinusCircle className="size-4 text-muted-foreground" />}
              <span className="font-medium">
                {last.error ? "The import did not finish" : loaded ? `${loaded} ${plural(loaded, "file")} loaded. Every page now shows the new data.` : "Nothing new was loaded"}
              </span>
            </div>
            {last.error ? <p className="px-4 py-3 text-sm text-bad">{last.error}</p> : null}
            {!last.error && !last.results.length ? <p className="px-4 py-3 text-sm text-muted-foreground">{DONE_EMPTY[last.job]}</p> : null}
            {last.results.length ? (
              <ul className="divide-y">
                {last.results.map((r, i) => {
                  const ok = r.rows > 0;
                  const same = r.skipped || r.kind === "already loaded";
                  return (
                    <li key={`${r.name}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> : same ? <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular">
                          {ok ? <>{n0(r.rows)} {plural(r.rows, "row")}{drange(r.first_day, r.last_day) ? ` · ${drange(r.first_day, r.last_day)}` : ""}</> : same ? "Skipped" : "Not loaded"}
                          {r.note ? ` · ${r.note}` : ""}
                        </div>
                      </div>
                      <Badge tone={ok ? "good" : same ? "muted" : "bad"}>{kindLabel(r.kind)}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
