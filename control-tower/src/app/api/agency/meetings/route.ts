import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAgencyPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slugify(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomToken() {
  return Math.random().toString(36).slice(2, 8);
}

function buildBaseUrl(req: Request) {
  const url = new URL(req.url);
  const xfProto = s(req.headers.get("x-forwarded-proto"));
  const xfHost = s(req.headers.get("x-forwarded-host"));
  const host = xfHost || s(req.headers.get("host")) || url.host;
  const protocol = xfProto || (url.protocol.replace(":", "") || "https");
  return `${protocol}://${host}`;
}

function toIsoOrNull(raw: unknown) {
  const value = s(raw);
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

type CreateMeetingBody = {
  title?: string;
  clientName?: string;
  clientEmail?: string;
  startsAt?: string;
  durationMinutes?: number;
};

export async function GET(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.read");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const baseUrl = buildBaseUrl(req);
  try {
    const q = await pool.query<{
      id: string;
      title: string;
      client_name: string;
      client_email: string | null;
      starts_at: string | null;
      duration_minutes: number;
      room_slug: string;
      created_at: string;
      created_by_name: string | null;
    }>(
      `
        select
          m.id,
          m.title,
          m.client_name,
          m.client_email,
          m.starts_at::text,
          m.duration_minutes,
          m.room_slug,
          m.created_at::text,
          coalesce(nullif(u.full_name, ''), u.email) as created_by_name
        from app.agency_meetings m
        left join app.users u on u.id = m.created_by_user_id
        order by coalesce(m.starts_at, m.created_at) desc, m.created_at desc
        limit 250
      `,
    );

    return NextResponse.json({
      ok: true,
      rows: q.rows.map((row) => ({
        id: row.id,
        title: row.title,
        clientName: row.client_name,
        clientEmail: row.client_email || "",
        startsAt: row.starts_at || "",
        durationMinutes: Number(row.duration_minutes || 45),
        roomSlug: row.room_slug,
        joinUrl: `${baseUrl}/meet/${encodeURIComponent(row.room_slug)}?agency=${encodeURIComponent("Delta System")}&meeting=${encodeURIComponent(
          row.title,
        )}&client=${encodeURIComponent(row.client_name)}${row.client_email ? `&email=${encodeURIComponent(row.client_email)}` : ""}`,
        createdAt: row.created_at,
        createdBy: row.created_by_name || "Agency",
      })),
    });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "Meetings table is missing. Run DB migration 030_agency_meetings.sql." },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to load meetings.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as CreateMeetingBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const title = s(body.title) || "Client Strategy Call";
  const clientName = s(body.clientName) || "Client";
  const clientEmail = s(body.clientEmail).toLowerCase();
  const startsAt = toIsoOrNull(body.startsAt);
  const durationRaw = Number(body.durationMinutes);
  const durationMinutes = Number.isFinite(durationRaw) ? Math.max(15, Math.min(180, Math.round(durationRaw))) : 45;
  const pool = getDbPool();

  let created:
    | {
        id: string;
        title: string;
        client_name: string;
        client_email: string | null;
        starts_at: string | null;
        duration_minutes: number;
        room_slug: string;
        created_at: string;
      }
    | undefined;

  try {
    for (let i = 0; i < 3; i += 1) {
      const roomSlug = `${slugify(title) || "meeting"}-${randomToken()}`;
      try {
        const ins = await pool.query<{
          id: string;
          title: string;
          client_name: string;
          client_email: string | null;
          starts_at: string | null;
          duration_minutes: number;
          room_slug: string;
          created_at: string;
        }>(
          `
            insert into app.agency_meetings (
              title,
              client_name,
              client_email,
              starts_at,
              duration_minutes,
              room_slug,
              created_by_user_id
            )
            values ($1, $2, nullif($3, ''), $4::timestamptz, $5, $6, $7)
            returning
              id,
              title,
              client_name,
              client_email,
              starts_at::text,
              duration_minutes,
              room_slug,
              created_at::text
          `,
          [title, clientName, clientEmail, startsAt, durationMinutes, roomSlug, auth.user.id],
        );
        created = ins.rows[0];
        break;
      } catch (error: unknown) {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
        if (code !== "23505") throw error;
      }
    }
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "Meetings table is missing. Run DB migration 030_agency_meetings.sql." },
        { status: 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to create meeting.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  if (!created) {
    return NextResponse.json({ ok: false, error: "Could not create unique meeting room." }, { status: 500 });
  }

  const baseUrl = buildBaseUrl(req);
  const joinUrl = `${baseUrl}/meet/${encodeURIComponent(created.room_slug)}?agency=${encodeURIComponent("Delta System")}&meeting=${encodeURIComponent(
    created.title,
  )}&client=${encodeURIComponent(created.client_name)}${created.client_email ? `&email=${encodeURIComponent(created.client_email)}` : ""}`;

  return NextResponse.json({
    ok: true,
    meeting: {
      id: created.id,
      title: created.title,
      clientName: created.client_name,
      clientEmail: created.client_email || "",
      startsAt: created.starts_at || "",
      durationMinutes: Number(created.duration_minutes || 45),
      roomSlug: created.room_slug,
      joinUrl,
      createdAt: created.created_at,
      createdBy: auth.user.fullName || auth.user.email,
    },
  });
}
