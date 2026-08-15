import { NextResponse } from "next/server";

import { clearClientSessionCookies, isTrustedClientRequest } from "@/lib/clientPortalAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const response = acceptsHtml
    ? NextResponse.redirect(new URL("/login?logged_out=1", request.url), 303)
    : NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });

  for (const cookie of clearClientSessionCookies()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
