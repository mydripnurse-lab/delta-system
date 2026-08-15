"use client";

import { useState } from "react";

export default function ClientLogoutButton({ className = "" }: { className?: string }) {
  const [working, setWorking] = useState(false);
  return (
    <form
      action="/api/client-auth/logout"
      method="post"
      onSubmit={() => setWorking(true)}
    >
      <button type="submit" className={className} disabled={working}>
        {working ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
