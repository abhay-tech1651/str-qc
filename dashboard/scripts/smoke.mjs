/**
 * Smoke check of the running dashboard: every page answers 200, renders real content, and never shows
 * "NaN", "undefined", "[object Object]" or "Infinity" as text. Usage: node scripts/smoke.mjs [baseUrl]
 */
const base = process.argv[2] || "http://127.0.0.1:3000";
const pages = [
  "/", "/issues", "/projects/ivory", "/projects/clove", "/projects/cocoa", "/projects/jade",
  "/projects/ivory?tab=campaigns", "/projects/ivory?tab=terms", "/projects/ivory?tab=keywords", "/projects/ivory?tab=agency", "/projects/ivory?tab=ctm",
  "/agency", "/agency?tab=risky", "/search-terms", "/search-terms?project=clove", "/campaigns", "/keywords", "/competitors", "/data", "/help", "/handbook",
];
const bad = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b/;
let failed = 0;
for (const p of pages) {
  const t0 = Date.now();
  const res = await fetch(base + p);
  const html = await res.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
  const hit = text.match(bad);
  const ok = res.status === 200 && !hit;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${String(Date.now() - t0).padStart(5)} ms  ${p}${hit ? `  shows "${hit[0]}" near: ${text.slice(Math.max(0, hit.index - 60), hit.index + 40).replace(/\s+/g, " ")}` : ""}`);
}
const notFound = await fetch(base + "/projects/unknown");
console.log(`${notFound.status === 404 ? "ok  " : "FAIL"} ${notFound.status} unknown project is a 404`);
if (notFound.status !== 404) failed++;
const foreign = await fetch(base + "/api/import?source=inbox", { method: "POST" });
console.log(`${foreign.status === 403 ? "ok  " : "FAIL"} ${foreign.status} a POST without the dashboard's header is refused`);
if (foreign.status !== 403) failed++;
process.exit(failed ? 1 : 0);
