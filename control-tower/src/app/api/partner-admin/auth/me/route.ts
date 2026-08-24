import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ok: true, user: auth.user, access: { ...auth.access, delegated: Boolean(auth.delegation) } }, { headers: { "cache-control": "no-store" } });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function PATCH(req: Request) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  if (auth.delegation) return NextResponse.json({ ok: false, error: "Return to the Owner account before editing a profile." }, { status: 403 });
  try {
    const body = await req.json();
    const fullName = text(body?.fullName);
    const avatarUrl = text(body?.avatarUrl);
    if (!fullName) return NextResponse.json({ ok: false, error: "Full name is required." }, { status: 400 });
    if (fullName.length > 120) return NextResponse.json({ ok: false, error: "Full name is too long." }, { status: 400 });
    if (avatarUrl && !/^data:image\/(jpeg|png|webp);base64,/i.test(avatarUrl) && !/^https:\/\//i.test(avatarUrl)) {
      return NextResponse.json({ ok: false, error: "Upload a JPG, PNG or WebP image." }, { status: 400 });
    }
    if (avatarUrl.length > 750_000) {
      return NextResponse.json({ ok: false, error: "The profile image is too large." }, { status: 400 });
    }
    const result = await getDbPool().query<{
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
    }>(
      `update app.users
          set full_name = $2,
              avatar_url = nullif($3, '')
        where id = $1
        returning id, email, full_name, avatar_url`,
      [auth.user.id, fullName, avatarUrl],
    );
    const user = result.rows[0];
    if (!user) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, fullName: user.full_name, avatarUrl: user.avatar_url },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not update profile." },
      { status: 500 },
    );
  }
}
