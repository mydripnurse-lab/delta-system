import { redirect } from "next/navigation";

import ClientReferralProgram from "@/components/client/ClientReferralProgram";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientReferralSummary } from "@/lib/clientReferrals";

export const dynamic = "force-dynamic";

export default async function ClientInvitationRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards/invitations");
  const summary = await getClientReferralSummary(account.id);
  return <ClientReferralProgram initialSummary={summary} />;
}
