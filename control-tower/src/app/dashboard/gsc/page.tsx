// control-tower/src/app/dashboard/gsc/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";

const UsaChoroplethProgressMap = dynamic(
  () => import("@/components/UsaChoroplethProgressMap"),
  { ssr: false },
);
const PuertoRicoMunicipioSearchMap = dynamic(
  () => import("@/components/PuertoRicoMunicipioSearchMap"),
  { ssr: false },
);

const GSCTrendChart = dynamic(() => import("@/components/GSCTrendChart"), {
  ssr: false,
});

type RangePreset =
  | "last_7_days"
  | "last_28_days"
  | "last_month"
  | "last_quarter"
  | "last_6_months"
  | "last_year"
  | "custom";
type SearchTab = "gsc" | "bing" | "all";
type GscSectionKey =
  | "overview"
  | "filters"
  | "geo"
  | "queries"
  | "segments"
  | "states"
  | "ai-playbook"
  | "chat";

type AuthMeUser = {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  globalRoles?: string[];
};

function fmtInt(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
function fmtPct(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0.00%";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtPos(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}
function fmtDeltaPct(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

// For pills: allow "invert" semantics (lower is better: avg position)
function deltaClass(pct: any, opts?: { invert?: boolean }) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "";
  const invert = !!opts?.invert;

  if (!invert) return n < 0 ? "deltaDown" : "deltaUp";
  return n > 0 ? "deltaDown" : "deltaUp";
}

function GscDashboardPageContent() {
  const searchParams = useBrowserSearchParams();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const [preset, setPreset] = useState<RangePreset>("last_28_days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [metric, setMetric] = useState<"impressions" | "clicks">("impressions");
  const [mapSelected, setMapSelected] = useState<string>("");
  const [mapScope, setMapScope] = useState<"us" | "pr">("us");
  const [prMunicipioSelected, setPrMunicipioSelected] = useState<string>("");

  const [trendMode, setTrendMode] = useState<"day" | "week" | "month">("day");
  const [compareOn, setCompareOn] = useState(true);

  const [nfTab, setNfTab] = useState<"nationwide" | "funnels">("nationwide");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiInsights, setAiInsights] = useState<any>(null);

  const [data, setData] = useState<any>(null);

  const [showTopKeywords, setShowTopKeywords] = useState(true);
  const [searchTab, setSearchTab] = useState<SearchTab>("all");

  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);
  const integrationKeyRaw =
    String(searchParams?.get("integrationKey") || "").trim() || "default";
  const integrationKey =
    integrationKeyRaw.toLowerCase() === "owner" ? "default" : integrationKeyRaw;
  const backHref = tenantId
    ? `/dashboard?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard";
  const notificationHubHref = tenantId
    ? `/dashboard/notification-hub?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard/notification-hub";
  const sectionBasePath = pathname?.includes("/dashboard/search-performance")
    ? "/dashboard/search-performance"
    : "/dashboard/gsc";

  const [authMe, setAuthMe] = useState<AuthMeUser | null>(null);
  const [tenantHeaderName, setTenantHeaderName] = useState("My Drip Nurse");
  const [tenantHeaderSlug, setTenantHeaderSlug] = useState("my-drip-nurse");
  const [tenantHeaderLogo, setTenantHeaderLogo] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const activeSection = useMemo<GscSectionKey>(() => {
    const path = String(pathname || "");
    const base = sectionBasePath;
    const tail = path.startsWith(base) ? path.slice(base.length) : "";
    const raw = tail.replace(/^\/+/, "").split("/")[0] || "";
    if (
      raw === "filters" ||
      raw === "geo" ||
      raw === "queries" ||
      raw === "segments" ||
      raw === "states" ||
      raw === "ai-playbook" ||
      raw === "chat" ||
      raw === "overview"
    ) {
      return raw;
    }
    return "overview";
  }, [pathname, sectionBasePath]);

  const sectionNavItems: Array<{ key: GscSectionKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "geo", label: "Geo Intelligence" },
    { key: "queries", label: "Query Explorer" },
    { key: "segments", label: "Nationwide & Funnels" },
    { key: "states", label: "States Table" },
    { key: "ai-playbook", label: "AI Playbook" },
    { key: "chat", label: "Agent Chat" },
  ];

  function buildSectionHref(section: GscSectionKey) {
    const query = new URLSearchParams(searchParams?.toString() || "");
    query.set("range", preset);
    if (preset === "custom") {
      if (customStart) query.set("start", customStart);
      if (customEnd) query.set("end", customEnd);
    } else {
      query.delete("start");
      query.delete("end");
    }
    query.set("source", searchTab);
    query.set("metric", metric);
    query.set("trend", trendMode);
    query.set("mapScope", mapScope);
    if (mapScope === "us" && mapSelected) query.set("state", mapSelected);
    else query.delete("state");
    if (mapScope === "pr" && prMunicipioSelected)
      query.set("prTown", prMunicipioSelected);
    else query.delete("prTown");
    if (compareOn) query.set("compare", "1");
    else query.delete("compare");
    attachTenantScope(query);
    const qs = query.toString();
    const href = `${sectionBasePath}/${section}`;
    return qs ? `${href}?${qs}` : href;
  }

  function accountDisplayName() {
    const full = String(authMe?.fullName || "").trim();
    if (full) return full;
    const email = String(authMe?.email || "").trim();
    if (!email) return "Platform User";
    return email.split("@")[0] || email;
  }

  function currentRoleLabel() {
    const roles = Array.isArray(authMe?.globalRoles) ? authMe.globalRoles : [];
    return String(roles[0] || "tenant_user").trim() || "tenant_user";
  }

  function initialsFromLabel(label: string) {
    const cleaned = String(label || "").trim();
    if (!cleaned) return "U";
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  function openAgencyAccountPanel(panel: "profile" | "security") {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/?account=${panel}&returnTo=${returnTo}`;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  function attachTenantScope(p: URLSearchParams) {
    if (!tenantId) return;
    p.set("tenantId", tenantId);
    p.set("integrationKey", integrationKey);
  }

  useEffect(() => {
    const qRange = String(searchParams?.get("range") || "").trim();
    const qStart = String(searchParams?.get("start") || "").trim();
    const qEnd = String(searchParams?.get("end") || "").trim();
    const qSource = String(searchParams?.get("source") || "").trim().toLowerCase();
    const qMetric = String(searchParams?.get("metric") || "").trim().toLowerCase();
    const qTrend = String(searchParams?.get("trend") || "").trim().toLowerCase();
    const qState = String(searchParams?.get("state") || "").trim();
    const qMapScope = String(searchParams?.get("mapScope") || "").trim().toLowerCase();
    const qPrTown = String(searchParams?.get("prTown") || "").trim();
    const qCompare = String(searchParams?.get("compare") || "").trim();

    if (
      qRange === "last_7_days" ||
      qRange === "last_28_days" ||
      qRange === "last_month" ||
      qRange === "last_quarter" ||
      qRange === "last_6_months" ||
      qRange === "last_year" ||
      qRange === "custom"
    ) {
      setPreset(qRange);
    }
    if (qRange === "custom") {
      setCustomStart(qStart);
      setCustomEnd(qEnd);
    }
    if (qSource === "gsc" || qSource === "bing" || qSource === "all") {
      setSearchTab(qSource);
    }
    if (qMetric === "impressions" || qMetric === "clicks") {
      setMetric(qMetric);
    }
    if (qTrend === "day" || qTrend === "week" || qTrend === "month") {
      setTrendMode(qTrend);
    }
    if (qMapScope === "us" || qMapScope === "pr") {
      setMapScope(qMapScope);
    }
    setMapSelected(qState);
    setPrMunicipioSelected(qPrTown);
    setCompareOn(qCompare !== "0");
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadAuthMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; user?: AuthMeUser }
          | null;
        if (!cancelled && res.ok && json?.ok && json.user) setAuthMe(json.user);
      } catch {
        // optional auth metadata for header
      }
    }
    void loadAuthMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantBranding() {
      if (!tenantId) return;
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              tenant?: { name?: string | null; slug?: string | null } | null;
              settings?: { logo_url?: string | null } | null;
            }
          | null;
        if (!res.ok || !json?.ok || cancelled) return;
        const name = String(json.tenant?.name || "").trim();
        const slug = String(json.tenant?.slug || "").trim();
        const logoUrl = String(json.settings?.logo_url || "").trim();
        if (name) setTenantHeaderName(name);
        if (slug) setTenantHeaderSlug(slug);
        setTenantHeaderLogo(logoUrl);
      } catch {
        // optional tenant branding for header
      }
    }
    void loadTenantBranding();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadNotificationCount() {
      if (!tenantId) {
        if (!cancelled) setNotificationCount(0);
        return;
      }
      try {
        const qs = new URLSearchParams({
          organizationId: tenantId,
          status: "proposed",
          limit: "200",
        });
        const res = await fetch(`/api/agents/proposals?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; proposals?: Array<unknown>; error?: string }
          | null;
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error || "").trim() || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setNotificationCount(Array.isArray(json.proposals) ? json.proposals.length : 0);
        }
      } catch {
        if (!cancelled) setNotificationCount(0);
      }
    }
    void loadNotificationCount();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function qs() {
    const p = new URLSearchParams();
    p.set("range", preset);
    if (preset === "custom") {
      if (customStart) p.set("start", customStart);
      if (customEnd) p.set("end", customEnd);
    }
    p.set("mapScope", mapScope);
    if (mapScope === "us" && mapSelected) p.set("state", mapSelected);
    if (mapScope === "pr" && prMunicipioSelected) p.set("prTown", prMunicipioSelected);
    if (compareOn) p.set("compare", "1");
    attachTenantScope(p);
    return p.toString();
  }

  function buildSyncParams(force: boolean) {
    const p = new URLSearchParams();
    p.set("range", preset);
    if (preset === "custom") {
      if (customStart) p.set("start", customStart);
      if (customEnd) p.set("end", customEnd);
    }
    if (force) p.set("force", "1");

    // ✅ IMPORTANT: tell sync we need previous-window trend when compare is on
    if (compareOn) p.set("compare", "1");

    p.set("v", String(Date.now()));
    attachTenantScope(p);
    return p.toString();
  }

  function buildJoinUrl(forceCatalog: boolean) {
    const base = qs();
    const p = new URLSearchParams(base);
    if (forceCatalog) p.set("force", "1");
    if (mapScope === "pr") p.set("bust", "1");
    p.set("v", String(Date.now()));
    if (searchTab === "bing") return `/api/dashboard/bing/join?${p.toString()}`;
    if (searchTab === "all")
      return `/api/dashboard/search-performance/join?${p.toString()}`;
    return `/api/dashboard/gsc/join?${p.toString()}`;
  }

  async function load(opts?: { force?: boolean }) {
    const force = !!opts?.force || preset === "custom";
    if (!tenantReady) return;

    setErr("");
    setLoading(true);
    setAiErr("");
    setAiInsights(null);

    try {
      if (!tenantId) {
        throw new Error("Missing tenant context. Open from Control Tower or use a mapped project domain.");
      }
      const syncTargets =
        searchTab === "all"
          ? ["/api/dashboard/gsc/sync", "/api/dashboard/bing/sync"]
          : [searchTab === "bing" ? "/api/dashboard/bing/sync" : "/api/dashboard/gsc/sync"];

      for (const syncTarget of syncTargets) {
        const syncRes = await fetch(
          `${syncTarget}?${buildSyncParams(force)}`,
          {
            cache: "no-store",
          },
        );
        const syncJson = await syncRes.json();
        if (!syncRes.ok || !syncJson?.ok) {
          throw new Error(syncJson?.error || `SYNC HTTP ${syncRes.status}`);
        }
      }

      const res = await fetch(buildJoinUrl(force), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || `JOIN HTTP ${res.status}`);

      setData(json);
    } catch (e: any) {
      setData(null);
      setErr(e?.message || "Failed to load GSC dashboard");
    } finally {
      setLoading(false);
      setHardRefreshing(false);
    }
  }

  useEffect(() => {
    if (!tenantReady) return;
    if (!tenantId) {
      setErr("Missing tenant context. Open from Control Tower or use a mapped project domain.");
      return;
    }
    if (preset !== "custom") load();
    else if (customStart && customEnd) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, compareOn, searchTab, tenantReady, tenantId]);

  useEffect(() => {
    if (data && tenantReady && tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSelected, tenantReady, tenantId]);

  useEffect(() => {
    if (mapScope !== "pr") return;
    if (mapSelected) setMapSelected("");
  }, [mapScope, mapSelected]);

  function clearSelection() {
    if (mapScope === "pr") setPrMunicipioSelected("");
    else setMapSelected("");
  }

  const summaryOverall = data?.summaryOverall || {
    impressions: 0,
    clicks: 0,
    ctr: 0,
    position: 0,
    pagesCounted: 0,
    generatedAt: null,
    startDate: null,
    endDate: null,
  };

  const summaryFiltered = data?.summaryFiltered || summaryOverall;
  const selectedState = mapScope === "us" ? mapSelected : "";
  const summary = selectedState ? summaryFiltered : summaryOverall;

  const compare = data?.compare || null;
  const stateRows = (data?.stateRows || []) as Array<any>;
  const prMunicipioRows = (data?.prMunicipioRows || []) as Array<any>;

  const mapRows = useMemo(() => {
    const rows = stateRows.filter((r) => r.state !== "__unknown");
    const values = rows.map((r) =>
      metric === "impressions"
        ? Number(r.impressions || 0)
        : Number(r.clicks || 0),
    );
    const max = Math.max(...values, 1);

    return rows.map((r) => {
      const v =
        metric === "impressions"
          ? Number(r.impressions || 0)
          : Number(r.clicks || 0);
      return {
        state: r.state,
        counties: { total: max, ready: v, domainsActive: 0 },
        cities: { total: 0, ready: 0, domainsActive: 0 },
        __value: v,
      };
    });
  }, [stateRows, metric]);

  const selectedStateRow = useMemo(() => {
    if (!selectedState) return null;
    return stateRows.find((r) => String(r.state) === selectedState) || null;
  }, [selectedState, stateRows]);

  const selectedPrMunicipioRow = useMemo(() => {
    if (!prMunicipioSelected) return null;
    return (
      prMunicipioRows.find(
        (r) =>
          String(r.municipio || "").trim().toLowerCase() ===
          prMunicipioSelected.trim().toLowerCase(),
      ) || null
    );
  }, [prMunicipioRows, prMunicipioSelected]);

  const prTopMunicipios = useMemo(() => {
    return [...prMunicipioRows]
      .sort((a, b) => {
        const av = metric === "impressions" ? Number(a?.impressions || 0) : Number(a?.clicks || 0);
        const bv = metric === "impressions" ? Number(b?.impressions || 0) : Number(b?.clicks || 0);
        return bv - av;
      })
      .slice(0, 10);
  }, [prMunicipioRows, metric]);

  const topQueries = data?.top?.queries || [];
  const topPages = data?.top?.pages || [];

  const summaryNationwide = data?.summaryNationwide || {
    impressions: 0,
    clicks: 0,
    ctr: 0,
    position: 0,
    pagesCounted: 0,
    label: "Nationwide / Home Page",
    rootHost: "",
  };

  const funnelRows = (data?.funnels || []) as any[];
  const summaryFunnels = data?.summaryFunnels || {
    impressions: 0,
    clicks: 0,
    ctr: 0,
    position: 0,
    pagesCounted: 0,
    label: "Funnels (non-Delta subdomains)",
  };

  const trend = (data?.trend || []) as any[];
  const trendFiltered = (data?.trendFiltered || []) as any[];
  const startDate = summary?.startDate || data?.meta?.startDate || null;
  const endDate = summary?.endDate || data?.meta?.endDate || null;

  const keywordsCount = useMemo(() => {
    if (selectedState) return selectedStateRow?.keywordsCount ?? 0;
    return data?.keywordsOverall ?? 0;
  }, [data, selectedState, selectedStateRow]);

  const topKeywords = useMemo(() => {
    if (!data) return [];
    if (selectedState) return (data?.topKeywordsFiltered || []).slice(0, 10);
    return (data?.topKeywordsOverall || []).slice(0, 10);
  }, [data, selectedState]);

  const comparePills = useMemo(() => {
    if (!compareOn || !compare?.pct) return null;
    const pct = compare.pct || {};
    return {
      impressions: pct.impressions ?? null,
      clicks: pct.clicks ?? null,
      ctr: pct.ctr ?? null,
      position: pct.position ?? null,
    };
  }, [compareOn, compare]);

  async function generateInsights() {
    setAiErr("");
    setAiLoading(true);
    setAiInsights(null);

    try {
      const payload = {
        source: searchTab,
        range: {
          preset,
          start: summary.startDate,
          end: summary.endDate,
          generatedAt: summary.generatedAt,
        },
        scope: {
          state: selectedState || null,
          municipio: mapScope === "pr" ? prMunicipioSelected || null : null,
          mapScope,
          metric,
        },
        summary,
        keywordsCount: keywordsCount ?? null,
        nationwide: summaryNationwide,
        funnels: {
          summary: summaryFunnels,
          rows: funnelRows.slice(0, 25),
        },
        compare: compareOn ? compare : null,
        trend: {
          mode: trendMode,
          note: "trendFiltered is range-aligned; comparison uses previous window based on trend only.",
        },
        top: {
          queries: topQueries.slice(0, 25),
          pages: topPages.slice(0, 25),
        },
        states: stateRows.slice(0, 20),
        searchPerformance: {
          note:
            "__unknown = páginas fuera del patrón Delta o sin match en catálogo del tenant.",
        },
        debug: data?.debug || null,
      };

      const insightsEndpoint =
        searchTab === "bing"
          ? "/api/dashboard/bing/insights"
          : searchTab === "all"
            ? "/api/dashboard/search-performance/insights"
            : "/api/dashboard/gsc/insights";

      const endpointQs = new URLSearchParams();
      attachTenantScope(endpointQs);
      const endpointUrl = endpointQs.toString()
        ? `${insightsEndpoint}?${endpointQs.toString()}`
        : insightsEndpoint;

      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || "Failed to generate insights");
      setAiInsights(json.insights);
    } catch (e: any) {
      setAiErr(e?.message || "Failed to generate insights");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="agencyShell callsDash dashboardPremium">
      <header className="agencyGlobalTopbar">
        <div className="agencyGlobalBrand">
          {tenantHeaderLogo ? (
            <img
              className="logo tenantLogo"
              src={tenantHeaderLogo}
              alt={`${tenantHeaderName} logo`}
            />
          ) : (
            <div className="agencyBrandLogo agencyBrandLogoDelta" />
          )}
          <div>
            <h1>{tenantHeaderName} — Search Performance Dashboard</h1>
            <p>@{tenantHeaderSlug || "tenant"}</p>
          </div>
        </div>

        <nav className="agencyGlobalNav agencyGlobalNavRight">
          <div className="agencyAccountWrap" ref={accountMenuRef}>
            <button
              type="button"
              className="agencyAccountTrigger"
              title={accountDisplayName()}
              onClick={() => setAccountMenuOpen((prev) => !prev)}
            >
              <span className="agencyProfileAvatar">
                {notificationCount > 0 ? (
                  <span
                    className="agencyProfileNotifBadge"
                    aria-label={`${notificationCount} notifications`}
                  >
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
                {String(authMe?.avatarUrl || "").trim() ? (
                  <img
                    className="agencyProfileAvatarImg"
                    src={String(authMe?.avatarUrl || "").trim()}
                    alt={accountDisplayName()}
                  />
                ) : (
                  initialsFromLabel(accountDisplayName())
                )}
              </span>
              <span className="agencyAccountIdentity">
                <strong>{accountDisplayName()}</strong>
                <small>{currentRoleLabel()}</small>
              </span>
              <span className="agencyAccountCaret" aria-hidden>
                ▾
              </span>
            </button>
            {accountMenuOpen ? (
              <div className="agencyAccountMenu">
                <button
                  type="button"
                  className="agencyAccountMenuItem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    openAgencyAccountPanel("profile");
                  }}
                >
                  Profile
                </button>
                <button
                  type="button"
                  className="agencyAccountMenuItem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    openAgencyAccountPanel("security");
                  }}
                >
                  Security
                </button>
                <button
                  type="button"
                  className="agencyAccountMenuItem agencyAccountMenuItemNotif"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    window.location.href = notificationHubHref;
                  }}
                >
                  <span>Notifications</span>
                  <span className="agencyAccountMenuCount">{notificationCount}</span>
                </button>
                <button
                  type="button"
                  className="agencyAccountMenuItem"
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <div className="agencyRoot">
        <aside className="agencySidebar">
          <nav className="agencyNav">
            <Link className="agencyNavItem agencyNavBackItem" href={backHref}>
              ← Back to Dashboard
            </Link>
            {sectionNavItems.map((item) => (
              <Link
                key={item.key}
                className={`agencyNavItem ${activeSection === item.key ? "agencyNavItemActive" : ""}`}
                href={buildSectionHref(item.key)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="agencyMain">

      {/* Filters */}
      {activeSection === "filters" || activeSection === "overview" ? (
      <section className="card spRouteAnim" key={`filters-${activeSection}`}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Executive Filters</h2>
            <div className="cardSubtitle">
              Este filtro afecta el mapa, KPIs, trend y tablas. Cache se
              regenera automáticamente (stale ≤ 10 min).
            </div>
          </div>

          <div
            className="cardHeaderActions"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <button
              className={`smallBtn ${compareOn ? "smallBtnOn" : ""}`}
              onClick={() => setCompareOn((v) => !v)}
              disabled={loading}
              type="button"
              title="Compara contra la ventana previa (trend-based)"
            >
              Compare: {compareOn ? "On" : "Off"}
            </button>

            <button
              className="smallBtn"
              onClick={() => {
                setHardRefreshing(true);
                load({ force: true });
              }}
              disabled={loading}
              type="button"
              title="Forza sync con Google + fuerza reload del catálogo tenant (DB-first)"
            >
              {loading && hardRefreshing ? "Hard refresh..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="cardBody">
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              className={`smallBtn ${searchTab === "gsc" ? "smallBtnOn" : ""}`}
              onClick={() => setSearchTab("gsc")}
              type="button"
            >
              Google Search Console
            </button>
            <button
              className={`smallBtn ${searchTab === "bing" ? "smallBtnOn" : ""}`}
              onClick={() => setSearchTab("bing")}
              type="button"
            >
              Bing Webmaster
            </button>
            <button
              className={`smallBtn ${searchTab === "all" ? "smallBtnOn" : ""}`}
              onClick={() => setSearchTab("all")}
              type="button"
            >
              All
            </button>
          </div>

          <div className="filtersBar">
            <div className="filtersGroup">
              <div className="filtersLabel">Range</div>
              <div className="rangePills">
                <button
                  className={`smallBtn ${preset === "last_7_days" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_7_days")}
                  type="button"
                >
                  7 days
                </button>
                <button
                  className={`smallBtn ${preset === "last_28_days" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_28_days")}
                  type="button"
                >
                  28 days
                </button>

                <span className="filtersDivider" />

                <button
                  className={`smallBtn ${preset === "last_month" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_month")}
                  type="button"
                >
                  Last month
                </button>
                <button
                  className={`smallBtn ${preset === "last_quarter" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_quarter")}
                  type="button"
                >
                  Last quarter
                </button>
                <button
                  className={`smallBtn ${preset === "last_6_months" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_6_months")}
                  type="button"
                >
                  Last 6 months
                </button>
                <button
                  className={`smallBtn ${preset === "last_year" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_year")}
                  type="button"
                >
                  Last year
                </button>

                <span className="filtersDivider" />

                <button
                  className={`smallBtn ${preset === "custom" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("custom")}
                  type="button"
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="filtersGroup dateGroup">
              <div className="filtersLabel">Custom dates</div>
              <div className="dateInputs">
                <div className="dateField">
                  <label
                    className="mini"
                    style={{ marginBottom: 6, display: "block" }}
                  >
                    Start
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    disabled={preset !== "custom"}
                  />
                </div>
                <div className="dateField">
                  <label
                    className="mini"
                    style={{ marginBottom: 6, display: "block" }}
                  >
                    End
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    disabled={preset !== "custom"}
                  />
                </div>

                {preset === "custom" && (
                  <button
                    className="btn btnPrimary applyBtn"
                    onClick={() => load({ force: true })}
                    disabled={!customStart || !customEnd || loading}
                    type="button"
                    title="Aplica el rango manual y forza refresh"
                  >
                    {loading ? "Applying..." : "Apply"}
                  </button>
                )}
              </div>

              <div className="mini" style={{ marginTop: 8, opacity: 0.85 }}>
                {preset !== "custom"
                  ? "Tip: Usa presets para velocidad. Custom es para rangos manuales."
                  : "Custom activo: selecciona Start/End y Apply."}
              </div>
            </div>
          </div>

          <div className="filtersRow2">
            <div className="filtersChips">
              <button
                className={`smallBtn ${metric === "impressions" ? "smallBtnOn" : ""}`}
                type="button"
                onClick={() => setMetric("impressions")}
              >
                Impressions
              </button>
              <button
                className={`smallBtn ${metric === "clicks" ? "smallBtnOn" : ""}`}
                type="button"
                onClick={() => setMetric("clicks")}
              >
                Clicks
              </button>

              <span className="filtersDivider" />

              <button
                className="smallBtn"
                onClick={clearSelection}
                type="button"
              >
                {mapScope === "pr" ? "Clear municipio" : "Clear state"}
              </button>

              {summary.generatedAt && (
                <span className="mini" style={{ opacity: 0.8, marginLeft: 8 }}>
                  Last Update:{" "}
                  <b>{new Date(summary.generatedAt).toLocaleString()}</b>
                </span>
              )}
            </div>

            {err ? (
              <div className="mini" style={{ color: "var(--danger)" }}>
                ❌ {err}
              </div>
            ) : (
              <div className="filtersFooter">
                <div className="deltaRow">
                  <span className="deltaHint">
                    <div className="mini" style={{ opacity: 0.9 }}>
                      Range: <b>{summary.startDate || "—"}</b> →{" "}
                      <b>{summary.endDate || "—"}</b> • Impr:{" "}
                      <b>{fmtInt(summary.impressions)}</b> • Clicks:{" "}
                      <b>{fmtInt(summary.clicks)}</b> • CTR:{" "}
                      <b>{fmtPct(summary.ctr)}</b> • Avg pos:{" "}
                      <b>{fmtPos(summary.position)}</b>
                      {selectedState ? (
                        <>
                          {" "}
                          • State: <b>{selectedState}</b>
                        </>
                      ) : null}
                      {mapScope === "pr" && prMunicipioSelected ? (
                        <>
                          {" "}
                          • Municipio: <b>{prMunicipioSelected}</b>
                        </>
                      ) : null}
                    </div>
                  </span>

                  {compareOn && comparePills ? (
                    <span className="deltaPills">
                      <span
                        className={`deltaPill ${deltaClass(comparePills.impressions)}`}
                        title="Δ Impressions vs previous window"
                      >
                        Impr:{" "}
                        {comparePills.impressions == null
                          ? "—"
                          : fmtDeltaPct(comparePills.impressions)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.clicks)}`}
                        title="Δ Clicks vs previous window"
                      >
                        Clicks:{" "}
                        {comparePills.clicks == null
                          ? "—"
                          : fmtDeltaPct(comparePills.clicks)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.ctr)}`}
                        title="Δ CTR vs previous window"
                      >
                        CTR:{" "}
                        {comparePills.ctr == null
                          ? "—"
                          : fmtDeltaPct(comparePills.ctr)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.position, { invert: true })}`}
                        title="Δ Avg position (lower is better)"
                      >
                        Pos:{" "}
                        {comparePills.position == null
                          ? "—"
                          : fmtDeltaPct(comparePills.position)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {/* Summary */}
      {activeSection === "overview" ? (
      <section className="card spRouteAnim" key="overview">
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Summary</h2>
            <div className="cardSubtitle">
              {searchTab === "all"
                ? "KPIs combinados de Google + Bing"
                : searchTab === "bing"
                  ? "KPIs de Bing Webmaster"
                  : "KPIs de Google Search Console"}{" "}
              del rango seleccionado{" "}
              {selectedState ? "(filtrado por estado)" : ""}.
            </div>
          </div>
          <div className="badge">{loading ? "loading…" : "ready"}</div>
        </div>

        <div className="cardBody">
          <div className="kpiGrid32">
            <div className="kpi">
              <p className="n">{fmtInt(summary.impressions)}</p>
              <p className="l">
                Impressions{" "}
                {compareOn && compare?.pct?.impressions != null ? (
                  <span
                    className={`delta ${compare.pct.impressions >= 0 ? "deltaUp" : "deltaDown"}`}
                  >
                    {fmtDeltaPct(compare.pct.impressions)}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="kpi">
              <p className="n">{fmtInt(summary.clicks)}</p>
              <p className="l">
                Clicks{" "}
                {compareOn && compare?.pct?.clicks != null ? (
                  <span
                    className={`delta ${compare.pct.clicks >= 0 ? "deltaUp" : "deltaDown"}`}
                  >
                    {fmtDeltaPct(compare.pct.clicks)}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="kpi">
              <p className="n">{fmtPct(summary.ctr)}</p>
              <p className="l">
                CTR{" "}
                {compareOn && compare?.pct?.ctr != null ? (
                  <span
                    className={`delta ${compare.pct.ctr >= 0 ? "deltaUp" : "deltaDown"}`}
                  >
                    {fmtDeltaPct(compare.pct.ctr)}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="kpi">
              <p className="n">{fmtPos(summary.position)}</p>
              <p className="l">
                Avg position {" "}
                {compareOn && compare?.pct?.position != null ? (
                  <span
                    className={`delta ${compare.pct.position > 0 ? "deltaDown" : "deltaUp"}`}
                  >
                    {fmtDeltaPct(compare.pct.position)}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="kpi">
              <p className="n">{fmtInt(keywordsCount)}</p>
              <p className="l">Keywords</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtInt(summary.pagesCounted)}</p>
              <p className="l">Pages counted</p>
            </div>
          </div>

          {compareOn && compare ? (
            <div className="mini" style={{ marginTop: 10, opacity: 0.85 }}>
              Compare window: <b>{compare.previous.startDate}</b> →{" "}
              <b>{compare.previous.endDate}</b> vs current{" "}
              <b>{compare.current.startDate}</b> →{" "}
              <b>{compare.current.endDate}</b> (trend-based)
            </div>
          ) : null}

          <div className="mini" style={{ marginTop: 10 }}>
            Lectura estratégica: <b>Impressions por estado</b> = dónde Google te
            está creyendo. <b>CTR bajo + pos 8–20</b> = quick wins
            (title/meta/snippet + enlaces internos).
          </div>

          <div style={{ marginTop: 14 }}>
            <GSCTrendChart
              trend={(trendFiltered.length ? trendFiltered : trend) as any}
              metric={metric}
              mode={trendMode}
              onModeChange={setTrendMode}
              startDate={startDate}
              endDate={endDate}
              comparePct={
                compareOn && compare?.pct
                  ? Number(
                      metric === "impressions"
                        ? compare.pct.impressions
                        : compare.pct.clicks,
                    )
                  : null
              }
            />
          </div>
        </div>
      </section>
      ) : null}

      {/* Map + panel + AI */}
      {activeSection === "geo" ||
      activeSection === "queries" ||
      activeSection === "segments" ||
      activeSection === "states" ||
      activeSection === "ai-playbook" ||
      activeSection === "chat" ? (
      <section className="card spRouteAnim" key={`section-${activeSection}`}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">
              {activeSection === "geo"
                ? "Performance by geography"
                : activeSection === "queries"
                  ? "Top Queries & Pages"
                  : activeSection === "segments"
                    ? "Nationwide & Funnels"
                    : activeSection === "ai-playbook"
                      ? "AI Playbook"
                      : activeSection === "chat"
                        ? "Agent Chat"
                    : "States table"}
            </h2>
            <div className="cardSubtitle">
              {activeSection === "geo"
                ? "United States y Puerto Rico con drilldown; Puerto Rico se distribuye por pueblo."
                : activeSection === "queries"
                  ? "Top 100 por impressions con filtros de estado y rango."
                  : activeSection === "segments"
                    ? "Root domain como nationwide y subdominios como funnels."
                    : activeSection === "ai-playbook"
                      ? "Estrategia accionable por IA sobre tus datos actuales de Search Performance."
                      : activeSection === "chat"
                        ? "Asistente experto con contexto de filtros y métricas del dashboard."
                    : "Tabla completa por estado con métricas clave."}
            </div>
          </div>

          <div className="cardHeaderActions">
            {activeSection === "geo" ? (
              <button className="smallBtn" onClick={clearSelection} type="button">
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="cardBody">
          {activeSection === "geo" ? (
          <div className="mapGrid">
            <div className="mapCard">
              <div className="mapCardTop">
                <div>
                  <div className="mapCardTitle">
                    {mapScope === "pr" ? "Puerto Rico" : "United States"}{" "}
                    {metric === "impressions" ? "Impressions" : "Clicks"} Map
                  </div>
                  <div className="mini" style={{ marginTop: 6 }}>
                    {mapScope === "pr"
                      ? "Click en un pueblo para drilldown."
                      : "Click en un estado para drilldown."}
                  </div>
                </div>
                <div className="segmented" role="tablist" aria-label="Map geography scope">
                  <button
                    className={`segBtn ${mapScope === "us" ? "segBtnOn" : ""}`}
                    type="button"
                    onClick={() => setMapScope("us")}
                  >
                    United States
                  </button>
                  <button
                    className={`segBtn ${mapScope === "pr" ? "segBtnOn" : ""}`}
                    type="button"
                    onClick={() => setMapScope("pr")}
                  >
                    Puerto Rico
                  </button>
                </div>
              </div>

              <div className="mapFrame mapFrameXL">
                {mapScope === "pr" ? (
                  <PuertoRicoMunicipioSearchMap
                    rows={prMunicipioRows}
                    metric={metric}
                    selectedMunicipio={prMunicipioSelected}
                    onPick={(name: string) => setPrMunicipioSelected(String(name))}
                  />
                ) : (
                  <UsaChoroplethProgressMap
                    rows={mapRows as any}
                    metric={metric as any}
                    labelMode={"value" as any}
                    valueField={"__value" as any}
                    selectedState={selectedState}
                    onPick={(name: string) => setMapSelected(String(name))}
                  />
                )}
              </div>

              {mapScope === "pr" ? (
                <div className="mapPrRank">
                  <div className="mapPrRankTop">
                    <div className="mapPrRankTitle">Top municipios</div>
                    <div className="mini" style={{ opacity: 0.78 }}>
                      {metric === "impressions" ? "Impressions" : "Clicks"} • URL-mapped
                    </div>
                  </div>

                  <div className="mapPrRankGrid">
                    {prTopMunicipios.length ? (
                      prTopMunicipios.map((row: any, idx: number) => {
                        const municipio = String(row?.municipio || "—");
                        const value =
                          metric === "impressions"
                            ? Number(row?.impressions || 0)
                            : Number(row?.clicks || 0);
                        const isActive =
                          prMunicipioSelected.trim().toLowerCase() ===
                          municipio.trim().toLowerCase();
                        return (
                          <button
                            key={`${municipio}-${idx}`}
                            className={`mapPrRankItem ${isActive ? "mapPrRankItemOn" : ""}`}
                            type="button"
                            onClick={() => setPrMunicipioSelected(municipio)}
                          >
                            <span className="mapPrRankPos">#{idx + 1}</span>
                            <span className="mapPrRankName">{municipio}</span>
                            <span className="mapPrRankVal">{fmtInt(value)}</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="mini" style={{ opacity: 0.78 }}>
                        No municipio rows for this range yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="statePanel">
              <div className="statePanelTop">
                <div className="mini" style={{ opacity: 0.85 }}>
                  {mapScope === "pr" ? "Municipio analytics" : "State analytics"}
                </div>

                {mapScope === "pr" && prMunicipioSelected ? (
                  <div className="stateHead">
                    <div className="stateName">{prMunicipioSelected}</div>
                    <div className="statePill">
                      {metric === "impressions"
                        ? fmtInt(selectedPrMunicipioRow?.impressions || 0)
                        : fmtInt(selectedPrMunicipioRow?.clicks || 0)}{" "}
                      {metric}
                    </div>
                  </div>
                ) : selectedState ? (
                  <div className="stateHead">
                    <div className="stateName">{selectedState}</div>
                    <div className="statePill">
                      {metric === "impressions"
                        ? fmtInt(selectedStateRow?.impressions || 0)
                        : fmtInt(selectedStateRow?.clicks || 0)}{" "}
                      {metric}
                    </div>
                  </div>
                ) : (
                  <div className="mini" style={{ marginTop: 10 }}>
                    {mapScope === "pr"
                      ? "Click a municipio to drill down."
                      : "Click a state to drill down."}
                  </div>
                )}
                {mapScope === "pr" ? (
                  <div className="mini" style={{ marginTop: 8, opacity: 0.75 }}>
                    Municipios detectados por URL: <b>{fmtInt(prMunicipioRows.length)}</b>
                  </div>
                ) : null}
              </div>

              <div className="stateCards">
                <div className="stateKpi">
                  <div className="mini">Impressions</div>
                  <div className="stateKpiN">
                    {fmtInt(
                      (mapScope === "pr"
                        ? selectedPrMunicipioRow?.impressions
                        : selectedStateRow?.impressions) ??
                        summaryOverall.impressions,
                    )}
                  </div>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    Demand proxy
                  </div>
                </div>

                <div className="stateKpi">
                  <div className="mini">Clicks</div>
                  <div className="stateKpiN">
                    {fmtInt(
                      (mapScope === "pr"
                        ? selectedPrMunicipioRow?.clicks
                        : selectedStateRow?.clicks) ?? summaryOverall.clicks,
                    )}
                  </div>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    Traffic delivered
                  </div>
                </div>

                <div className="stateKpi">
                  <div className="mini">CTR</div>
                  <div className="stateKpiN">
                    {fmtPct(
                      (mapScope === "pr"
                        ? selectedPrMunicipioRow?.ctr
                        : selectedStateRow?.ctr) ?? summaryOverall.ctr,
                    )}
                  </div>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    Snippet quality
                  </div>
                </div>

                <div className="stateKpi">
                  <div className="mini">Avg position</div>
                  <div className="stateKpiN">
                    {fmtPos(
                      (mapScope === "pr"
                        ? selectedPrMunicipioRow?.position
                        : selectedStateRow?.position) ?? summaryOverall.position,
                    )}
                  </div>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    Ranking health
                  </div>
                </div>

                {/* ✅ Keywords fixed (real, state-aware) */}
                <div className="stateKpi">
                  <div className="mini">Keywords</div>
                  <div className="stateKpiN">{fmtInt(keywordsCount)}</div>
                  <div className="mini" style={{ opacity: 0.85 }}>
                    {selectedState
                      ? "Queries in this state"
                      : "Queries overall (Delta pages)"}
                  </div>
                </div>

                {mapScope === "pr" ? (
                  <div className="stateKpi">
                    <div className="mini">Pages</div>
                    <div className="stateKpiN">
                      {fmtInt(selectedPrMunicipioRow?.pagesCounted ?? 0)}
                    </div>
                    <div className="mini" style={{ opacity: 0.85 }}>
                      URLs mapped to this municipio
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ✅ Top keywords list (pro) */}
              <div className="aiCard" style={{ marginTop: 12 }}>
                <div className="aiCardTop">
                  <div>
                    <div className="aiTitle">
                      Top Keywords{" "}
                      <span className="mini" style={{ opacity: 0.85 }}>
                        {selectedState ? `(${selectedState})` : "(Overall)"}
                      </span>
                    </div>
                    <div
                      className="mini"
                      style={{ opacity: 0.85, marginTop: 4 }}
                    >
                      Basado en query+page (filtrable por estado). Top por
                      impressions.
                    </div>
                  </div>

                  <button
                    className="smallBtn aiBtn"
                    onClick={() => setShowTopKeywords((v) => !v)}
                    type="button"
                    disabled={!topKeywords?.length}
                  >
                    {showTopKeywords ? "Hide" : "Show"}
                  </button>
                </div>

                {showTopKeywords ? (
                  <div className="aiBody" style={{ paddingTop: 10 }}>
                    {topKeywords?.length ? (
                      <ul className="aiList" style={{ marginTop: 0 }}>
                        {topKeywords.slice(0, 8).map((k: any, i: number) => (
                          <li key={i}>
                            <span className="mono">{k.query}</span>{" "}
                            <span style={{ opacity: 0.7 }}>
                              • {fmtInt(k.impressions)} impr
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mini" style={{ opacity: 0.8 }}>
                        No keyword data (qp) en este rango. Pulsa Refresh.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aiPlaceholder">
                    <div className="mini" style={{ opacity: 0.85 }}>
                      Oculto. Toggle “Show” para ver el top.
                    </div>
                  </div>
                )}
              </div>

            </aside>
          </div>
          ) : null}

          {/* AI Playbook */}
          {activeSection === "ai-playbook" ? (
          <div className="spStudioLayout" style={{ marginTop: 14 }}>
            <div className="spStudioRail">
              <div className="gscTopCard spStudioCard">
                <div className="gscTopHead">
                  <div className="gscTopTitle">Playbook Context</div>
                </div>
                <div className="spStudioPills">
                  <span className="pill chartPill">
                    <span className="mini" style={{ opacity: 0.82 }}>Source</span>
                    <b>{searchTab === "all" ? "Google + Bing" : searchTab === "bing" ? "Bing" : "Google"}</b>
                  </span>
                  <span className="pill chartPill">
                    <span className="mini" style={{ opacity: 0.82 }}>Range</span>
                    <b>{summary.startDate || "—"} → {summary.endDate || "—"}</b>
                  </span>
                  <span className="pill chartPill">
                    <span className="mini" style={{ opacity: 0.82 }}>Scope</span>
                    <b>{selectedState || "All states"}</b>
                    {mapScope === "pr" && prMunicipioSelected ? (
                      <span> · {prMunicipioSelected}</span>
                    ) : null}
                  </span>
                </div>
                <div className="mini" style={{ marginTop: 10, opacity: 0.84 }}>
                  Usa el botón de Generate para construir recomendaciones de prioridad alta
                  usando KPIs, tendencias y queries/pages.
                </div>
              </div>

              <div className="gscTopCard spStudioCard">
                <div className="gscTopHead">
                  <div className="gscTopTitle">
                    Top Keywords{" "}
                    <span className="mini" style={{ opacity: 0.8 }}>
                      {selectedState ? `(${selectedState})` : "(Overall)"}
                      {mapScope === "pr" && prMunicipioSelected
                        ? ` (${prMunicipioSelected})`
                        : ""}
                    </span>
                  </div>
                </div>
                {topKeywords?.length ? (
                  <ul className="aiList" style={{ marginTop: 0 }}>
                    {topKeywords.slice(0, 10).map((k: any, i: number) => (
                      <li key={i}>
                        <span className="mono">{k.query}</span>{" "}
                        <span style={{ opacity: 0.72 }}>• {fmtInt(k.impressions)} impr</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mini" style={{ opacity: 0.78 }}>
                    No keyword data disponible para este rango.
                  </div>
                )}
              </div>
            </div>

            <div className="gscTopCard spStudioCard">
              <div className="aiCardTop">
                <div>
                  <div className="aiTitle">
                    {searchTab === "all"
                      ? "AI Playbook (Search Performance Expert)"
                      : searchTab === "bing"
                        ? "AI Playbook (Bing Webmaster Expert)"
                        : "AI Playbook (Google Search Console Expert)"}
                  </div>
                  <div className="mini" style={{ opacity: 0.85, marginTop: 4 }}>
                    Recomendaciones ejecutables basadas en señales del dashboard.
                  </div>
                </div>

                <button
                  className="smallBtn aiBtn"
                  onClick={generateInsights}
                  disabled={aiLoading || loading || !stateRows.length}
                  type="button"
                >
                  {aiLoading ? "Generating…" : "Generate AI Playbook"}
                </button>
              </div>

              {aiErr ? (
                <div className="mini" style={{ color: "var(--danger)", marginTop: 10 }}>
                  ❌ {aiErr}
                </div>
              ) : null}

              {aiInsights ? (
                <div className="aiBody">
                  <div className="aiSummary">
                    <div className="aiSummaryTitle">Executive summary</div>
                    <div className="aiText">{aiInsights.executive_summary}</div>
                  </div>

                  <div className="aiScore">
                    <span className={`aiBadge ${aiInsights.scorecard?.health || ""}`}>
                      {String(aiInsights.scorecard?.health || "mixed").toUpperCase()}
                    </span>
                    <div className="mini" style={{ marginTop: 8, opacity: 0.9 }}>
                      <b>Primary risk:</b> {aiInsights.scorecard?.primary_risk}
                    </div>
                    <div className="mini" style={{ marginTop: 6, opacity: 0.9 }}>
                      <b>Primary opportunity:</b> {aiInsights.scorecard?.primary_opportunity}
                    </div>
                  </div>

                  {!!aiInsights.opportunities?.length && (
                    <div className="aiBlock">
                      <div className="aiBlockTitle">Top opportunities</div>
                      <div className="aiOps">
                        {aiInsights.opportunities.slice(0, 3).map((o: any, idx: number) => (
                          <div className="aiOp" key={idx}>
                            <div className="aiOpHead">
                              <div className="aiOpTitle">{o.title}</div>
                              <span className={`aiImpact ${o.expected_impact}`}>
                                {String(o.expected_impact || "medium").toUpperCase()}
                              </span>
                            </div>
                            <div className="mini" style={{ opacity: 0.9, marginTop: 6 }}>
                              <b>Why:</b> {o.why_it_matters}
                            </div>
                            <div className="mini" style={{ opacity: 0.85, marginTop: 6 }}>
                              <b>Evidence:</b> {o.evidence}
                            </div>
                            {Array.isArray(o.recommended_actions) && o.recommended_actions.length ? (
                              <ul className="aiList">
                                {o.recommended_actions.slice(0, 5).map((a: string, i: number) => (
                                  <li key={i}>{a}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!!aiInsights.quick_wins_next_7_days?.length && (
                    <div className="aiBlock">
                      <div className="aiBlockTitle">Quick wins (7 days)</div>
                      <ul className="aiList">
                        {aiInsights.quick_wins_next_7_days.slice(0, 7).map((x: string, i: number) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aiPlaceholder">
                  <div className="mini" style={{ opacity: 0.85 }}>
                    Tip: Selecciona un estado en Geo Intelligence para recomendaciones
                    hiper-específicas por keywords y páginas.
                  </div>
                </div>
              )}
            </div>
          </div>
          ) : null}

          {/* Agent Chat */}
          {activeSection === "chat" ? (
          <div className="spStudioLayout spStudioLayoutSingle" style={{ marginTop: 14 }}>
            <div className="gscTopCard spStudioCard">
              <div className="gscTopHead">
                <div>
                  <div className="gscTopTitle">Search Performance Agent Chat</div>
                  <div className="mini" style={{ marginTop: 4, opacity: 0.82 }}>
                    Conversación persistente con contexto del rango, estado y métricas activas.
                  </div>
                </div>
              </div>

              <div className="spStudioPills">
                <span className="pill chartPill"><span className="mini">Source</span><b>{searchTab}</b></span>
                <span className="pill chartPill"><span className="mini">Trend</span><b>{trendMode}</b></span>
                <span className="pill chartPill"><span className="mini">Metric</span><b>{metric}</b></span>
                <span className="pill chartPill"><span className="mini">State</span><b>{selectedState || "All"}</b></span>
                {mapScope === "pr" ? (
                  <span className="pill chartPill"><span className="mini">Municipio</span><b>{prMunicipioSelected || "All"}</b></span>
                ) : null}
              </div>

              <div style={{ marginTop: 12 }}>
                <AiAgentChatPanel
                  agent={
                    searchTab === "all"
                      ? "search_performance"
                      : searchTab === "bing"
                        ? "bing_webmaster"
                        : "gsc"
                  }
                  title={
                    searchTab === "all"
                      ? "Search Performance Agent Chat"
                      : searchTab === "bing"
                        ? "Bing Webmaster Agent Chat"
                        : "GSC Agent Chat"
                  }
                  context={{
                    source: searchTab,
                    preset,
                    customStart,
                    customEnd,
                    compareOn,
                    trendMode,
                    metric,
                    selectedState: selectedState || null,
                    selectedMunicipio: mapScope === "pr" ? prMunicipioSelected || null : null,
                    summary,
                    selectedStateRow,
                  }}
                />
              </div>
            </div>
          </div>
          ) : null}

          {/* Top tables */}
          {activeSection === "queries" ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="cardHeader">
              <div>
                <h2 className="cardTitle">Top Queries & Pages</h2>
                <div className="cardSubtitle">
                  Top 100 por impressions. (Pages se filtran por estado cuando
                  seleccionas uno.)
                </div>
              </div>
              <div className="badge">top 100</div>
            </div>

            <div className="cardBody">
              <div className="gscTopGrid">
                <div className="gscTopCard">
                  <div className="gscTopHead">
                    <div className="gscTopTitle">Top Queries</div>
                  </div>
                  <div className="tableWrap tableScrollX">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">Query</th>
                          <th className="th">Impr</th>
                          <th className="th">Clicks</th>
                          <th className="th">CTR</th>
                          <th className="th">Pos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topQueries.map((q: any, i: number) => (
                          <tr key={i} className="tr">
                            <td className="td mono">{q.query || "—"}</td>
                            <td className="td">{fmtInt(q.impressions)}</td>
                            <td className="td">{fmtInt(q.clicks)}</td>
                            <td className="td">{fmtPct(q.ctr)}</td>
                            <td className="td">{fmtPos(q.position)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="gscTopCard">
                  <div className="gscTopHead">
                    <div className="gscTopTitle">
                      Top Pages{" "}
                      {selectedState ? (
                        <span className="mini">({selectedState})</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="tableWrap tableScrollX">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">Page</th>
                          <th className="th">Impr</th>
                          <th className="th">Clicks</th>
                          <th className="th">CTR</th>
                          <th className="th">Pos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPages.map((p: any, i: number) => (
                          <tr key={i} className="tr">
                            <td className="td mono">{p.page || "—"}</td>
                            <td className="td">{fmtInt(p.impressions)}</td>
                            <td className="td">{fmtInt(p.clicks)}</td>
                            <td className="td">{fmtPct(p.ctr)}</td>
                            <td className="td">{fmtPos(p.position)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mini" style={{ marginTop: 10, opacity: 0.75 }}>
                Roadmap: query+page join → cluster por estado/county/city + gap
                analysis contra catálogo tenant (DB-first).
              </div>
            </div>
          </div>
          ) : null}

          {/* Nationwide + Funnels */}
          {activeSection === "segments" ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="cardHeader">
              <div>
                <h2 className="cardTitle">Nationwide & Funnels</h2>
                <div className="cardSubtitle">
                  Root domain se considera “Nationwide / Home Page”. Subdominios
                  fuera del patrón Delta → Funnels.
                </div>
              </div>

              <div
                className="cardHeaderActions"
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <div
                  className="segmented"
                  role="tablist"
                  aria-label="Nationwide/Funnels tab"
                >
                  <button
                    className={`segBtn ${nfTab === "nationwide" ? "segBtnOn" : ""}`}
                    onClick={() => setNfTab("nationwide")}
                    type="button"
                  >
                    Nationwide
                  </button>
                  <button
                    className={`segBtn ${nfTab === "funnels" ? "segBtnOn" : ""}`}
                    onClick={() => setNfTab("funnels")}
                    type="button"
                  >
                    Funnels
                  </button>
                </div>

                <div className="badge">
                  {fmtInt(summaryNationwide.impressions)} impr •{" "}
                  {fmtInt(funnelRows.length)} funnels
                </div>
              </div>
            </div>

            <div className="cardBody">
              {nfTab === "nationwide" ? (
                <div className="gscTopCard">
                  <div className="gscTopHead">
                    <div className="gscTopTitle">
                      {summaryNationwide.label || "Nationwide / Home Page"}
                    </div>
                  </div>

                  <div className="kpiGrid32">
                    <div className="kpi">
                      <p className="n">
                        {fmtInt(summaryNationwide.impressions)}
                      </p>
                      <p className="l">Impressions</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtInt(summaryNationwide.clicks)}</p>
                      <p className="l">Clicks</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtPct(summaryNationwide.ctr)}</p>
                      <p className="l">CTR</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtPos(summaryNationwide.position)}</p>
                      <p className="l">Avg pos</p>
                    </div>
                    <div className="kpi">
                      <p className="n">
                        {fmtInt(summaryNationwide.pagesCounted)}
                      </p>
                      <p className="l">Pages counted</p>
                    </div>
                  </div>

                  <div className="mini" style={{ marginTop: 10, opacity: 0.8 }}>
                    Root host:{" "}
                    <b className="mono">{summaryNationwide.rootHost || "—"}</b>
                  </div>
                </div>
              ) : (
                <div className="gscTopCard">
                  <div className="gscTopHead">
                    <div className="gscTopTitle">
                      {summaryFunnels.label || "Funnels (non-Delta subdomains)"}
                    </div>
                  </div>

                  <div className="kpiGrid32" style={{ marginBottom: 12 }}>
                    <div className="kpi">
                      <p className="n">{fmtInt(summaryFunnels.impressions)}</p>
                      <p className="l">Impressions</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtInt(summaryFunnels.clicks)}</p>
                      <p className="l">Clicks</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtPct(summaryFunnels.ctr)}</p>
                      <p className="l">CTR</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtPos(summaryFunnels.position)}</p>
                      <p className="l">Avg pos</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{fmtInt(summaryFunnels.pagesCounted)}</p>
                      <p className="l">Pages counted</p>
                    </div>
                  </div>

                  <div className="tableWrap tableScrollX">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">Funnel</th>
                          <th className="th">Host</th>
                          <th className="th">Impr</th>
                          <th className="th">Clicks</th>
                          <th className="th">CTR</th>
                          <th className="th">Pos</th>
                          <th className="th">Pages</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnelRows.slice(0, 30).map((r: any, i: number) => (
                          <tr key={i} className="tr">
                            <td className="td">
                              <b>{r.funnel || "Funnel"}</b>
                            </td>
                            <td className="td mono">{r.host || "—"}</td>
                            <td className="td">{fmtInt(r.impressions)}</td>
                            <td className="td">{fmtInt(r.clicks)}</td>
                            <td className="td">{fmtPct(r.ctr)}</td>
                            <td className="td">{fmtPos(r.position)}</td>
                            <td className="td">{fmtInt(r.pagesCounted)}</td>
                          </tr>
                        ))}
                        {!funnelRows.length ? (
                          <tr className="tr">
                            <td
                              className="td"
                              colSpan={7}
                              style={{ opacity: 0.75 }}
                            >
                              No funnels detectados en este rango.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* <div
                    className="mini"
                    style={{ marginTop: 10, opacity: 0.75 }}
                  >
                    Funnels = subdominios fuera de city/county/-abbr. Se agrupan
                    por host y se formatea el nombre a Title Case.
                  </div> */}
                </div>
              )}
            </div>
          </div>
          ) : null}

          {/* States table */}
          {activeSection === "states" ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="cardHeader">
              <div>
                <h2 className="cardTitle">States table</h2>
              </div>
              <div className="badge">{stateRows.length} rows</div>
            </div>

            <div className="cardBody">
              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">State</th>
                      <th className="th">Impressions</th>
                      <th className="th">Clicks</th>
                      <th className="th">CTR</th>
                      <th className="th">Avg pos</th>
                      <th className="th">Pages</th>
                      <th className="th">Keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateRows.map((r: any, i: number) => (
                      <tr
                        key={i}
                        className="tr"
                        style={{
                          cursor:
                            r.state === "__unknown" ? "default" : "pointer",
                        }}
                        onClick={() => {
                          if (r.state === "__unknown") return;
                          setMapScope("us");
                          setMapSelected(String(r.state));
                        }}
                      >
                        <td className="td">
                          <b className="mono">{r.state}</b>
                        </td>
                        <td className="td">{fmtInt(r.impressions)}</td>
                        <td className="td">{fmtInt(r.clicks)}</td>
                        <td className="td">{fmtPct(r.ctr)}</td>
                        <td className="td">{fmtPos(r.position)}</td>
                        <td className="td">{fmtInt(r.pagesCounted)}</td>
                        <td className="td">{fmtInt(r.keywordsCount ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* {data?.debug?.catalogFingerprint ? (
                <div className="mini" style={{ marginTop: 10, opacity: 0.65 }}>
                  Catalog fingerprint:{" "}
                  <b className="mono">
                    {String(data.debug.catalogFingerprint)}
                  </b>
                  {data?.debug?.forceCatalog ? (
                    <>
                      {" "}
                      • forceCatalog: <b className="mono">true</b>
                    </>
                  ) : null}
                </div>
              ) : null} */}
            </div>
          </div>
          ) : null}
        </div>
      </section>
      ) : null}
        </section>
      </div>
    </main>
  );
}

export default function GscDashboardPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading dashboard...</div>}>
      <GscDashboardPageContent />
    </Suspense>
  );
}
