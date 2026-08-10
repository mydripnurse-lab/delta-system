import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    name: "My Drip Nurse Partner Portal",
    short_name: "MDN Partner",
    description: "Manage My Drip Nurse appointments, availability, and partner profile.",
    start_url: "/portal",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f4",
    theme_color: "#075c68",
    icons: [{ src: "https://sitemaps.mydripnurse.com/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
