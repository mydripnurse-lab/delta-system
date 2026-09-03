import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ClientPortalShell from "@/components/client/ClientPortalShell";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Care | My Drip Nurse",
  description: "Your My Drip Nurse care portal for booking appointments, managing orders, shopping wellness products, discovering new services, and earning rewards.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://care.mydripnurse.com" },
};

export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login");
  return <ClientPortalShell account={account}>{children}</ClientPortalShell>;
}
