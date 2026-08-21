"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { trackBookingAttribution } from "@/lib/clientAttribution";

const EXCLUDED_HOSTS = new Set(["admin.mydripnurse.com", "onboarding.mydripnurse.com", "policy.mydripnurse.com"]);

export default function AttributionTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    const publicHost = host === "localhost" || host === "127.0.0.1" || ((host === "mydripnurse.com" || host.endsWith(".mydripnurse.com")) && !EXCLUDED_HOSTS.has(host));
    if (!publicHost || pathname.startsWith("/api/") || pathname.startsWith("/partner-portal")) return;
    const key = `mdn:page-view:${window.location.href}`;
    try {
      const previous = Number(sessionStorage.getItem(key) || 0);
      if (previous && Date.now() - previous < 5_000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch { /* analytics must remain non-blocking */ }
    trackBookingAttribution(pathname.includes("/services/") ? "service_view" : "page_view");
  }, [pathname]);
  return null;
}
