"use client";

import { useEffect } from "react";

const STORAGE_KEY = "mdn:directory-attribution";
const ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function PartnerDirectoryAttribution({ partnerProfileId, disabled = false }: { partnerProfileId: string; disabled?: boolean }) {
  useEffect(() => {
    if (disabled) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("ref") === "directory" && params.get("directoryPartnerId") === partnerProfileId) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ partnerId: partnerProfileId, at: Date.now() }));
      }
    } catch { /* attribution must never interrupt the Partner website */ }
    const trackBookingStart = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      const href = anchor?.getAttribute("href") || "";
      if (!/\/services\/[^/]+\/book(?:[/?#]|$)/i.test(href)) return;
      try {
        const attribution = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null") as { partnerId?: string; at?: number; bookingTracked?: boolean } | null;
        if (!attribution || attribution.partnerId !== partnerProfileId || attribution.bookingTracked || !attribution.at || Date.now() - attribution.at > ATTRIBUTION_WINDOW_MS) return;
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...attribution, bookingTracked: true }));
        void fetch("/api/public/partner-directory/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partnerProfileIds: [partnerProfileId], event: "booking_click" }),
          keepalive: true,
        }).catch(() => undefined);
      } catch { /* analytics must never interrupt booking */ }
    };
    document.addEventListener("click", trackBookingStart, true);
    return () => document.removeEventListener("click", trackBookingStart, true);
  }, [disabled, partnerProfileId]);
  return null;
}
