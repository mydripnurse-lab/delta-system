import { ApplicationDetailClient } from "@/components/partner-admin/ApplicationDetailClient";

export const dynamic = "force-dynamic";

export default async function PartnerApplicationPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <ApplicationDetailClient applicationId={applicationId} />;
}
