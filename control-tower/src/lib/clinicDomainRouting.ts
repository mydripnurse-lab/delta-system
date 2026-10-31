// Only public website routes are exposed on a clinic's domain.
export function clinicDomainPath(pathname: string): 'asset' | 'public' | 'deny' {
    if (pathname.startsWith('/_next/static/') || pathname === '/_next/image' || pathname === '/mdn-logo.png' || pathname === '/favicon.ico') return 'asset';
    if (/^\/(?:services(?:\/[a-z0-9-]+)?|login|robots\.txt|sitemap\.xml)?\/?$/.test(pathname)) return 'public';
    return 'deny';
}
