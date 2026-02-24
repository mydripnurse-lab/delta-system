import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAgencyPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = {
  params: Promise<{ meetingId: string }>;
};

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireAgencyPermission(req, "agency.manage");
  if ("response" in auth) return auth.response;

  const { meetingId } = await ctx.params;
  const id = s(meetingId);
  if (!id) return NextResponse.json({ ok: false, error: "meetingId is required." }, { status: 400 });

  const pool = getDbPool();
  try {
    const q = await pool.query<{ id: string }>(`delete from app.agency_meetings where id = $1 returning id`, [id]);
    if (!q.rows[0]) return NextResponse.json({ ok: false, error: "Meeting not found." }, { status: 404 });
    return NextResponse.json({ ok: true, id: q.rows[0].id });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "Meetings table is missing. Run DB migration 030_agency_meetings.sql." },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to delete meeting.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
