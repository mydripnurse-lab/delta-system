import { NextResponse } from "next/server";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type MockBody = {
  locationId?: string;
  url?: string;
  openActivationUrl?: string;
  maxAttempts?: number;
  intervalMs?: number;
  steps?: unknown;
  variables?: unknown;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as MockBody | null;
  const locationId = s(body?.locationId);
  const url = s(body?.openActivationUrl || body?.url);
  if (!locationId) {
    return NextResponse.json({ ok: false, error: "Missing locationId" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    clicked: "mock:connect-domain-button",
    attempts: 1,
    lastResult: `mock-ok locationId=${locationId} url=${url}`,
    received: {
      locationId,
      url,
      maxAttempts: Number(body?.maxAttempts || 0),
      intervalMs: Number(body?.intervalMs || 0),
      steps: body?.steps ?? null,
      variables: body?.variables ?? null,
    },
  });
}
