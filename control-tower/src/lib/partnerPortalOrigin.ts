import 'server-only';
import { getRequestClinicTenant } from './clinicDomainRequest';
import { sameClinicOrigin } from './clinicDomainRouting';
export async function validPartnerPortalOrigin(request: Request) {
    const tenant = await getRequestClinicTenant();
    const origin = request.headers.get('origin');
    if (tenant) return sameClinicOrigin(origin, request.headers.get('host') || new URL(request.url).host);
    if (!origin) return true;
    try { const url = new URL(origin); return ['https:', 'http:'].includes(url.protocol) && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === 'mydripnurse.com' || url.hostname.endsWith('.mydripnurse.com')); } catch { return false; }
}
