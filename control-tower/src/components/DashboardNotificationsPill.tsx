"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  tenantId: string;
  href: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default function DashboardNotificationsPill({ tenantId, href }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) {
        if (!cancelled) setCount(0);
        return;
      }
      try {
        const qs = new URLSearchParams({
          organizationId: tenantId,
          status: "proposed",
          limit: "200",
        });
        const res = await fetch(`/api/agents/proposals?${qs.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; proposals?: Array<unknown>; error?: string }
          | null;
        if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
        if (!cancelled) setCount(Array.isArray(json.proposals) ? json.proposals.length : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <Link className="pill" href={href} style={{ textDecoration: "none" }} title="Open Notification Hub">
      <span>Notifications</span>
      <span className="badge" style={{ marginLeft: 6 }}>{count}</span>
    </Link>
  );
}

