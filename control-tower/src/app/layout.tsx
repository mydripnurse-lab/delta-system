import type { Metadata } from "next";
import "./globals.css";
import SessionKeepAlive from "@/components/SessionKeepAlive";

const BRAND_ICON_URL = "https://sitemaps.mydripnurse.com/favicon.ico";

export const metadata: Metadata = {
  title: "Delta System -  AI growth infrastructure for every U.S. market",
  description: "Delta System generates websites for every city, county, and state in the U.S., including Puerto Rico, then runs business operations with AI from one control tower.",
  icons: {
    icon: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    shortcut: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
    apple: [{ url: BRAND_ICON_URL, type: "image/x-icon" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionKeepAlive />
        {children}
      </body>
    </html>
  );
}
