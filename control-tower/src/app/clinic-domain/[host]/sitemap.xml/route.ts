import { requirePublicClinicDomain } from '@/lib/clinicDomainRequest';
import { publicClinicServices } from '@/lib/clinicBooking';
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
    const { host } = await params;
    const clinic = await requirePublicClinicDomain(host);
    const services = await publicClinicServices(clinic.clinicId);
    const urls = ['', '/services', ...services.map(s => `/services/${encodeURIComponent(s.slug)}`)].map(path => `https://${host}${path}`);
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${escape(url)}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
