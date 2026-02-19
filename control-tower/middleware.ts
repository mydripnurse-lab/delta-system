import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "ct_session";

function isProtectedPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/dashboard") || pathname.startsWith("/projects");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (hasSession) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/projects/:path*"],
};
