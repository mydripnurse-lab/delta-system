import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rewards | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function RewardsPage() {
  return renderPartnerPortal("rewards");
}
