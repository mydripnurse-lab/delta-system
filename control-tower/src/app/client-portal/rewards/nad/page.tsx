import { redirect } from "next/navigation";

import VisitRewardExperience from "@/app/client-portal/rewards/VisitRewardExperience";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";

export const dynamic = "force-dynamic";

export default async function ClientNadRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards/nad");
  const summary = await getClientVisitRewardSummary(account.id, "nad_family");
  return <VisitRewardExperience summary={summary} variant="nad" />;
}
