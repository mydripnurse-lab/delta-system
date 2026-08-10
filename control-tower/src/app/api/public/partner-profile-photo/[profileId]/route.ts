import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ profileId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { profileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    return NextResponse.json({ ok: false, error: "Invalid profile photo." }, { status: 400 });
  }

  await ensureStaffSchema();
  const result = await getDbPool().query<{ profile_photo_data: string | null; profile_photo_content_type: string | null }>(
    `select profile_photo_data, profile_photo_content_type
       from app.partner_profiles
      where id = $1
      limit 1`,
    [profileId],
  );
  const row = result.rows[0];
  if (!row?.profile_photo_data) {
    return NextResponse.json({ ok: false, error: "Profile photo not found." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(row.profile_photo_data, "base64"), {
    status: 200,
    headers: {
      "Content-Type": row.profile_photo_content_type || "image/jpeg",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
