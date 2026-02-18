"use client";

import { useEffect, useState } from "react";

type SearchParamsLike = { get: (key: string) => string | null } | null | undefined;

function normDomain(raw: unknown) {
  return String(raw || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "")
    .trim();
}

export function useResolvedTenantId(searchParams: SearchParamsLike) {
  const tenantIdFromQuery = String(searchParams?.get("tenantId") || "").trim();
  const [tenantId, setTenantId] = useState(tenantIdFromQuery);
  const [tenantReady, setTenantReady] = useState(Boolean(tenantIdFromQuery));

  useEffect(() => {
    let cancelled = false;

    async function resolveByDomain() {
      if (tenantIdFromQuery) {
        setTenantId(tenantIdFromQuery);
        setTenantReady(true);
        return;
      }
      try {
        const host = normDomain(window.location.hostname);
        const res = await fetch("/api/tenants", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; rows?: Array<{ id?: string; root_domain?: string | null }> }
          | null;
        const rows = Array.isArray(json?.rows) ? json.rows : [];
        const match = rows.find((r) => normDomain(r?.root_domain) === host);
        if (!cancelled && match?.id) setTenantId(String(match.id));
      } finally {
        if (!cancelled) setTenantReady(true);
      }
    }

    void resolveByDomain();
    return () => {
      cancelled = true;
    };
  }, [tenantIdFromQuery]);

  return { tenantId, tenantReady };
}

