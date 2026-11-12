import fs from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "@/lib/root";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The County Search Ads Handbook (docs/handbook.html, our own static file), served as a full page. */
export async function GET() {
  let body: string;
  try {
    body = await fs.readFile(path.join(repoRoot(), "docs", "handbook.html"), "utf8");
  } catch {
    return new Response("The handbook file (docs/handbook.html) was not found.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
