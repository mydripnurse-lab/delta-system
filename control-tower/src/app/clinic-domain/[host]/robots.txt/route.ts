import { requirePublicClinicDomain } from '@/lib/clinicDomainRequest';
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
    const { host } = await params;
    await requirePublicClinicDomain(host);
    return new Response(`User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /api/\nDisallow: /portal\nSitemap: https://${host}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
