// Only public website routes are exposed on a clinic's domain.
export function clinicDomainPath(pathname: string): 'asset' | 'public' | 'deny' {
    if (pathname.startsWith('/_next/static/') || pathname === '/_next/image' || pathname === '/mdn-logo.png' || pathname === '/favicon.ico' || pathname === '/clinic-assets/wellness-lounge.webp' || pathname === '/clinic-assets/mobile-iv-home.webp' || pathname === '/clinic-assets/category-iv-therapy.webp' || pathname === '/clinic-assets/category-nad.webp' || pathname === '/clinic-assets/category-vitamins.webp') return 'asset';
    if (/^\/(?:services(?:\/[a-z0-9-]+)?|login|become-a-partner|robots\.txt|sitemap\.xml)?\/?$/.test(pathname)) return 'public';
    return 'deny';
}
