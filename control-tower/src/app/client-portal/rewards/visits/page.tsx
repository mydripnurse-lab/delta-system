import { redirect } from "next/navigation";

import VisitRewardExperience from "@/app/client-portal/rewards/VisitRewardExperience";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";
import { loadCurrentMyDripNurseServices, MY_DRIP_NURSE_SERVICES } from "@/lib/myDripNurseServices";

export const dynamic = "force-dynamic";

export default async function ClientVisitRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards/visits");
  const [summary, currentServices] = await Promise.all([
    getClientVisitRewardSummary(account.id, "wellness"),
    loadCurrentMyDripNurseServices(),
  ]);
  return <VisitRewardExperience summary={summary} variant="wellness" services={currentServices.length ? currentServices : MY_DRIP_NURSE_SERVICES} />;
}
