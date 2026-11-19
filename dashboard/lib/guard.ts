import "server-only";

/**
 * Every request that changes data must come from this dashboard's own pages on the owner's computer: host and origin
 * 127.0.0.1 or localhost, plus a custom header that a page on another website cannot send. When the dashboard is shared
 * privately (QC_ALLOWED_HOSTS, docs/REMOTE_ACCESS.md), other people can read it but never import or change data;
 * a shared copy also sets QC_READ_ONLY=1, which refuses every change even from its own machine.
 */
export function refuseForeign(req: Request): Response | null {
  if (process.env.QC_READ_ONLY === "1") {
    return Response.json({ error: "This is the shared, read-only copy. Import data on the owner's computer, then Save data to GitHub." }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") ?? "";
  const okHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const okOrigin = !origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (!okHost || !okOrigin || req.headers.get("x-qc") !== "1") {
    return Response.json({ error: "Imports and changes work only on the owner's computer." }, { status: 403 });
  }
  return null;
}

/** True on the shared read-only copy (hides the import buttons). */
export const readOnly = () => process.env.QC_READ_ONLY === "1";
