import type { Metadata } from "next";
import "./globals.css";

const BRAND_ICON_URL =
  "https://storage.googleapis.com/msgsndr/K8GcSVZWinRaQTMF6Sb8/media/698c5030a41b87368f94ef80.png";

export const metadata: Metadata = {
  title: "Delta System -  AI growth infrastructure for every U.S. market",
  description: "Delta System generates websites for every city, county, and state in the U.S., including Puerto Rico, then runs business operations with AI from one control tower.",
  icons: {
    icon: [{ url: BRAND_ICON_URL, type: "image/png" }],
    shortcut: [{ url: BRAND_ICON_URL, type: "image/png" }],
    apple: [{ url: BRAND_ICON_URL, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
