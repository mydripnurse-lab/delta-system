import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

const SETTING_KEY = "projects_kpis_filters_v1";

type Preset = "7d" | "28d" | "3m" | "6m" | "1y" | "custom";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toPreset(v: unknown): Preset {
  const raw = s(v).toLowerCase();
  if (raw === "7d" || raw === "28d" || raw === "3m" || raw === "6m" || raw === "1y" || raw === "custom") {
    return raw;
  }
  return "28d";
}

function toCompare(v: unknown) {
  const raw = s(v).toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return 0;
  return 1;
}

function toIsoDay(v: unknown) {
  const raw = s(v);
  if (!raw) return "";
  return raw.slice(0, 10);
}

function normalizePayload(input: Record<string, unknown>) {
  return {
    preset: toPreset(input.preset),
    compare: toCompare(input.compare),
    start: toIsoDay(input.start),
    end: toIsoDay(input.end),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const pool = getDbPool();
    const q = await pool.query<{ payload: Record<string, unknown> | null }>(
      `
        select payload
        from app.agency_settings
        where setting_key = $1
        limit 1
      `,
      [SETTING_KEY],
    );
    const payload = q.rows[0]?.payload || {};
    const normalized = normalizePayload(payload);
    return NextResponse.json({ ok: true, settingKey: SETTING_KEY, payload: normalized });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = normalizePayload(body);
    const pool = getDbPool();
    await pool.query(
      `
        insert into app.agency_settings (setting_key, payload)
        values ($1, $2::jsonb)
        on conflict (setting_key)
        do update set
          payload = excluded.payload,
          updated_at = now()
      `,
      [SETTING_KEY, JSON.stringify(payload)],
    );
    return NextResponse.json({ ok: true, settingKey: SETTING_KEY, payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
