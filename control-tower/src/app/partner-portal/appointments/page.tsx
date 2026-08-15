import { renderPartnerPortal } from "../partnerPortalPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appointments | Partner Portal", robots: { index: false, follow: false }, manifest: "/manifest.webmanifest" };

export default function AppointmentsPage() {
  return renderPartnerPortal("appointments");
}
