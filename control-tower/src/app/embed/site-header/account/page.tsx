import type { Metadata } from "next";
import { headers } from "next/headers";

import MarketingHeaderAccountEmbed from "@/components/marketing/MarketingHeaderAccountEmbed";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { trustedMdnHome } from "@/lib/trustedMdnOrigin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Drip Nurse account",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function SiteHeaderAccountEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, query, requestHeaders] = await Promise.all([
    getAuthenticatedClient(),
    searchParams,
    headers(),
  ]);
  const returnTo = trustedMdnHome(first(query.returnTo)) || trustedMdnHome(requestHeaders.get("referer"));
  return <MarketingHeaderAccountEmbed account={account ? {
    fullName: account.fullName,
    email: account.email,
    photoUrl: account.profilePhotoUrl,
    photoUpdatedAt: account.profilePhotoUpdatedAt,
  } : null} returnTo={returnTo} />;
}
