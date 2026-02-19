import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const cookie = buildClearSessionCookie();
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookie,
    },
  });
}
