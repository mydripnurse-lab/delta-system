import type { Metadata } from "next";
import { headers } from "next/headers";

import MarketingHeaderAccountEmbed from "@/components/marketing/MarketingHeaderAccountEmbed";
import { CLIENT_SESSION_COOKIE_NAME, getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { logPublicRequestDiagnostic } from "@/lib/publicRequestDiagnostics";
import { isMdnMarketingHome, trustedMdnHome } from "@/lib/trustedMdnOrigin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Drip Nurse account",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function marketingHome(value: string | null | undefined) {
  const home = trustedMdnHome(value);
  return home && isMdnMarketingHome(home) ? home : "";
}

function hasClientSessionCookie(cookieHeader: string | null) {
  const prefix = `${CLIENT_SESSION_COOKIE_NAME}=`;
  return (cookieHeader || "").split(";").some((part) => part.trim().startsWith(prefix));
}

export default async function SiteHeaderAccountEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, requestHeaders] = await Promise.all([searchParams, headers()]);
  const hasSession = hasClientSessionCookie(requestHeaders.get("cookie"));
  const account = hasSession ? await getAuthenticatedClient() : null;
  logPublicRequestDiagnostic(requestHeaders, "/embed/site-header/account", { hasSession });
  const returnTo = marketingHome(first(query.returnTo)) || marketingHome(requestHeaders.get("referer"));
  return <MarketingHeaderAccountEmbed account={account ? {
    fullName: account.fullName,
    email: account.email,
    photoUrl: account.profilePhotoUrl,
    photoUpdatedAt: account.profilePhotoUpdatedAt,
  } : null} returnTo={returnTo} />;
}
