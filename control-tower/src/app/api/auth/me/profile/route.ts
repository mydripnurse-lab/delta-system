import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireAuthUser } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type PatchProfileBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
};

export async function PATCH(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as PatchProfileBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const fullName = s(body.fullName);
  const email = s(body.email).toLowerCase();
  const phone = s(body.phone);
  const avatarUrl = s(body.avatarUrl);
  if (!fullName && !email && !phone && body.phone !== "" && !avatarUrl && body.avatarUrl !== "") {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const set: string[] = [];
  const vals: unknown[] = [auth.user.id];
  if (fullName || body.fullName === "") {
    vals.push(fullName || null);
    set.push(`full_name = nullif($${vals.length}::text, '')`);
  }
  if (email) {
    vals.push(email);
    set.push(`email = $${vals.length}`);
  }
  if (phone || body.phone === "") {
    vals.push(phone || null);
    set.push(`phone = nullif($${vals.length}::text, '')`);
  }
  if (avatarUrl || body.avatarUrl === "") {
    vals.push(avatarUrl || null);
    set.push(`avatar_url = nullif($${vals.length}::text, '')`);
  }

  const pool = getDbPool();
  try {
    const q = await pool.query<{
      id: string;
      email: string;
      full_name: string | null;
      phone: string | null;
      avatar_url: string | null;
    }>(
      `
        update app.users
        set ${set.join(", ")}
        where id = $1
        returning id, email, full_name, phone, avatar_url
      `,
      vals,
    );

    if (!q.rows[0]) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: q.rows[0].id,
        email: q.rows[0].email,
        fullName: q.rows[0].full_name,
        phone: q.rows[0].phone,
        avatarUrl: q.rows[0].avatar_url,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    const duplicate = message.toLowerCase().includes("users_email_lower_uq");
    return NextResponse.json(
      { ok: false, error: duplicate ? "Email already exists." : message },
      { status: duplicate ? 409 : 500 },
    );
  }
}
