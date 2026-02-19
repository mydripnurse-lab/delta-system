import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: false, error: "Self-signup is disabled." }, { status: 403 });
}

