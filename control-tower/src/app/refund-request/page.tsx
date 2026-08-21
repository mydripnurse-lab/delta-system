import type { Metadata } from "next";

import RefundRequestForm from "@/components/refunds/RefundRequestForm";
import { getRefundRequestContext } from "@/lib/appointmentRefundRequests";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request a refund | My Drip Nurse",
  description: "Securely request review of a My Drip Nurse appointment deposit.",
  robots: { index: false, follow: false },
};

export default async function RefundRequestPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const [account, params] = await Promise.all([getAuthenticatedClient(), searchParams]);
  const context = await getRefundRequestContext(account);
  return <RefundRequestForm initialContext={context} embedded={params.embed === "1"} />;
}
