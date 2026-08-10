import { renderPartnerPortal } from "./partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Partner Portal | My Drip Nurse",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export default async function PartnerPortalPage() {
  return renderPartnerPortal("overview");
}
