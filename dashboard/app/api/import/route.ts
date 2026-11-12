import { refuseForeign } from "@/lib/guard";
import { downloadsDir, importAgencyWorkbook, importCsv, importFolder, inboxDir, refreshAgencySheet, setAgencySheet, todayIST, type ImportResult } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST multipart "files" (+ "lastModified" per file)  -> import dropped files
 * POST ?source=downloads | inbox                       -> import new Google Ads exports from that folder
 * POST ?source=agency                                  -> download and load the agency STR Google Sheet
 * POST ?source=agency-link  JSON {link}                 -> save the agency sheet's link on this computer (data/app)
 */
export async function POST(req: Request) {
  const refused = refuseForeign(req);
  if (refused) return refused;
  const source = new URL(req.url).searchParams.get("source");
  try {
    if (source === "downloads") return Response.json({ results: await importFolder(downloadsDir()) });
    if (source === "inbox") return Response.json({ results: await importFolder(inboxDir(), 3650) });
    if (source === "agency") return Response.json({ results: [await refreshAgencySheet()] });
    if (source === "agency-link") {
      const body = (await req.json().catch(() => ({}))) as { link?: unknown };
      const id = setAgencySheet(typeof body.link === "string" ? body.link : "");
      return id ? Response.json({ ok: true }) : Response.json({ error: "That is not a Google Sheets link. Copy the link from the address bar of the agency's sheet." }, { status: 400 });
    }

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f).slice(0, MAX_FILES);
    const stamps = form.getAll("lastModified").map((s) => Number(s));
    const results: ImportResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = String(f.name || "file").slice(0, 200);
      if (f.size > MAX_BYTES) { results.push({ name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "larger than 15 MB" }); continue; }
      if (!/\.(csv|tsv|xlsx)$/i.test(name)) { results.push({ name, kind: "unknown", rows: 0, first_day: null, last_day: null, note: "only .csv and .xlsx files" }); continue; }
      const buf = Buffer.from(await f.arrayBuffer());
      const exportedOn = todayIST(Number.isFinite(stamps[i]) && stamps[i] > 0 ? new Date(stamps[i]) : new Date());
      const exportedMs = Number.isFinite(stamps[i]) && stamps[i] > 0 ? stamps[i] : Date.now();
      results.push(/\.xlsx$/i.test(name) ? await importAgencyWorkbook(buf, name) : importCsv(name, buf, exportedOn, exportedMs));
    }
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
