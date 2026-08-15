import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    name: "My Drip Nurse Partner Portal",
    short_name: "MDN Partner",
    description: "Manage My Drip Nurse appointments, availability, and partner profile.",
    id: "/partner-portal",
    start_url: "/partner-portal",
    scope: "/partner-portal",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f6f4",
    theme_color: "#075c68",
    icons: [
      { src: "/partner-portal-icon-v2-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/partner-portal-icon-v2-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/partner-portal-icon-maskable-v2-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Cache-Control": "public, max-age=300, must-revalidate", "Content-Type": "application/manifest+json" } });
}
