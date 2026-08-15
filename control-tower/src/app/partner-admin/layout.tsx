import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalLocaleProvider } from "@/components/portal/PortalLocaleProvider";

const BRAND_ICON_URL = "https://sitemaps.mydripnurse.com/favicon.ico";

export const metadata: Metadata = {
  title: "My Drip Nurse Partner Admin",
  description: "Private My Drip Nurse workspace for partner applications, services, calendars and onboarding.",
  icons: {
    icon: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    shortcut: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    apple: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
  },
};

export default function PartnerAdminLayout({ children }: { children: ReactNode }) {
  return <PortalLocaleProvider>{children}</PortalLocaleProvider>;
}
