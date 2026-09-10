import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

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
  const result = await getDbPool().query<{ profile_photo_url: string | null; profile_photo_data: string | null; profile_photo_content_type: string | null }>(
    `select profile_photo_url, profile_photo_data, profile_photo_content_type
       from app.partner_profiles
      where id = $1
      limit 1`,
    [profileId],
  );
  const row = result.rows[0];
  if (row?.profile_photo_url && /^https:\/\//i.test(row.profile_photo_url)) {
    return NextResponse.redirect(row.profile_photo_url, 307);
  }
  if (!row?.profile_photo_data) {
    return NextResponse.json({ ok: false, error: "Profile photo not found." }, { status: 404 });
  }

  const contentType = row.profile_photo_content_type || "image/jpeg";
  const extension = contentType === "image/png" ? "png" : "jpg";
  try {
    const blob = await put(
      `partner-profile-photos/${profileId}/legacy.${extension}`,
      Buffer.from(row.profile_photo_data, "base64"),
      { access: "public", addRandomSuffix: true, contentType },
    );
    await getDbPool().query(
      `update app.partner_profiles
          set profile_photo_url = $2,
              profile_photo_data = null,
              profile_photo_content_type = null,
              updated_at = now()
        where id = $1`,
      [profileId, blob.url],
    );
    return NextResponse.redirect(blob.url, 307);
  } catch {
    return new NextResponse(Buffer.from(row.profile_photo_data, "base64"), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
