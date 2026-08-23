import { NextRequest, NextResponse } from "next/server";
import { deploymentSurface } from "@/lib/deployment-surface";

const SESSION_COOKIE_NAME = "ct_session";
const PARTNER_ADMIN_SESSION_COOKIE_NAME = "mdn_partner_admin_session";
const PUBLIC_POLICY_HOSTNAME = "policy.mydripnurse.com";
const PARTNER_ADMIN_HOSTNAME = "admin.mydripnurse.com";
const PARTNER_ONBOARDING_HOSTNAME = "onboarding.mydripnurse.com";
const PARTNER_WEBSITE_HOSTNAME = "partners.mydripnurse.com";
const CLIENT_CARE_HOSTNAME = "care.mydripnurse.com";
const CLIENT_SESSION_COOKIE_NAME = "mdn_client_session";
const PARTNER_PLATFORM_HOSTNAMES = new Set([
  PUBLIC_POLICY_HOSTNAME,
  PARTNER_ADMIN_HOSTNAME,
  PARTNER_ONBOARDING_HOSTNAME,
  PARTNER_WEBSITE_HOSTNAME,
  CLIENT_CARE_HOSTNAME,
]);
const TELAHAGOCRECER_HOSTNAMES = new Set([
  "telahagocrecer.com",
  "www.telahagocrecer.com",
  "search-embedded.telahagocrecer.com",
]);

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

function isClientCareHost(req: NextRequest) {
  return requestHostname(req) === CLIENT_CARE_HOSTNAME;
}

