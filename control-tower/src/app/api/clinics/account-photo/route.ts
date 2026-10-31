import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { getClinicIdentity, requireClinicOrigin } from '@/lib/clinicAuth';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
import { getDbPool } from '@/lib/db';

export const runtime = 'nodejs';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
    try {
        requireClinicOrigin(request);
        const identity = await getClinicIdentity();
        if (!identity) return json({ error: 'Sign in to update your photo.' }, 401);
        if (!consumeClinicRequestBudget(request, 'clinic-account-photo', 10)) return json({ error: 'Please wait before uploading another photo.' }, 429);
        if (Number(request.headers.get('content-length') || 0) > 3 * 1024 * 1024) return json({ error: 'Choose a photo under 2 MB.' }, 413);
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return json({ error: 'Choose a PNG, JPEG or WebP photo under 2 MB.' }, 400);
        // Decode, crop and strip metadata. Never store image bytes in Postgres.
        const bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000 }).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
        // Check the additive column before uploading, so an unapplied migration creates no orphan file.
        const pool = getDbPool();
        const account = identity.partnerId
            ? await pool.query('select clinic_avatar_url from app.partner_profiles where id=$1', [identity.partnerId])
            : await pool.query('select profile_photo_url from app.clinic_accounts where email=$1 and is_active=true', [identity.email]);
        if (!account.rowCount) return json({ error: 'Account not found.' }, 403);
        const key = createHash('sha256').update(identity.email).digest('hex').slice(0, 24);
        const photo = await put(`clinic-accounts/${key}/avatar.webp`, bytes, { access: 'public', addRandomSuffix: true, contentType: 'image/webp' });
        if (identity.partnerId) await pool.query('update app.partner_profiles set clinic_avatar_url=$2 where id=$1', [identity.partnerId, photo.url]);
        else await pool.query('update app.clinic_accounts set profile_photo_url=$2 where email=$1 and is_active=true', [identity.email, photo.url]);
        return json({ ok: true, photoUrl: photo.url });
    } catch {
        return json({ error: 'Unable to save your photo. Try a smaller image or contact support.' }, 400);
    }
}
