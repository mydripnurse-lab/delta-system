import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = {
  params: Promise<{ room: string }>;
};

export async function GET(req: Request, ctx: Ctx) {
  const { room } = await ctx.params;
  const roomSlug = s(room);
  if (!roomSlug) return NextResponse.json({ ok: false, error: "room is required." }, { status: 400 });

  const url = new URL(req.url);
  const hostKey = s(url.searchParams.get("hk"));
  const pool = getDbPool();

  try {
    const q = await pool.query<{
      title: string;
      room_slug: string;
      host_key: string;
      room_passcode: string;
      lobby_enabled: boolean;
    }>(
      `
        select
          title,
          room_slug,
          host_key,
          room_passcode,
          lobby_enabled
        from app.agency_meetings
        where room_slug = $1
        limit 1
      `,
      [roomSlug],
    );

    const row = q.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "Meeting not found." }, { status: 404 });
    const isHost = hostKey && hostKey === s(row.host_key);

    return NextResponse.json({
      ok: true,
      roomSlug: row.room_slug,
      title: row.title,
      host: Boolean(isHost),
      lobbyEnabled: Boolean(row.lobby_enabled),
      roomPasscode: isHost ? s(row.room_passcode) : "",
    });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "Meetings table is missing. Run DB migration 030_agency_meetings.sql." },
        { status: 500 },
      );
    }
    if (code === "42703") {
      return NextResponse.json(
        { ok: false, error: "Meetings security columns are missing. Run DB migration 031_agency_meetings_security.sql." },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to load meeting bootstrap.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
