import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { z } from 'zod';
import { requireClinicManager, requireClinicOrigin } from '@/lib/clinicAuth';
import { consumeClinicRequestBudget } from '@/lib/clinicRequestBudget';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    try {
        requireClinicOrigin(request);
        if (Number(request.headers.get('content-length')) > 3 * 1024 * 1024) return NextResponse.json({ error: 'Choose an image under 2 MB.' }, { status: 413 });
        if (!consumeClinicRequestBudget(request, 'clinic-hero-upload', 10)) return NextResponse.json({ error: 'Please wait before uploading another image.' }, { status: 429 });
        const form = await request.formData();
        const id = z.string().uuid().parse(form.get('clinicId'));
        await requireClinicManager(id);
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
            return NextResponse.json({ error: 'Choose a JPG, PNG or WebP image under 2 MB.' }, { status: 400 });
        // Decode, constrain dimensions and strip metadata before publishing the photo.
        const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000 });
        const metadata = await source.metadata();
        if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
        const bytes = await source.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        const uploaded = await put(`clinics/${id}/hero-image.webp`, bytes, { access: 'public', addRandomSuffix: true, contentType: 'image/webp' });
        return NextResponse.json({ url: uploaded.url });
    } catch {
        return NextResponse.json({ error: 'Could not upload the hero image. Check your access and choose a valid image.' }, { status: 400 });
    }
}
