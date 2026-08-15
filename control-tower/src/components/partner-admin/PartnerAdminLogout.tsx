"use client";

import { useState } from "react";

export function PartnerAdminLogout({ className, label = "Sign out", busyLabel = "Signing out…" }: { className?: string; label?: string; busyLabel?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/partner-admin/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button type="button" className={className} onClick={signOut} disabled={busy}>
      {busy ? busyLabel : label}
    </button>
  );
}
