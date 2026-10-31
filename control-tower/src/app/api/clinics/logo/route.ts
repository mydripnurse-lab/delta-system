import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { requireClinicManager, requireClinicOrigin } from '@/lib/clinicAuth';
export async function POST(request: Request) {
    try {
        requireClinicOrigin(request);
        const form = await request.formData();
        const id = z.string().uuid().parse(form.get('clinicId'));
        await requireClinicManager(id);
        const file = form.get('file');
        if (!(file instanceof File) || file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
            return NextResponse.json({ error: 'Choose a PNG, JPEG or WebP logo under 2 MB.' }, { status: 400 });
        const bytes = new Uint8Array(await file.arrayBuffer());
        const valid = file.type === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
        if (!valid)
            throw new Error('Invalid image');
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp';
        const uploaded = await put(`clinics/${id}/logo.${extension}`, Buffer.from(bytes), { access: 'public', addRandomSuffix: true, contentType: file.type });
        return NextResponse.json({ url: uploaded.url });
    }
    catch {
        return NextResponse.json({ error: 'Could not upload this logo. Check your permissions and image format.' }, { status: 400 });
    }
}
