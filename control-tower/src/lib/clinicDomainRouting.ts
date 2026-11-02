// Explicit public and authenticated surfaces; internal/admin routes stay closed.
export function clinicDomainPath(pathname: string): 'asset' | 'public' | 'nurse' | 'portal' | 'clinic-portal' | 'api' | 'deny' {
    if (pathname.startsWith('/_next/static/') || pathname === '/_next/image' || pathname === '/mdn-logo.png' || pathname === '/favicon.ico' || pathname === '/partner-sw.js' || pathname === '/partner-portal-icon-v2-192.png' || /^\/clinic-assets\/[a-z0-9-]+\.webp$/.test(pathname)) return 'asset';
    if (/^\/portal\/clinics(?:\/(?:overview|appointments|profile(?:\/(?:details|branding|account|practice))?|website|directory|services|affiliates|team|coverage|support|rewards|products))?\/?$/.test(pathname)) return 'clinic-portal';
    if (/^\/portal(?:\/(?:overview|appointments|availability|services|affiliates|support|profile|directory|rewards|products|website))?\/?$/.test(pathname)) return 'portal';
    if (/^\/nurses\/[a-z0-9-]+(?:\/(?:services(?:\/[a-z0-9-]+)?|become-a-partner))?\/?$/.test(pathname)) return 'nurse';
    if (/^\/api\/partner-portal\/(?:push-subscriptions|services|notifications|availability|tour|affiliates|support|profile|directory|appointments)$/.test(pathname)
        || /^\/api\/clinics(?:\/(?:logo|notifications|appointments|dashboard|practice|domain|affiliates|account-photo|team|hero-image|(?:practice|team)\/availability))?$/.test(pathname)
        || /^\/api\/public\/partner-portal\/(?:login|logout)$/.test(pathname)) return 'api';
    if (/^\/(?:services(?:\/[a-z0-9-]+)?|login|become-a-partner|robots\.txt|sitemap\.xml)?\/?$/.test(pathname)) return 'public';
    return 'deny';
}
export function clinicDomainDestination(hostname: string, pathname: string) {
    const kind = clinicDomainPath(pathname);
    if (pathname === '/portal/overview' || pathname === '/portal/overview/') return '/partner-portal';
    if (kind === 'portal') return pathname.replace(/^\/portal/, '/partner-portal').replace(/\/$/, '');
    if (kind === 'clinic-portal') return pathname.replace(/^\/portal\/clinics/, '/clinic-portal').replace(/\/$/, '');
    if (kind === 'nurse') return pathname.replace(/^\/nurses/, '/partner-site');
    if (kind === 'public') return `/clinic-domain/${hostname}${pathname === '/' ? '' : pathname}`;
    return null;
}
export function sameClinicOrigin(origin: string | null, host: string) {
    if (!origin) return false;
    try { const url = new URL(origin); return ['https:', 'http:'].includes(url.protocol) && url.host.toLowerCase() === host.toLowerCase(); } catch { return false; }
}