function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/partner-admin")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = requestHostname(req);
  const surface = deploymentSurface();

  // During the staged Vercel split, the current project remains `combined`.
  // Once domains are attached to their independent projects, these guards
  // prevent an accidental cross-project domain assignment from serving the
  // wrong product surface.
  if (surface === "partner-platform" && TELAHAGOCRECER_HOSTNAMES.has(hostname)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (surface === "telahagocrecer" && PARTNER_PLATFORM_HOSTNAMES.has(hostname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Keep hostname routing in one place. Chained beforeFiles rewrites can apply
  // a second time to an internal destination such as /partner-login.
  if (isPartnerOnboardingHost(req) && (pathname === "/" || pathname === "/welcome")) {
    const onboardingUrl = req.nextUrl.clone();
    onboardingUrl.pathname = "/partner-welcome";
    return NextResponse.rewrite(onboardingUrl);
  }

  if (isClientCareHost(req)) {
    if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname.includes(".")) {
      return NextResponse.next();
    }

    if (pathname === "/login") {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/client-login";
      return NextResponse.rewrite(loginUrl);
    }

    if (pathname === "/register") {
      const registerUrl = req.nextUrl.clone();
      registerUrl.pathname = "/client-register";
      return NextResponse.rewrite(registerUrl);
    }

    if (pathname === "/verify-email") {
      const verifyUrl = req.nextUrl.clone();
      verifyUrl.pathname = "/client-verify-email";
      return NextResponse.rewrite(verifyUrl);
    }

    if (pathname === "/forgot-password") {
      const forgotUrl = req.nextUrl.clone();
      forgotUrl.pathname = "/client-forgot-password";
      return NextResponse.rewrite(forgotUrl);
    }

    if (pathname === "/reset-password") {
      const resetUrl = req.nextUrl.clone();
      resetUrl.pathname = "/client-reset-password";
      return NextResponse.rewrite(resetUrl);
    }

    // Stripe returns here after secure payment. This route is intentionally
    // public because the Checkout session is reconciled server-side before
    // any appointment is confirmed.
    if (pathname === "/booking/complete") {
      return NextResponse.next();
    }

    // Public by design: signed-in clients receive their connected appointments,
    // while guests can submit only after matching a booking reference and email.
    if (pathname === "/refund-request") {
      return NextResponse.next();
    }

    const clientRoutes = new Map([
      ["/", "/client-portal"],
      ["/book", "/client-portal/book"],
      ["/services", "/client-portal/services"],
      ["/appointments", "/client-portal/appointments"],
      ["/referrals", "/client-portal/referrals"],
      ["/rewards", "/client-portal/rewards"],
      ["/rewards/invitations", "/client-portal/rewards/invitations"],
      ["/rewards/nad", "/client-portal/rewards/nad"],
      ["/rewards/visits", "/client-portal/rewards/visits"],
      ["/membership", "/client-portal/membership"],
      ["/products", "/client-portal/products"],
      ["/profile", "/client-portal/profile"],
    ]);
    const internalPath = clientRoutes.get(pathname);
    if (internalPath) {
      if (!req.cookies.get(CLIENT_SESSION_COOKIE_NAME)?.value) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
      const clientUrl = req.nextUrl.clone();
      clientUrl.pathname = internalPath;
      return NextResponse.rewrite(clientUrl);
    }

    const clientBookingMatch = pathname.match(/^\/book\/([a-z0-9-]+)\/?$/i);
    if (clientBookingMatch) {
      if (!req.cookies.get(CLIENT_SESSION_COOKIE_NAME)?.value) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
      const clientUrl = req.nextUrl.clone();
      clientUrl.pathname = `/client-portal/book/${clientBookingMatch[1]}`;
      return NextResponse.rewrite(clientUrl);
    }

    return new NextResponse("Not found", { status: 404 });
  }

  if (isPartnerWebsiteHost(req)) {
    const partnerUrl = req.nextUrl.clone();
    if (pathname === "/activate") {
      partnerUrl.pathname = "/partner-activate";
      return NextResponse.rewrite(partnerUrl);
    }
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
    if (pathname === "/forgot-password") {
      partnerUrl.pathname = "/partner-forgot-password";
      return NextResponse.rewrite(partnerUrl);
    }
    if (pathname === "/reset-password") {
      partnerUrl.pathname = "/partner-reset-password";
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
    if (pathname === "/partner-activate" || pathname === "/partner-login" || pathname === "/partner-forgot-password" || pathname === "/partner-reset-password" || pathname === "/partner-portal" || pathname === "/client-login" || pathname.startsWith("/partner-portal/")) {
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

  if (partnerAdminHost && pathname === "/forgot-password") {
    const forgotPasswordUrl = req.nextUrl.clone();
    forgotPasswordUrl.pathname = "/partner-admin/forgot-password";
    return NextResponse.rewrite(forgotPasswordUrl);
  }

  if (partnerAdminHost && pathname === "/reset-password") {
    const resetPasswordUrl = req.nextUrl.clone();
    resetPasswordUrl.pathname = "/partner-admin/reset-password";
    return NextResponse.rewrite(resetPasswordUrl);
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

  if (partnerAdminHost && (pathname === "/contact" || pathname.startsWith("/contact/"))) {
    const contactsUrl = req.nextUrl.clone();
    contactsUrl.pathname = pathname.replace(/^\/contact/, "/contacts");
    return NextResponse.redirect(contactsUrl);
  }

  if (partnerAdminHost && (pathname === "/analytic" || pathname.startsWith("/analytic/"))) {
    const analyticsUrl = req.nextUrl.clone();
    analyticsUrl.pathname = pathname.replace(/^\/analytic/, "/analytics");
    return NextResponse.redirect(analyticsUrl);
  }

  const partnerAdminRoute =
    partnerAdminHost && (
      pathname === "/" ||
      pathname === "/applications" || pathname.startsWith("/applications/") ||
      pathname === "/partners" || pathname.startsWith("/partners/") ||
      pathname === "/appointments" || pathname.startsWith("/appointments/") ||
      pathname === "/refunds" || pathname.startsWith("/refunds/") ||
      pathname === "/contacts" || pathname.startsWith("/contacts/") ||
      pathname === "/analytics" || pathname.startsWith("/analytics/") ||
      pathname === "/directory-analytics" || pathname.startsWith("/directory-analytics/") ||
      pathname === "/market-management" || pathname.startsWith("/market-management/") ||
      pathname === "/services" || pathname.startsWith("/services/") ||
      pathname === "/calendars" || pathname.startsWith("/calendars/") ||
      pathname === "/automations" || pathname.startsWith("/automations/") ||
      pathname === "/support" || pathname.startsWith("/support/") ||
      pathname === "/rewards" || pathname.startsWith("/rewards/") ||
      pathname === "/products" || pathname.startsWith("/products/")
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
    "/activate",
    "/portal",
    "/portal/:path*",
    "/client-login",
    "/client-register",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/membership",
    "/profile",
    "/book/:path*",
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
    "/contact/:path*",
    "/contacts/:path*",
    "/analytic/:path*",
    "/analytics/:path*",
    "/directory-analytics/:path*",
    "/market-management/:path*",
    "/services/:path*",
    "/calendars/:path*",
    "/automations/:path*",
    "/support/:path*",
    "/rewards/:path*",
    "/products/:path*",
    "/appointment-deposit-policy",
  ],
};
