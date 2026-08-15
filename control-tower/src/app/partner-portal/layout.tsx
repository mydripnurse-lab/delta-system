import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PortalLocaleProvider } from "@/components/portal/PortalLocaleProvider";

const BRAND_ICON_URL = "https://sitemaps.mydripnurse.com/favicon.ico";

export const metadata: Metadata = {
  applicationName: "My Drip Nurse Partner Portal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MDN Partner",
  },
  icons: {
    icon: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    shortcut: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    apple: [{ url: "/partner-portal-icon-v2-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#075c68",
  viewportFit: "cover",
};

export default function PartnerPortalLayout({ children }: { children: ReactNode }) {
  return <PortalLocaleProvider>{children}</PortalLocaleProvider>;
}
