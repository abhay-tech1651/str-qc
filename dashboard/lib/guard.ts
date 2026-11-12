import "server-only";

/**
 * Every request that changes data must come from this dashboard's own pages: same origin and a custom header that a
 * page on another website cannot send. The server also listens on 127.0.0.1 only (see package.json).
 */
export function refuseForeign(req: Request): Response | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") ?? "";
  const okHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const okOrigin = !origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (!okHost || !okOrigin || req.headers.get("x-qc") !== "1") {
    return Response.json({ error: "refused" }, { status: 403 });
  }
  return null;
}
