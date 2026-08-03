import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "ct_session";
const PARTNER_ADMIN_SESSION_COOKIE_NAME = "mdn_partner_admin_session";
const PUBLIC_POLICY_HOSTNAME = "policy.mydripnurse.com";
const PARTNER_ADMIN_HOSTNAME = "admin.mydripnurse.com";
const PARTNER_ADMIN_LOCAL_HOSTNAME = "admin.localhost";

function requestHostname(req: NextRequest) {
  return (req.headers.get("host") || "").split(":")[0].toLowerCase();
}

function isPublicPolicyHost(req: NextRequest) {
  return requestHostname(req) === PUBLIC_POLICY_HOSTNAME;
}

function isPartnerAdminHost(req: NextRequest) {
  const hostname = requestHostname(req);
  return (
    hostname === PARTNER_ADMIN_HOSTNAME ||
    (process.env.NODE_ENV !== "production" && hostname === PARTNER_ADMIN_LOCAL_HOSTNAME)
  );
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

  const partnerAdminRoute =
    partnerAdminHost && (pathname === "/" || pathname === "/applications" || pathname.startsWith("/applications/"));

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
    "/dashboard/:path*",
    "/projects/:path*",
    "/partner-admin/:path*",
    "/applications/:path*",
    "/appointment-deposit-policy",
  ],
};
