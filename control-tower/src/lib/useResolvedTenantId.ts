"use client";

import { useEffect, useState } from "react";

type SearchParamsLike = { get: (key: string) => string | null } | null | undefined;
type TenantRow = { id?: string; root_domain?: string | null };

function normDomain(raw: unknown) {
  return String(raw || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "")
    .trim();
}

export function useResolvedTenantId(searchParams: SearchParamsLike) {
  const LAST_TENANT_KEY = "control_tower:last_tenant_id";
  const tenantIdFromQuery = String(searchParams?.get("tenantId") || "").trim();
  const [tenantId, setTenantId] = useState(tenantIdFromQuery);
  const [tenantReady, setTenantReady] = useState(Boolean(tenantIdFromQuery));

  useEffect(() => {
    let cancelled = false;

    async function resolveByDomain() {
      if (tenantIdFromQuery) {
        setTenantId(tenantIdFromQuery);
        try {
          window.localStorage.setItem(LAST_TENANT_KEY, tenantIdFromQuery);
        } catch {}
        setTenantReady(true);
        return;
      }
      try {
        const host = normDomain(window.location.hostname);
        const res = await fetch("/api/tenants", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; rows?: TenantRow[] } | null;
        const rows = Array.isArray(json?.rows) ? json.rows : [];
        const byDomain = rows.find((r) => normDomain(r?.root_domain) === host);

        let resolved = String(byDomain?.id || "").trim();
        if (!resolved) {
          try {
            const last = String(window.localStorage.getItem(LAST_TENANT_KEY) || "").trim();
            if (last && rows.some((r) => String(r?.id || "").trim() === last)) {
              resolved = last;
            }
          } catch {}
        }
        if (!resolved && rows.length === 1) {
          resolved = String(rows[0]?.id || "").trim();
        }
        if (!resolved && rows.length > 1) {
          resolved = String(rows[0]?.id || "").trim();
        }

        if (!cancelled && resolved) {
          setTenantId(resolved);
          try {
            window.localStorage.setItem(LAST_TENANT_KEY, resolved);
          } catch {}
        }
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
