import { NextResponse } from "next/server";

import { ensureClientPortalSchema, getAuthenticatedClient, isTrustedClientRequest } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type Context = { params: Promise<{ appointmentId: string }> };

function reviewerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)?.[0]}.` : parts[0] || "Verified patient";
}

export async function POST(request: Request, { params }: Context) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
  const { appointmentId } = await params;
  const body = (await request.json().catch(() => null)) as { rating?: number; comment?: string } | null;
  const rating = Number(body?.rating);
  const comment = String(body?.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 600) {
    return NextResponse.json({ ok: false, error: "Choose a rating from 1 to 5 and keep your note under 600 characters." }, { status: 400 });
  }

  await ensureClientPortalSchema();
  const pool = getDbPool();
  const result = await pool.query<{ partner_profile_id: string; full_name: string }>(
    `select appointment.partner_profile_id::text, client.full_name
       from app.appointments appointment
       join app.client_customer_links link
         on link.booking_customer_id = appointment.customer_id
        and link.client_account_id = $1::uuid
       join app.client_accounts client on client.id = link.client_account_id
      where appointment.id = $2::uuid
        and appointment.status = 'completed'
        and appointment.partner_profile_id is not null
      limit 1`,
    [account.id, appointmentId],
  );
  const visit = result.rows[0];
  if (!visit) return NextResponse.json({ ok: false, error: "This completed visit is not available for review." }, { status: 404 });

  const saved = await pool.query<{ rating: number; comment: string; created_at: string }>(
    `insert into app.appointment_reviews
       (appointment_id, partner_profile_id, client_account_id, rating, comment, reviewer_display_name)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
     on conflict (appointment_id) do update
       set rating = excluded.rating,
           comment = excluded.comment,
           reviewer_display_name = excluded.reviewer_display_name,
           is_published = true,
           updated_at = now()
     returning rating, comment, created_at::text`,
    [appointmentId, visit.partner_profile_id, account.id, rating, comment, reviewerName(visit.full_name)],
  );
  return NextResponse.json({ ok: true, review: saved.rows[0] });
}
