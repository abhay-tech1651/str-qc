import { NextResponse, type NextRequest } from "next/server";

/**
 * Every request, page or file, must name an allowed host. On this computer that is 127.0.0.1 or localhost. When the
 * dashboard is shared privately (docs/REMOTE_ACCESS.md), QC_ALLOWED_HOSTS lists the private names it is served under,
 * for example the Tailscale name "county-qc.tailXXXX.ts.net". Anything else is refused: this stops "DNS rebinding",
 * where a website points its own domain at the dashboard so a browser tab on that site could read its pages.
 */
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;
const EXTRA = (process.env.QC_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const bare = host.replace(/:\d+$/, "");
  if (!LOCAL_HOST.test(host) && !EXTRA.includes(bare)) {
    return new NextResponse("Refused. Open the dashboard at its private address.", {
      status: 403, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}
