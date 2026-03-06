import { NextResponse } from "next/server";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function readMapsApiKey(tenantId: string) {
  const integration = await getTenantIntegration(tenantId, "custom", "solar_survey");
  const cfg = integration?.config && typeof integration.config === "object"
    ? (integration.config as Record<string, unknown>)
    : {};
  return s(cfg.googleMapsApiKey);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = s(url.searchParams.get("tenantId"));
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId." }, { status: 400 });
    }
    const mapsApiKey = await readMapsApiKey(tenantId);
    return NextResponse.json({
      ok: true,
      mapsApiKey,
      hasMapsApiKey: !!mapsApiKey,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

