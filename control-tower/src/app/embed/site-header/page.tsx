import type { Metadata } from "next";

import MarketingHeaderEmbed from "@/components/marketing/MarketingHeaderEmbed";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Drip Nurse navigation",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function safeWebsiteUrl(value: string) {
  const candidate = value.trim();
  if (!candidate || candidate.includes("{{") || candidate.includes("}}")) return "https://mydripnurse.com";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "https://mydripnurse.com";
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "https://mydripnurse.com";
  }
}

function safePhone(value: string) {
  const candidate = value.trim();
  return !candidate || candidate.includes("{{") || candidate.includes("}}")
    ? "321-989-6446"
    : candidate.slice(0, 40);
}

function safeLocation(value: string) {
  const candidate = value.trim();
  return !candidate || candidate.includes("{{") || candidate.includes("}}")
    ? "Orange County, Florida"
    : candidate.slice(0, 80);
}

export default async function SiteHeaderEmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const account = await getAuthenticatedClient();
  return (
    <MarketingHeaderEmbed
      account={account ? {
        fullName: account.fullName,
        email: account.email,
        photoUrl: account.profilePhotoUrl,
        photoUpdatedAt: account.profilePhotoUpdatedAt,
      } : null}
      location={safeLocation(first(query.location))}
      phone={safePhone(first(query.phone))}
      websiteUrl={safeWebsiteUrl(first(query.website))}
    />
  );
}
