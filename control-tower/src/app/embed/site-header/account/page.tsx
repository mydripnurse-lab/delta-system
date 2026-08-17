import type { Metadata } from "next";

import MarketingHeaderAccountEmbed from "@/components/marketing/MarketingHeaderAccountEmbed";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Drip Nurse account",
  robots: { index: false, follow: false },
};

export default async function SiteHeaderAccountEmbedPage() {
  const account = await getAuthenticatedClient();
  return <MarketingHeaderAccountEmbed account={account ? {
    fullName: account.fullName,
    email: account.email,
    photoUrl: account.profilePhotoUrl,
    photoUpdatedAt: account.profilePhotoUpdatedAt,
  } : null} />;
}
