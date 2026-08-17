import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}
function toDecision(v: unknown): "accepted" | "denied" | "" {
  const x = s(v).toLowerCase();
  if (x === "accept" || x === "accepted") return "accepted";
  if (x === "deny" || x === "denied") return "denied";
  return "";
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const params = await ctx.params;
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid notification id." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body.tenantId);
    const integrationKey = s(body.integrationKey) || "default";
    const decision = toDecision(body.decision);
    const decisionNote = s(body.note);
    const decidedByUserId = s(body.decidedByUserId);

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    if (!decision) {
      return NextResponse.json({ ok: false, error: "Invalid decision (accept|deny)." }, { status: 400 });
    }

    const pool = getDbPool();
    const q = await pool.query(
      `
        update app.ads_ai_notifications
        set
          status = $1,
          decision_note = nullif($2, ''),
          decided_by_user_id = nullif($3, '')::uuid,
          decided_at = now(),
          updated_at = now()
        where id = $4
          and organization_id = $5::uuid
          and module = 'ads'
          and integration_key = $6
        returning
          id,
          organization_id,
          integration_key,
          source,
          recommendation_type,
          fingerprint,
          priority,
          status,
          title,
          summary,
          recommendation_payload,
          evidence,
          decision_note,
          decided_by_user_id,
          decided_at,
          created_at,
          updated_at
      `,
      [decision, decisionNote, decidedByUserId, id, tenantId, integrationKey],
    );

    const row = q.rows[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: "Notification not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, notification: row });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to update notification" },
      { status: 500 },
    );
  }
}
