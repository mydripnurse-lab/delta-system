import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "ct_session";
const PARTNER_ADMIN_SESSION_COOKIE_NAME = "mdn_partner_admin_session";
const PUBLIC_POLICY_HOSTNAME = "policy.mydripnurse.com";
const PARTNER_ADMIN_HOSTNAME = "admin.mydripnurse.com";
const PARTNER_ONBOARDING_HOSTNAME = "onboarding.mydripnurse.com";
const PARTNER_WEBSITE_HOSTNAME = "partners.mydripnurse.com";

function requestHostname(req: NextRequest) {
  return (req.headers.get("host") || "").split(":")[0].toLowerCase();
}

function isPublicPolicyHost(req: NextRequest) {
  return requestHostname(req) === PUBLIC_POLICY_HOSTNAME;
}

function isPartnerAdminHost(req: NextRequest) {
  return requestHostname(req) === PARTNER_ADMIN_HOSTNAME;
}

function isPartnerOnboardingHost(req: NextRequest) {
  return requestHostname(req) === PARTNER_ONBOARDING_HOSTNAME;
}

function isPartnerWebsiteHost(req: NextRequest) {
  return requestHostname(req) === PARTNER_WEBSITE_HOSTNAME;
}

function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/partner-admin")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Keep hostname routing in one place. Chained beforeFiles rewrites can apply
  // a second time to an internal destination such as /partner-login.
  if (isPartnerOnboardingHost(req) && (pathname === "/" || pathname === "/welcome")) {
    const onboardingUrl = req.nextUrl.clone();
    onboardingUrl.pathname = "/partner-welcome";
    return NextResponse.rewrite(onboardingUrl);
  }

  if (isPartnerWebsiteHost(req)) {
    const partnerUrl = req.nextUrl.clone();
    if (pathname === "/sitemap.xml") {
      partnerUrl.pathname = "/partner-seo/sitemap.xml";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname === "/robots.txt") {
      partnerUrl.pathname = "/partner-seo/robots.txt";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname === "/") {
      partnerUrl.pathname = "/partners-directory";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname === "/login") {
      partnerUrl.pathname = "/partner-login";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname === "/portal") {
      partnerUrl.pathname = "/partner-portal";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname.startsWith("/portal/")) {
      partnerUrl.pathname = `/partner-portal${pathname.slice("/portal".length)}`;
      return NextResponse.rewrite(partnerUrl);
    }
    // These are application routes, not partner profile slugs. Let Next.js
    // resolve them directly before the generic /:slug website rewrite below.
    if (pathname === "/partner-login" || pathname === "/partner-portal" || pathname.startsWith("/partner-portal/")) {
      return NextResponse.next();
    }

    const servicesMatch = pathname.match(/^\/([a-z0-9-]+)\/services\/?$/i);
    if (servicesMatch) {
      partnerUrl.pathname = `/partner-site/${servicesMatch[1]}/services`;
      return NextResponse.rewrite(partnerUrl);
    }

    const serviceBookingMatch = pathname.match(/^\/([a-z0-9-]+)\/services\/([a-z0-9-]+)\/book\/?$/i);
    if (serviceBookingMatch) {
      partnerUrl.pathname = `/partner-site/${serviceBookingMatch[1]}/services/${serviceBookingMatch[2]}/book`;
      return NextResponse.rewrite(partnerUrl);
    }

    const serviceLandingMatch = pathname.match(/^\/([a-z0-9-]+)\/services\/([a-z0-9-]+)\/?$/i);
    if (serviceLandingMatch) {
      partnerUrl.pathname = `/partner-site/${serviceLandingMatch[1]}/services/${serviceLandingMatch[2]}`;
      return NextResponse.rewrite(partnerUrl);
    }

    const socialImageMatch = pathname.match(/^\/([a-z0-9-]+)\/opengraph-image\/?$/i);
    if (socialImageMatch) {
      partnerUrl.pathname = `/partner-site/${socialImageMatch[1]}/opengraph-image`;
      return NextResponse.rewrite(partnerUrl);
    }

    const affiliateMatch = pathname.match(/^\/([a-z0-9-]+)\/become-a-partner\/?$/i);
    if (affiliateMatch) {
      partnerUrl.pathname = `/partner-site/${affiliateMatch[1]}/become-a-partner`;
      return NextResponse.rewrite(partnerUrl);
    }

    const applicationMatch = pathname.match(/^\/([a-z0-9-]+)\/apply\/?$/i);
    if (applicationMatch) {
      partnerUrl.pathname = `/partner-site/${applicationMatch[1]}/apply`;
      return NextResponse.rewrite(partnerUrl);
    }

    const profileMatch = pathname.match(/^\/([a-z0-9-]+)\/?$/i);
    if (profileMatch) {
      partnerUrl.pathname = `/partner-site/${profileMatch[1]}`;
      return NextResponse.rewrite(partnerUrl);
    }
  }

  if (isPublicPolicyHost(req)) {
    if (pathname === "/" || pathname === "/appointment-deposit-policy") {
      if (pathname === "/appointment-deposit-policy") {
        const publicUrl = req.nextUrl.clone();
        publicUrl.pathname = "/";
        return NextResponse.redirect(publicUrl);
      }
      return NextResponse.next();
    }

    const policyUrl = req.nextUrl.clone();
    policyUrl.pathname = "/";
    policyUrl.search = "";
    return NextResponse.redirect(policyUrl);
  }

  const partnerAdminHost = isPartnerAdminHost(req);
  if (partnerAdminHost && pathname.startsWith("/partner-admin")) {
    const canonicalUrl = req.nextUrl.clone();
    canonicalUrl.pathname = pathname.replace(/^\/partner-admin/, "") || "/";
    return NextResponse.redirect(canonicalUrl);
  }

  if (partnerAdminHost && pathname === "/login") {
    const hasPartnerAdminSession = !!req.cookies.get(PARTNER_ADMIN_SESSION_COOKIE_NAME)?.value;
    if (hasPartnerAdminSession) {
      const adminHomeUrl = req.nextUrl.clone();
      adminHomeUrl.pathname = "/";
      adminHomeUrl.search = "";
      return NextResponse.redirect(adminHomeUrl);
    }

    const internalLoginUrl = req.nextUrl.clone();
    internalLoginUrl.pathname = "/partner-admin/login";
    return NextResponse.rewrite(internalLoginUrl);
  }

  if (partnerAdminHost && (pathname.startsWith("/dashboard") || pathname.startsWith("/projects"))) {
    const adminHomeUrl = req.nextUrl.clone();
    adminHomeUrl.pathname = "/";
    adminHomeUrl.search = "";
    return NextResponse.redirect(adminHomeUrl);
  }

  if (partnerAdminHost && (pathname === "/staff" || pathname.startsWith("/staff/"))) {
    const partnersUrl = req.nextUrl.clone();
    partnersUrl.pathname = "/partners";
    partnersUrl.search = "";
    return NextResponse.redirect(partnersUrl);
  }

  const partnerAdminRoute =
    partnerAdminHost && (
      pathname === "/" ||
      pathname === "/applications" || pathname.startsWith("/applications/") ||
      pathname === "/partners" || pathname.startsWith("/partners/") ||
      pathname === "/appointments" || pathname.startsWith("/appointments/") ||
      pathname === "/services" || pathname.startsWith("/services/") ||
      pathname === "/calendars" || pathname.startsWith("/calendars/") ||
      pathname === "/automations" || pathname.startsWith("/automations/") ||
      pathname === "/support" || pathname.startsWith("/support/")
    );

  if (partnerAdminRoute) {
    const hasPartnerAdminSession = !!req.cookies.get(PARTNER_ADMIN_SESSION_COOKIE_NAME)?.value;
    if (!hasPartnerAdminSession) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const adminUrl = req.nextUrl.clone();
    adminUrl.pathname = pathname === "/" ? "/partner-admin" : `/partner-admin${pathname}`;
    return NextResponse.rewrite(adminUrl);
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (hasSession) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/portal",
    "/portal/:path*",
    "/welcome",
    "/:slug",
    "/:slug/services",
    "/:slug/services/:path*",
    "/:slug/become-a-partner",
    "/:slug/apply",
    "/:slug/opengraph-image",
    "/sitemap.xml",
    "/robots.txt",
    "/dashboard/:path*",
    "/projects/:path*",
    "/partner-admin/:path*",
    "/partner-portal/:path*",
    "/applications/:path*",
    "/staff/:path*",
    "/partners/:path*",
    "/appointments/:path*",
    "/services/:path*",
    "/calendars/:path*",
    "/automations/:path*",
    "/support/:path*",
    "/appointment-deposit-policy",
  ],
};
