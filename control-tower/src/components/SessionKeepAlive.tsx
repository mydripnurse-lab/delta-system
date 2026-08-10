"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

export default function SessionKeepAlive() {
  useEffect(() => {
    let stopped = false;

    const refresh = async () => {
      if (stopped) return;
      try {
        const endpoint = window.location.hostname.toLowerCase() === "admin.mydripnurse.com"
          ? "/api/partner-admin/auth/refresh"
          : "/api/auth/refresh";
        await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
        });
      } catch {
        // A temporary network failure is retried by the next interval/focus.
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
