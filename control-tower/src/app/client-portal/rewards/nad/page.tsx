import { redirect } from "next/navigation";

import VisitRewardExperience from "@/app/client-portal/rewards/VisitRewardExperience";
import { getAuthenticatedClient } from "@/lib/clientPortalAuth";
import { getClientVisitRewardSummary } from "@/lib/clientRewards";
import { loadCurrentMyDripNurseServices, MY_DRIP_NURSE_SERVICES } from "@/lib/myDripNurseServices";

export const dynamic = "force-dynamic";

export default async function ClientNadRewardsPage() {
  const account = await getAuthenticatedClient();
  if (!account) redirect("/login?next=/rewards/nad");
  const [summary, currentServices] = await Promise.all([
    getClientVisitRewardSummary(account.id, "nad_family"),
    loadCurrentMyDripNurseServices(),
  ]);
  return <VisitRewardExperience summary={summary} variant="nad" services={currentServices.length ? currentServices : MY_DRIP_NURSE_SERVICES} />;
}
