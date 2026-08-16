import { redirect } from "next/navigation";

import VisitRewardExperience from "@/app/client-portal/rewards/VisitRewardExperience";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";

export const dynamic = "force-dynamic";

export default async function ClientVisitRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards/visits");
  const summary = await getClientVisitRewardSummary(account.id, "wellness");
  return <VisitRewardExperience summary={summary} variant="wellness" />;
}
