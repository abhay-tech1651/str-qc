import { NextResponse, type NextRequest } from "next/server";

/**
 * Every request, page or file, must name this computer as its host. The server already listens on 127.0.0.1 only;
 * this check also stops "DNS rebinding", where a website points its own domain at 127.0.0.1 so that a browser tab on
 * that website could read the dashboard's pages (search terms, spend, agency comments) while the dashboard runs.
 */
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

export function proxy(request: NextRequest) {
  if (!LOCAL_HOST.test(request.headers.get("host") ?? "")) {
    return new NextResponse("Refused. Open the dashboard at http://127.0.0.1:3000 on this computer.", {
      status: 403, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}
