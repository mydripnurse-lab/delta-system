"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";
import DashboardTopbar from "@/components/DashboardTopbar";
import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";
import { addDashboardRangeParams, readDashboardRangeFromSearch } from "@/lib/dashboardRangeSync";

type RangePreset = DashboardRangePreset;

type ProspectingResponse = {
  ok: boolean;
  error?: string;
  range?: { start: string; end: string };
  opportunitySignals?: {
    lostBookings: number;
    lostBookingValue: number;
    impressions: number;
    clicks: number;
    leadVolume: number;
  };
  businessProfile?: {
    businessName: string;
    businessCategory: string;
    servicesOffered: string;
    targetGeoScope: string;
    targetIndustries: string;
    idealCustomerProfile: string;
    highImpressionLowBookingServices: string;
    lostBookingReasons: string;
    prospectingAutoEnabled?: boolean;
    servicesList: string[];
    missingFields: string[];
  };
  geoQueue?: {
    states: GeoQueueRow[];
    counties: GeoQueueRow[];
    cities: GeoQueueRow[];
  };
  leadPool?: {
    summary: {
      total: number;
      withEmail: number;
      withPhone: number;
      contactable: number;
      byStatus: Record<string, number>;
      updatedAt: string;
    };
    rows: LeadRow[];
  };
  notifications?: {
    pendingApproval: number;
    unseen: number;
    latest: Array<{
      leadId: string;
      businessName: string;
      state: string;
      county: string;
      city: string;
      reviewStatus: string;
      createdAt: string;
      seen: boolean;
    }>;
  };
  complianceChecklist?: string[];
};

type GeoQueueRow = {
  name: string;
  opportunities: number;
  value: number;
  uniqueContacts: number;
  priorityScore: number;
  cbpEstablishments?: number;
  opportunityOpen?: number;
  opportunityWon?: number;
  opportunityLost?: number;
  opportunityStaleOver7d?: number;
  opportunityStaleOver14d?: number;
  opportunityValue?: number;
  opportunityWinRate?: number;
  opportunityAvgAgeDays?: number;
};

type LeadRow = {
  id: string;
  businessName: string;
  website: string;
  email: string;
  phone: string;
  category: string;
  services: string;
  state: string;
  county: string;
  city: string;
  source: string;
  status: "new" | "validated" | "contacted" | "replied" | "disqualified";
  reviewStatus?: "pending" | "approved" | "rejected";
  notes: string;
  createdAt: string;
  updatedAt: string;
  notificationSeenAt?: string;
  convictionScore?: number;
  convictionTier?: "hot" | "warm" | "cold";
  convictionReasons?: string[];
};

type LeadDraft = {
  businessName: string;
  website: string;
  email: string;
  phone: string;
  category: string;
  services: string;
  state: string;
  county: string;
  city: string;
  source: string;
  notes: string;
};

type RunDiscoveryResponse = {
  ok?: boolean;
  error?: string;
  results?: {
    discovered?: number;
    processed?: number;
    created?: number;
    updated?: number;
    withEmail?: number;
    withPhone?: number;
  };
  diagnostics?: {
    sourceCounts?: Record<string, number>;
    warnings?: string[];
    enrichment?: {
      crawlWebsiteEnabled?: boolean;
      hunterDomainSearchEnabled?: boolean;
      hunterConfigured?: boolean;
    };
  };
};

type AiOpportunity = {
  title: string;
  why_it_matters: string;
  evidence: string;
  expected_impact: "low" | "medium" | "high";
  recommended_actions: string[];
};

type AiInsights = {
  executive_summary: string;
  scorecard?: {
    health?: "good" | "mixed" | "bad";
    primary_risk?: string;
    primary_opportunity?: string;
  };
  opportunities?: AiOpportunity[];
  quick_wins_next_7_days?: string[];
  experiments_next_30_days?: string[];
};

function fmtInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function fmtMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtPct(v: unknown, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

function fmtDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function statusToneClass(value: string) {
  const v = String(value || "").toLowerCase();
  if (v === "validated" || v === "approved" || v === "replied") return "success";
  if (v === "pending" || v === "new" || v === "contacted") return "warning";
  if (v === "rejected" || v === "disqualified") return "error";
  return "";
}

function geoOppSignalsLabel(row: GeoQueueRow) {
  const parts: string[] = [];
  if (Number(row.opportunityOpen || 0) > 0) parts.push(`Open ${fmtInt(row.opportunityOpen)}`);
  if (Number(row.opportunityStaleOver7d || 0) > 0) parts.push(`Stale>7d ${fmtInt(row.opportunityStaleOver7d)}`);
  if (Number(row.opportunityValue || 0) > 0) parts.push(`OppValue ${fmtMoney(row.opportunityValue)}`);
  if (Number(row.opportunityWinRate || 0) > 0) parts.push(`Win ${fmtInt(row.opportunityWinRate)}%`);
  return parts.join(" · ");
}

function ProspectingDashboardContent() {
  const searchParams = useBrowserSearchParams();
  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);

  const integrationKey = String(searchParams?.get("integrationKey") || "owner").trim() || "owner";
  const initialRange = readDashboardRangeFromSearch(searchParams, "28d");
  const [preset, setPreset] = useState<RangePreset>(initialRange.preset);
  const [customStart, setCustomStart] = useState(initialRange.customStart);
  const [customEnd, setCustomEnd] = useState(initialRange.customEnd);
  const backHref = useMemo(() => {
    if (!tenantId) return "/dashboard";
    const qs = new URLSearchParams();
    qs.set("tenantId", tenantId);
    qs.set("integrationKey", integrationKey);
    addDashboardRangeParams(qs, preset, customStart, customEnd);
    return `/dashboard?${qs.toString()}`;
  }, [tenantId, integrationKey, preset, customStart, customEnd]);
  const notificationsHref = useMemo(() => {
    if (!tenantId) return "/dashboard/notification-hub";
    return `/dashboard/notification-hub?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`;
  }, [tenantId, integrationKey]);
  const computedRange = useMemo(
    () => computeDashboardRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProspectingResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [agentRouting, setAgentRouting] = useState<Record<string, string>>({});
  const [hubBusyKey, setHubBusyKey] = useState("");
  const [hubMessage, setHubMessage] = useState("");
  const [hubError, setHubError] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    businessCategory: "",
    servicesOffered: "",
    targetGeoScope: "",
    targetIndustries: "",
    idealCustomerProfile: "",
    highImpressionLowBookingServices: "",
    lostBookingReasons: "",
    prospectingAutoEnabled: false,
  });

  const [leadSaving, setLeadSaving] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  const [leadDraft, setLeadDraft] = useState<LeadDraft>({
    businessName: "",
    website: "",
    email: "",
    phone: "",
    category: "",
    services: "",
    state: "",
    county: "",
    city: "",
    source: "manual",
    notes: "",
  });
  const [runLoading, setRunLoading] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [runGeoType, setRunGeoType] = useState<"state" | "county" | "city">("city");
  const [runGeoName, setRunGeoName] = useState("");
  const [runState, setRunState] = useState("");
  const [runCounty, setRunCounty] = useState("");
  const [runCity, setRunCity] = useState("");
  const [runMaxResults, setRunMaxResults] = useState("25");
  const [runServices, setRunServices] = useState("");
  const [runSources, setRunSources] = useState({
    googlePlaces: true,
    osmOverpass: true,
    overture: true,
  });
  const [runEnrichment, setRunEnrichment] = useState({
    crawlWebsite: true,
    hunterDomainSearch: false,
  });
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMessage, setAutoMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [queueRunLoading, setQueueRunLoading] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const [leadViewId, setLeadViewId] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadPage, setLeadPage] = useState(1);
  const [notifSearch, setNotifSearch] = useState("");
  const [notifViewId, setNotifViewId] = useState("");

  async function load() {
    if (!tenantReady || !tenantId) return;
    if (!computedRange.start || !computedRange.end) return;

    setLoading(true);
    setError("");
    setProfileMessage("");
    setLeadMessage("");
    try {
      const qs = new URLSearchParams({
        tenantId,
        integrationKey,
        preset,
        start: computedRange.start,
        end: computedRange.end,
      });
      const res = await fetch(`/api/dashboard/prospecting?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ProspectingResponse | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setData(json);
      const p = json.businessProfile;
      setProfileDraft({
        businessCategory: String(p?.businessCategory || ""),
        servicesOffered: String(p?.servicesOffered || ""),
        targetGeoScope: String(p?.targetGeoScope || ""),
        targetIndustries: String(p?.targetIndustries || ""),
        idealCustomerProfile: String(p?.idealCustomerProfile || ""),
        highImpressionLowBookingServices: String(p?.highImpressionLowBookingServices || ""),
        lostBookingReasons: String(p?.lostBookingReasons || ""),
        prospectingAutoEnabled: Boolean(p?.prospectingAutoEnabled),
      });
      if (!leadDraft.category && p?.businessCategory) {
        setLeadDraft((prev) => ({ ...prev, category: p.businessCategory }));
      }
      if (!leadDraft.services && p?.servicesOffered) {
        setLeadDraft((prev) => ({ ...prev, services: p.servicesOffered }));
      }
      if (!runServices && p?.servicesOffered) {
        setRunServices(p.servicesOffered);
      }
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load prospecting dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantReady) return;
    if (!tenantId) {
      setError("Missing tenant context. Open this dashboard from Control Tower.");
      return;
    }
    if (preset !== "custom") {
      void load();
      return;
    }
    if (customStart && customEnd) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantReady, tenantId, preset, customStart, customEnd, integrationKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadAgentRouting() {
      if (!tenantId) return;
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/integrations/openclaw`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; agents?: Record<string, { agentId?: string; enabled?: boolean }> }
          | null;
        if (!res.ok || !json?.ok) return;
        const agents = (json.agents || {}) as Record<string, { agentId?: string; enabled?: boolean }>;
        const map: Record<string, string> = {};
        Object.keys(agents).forEach((k) => {
          const row = agents[k];
          const agentId = String(row?.agentId || "").trim();
          if (row?.enabled !== false && agentId) map[k] = agentId;
        });
        if (!cancelled) setAgentRouting(map);
      } catch {
        // optional integration
      }
    }
    void loadAgentRouting();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function saveBusinessProfile() {
    if (!tenantId) return;
    setProfileSaving(true);
    setProfileMessage("");
    try {
      const rows = [
        { keyName: "business_category", keyValue: profileDraft.businessCategory },
        { keyName: "services_offered", keyValue: profileDraft.servicesOffered },
        { keyName: "target_geo_scope", keyValue: profileDraft.targetGeoScope },
        { keyName: "target_industries", keyValue: profileDraft.targetIndustries },
        { keyName: "ideal_customer_profile", keyValue: profileDraft.idealCustomerProfile },
        { keyName: "high_impression_low_booking_services", keyValue: profileDraft.highImpressionLowBookingServices },
        { keyName: "lost_booking_reasons", keyValue: profileDraft.lostBookingReasons },
        { keyName: "prospecting_auto_enabled", keyValue: profileDraft.prospectingAutoEnabled ? "true" : "false" },
      ].map((r) => ({
        provider: "ghl",
        scope: "module",
        module: "custom_values",
        keyName: r.keyName,
        keyValue: r.keyValue,
        valueType: "text",
        isActive: true,
      }));

      const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/custom-values`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; upserted?: number } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setProfileMessage(`Profile saved (${json.upserted || 0} fields).`);
      await load();
    } catch (e: unknown) {
      setProfileMessage(e instanceof Error ? e.message : "Failed to save profile fields");
    } finally {
      setProfileSaving(false);
    }
  }

  async function addLead() {
    if (!tenantId) return;
    if (!leadDraft.businessName.trim()) {
      setLeadMessage("Business name is required.");
      return;
    }
    setLeadSaving(true);
    setLeadMessage("");
    try {
      const res = await fetch("/api/dashboard/prospecting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action: "upsertLead",
          lead: {
            ...leadDraft,
            status: "new",
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setLeadDraft((prev) => ({
        ...prev,
        businessName: "",
        website: "",
        email: "",
        phone: "",
        state: "",
        county: "",
        city: "",
        notes: "",
      }));
      setLeadMessage("Lead saved.");
      await load();
    } catch (e: unknown) {
      setLeadMessage(e instanceof Error ? e.message : "Failed to save lead");
    } finally {
      setLeadSaving(false);
    }
  }

  async function runDiscovery() {
    if (!tenantId) return;
    if (!runGeoName.trim()) {
      setRunMessage("Geo name is required.");
      return;
    }
    setRunLoading(true);
    setRunMessage("");
    try {
      const services = runServices
        .split(/[,\n|;]/g)
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch("/api/dashboard/prospecting/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          integrationKey,
          geoType: runGeoType,
          geoName: runGeoName,
          state: runState,
          county: runCounty,
          city: runCity,
          maxResults: Number(runMaxResults || 25),
          services,
          sources: runSources,
          enrichment: runEnrichment,
        }),
      });
      const json = (await res.json().catch(() => null)) as RunDiscoveryResponse | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const r = json.results || {};
      const bySource = json.diagnostics?.sourceCounts || {};
      const sourceSummary = Object.entries(bySource)
        .filter(([, count]) => Number(count || 0) > 0)
        .map(([k, count]) => `${k}: ${fmtInt(count)}`)
        .join(" | ");
      const warningSummary = (json.diagnostics?.warnings || []).slice(0, 2).join(" | ");
      setRunMessage(
        `Run complete. Discovered ${fmtInt(r.discovered)}; created ${fmtInt(r.created)}; updated ${fmtInt(r.updated)}; with email ${fmtInt(r.withEmail)}; with phone ${fmtInt(r.withPhone)}.${sourceSummary ? ` Sources -> ${sourceSummary}.` : ""}${warningSummary ? ` Warnings -> ${warningSummary}` : ""}`,
      );
      await load();
    } catch (e: unknown) {
      setRunMessage(e instanceof Error ? e.message : "Failed to run discovery");
    } finally {
      setRunLoading(false);
    }
  }

  async function runAutoBatch() {
    if (!tenantId) return;
    setAutoLoading(true);
    setAutoMessage("");
    try {
      const res = await fetch("/api/dashboard/prospecting/auto-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          integrationKey,
          batchSize: 6,
          cooldownMinutes: 180,
          maxResultsPerGeo: 20,
          sources: runSources,
          enrichment: runEnrichment,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; tenants?: Array<{ processed?: number }> }
        | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const processed = Number(json?.tenants?.[0]?.processed || 0);
      setAutoMessage(`Auto batch completed. Geos processed: ${fmtInt(processed)}.`);
      await load();
    } catch (e: unknown) {
      setAutoMessage(e instanceof Error ? e.message : "Failed auto batch run");
    } finally {
      setAutoLoading(false);
    }
  }

  async function pushLeadsToWebhook() {
    if (!tenantId) return;
    setPushLoading(true);
    setPushMessage("");
    try {
      const res = await fetch("/api/dashboard/prospecting/push-ghl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          maxLeads: 100,
          statuses: ["validated", "new"],
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; sent?: number; reason?: string }
        | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setPushMessage(json?.reason ? String(json.reason) : `Webhook push completed. Sent ${fmtInt(json?.sent)} leads.`);
      await load();
    } catch (e: unknown) {
      setPushMessage(e instanceof Error ? e.message : "Failed webhook push");
    } finally {
      setPushLoading(false);
    }
  }

  async function reviewLead(leadId: string, decision: "approved" | "rejected") {
    if (!tenantId) return;
    setLeadSaving(true);
    setLeadMessage("");
    try {
      const res = await fetch("/api/dashboard/prospecting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action: "reviewLead",
          leadId,
          decision,
          reviewedBy: "dashboard_user",
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: unknown) {
      setLeadMessage(e instanceof Error ? e.message : "Failed to review lead");
    } finally {
      setLeadSaving(false);
    }
  }

  async function markNotificationsSeen(leadIds: string[]) {
    if (!tenantId || !leadIds.length) return;
    try {
      await fetch("/api/dashboard/prospecting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action: "markNotificationsSeen",
          leadIds,
        }),
      });
      await load();
    } catch {
      // non-blocking
    }
  }

  const geoCandidates = useMemo(() => {
    if (!data?.geoQueue) return [] as string[];
    if (runGeoType === "state") return data.geoQueue.states.map((x) => x.name);
    if (runGeoType === "county") return data.geoQueue.counties.map((x) => x.name);
    return data.geoQueue.cities.map((x) => x.name);
  }, [data?.geoQueue, runGeoType]);

  function applyGeoFromQueue(type: "state" | "county" | "city", name: string) {
    setRunGeoType(type);
    setRunGeoName(name);
    if (type === "state") {
      setRunState(name);
      setRunCounty("");
      setRunCity("");
    }
    if (type === "county") {
      setRunCounty(name);
      setRunCity("");
    }
    if (type === "city") {
      setRunCity(name);
    }
    setQueueMessage(`Selected ${type}: ${name}`);
  }

  async function runTopGeoOpportunities() {
    if (!tenantId || !data?.geoQueue) return;
    const picks: Array<{ type: "state" | "county" | "city"; name: string }> = [];
    const topState = data.geoQueue.states[0];
    const topCounty = data.geoQueue.counties[0];
    const topCity = data.geoQueue.cities[0];
    if (topState?.name) picks.push({ type: "state", name: topState.name });
    if (topCounty?.name) picks.push({ type: "county", name: topCounty.name });
    if (topCity?.name) picks.push({ type: "city", name: topCity.name });
    if (!picks.length) {
      setQueueMessage("No geo opportunities available yet.");
      return;
    }

    setQueueRunLoading(true);
    setQueueMessage("");
    let success = 0;
    try {
      for (const pick of picks) {
        const services = runServices
          .split(/[,\n|;]/g)
          .map((x) => x.trim())
          .filter(Boolean);
        const res = await fetch("/api/dashboard/prospecting/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tenantId,
            integrationKey,
            geoType: pick.type,
            geoName: pick.name,
            state: pick.type === "state" ? pick.name : runState,
            county: pick.type === "county" ? pick.name : runCounty,
            city: pick.type === "city" ? pick.name : runCity,
            maxResults: Number(runMaxResults || 25),
            services,
            sources: runSources,
            enrichment: runEnrichment,
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) continue;
        success += 1;
      }
      await load();
      setQueueMessage(`Queued geo runs completed: ${success}/${picks.length}.`);
    } catch (e: unknown) {
      setQueueMessage(e instanceof Error ? e.message : "Failed to run top geo opportunities");
    } finally {
      setQueueRunLoading(false);
    }
  }

  async function runGeoFromQueue(type: "state" | "county" | "city", name: string) {
    if (!tenantId) return;
    setQueueRunLoading(true);
    setQueueMessage("");
    try {
      const services = runServices
        .split(/[,\n|;]/g)
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch("/api/dashboard/prospecting/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          integrationKey,
          geoType: type,
          geoName: name,
          state: type === "state" ? name : runState,
          county: type === "county" ? name : runCounty,
          city: type === "city" ? name : runCity,
          maxResults: Number(runMaxResults || 25),
          services,
          sources: runSources,
          enrichment: runEnrichment,
        }),
      });
      const json = (await res.json().catch(() => null)) as RunDiscoveryResponse | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
      setQueueMessage(`Run complete for ${type}: ${name}. Discovered ${fmtInt(json?.results?.discovered)}.`);
    } catch (e: unknown) {
      setQueueMessage(e instanceof Error ? e.message : "Failed to run selected geo");
    } finally {
      setQueueRunLoading(false);
    }
  }

  async function deleteLead(id: string) {
    if (!tenantId) return;
    setLeadSaving(true);
    setLeadMessage("");
    try {
      const res = await fetch("/api/dashboard/prospecting", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          action: "deleteLead",
          leadId: id,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: unknown) {
      setLeadMessage(e instanceof Error ? e.message : "Failed to delete lead");
    } finally {
      setLeadSaving(false);
    }
  }

  const signals = data?.opportunitySignals;
  const profile = data?.businessProfile;
  const leadSummary = data?.leadPool?.summary;
  const leads = data?.leadPool?.rows || [];
  const notifications = data?.notifications;
  const leadView = useMemo(() => leads.find((x) => x.id === leadViewId) || null, [leads, leadViewId]);
  const leadPageSize = 12;
  const leadRowsFiltered = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((row) => {
      const hay = [
        row.businessName,
        row.category,
        row.city,
        row.county,
        row.state,
        row.email,
        row.phone,
        row.website,
        row.services,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, leadSearch]);
  const leadPages = Math.max(1, Math.ceil(leadRowsFiltered.length / leadPageSize));
  const leadPageSafe = Math.min(Math.max(1, leadPage), leadPages);
  const leadRowsPaged = leadRowsFiltered.slice((leadPageSafe - 1) * leadPageSize, leadPageSafe * leadPageSize);

  const notifRowsFiltered = useMemo(() => {
    const q = notifSearch.trim().toLowerCase();
    const rows = notifications?.latest || [];
    if (!q) return rows;
    return rows.filter((row) =>
      [row.businessName, row.city, row.county, row.state, row.reviewStatus].join(" ").toLowerCase().includes(q),
    );
  }, [notifications?.latest, notifSearch]);
  const notifView = useMemo(
    () => (notifications?.latest || []).find((x) => x.leadId === notifViewId) || null,
    [notifications?.latest, notifViewId],
  );
  const recommendations = useMemo(() => {
    const out: string[] = [];
    if (Number(signals?.lostBookings || 0) > 0) {
      out.push(`Recover lost demand: ${fmtInt(signals?.lostBookings)} lost qualified opportunities in selected range.`);
    }
    if (Number(signals?.impressions || 0) > 0 && Number(signals?.lostBookings || 0) > 0) {
      out.push("Prioritize geos with high search demand and low booking conversion for prospect outreach.");
    }
    if (Number(leadSummary?.contactable || 0) < Number(leadSummary?.total || 0) * 0.6) {
      out.push("Improve enrichment quality: run website/email/phone enrichment to raise contactable lead ratio.");
    }
    const topCity = data?.geoQueue?.cities?.[0];
    if (topCity?.name) {
      out.push(`Run city-first expansion in ${topCity.name} (top geo priority).`);
    }
    if (!out.length) {
      out.push("No critical risk detected. Keep daily geo discovery running and review approvals.");
    }
    return out;
  }, [signals?.lostBookings, signals?.impressions, leadSummary?.contactable, leadSummary?.total, data?.geoQueue?.cities]);
  const lostBookings = Number(signals?.lostBookings || 0);
  const lostBookingValue = Number(signals?.lostBookingValue || 0);
  const impressions = Number(signals?.impressions || 0);
  const clicks = Number(signals?.clicks || 0);
  const leadVolume = Number(signals?.leadVolume || 0);
  const contactable = Number(leadSummary?.contactable || 0);
  const totalLeads = Number(leadSummary?.total || 0);
  const pendingApproval = Number(notifications?.pendingApproval || 0);
  const unseenNotif = Number(notifications?.unseen || 0);
  const contactableRate = totalLeads > 0 ? (contactable / totalLeads) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const topState = data?.geoQueue?.states?.[0];
  const topCounty = data?.geoQueue?.counties?.[0];
  const topCity = data?.geoQueue?.cities?.[0];
  const profileMissingCount = Number(profile?.missingFields?.length || 0);

  const primarySignalCards = [
    {
      key: "lost-value",
      title: "Lost Booking Value",
      value: fmtMoney(lostBookingValue),
      hint: `${fmtInt(lostBookings)} lost bookings in range`,
      tone: lostBookingValue >= 5000 ? "critical" : lostBookingValue >= 1500 ? "warning" : "neutral",
    },
    {
      key: "pending-review",
      title: "Pending For Approval",
      value: fmtInt(pendingApproval),
      hint: `Unseen: ${fmtInt(unseenNotif)}`,
      tone: pendingApproval >= 20 ? "critical" : pendingApproval >= 5 ? "warning" : "neutral",
    },
    {
      key: "contactable-rate",
      title: "Contactable Lead Ratio",
      value: fmtPct(contactableRate),
      hint: `${fmtInt(contactable)} of ${fmtInt(totalLeads)} leads`,
      tone: contactableRate < 55 ? "critical" : contactableRate < 70 ? "warning" : "success",
    },
    {
      key: "demand",
      title: "Search Demand (CTR)",
      value: fmtPct(ctr),
      hint: `${fmtInt(impressions)} impr · ${fmtInt(clicks)} clicks`,
      tone: ctr < 3 ? "warning" : "neutral",
    },
    {
      key: "lead-volume",
      title: "Lead Volume Signal",
      value: fmtInt(leadVolume),
      hint: `Pool total: ${fmtInt(totalLeads)}`,
      tone: leadVolume <= 0 ? "warning" : "neutral",
    },
    {
      key: "profile-readiness",
      title: "Profile Readiness",
      value: profileMissingCount ? `${profileMissingCount} missing` : "Ready",
      hint: "Business profile completeness for agent quality",
      tone: profileMissingCount >= 3 ? "critical" : profileMissingCount > 0 ? "warning" : "success",
    },
  ];

  async function generateAiInsights() {
    setAiErr("");
    setAiLoading(true);
    setAiInsights(null);
    try {
      const payload = {
        range: {
          start: computedRange.start,
          end: computedRange.end,
          preset,
        },
        opportunity_signals: signals || null,
        business_profile: profile || null,
        lead_summary: leadSummary || null,
        top_geo_queue: {
          states: (data?.geoQueue?.states || []).slice(0, 6),
          counties: (data?.geoQueue?.counties || []).slice(0, 6),
          cities: (data?.geoQueue?.cities || []).slice(0, 6),
        },
        current_recommendations: recommendations,
      };
      const res = await fetch("/api/dashboard/prospecting/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; insights?: AiInsights } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setAiInsights(json.insights || null);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Failed to generate AI insights.");
    } finally {
      setAiLoading(false);
    }
  }

  async function sendOpportunityToHub(op: AiOpportunity, idx: number) {
    if (!tenantId) {
      setHubError("Missing tenant context.");
      return;
    }
    setHubError("");
    setHubMessage("");
    const key = `${idx}-${op.title}`;
    setHubBusyKey(key);
    try {
      const impact = String(op.expected_impact || "medium").toLowerCase();
      const priority = impact === "high" ? "P1" : impact === "low" ? "P3" : "P2";
      const riskLevel = impact === "high" ? "high" : impact === "low" ? "low" : "medium";
      const expectedImpact = impact === "high" ? "high" : impact === "low" ? "low" : "medium";
      const agentId = agentRouting.prospecting || agentRouting.leads || "soul_leads_prospecting";
      const payload: Record<string, unknown> = {
        tenant_id: tenantId,
        integration_key: integrationKey,
        dashboard: "prospecting",
        recommended_action: op.title,
        rationale: op.why_it_matters,
        evidence: op.evidence,
        steps: op.recommended_actions || [],
        source: "prospecting_ai_playbook",
      };
      const res = await fetch("/api/agents/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: tenantId,
          actionType: "send_leads_ghl",
          agentId,
          dashboardId: "prospecting",
          priority,
          riskLevel,
          expectedImpact,
          summary: `${op.title} (prospecting)`,
          payload,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setHubMessage(`Sent to Notification Hub: ${op.title}`);
    } catch (e: unknown) {
      setHubError(e instanceof Error ? e.message : "Failed to send to Notification Hub.");
    } finally {
      setHubBusyKey("");
    }
  }

  return (
    <div className="shell callsDash ceoDash prospectingDash">
      <DashboardTopbar
        title="Prospecting Dashboard"
        subtitle="County by county and city by city lead intelligence."
        backHref={backHref}
        backLabel="Back to Executive Dashboard"
        tenantId={tenantId}
        notificationsHref={notificationsHref}
      />

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Filters</h2>
            <div className="cardSubtitle">Prospecting signals are computed from selected date range.</div>
          </div>
          <button className="smallBtn" onClick={() => void load()} type="button" disabled={loading || !tenantId}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="cardBody">
          <div className="toolbar">
            {(["today", "7d", "28d", "1m", "3m", "custom"] as RangePreset[]).map((p) => (
              <button
                key={p}
                className={`tabBtn ${preset === p ? "active" : ""}`}
                onClick={() => setPreset(p)}
                type="button"
              >
                {p}
              </button>
            ))}
            {preset === "custom" ? (
              <>
                <input className="input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <input className="input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </>
            ) : null}
          </div>
          {error ? <div className="mini" style={{ color: "var(--danger)" }}>X {error}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Opportunity Signals</h2>
            <div className="cardSubtitle">Priority-ranked inputs used by the prospecting agent and orchestrator decisions.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="prospectingSignalGrid">
            {primarySignalCards.map((card, idx) => (
              <article key={card.key} className={`prospectingSignalCard tone-${card.tone}`}>
                <div className="prospectingSignalHead">
                  <span className="prospectingSignalRank">P{idx + 1}</span>
                  <p className="prospectingSignalTitle">{card.title}</p>
                </div>
                <p className="prospectingSignalValue">{card.value}</p>
                <p className="prospectingSignalHint">{card.hint}</p>
              </article>
            ))}
          </div>
          <div className="prospectingAgentFeed">
            <div className="prospectingAgentFeedHead">Agent Priority Feed</div>
            <div className="prospectingAgentFeedItems">
              <span className="badge">Top state: {topState?.name || "-"}</span>
              <span className="badge">Top county: {topCounty?.name || "-"}</span>
              <span className="badge">Top city: {topCity?.name || "-"}</span>
              <span className="badge">Scope: {profile?.targetGeoScope || "USA + PR"}</span>
              <span className="badge">Email leads: {fmtInt(leadSummary?.withEmail)}</span>
              <span className="badge">Phone leads: {fmtInt(leadSummary?.withPhone)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Opportunity Recommendations</h2>
            <div className="cardSubtitle">Actions generated from bookings, impressions, geo priority, and lead quality signals.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="agencyFormPanel prospectingFormPanel" style={{ marginTop: 0 }}>
            <ul className="mini" style={{ margin: 0, paddingLeft: 18 }}>
              {recommendations.map((rec, idx) => (
                <li key={`rec-${idx}`} style={{ marginBottom: 8 }}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Business Profile Enrichment</h2>
            <div className="cardSubtitle">Add structured fields to improve matching against similar businesses nationwide.</div>
          </div>
          <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void saveBusinessProfile()} disabled={profileSaving || !tenantId}>
            {profileSaving ? "Saving..." : "Save profile fields"}
          </button>
        </div>
        <div className="cardBody">
          <div className="agencyFormPanel prospectingFormPanel" style={{ marginTop: 0 }}>
            <div className="agencyWizardGrid agencyWizardGridTwo">
              <label className="agencyField">
                <span className="agencyFieldLabel">Business Category</span>
                <input
                  className="input"
                  placeholder="e.g. Mobile IV Therapy"
                  value={profileDraft.businessCategory}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, businessCategory: e.target.value }))}
                />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Services Offered</span>
                <input
                  className="input"
                  placeholder="comma separated"
                  value={profileDraft.servicesOffered}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, servicesOffered: e.target.value }))}
                />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Target Geo Scope</span>
                <input
                  className="input"
                  placeholder="USA and Puerto Rico"
                  value={profileDraft.targetGeoScope}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, targetGeoScope: e.target.value }))}
                />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Target Industries</span>
                <input
                  className="input"
                  placeholder="Healthcare, Wellness..."
                  value={profileDraft.targetIndustries}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, targetIndustries: e.target.value }))}
                />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Ideal Customer Profile</span>
                <input
                  className="input"
                  placeholder="high intent profile"
                  value={profileDraft.idealCustomerProfile}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, idealCustomerProfile: e.target.value }))}
                />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">High Impression Low Booking Services</span>
                <input
                  className="input"
                  placeholder="top missed-conversion services"
                  value={profileDraft.highImpressionLowBookingServices}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, highImpressionLowBookingServices: e.target.value }))}
                />
              </label>
              <label className="agencyField agencyFieldFull">
                <span className="agencyFieldLabel">Lost Booking Reasons</span>
                <input
                  className="input"
                  placeholder="reason tags"
                  value={profileDraft.lostBookingReasons}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, lostBookingReasons: e.target.value }))}
                />
              </label>
              <label className="agencyField agencyFieldFull prospectingCheckboxField">
                <span className="agencyFieldLabel">Automation</span>
                <span className="mini" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={profileDraft.prospectingAutoEnabled}
                    onChange={(e) => setProfileDraft((p) => ({ ...p, prospectingAutoEnabled: e.target.checked }))}
                  />
                  Auto prospecting enabled (continuous search via cron auto-run)
                </span>
              </label>
            </div>
          </div>
          {profile?.missingFields?.length ? (
            <div className="mini" style={{ color: "var(--warn)", marginTop: 8 }}>
              Missing profile keys: {profile.missingFields.join(", ")}
            </div>
          ) : null}
          {profileMessage ? <div className="mini" style={{ marginTop: 8 }}>{profileMessage}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Opportunity Notifications</h2>
            <div className="cardSubtitle">New opportunities require your approval before webhook send.</div>
          </div>
          <div className="cardHeaderActions">
            <div className="badge">Pending approval: {fmtInt(notifications?.pendingApproval)}</div>
            <div className="badge">Unseen: {fmtInt(notifications?.unseen)}</div>
            <button
              className="smallBtn"
              type="button"
              onClick={() =>
                void markNotificationsSeen((notifications?.latest || []).filter((x) => !x.seen).map((x) => x.leadId))
              }
            >
              Mark seen
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginBottom: 10 }}>
            <input
              className="input"
              style={{ maxWidth: 360 }}
              placeholder="Search notifications..."
              value={notifSearch}
              onChange={(e) => setNotifSearch(e.target.value)}
            />
            <span className="badge">{fmtInt(notifRowsFiltered.length)} results</span>
          </div>
          <div className="tableWrap prospectingPremiumWrap">
            <table className="table prospectingPremiumTable prospectingNotificationsTable">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Geo</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {notifRowsFiltered.map((row) => (
                  <tr key={`notif-${row.leadId}`}>
                    <td>
                      <div className="prospectingCellTitle">{row.businessName}</div>
                    </td>
                    <td>
                      <div className="prospectingCellTitle">{row.city || row.county || row.state || "-"}</div>
                      <div className="prospectingCellSub">{[row.county, row.state].filter(Boolean).join(", ") || "-"}</div>
                    </td>
                    <td>
                      <span className={`statusPill ${statusToneClass(row.reviewStatus)}`}>{row.reviewStatus}</span>
                    </td>
                    <td className="prospectingCellSub">{fmtDateTime(row.createdAt)}</td>
                    <td>
                      <button className="smallBtn" type="button" onClick={() => setNotifViewId(row.leadId)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {notifRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="mini">No notifications yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {notifView ? (
            <div className="agencyFormPanel prospectingFormPanel prospectingDetailModal" style={{ marginTop: 12 }}>
              <div className="cardHeader" style={{ padding: 0, borderBottom: "none" }}>
                <div>
                  <h2 className="cardTitle" style={{ marginBottom: 4 }}>Opportunity Notification</h2>
                  <div className="cardSubtitle">{notifView.businessName}</div>
                </div>
                <div className="cardHeaderActions">
                  <button className="smallBtn" type="button" onClick={() => setNotifViewId("")}>Close</button>
                </div>
              </div>
              <div className="agencyWizardGrid agencyWizardGridThree" style={{ marginTop: 10 }}>
                <div className="agencyField"><span className="agencyFieldLabel">Geo</span><div className="mini">{[notifView.city, notifView.county, notifView.state].filter(Boolean).join(", ") || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Status</span><div className="mini">{notifView.reviewStatus}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Created</span><div className="mini">{fmtDateTime(notifView.createdAt)}</div></div>
              </div>
              <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 10 }}>
                <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void reviewLead(notifView.leadId, "approved")} disabled={leadSaving}>
                  Approve
                </button>
                <button className="smallBtn" type="button" onClick={() => void reviewLead(notifView.leadId, "rejected")} disabled={leadSaving}>
                  Reject
                </button>
                <button className="smallBtn" type="button" onClick={() => setLeadViewId(notifView.leadId)}>
                  Open Full Lead
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Geo Opportunity Queue</h2>
            <div className="cardSubtitle">Priority candidates from business signals + top geo opportunities (state/county/city).</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void runTopGeoOpportunities()} disabled={queueRunLoading || runLoading}>
              {queueRunLoading ? "Running top opportunities..." : "Run top opportunities"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="prospectingGeoRows">
            <div className="prospectingGeoRowBlock">
              <p className="l moduleTitle">Top States</p>
              <div className="prospectingGeoList">
                {(data?.geoQueue?.states || []).slice(0, 8).map((r, idx) => (
                  <div key={`state-${r.name}`} className="prospectingGeoRow">
                    <div className="prospectingGeoHead">
                      <div className="prospectingGeoIdentity">
                        <div className="prospectingGeoRank">#{idx + 1}</div>
                        <div className="prospectingGeoName">{r.name}</div>
                      </div>
                      <div className="prospectingGeoActions">
                        <button className="smallBtn" type="button" onClick={() => applyGeoFromQueue("state", r.name)}>Use</button>
                        <button className="smallBtn" type="button" onClick={() => void runGeoFromQueue("state", r.name)} disabled={queueRunLoading}>Run</button>
                      </div>
                    </div>
                    <div className="prospectingGeoMeta">
                      <span className="badge">Opp {fmtInt(r.opportunities)}</span>
                      <span className="badge">{fmtMoney(r.value)}</span>
                      <span className="badge">CBP {fmtInt(r.cbpEstablishments)}</span>
                      {Number(r.opportunityOpen || 0) > 0 ? <span className="badge">Open {fmtInt(r.opportunityOpen)}</span> : null}
                      {Number(r.opportunityStaleOver7d || 0) > 0 ? <span className="badge">Stale &gt;7d {fmtInt(r.opportunityStaleOver7d)}</span> : null}
                      {Number(r.opportunityValue || 0) > 0 ? <span className="badge">Opp Value {fmtMoney(r.opportunityValue)}</span> : null}
                      {Number(r.opportunityWinRate || 0) > 0 ? <span className="badge">Win {fmtInt(r.opportunityWinRate)}%</span> : null}
                      <span className="badge">P {fmtInt(r.priorityScore)}</span>
                    </div>
                    {geoOppSignalsLabel(r) ? (
                      <div className="mini" style={{ marginTop: 6, opacity: 0.85 }}>
                        {geoOppSignalsLabel(r)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {(data?.geoQueue?.states || []).length === 0 ? (
                  <div className="mini">No state opportunities yet.</div>
                ) : null}
              </div>
            </div>

            <div className="prospectingGeoRowBlock">
              <p className="l moduleTitle">Top Counties</p>
              <div className="prospectingGeoList">
                {(data?.geoQueue?.counties || []).slice(0, 8).map((r, idx) => (
                  <div key={`county-${r.name}`} className="prospectingGeoRow">
                    <div className="prospectingGeoHead">
                      <div className="prospectingGeoIdentity">
                        <div className="prospectingGeoRank">#{idx + 1}</div>
                        <div className="prospectingGeoName">{r.name}</div>
                      </div>
                      <div className="prospectingGeoActions">
                        <button className="smallBtn" type="button" onClick={() => applyGeoFromQueue("county", r.name)}>Use</button>
                        <button className="smallBtn" type="button" onClick={() => void runGeoFromQueue("county", r.name)} disabled={queueRunLoading}>Run</button>
                      </div>
                    </div>
                    <div className="prospectingGeoMeta">
                      <span className="badge">Opp {fmtInt(r.opportunities)}</span>
                      <span className="badge">{fmtMoney(r.value)}</span>
                      {Number(r.opportunityOpen || 0) > 0 ? <span className="badge">Open {fmtInt(r.opportunityOpen)}</span> : null}
                      {Number(r.opportunityStaleOver7d || 0) > 0 ? <span className="badge">Stale &gt;7d {fmtInt(r.opportunityStaleOver7d)}</span> : null}
                      {Number(r.opportunityValue || 0) > 0 ? <span className="badge">Opp Value {fmtMoney(r.opportunityValue)}</span> : null}
                      {Number(r.opportunityWinRate || 0) > 0 ? <span className="badge">Win {fmtInt(r.opportunityWinRate)}%</span> : null}
                      <span className="badge">P {fmtInt(r.priorityScore)}</span>
                    </div>
                    {geoOppSignalsLabel(r) ? (
                      <div className="mini" style={{ marginTop: 6, opacity: 0.85 }}>
                        {geoOppSignalsLabel(r)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {(data?.geoQueue?.counties || []).length === 0 ? (
                  <div className="mini">No county opportunities yet.</div>
                ) : null}
              </div>
            </div>

            <div className="prospectingGeoRowBlock">
              <p className="l moduleTitle">Top Cities</p>
              <div className="prospectingGeoList">
                {(data?.geoQueue?.cities || []).slice(0, 8).map((r, idx) => (
                  <div key={`city-${r.name}`} className="prospectingGeoRow">
                    <div className="prospectingGeoHead">
                      <div className="prospectingGeoIdentity">
                        <div className="prospectingGeoRank">#{idx + 1}</div>
                        <div className="prospectingGeoName">{r.name}</div>
                      </div>
                      <div className="prospectingGeoActions">
                        <button className="smallBtn" type="button" onClick={() => applyGeoFromQueue("city", r.name)}>Use</button>
                        <button className="smallBtn" type="button" onClick={() => void runGeoFromQueue("city", r.name)} disabled={queueRunLoading}>Run</button>
                      </div>
                    </div>
                    <div className="prospectingGeoMeta">
                      <span className="badge">Opp {fmtInt(r.opportunities)}</span>
                      <span className="badge">{fmtMoney(r.value)}</span>
                      {Number(r.opportunityOpen || 0) > 0 ? <span className="badge">Open {fmtInt(r.opportunityOpen)}</span> : null}
                      {Number(r.opportunityStaleOver7d || 0) > 0 ? <span className="badge">Stale &gt;7d {fmtInt(r.opportunityStaleOver7d)}</span> : null}
                      {Number(r.opportunityValue || 0) > 0 ? <span className="badge">Opp Value {fmtMoney(r.opportunityValue)}</span> : null}
                      {Number(r.opportunityWinRate || 0) > 0 ? <span className="badge">Win {fmtInt(r.opportunityWinRate)}%</span> : null}
                      <span className="badge">P {fmtInt(r.priorityScore)}</span>
                    </div>
                    {geoOppSignalsLabel(r) ? (
                      <div className="mini" style={{ marginTop: 6, opacity: 0.85 }}>
                        {geoOppSignalsLabel(r)}
                      </div>
                    ) : null}
                  </div>
                ))}
                {(data?.geoQueue?.cities || []).length === 0 ? (
                  <div className="mini">No city opportunities yet.</div>
                ) : null}
              </div>
            </div>
          </div>
          {queueMessage ? <div className="mini" style={{ marginTop: 10 }}>{queueMessage}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Playbook (Prospecting Expert)</h2>
            <div className="cardSubtitle">Generate strategy actions and send selected actions to Notification Hub/OpenClaw.</div>
          </div>
          <button
            className="smallBtn agencyActionPrimary"
            type="button"
            onClick={() => void generateAiInsights()}
            disabled={aiLoading || loading || !tenantId}
          >
            {aiLoading ? "Generating..." : "Generate AI Playbook"}
          </button>
        </div>
        <div className="cardBody">
          {aiErr ? <div className="mini" style={{ color: "var(--danger)", marginBottom: 8 }}>X {aiErr}</div> : null}
          {hubError ? <div className="mini" style={{ color: "var(--danger)", marginBottom: 8 }}>X {hubError}</div> : null}
          {hubMessage ? <div className="mini" style={{ color: "rgba(74,222,128,0.95)", marginBottom: 8 }}>✓ {hubMessage}</div> : null}

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
                <div className="mini" style={{ marginTop: 8 }}>
                  <b>Primary risk:</b> {aiInsights.scorecard?.primary_risk}
                </div>
                <div className="mini" style={{ marginTop: 6 }}>
                  <b>Primary opportunity:</b> {aiInsights.scorecard?.primary_opportunity}
                </div>
              </div>

              {!!aiInsights.opportunities?.length && (
                <div className="aiBlock">
                  <div className="aiBlockTitle">Top opportunities</div>
                  <div className="aiOps">
                    {aiInsights.opportunities.slice(0, 4).map((o, idx) => {
                      const key = `${idx}-${o.title}`;
                      return (
                        <div className="aiOp" key={key}>
                          <div className="aiOpHead">
                            <div className="aiOpTitle">{o.title}</div>
                            <span className={`aiImpact ${o.expected_impact || "medium"}`}>
                              {String(o.expected_impact || "medium").toUpperCase()}
                            </span>
                          </div>
                          <div className="mini" style={{ marginTop: 6 }}>
                            <b>Why:</b> {o.why_it_matters}
                          </div>
                          <div className="mini" style={{ marginTop: 6 }}>
                            <b>Evidence:</b> {o.evidence}
                          </div>
                          {Array.isArray(o.recommended_actions) && o.recommended_actions.length ? (
                            <ul className="aiList">
                              {o.recommended_actions.slice(0, 4).map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div style={{ marginTop: 10 }}>
                            <button
                              className="btn moduleBtn"
                              type="button"
                              disabled={hubBusyKey === key}
                              onClick={() => void sendOpportunityToHub(o, idx)}
                            >
                              {hubBusyKey === key ? "Sending..." : "Send to Hub"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mini">Generate AI Playbook to get actionable prospecting plan and send items to hub.</div>
          )}

          <div style={{ marginTop: 12 }}>
            <AiAgentChatPanel
              agent="prospecting"
              title="Prospecting Agent Chat"
              context={{
                tenantId,
                integrationKey,
                range: { start: computedRange.start, end: computedRange.end, preset },
                opportunitySignals: signals || null,
                leadSummary: leadSummary || null,
                topGeo: {
                  states: (data?.geoQueue?.states || []).slice(0, 5),
                  counties: (data?.geoQueue?.counties || []).slice(0, 5),
                  cities: (data?.geoQueue?.cities || []).slice(0, 5),
                },
              }}
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Discovery Runner</h2>
            <div className="cardSubtitle">Multi-source discovery (Overture + OSM + Google optional) with website crawl and optional Hunter enrichment.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="prospectingRunnerConfig">
            <div className="prospectingRunnerConfigBlock">
              <div className="prospectingRunnerConfigTitle">Discovery Sources</div>
              <div className="prospectingRunnerChipRow">
                <button
                  className={`smallBtn ${runSources.overture ? "agencyActionPrimary" : ""}`}
                  type="button"
                  onClick={() => setRunSources((p) => ({ ...p, overture: !p.overture }))}
                >
                  {runSources.overture ? "Overture ON" : "Overture OFF"}
                </button>
                <button
                  className={`smallBtn ${runSources.osmOverpass ? "agencyActionPrimary" : ""}`}
                  type="button"
                  onClick={() => setRunSources((p) => ({ ...p, osmOverpass: !p.osmOverpass }))}
                >
                  {runSources.osmOverpass ? "OSM ON" : "OSM OFF"}
                </button>
                <button
                  className={`smallBtn ${runSources.googlePlaces ? "agencyActionPrimary" : ""}`}
                  type="button"
                  onClick={() => setRunSources((p) => ({ ...p, googlePlaces: !p.googlePlaces }))}
                >
                  {runSources.googlePlaces ? "Google ON" : "Google OFF"}
                </button>
              </div>
            </div>
            <div className="prospectingRunnerConfigBlock">
              <div className="prospectingRunnerConfigTitle">Enrichment</div>
              <div className="prospectingRunnerChipRow">
                <button
                  className={`smallBtn ${runEnrichment.crawlWebsite ? "agencyActionPrimary" : ""}`}
                  type="button"
                  onClick={() => setRunEnrichment((p) => ({ ...p, crawlWebsite: !p.crawlWebsite }))}
                >
                  {runEnrichment.crawlWebsite ? "Crawl ON" : "Crawl OFF"}
                </button>
                <button
                  className={`smallBtn ${runEnrichment.hunterDomainSearch ? "agencyActionPrimary" : ""}`}
                  type="button"
                  onClick={() => setRunEnrichment((p) => ({ ...p, hunterDomainSearch: !p.hunterDomainSearch }))}
                >
                  {runEnrichment.hunterDomainSearch ? "Hunter ON" : "Hunter OFF"}
                </button>
              </div>
            </div>
          </div>
          <div className="agencyFormPanel prospectingFormPanel" style={{ marginTop: 0 }}>
            <div className="agencyWizardGrid agencyWizardGridThree">
              <label className="agencyField">
                <span className="agencyFieldLabel">Geo Type</span>
                <select className="input" value={runGeoType} onChange={(e) => setRunGeoType(e.target.value as "state" | "county" | "city")}>
                  <option value="state">State</option>
                  <option value="county">County</option>
                  <option value="city">City</option>
                </select>
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Geo Name</span>
                <input className="input" list="prospecting-geo-options" placeholder="Miami" value={runGeoName} onChange={(e) => setRunGeoName(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">State Context</span>
                <input className="input" placeholder="optional" value={runState} onChange={(e) => setRunState(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">County Context</span>
                <input className="input" placeholder="optional" value={runCounty} onChange={(e) => setRunCounty(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">City Context</span>
                <input className="input" placeholder="optional" value={runCity} onChange={(e) => setRunCity(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Max Results</span>
                <input className="input" placeholder="25" value={runMaxResults} onChange={(e) => setRunMaxResults(e.target.value)} />
              </label>
              <label className="agencyField agencyFieldFull">
                <span className="agencyFieldLabel">Services</span>
                <input className="input" placeholder="comma separated services" value={runServices} onChange={(e) => setRunServices(e.target.value)} />
              </label>
            </div>
            <datalist id="prospecting-geo-options">
              {geoCandidates.slice(0, 100).map((name) => (
                <option key={`geo-opt-${name}`} value={name} />
              ))}
            </datalist>
          </div>
          <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 10 }}>
            <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void runDiscovery()} disabled={runLoading}>
              {runLoading ? "Running discovery..." : "Run discovery"}
            </button>
            <button className="smallBtn" type="button" onClick={() => void runAutoBatch()} disabled={autoLoading}>
              {autoLoading ? "Running auto batch..." : "Run auto batch"}
            </button>
            <button className="smallBtn" type="button" onClick={() => void pushLeadsToWebhook()} disabled={pushLoading}>
              {pushLoading ? "Pushing approved leads..." : "Push approved leads to GHL webhook"}
            </button>
            {runMessage ? <div className="mini">{runMessage}</div> : null}
            {autoMessage ? <div className="mini">{autoMessage}</div> : null}
            {pushMessage ? <div className="mini">{pushMessage}</div> : null}
          </div>
          <div className="mini" style={{ marginTop: 8 }}>
            Config priority: Google key from tenant integration `google_cloud/google_maps/google_places:default` config.apiKey, then env `GOOGLE_MAPS_API_KEY`; Hunter key from tenant integration `hunter:default` config.apiKey, then env `HUNTER_API_KEY`; Overture uses optional env `OVERTURE_PLACE_SEARCH_URL`.
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14, marginBottom: 24 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Lead Capture Pool</h2>
            <div className="cardSubtitle">Store businesses discovered by scraping/research with email and phone for outreach.</div>
          </div>
          {tenantId ? (
            <a
              className="smallBtn"
              href={`/api/dashboard/prospecting/export?tenantId=${encodeURIComponent(tenantId)}&contactableOnly=1`}
            >
              Export Contactable CSV
            </a>
          ) : null}
        </div>
        <div className="cardBody">
          <div className="agencyFormPanel prospectingFormPanel" style={{ marginTop: 0 }}>
            <div className="agencyWizardGrid agencyWizardGridThree">
              <label className="agencyField">
                <span className="agencyFieldLabel">Business Name</span>
                <input className="input" placeholder="Business name" value={leadDraft.businessName} onChange={(e) => setLeadDraft((p) => ({ ...p, businessName: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Website</span>
                <input className="input" placeholder="https://..." value={leadDraft.website} onChange={(e) => setLeadDraft((p) => ({ ...p, website: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Email</span>
                <input className="input" placeholder="hello@business.com" value={leadDraft.email} onChange={(e) => setLeadDraft((p) => ({ ...p, email: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Phone</span>
                <input className="input" placeholder="+1..." value={leadDraft.phone} onChange={(e) => setLeadDraft((p) => ({ ...p, phone: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">State</span>
                <input className="input" placeholder="State" value={leadDraft.state} onChange={(e) => setLeadDraft((p) => ({ ...p, state: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">County</span>
                <input className="input" placeholder="County" value={leadDraft.county} onChange={(e) => setLeadDraft((p) => ({ ...p, county: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">City</span>
                <input className="input" placeholder="City" value={leadDraft.city} onChange={(e) => setLeadDraft((p) => ({ ...p, city: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Category</span>
                <input className="input" placeholder="Category" value={leadDraft.category} onChange={(e) => setLeadDraft((p) => ({ ...p, category: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Services</span>
                <input className="input" placeholder="Services" value={leadDraft.services} onChange={(e) => setLeadDraft((p) => ({ ...p, services: e.target.value }))} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Source</span>
                <input className="input" placeholder="Source URL / notes source" value={leadDraft.source} onChange={(e) => setLeadDraft((p) => ({ ...p, source: e.target.value }))} />
              </label>
              <label className="agencyField agencyFieldFull">
                <span className="agencyFieldLabel">Notes</span>
                <input className="input" placeholder="Notes" value={leadDraft.notes} onChange={(e) => setLeadDraft((p) => ({ ...p, notes: e.target.value }))} />
              </label>
            </div>
          </div>
          <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 10 }}>
            <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void addLead()} disabled={leadSaving}>
              {leadSaving ? "Saving..." : "Add lead"}
            </button>
            {leadMessage ? <div className="mini">{leadMessage}</div> : null}
          </div>
          <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 380 }}
              placeholder="Search business, geo, email, phone..."
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                setLeadPage(1);
              }}
            />
            <span className="badge">{fmtInt(leadRowsFiltered.length)} leads</span>
          </div>

          <div className="tableWrap prospectingPremiumWrap" style={{ marginTop: 12 }}>
            <table className="table prospectingPremiumTable prospectingLeadTable">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Geo</th>
                  <th>Contact</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leadRowsPaged.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="prospectingCellTitle">{lead.businessName}</div>
                      <div className="prospectingCellSub">{lead.category || "-"}</div>
                      <div className="prospectingCellSub">{lead.source || "-"}</div>
                    </td>
                    <td>
                      <div className="prospectingCellTitle">{lead.city || lead.county || lead.state || "-"}</div>
                      <div className="prospectingCellSub">{[lead.county, lead.state].filter(Boolean).join(", ") || "-"}</div>
                    </td>
                    <td>
                      <div className="prospectingCellSub">{lead.email || "-"}</div>
                      <div className="prospectingCellSub">{lead.phone || "-"}</div>
                    </td>
                    <td>
                      <div className="prospectingCellTitle">{fmtInt(lead.convictionScore)} / 100</div>
                      <div className="prospectingCellSub">{lead.convictionTier || "cold"}</div>
                    </td>
                    <td>
                      <span className={`statusPill ${statusToneClass(lead.status)}`}>{lead.status}</span>
                    </td>
                    <td>
                      <span className={`statusPill ${statusToneClass(lead.reviewStatus || "pending")}`}>{lead.reviewStatus || "pending"}</span>
                    </td>
                    <td>
                      <div className="prospectingRowActions">
                        <button className="smallBtn" type="button" onClick={() => setLeadViewId(lead.id)}>
                          View
                        </button>
                        <button className="smallBtn" type="button" onClick={() => void deleteLead(lead.id)} disabled={leadSaving}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {leadRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="mini">No leads saved yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {leadRowsFiltered.length > leadPageSize ? (
            <div
              className="agencyCreateActions agencyCreateActionsSpaced"
              style={{ marginTop: 8 }}
            >
              <div className="mini">
                Page {leadPageSafe} / {leadPages}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="smallBtn" type="button" disabled={leadPageSafe <= 1} onClick={() => setLeadPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <button className="smallBtn" type="button" disabled={leadPageSafe >= leadPages} onClick={() => setLeadPage((p) => Math.min(leadPages, p + 1))}>
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {leadView ? (
            <div className="agencyFormPanel prospectingFormPanel prospectingDetailModal" style={{ marginTop: 12 }}>
              <div className="cardHeader" style={{ padding: 0, borderBottom: "none" }}>
                <div>
                  <h2 className="cardTitle" style={{ marginBottom: 4 }}>Lead Detail</h2>
                  <div className="cardSubtitle">{leadView.businessName}</div>
                </div>
                <div className="cardHeaderActions">
                  <button className="smallBtn" type="button" onClick={() => setLeadViewId("")}>Close</button>
                </div>
              </div>
              <div className="agencyWizardGrid agencyWizardGridThree" style={{ marginTop: 10 }}>
                <div className="agencyField"><span className="agencyFieldLabel">Website</span><div className="mini">{leadView.website || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Email</span><div className="mini">{leadView.email || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Phone</span><div className="mini">{leadView.phone || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Category</span><div className="mini">{leadView.category || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Services</span><div className="mini">{leadView.services || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Location</span><div className="mini">{[leadView.city, leadView.county, leadView.state].filter(Boolean).join(", ") || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Source</span><div className="mini">{leadView.source || "-"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Status</span><div className="mini">{leadView.status}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Review</span><div className="mini">{leadView.reviewStatus || "pending"}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Conviction Score</span><div className="mini">{fmtInt(leadView.convictionScore)} / 100 ({leadView.convictionTier || "cold"})</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Created</span><div className="mini">{fmtDateTime(leadView.createdAt)}</div></div>
                <div className="agencyField"><span className="agencyFieldLabel">Updated</span><div className="mini">{fmtDateTime(leadView.updatedAt)}</div></div>
                <div className="agencyField agencyFieldFull"><span className="agencyFieldLabel">Notes</span><div className="mini">{leadView.notes || "-"}</div></div>
                <div className="agencyField agencyFieldFull">
                  <span className="agencyFieldLabel">Why This Score</span>
                  <div className="mini">{(leadView.convictionReasons || []).join(" • ") || "-"}</div>
                </div>
              </div>
              <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 10 }}>
                <button className="smallBtn agencyActionPrimary" type="button" onClick={() => void reviewLead(leadView.id, "approved")} disabled={leadSaving}>
                  Approve
                </button>
                <button className="smallBtn" type="button" onClick={() => void reviewLead(leadView.id, "rejected")} disabled={leadSaving}>
                  Reject
                </button>
                {leadView.website ? (
                  <a className="smallBtn" href={leadView.website} target="_blank" rel="noreferrer">
                    Open Website
                  </a>
                ) : null}
                {leadView.email ? (
                  <a className="smallBtn" href={`mailto:${leadView.email}`}>
                    Email
                  </a>
                ) : null}
                {leadView.phone ? (
                  <a className="smallBtn" href={`tel:${leadView.phone}`}>
                    Call
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {(data?.complianceChecklist || []).length ? (
            <div style={{ marginTop: 12 }}>
              <p className="mini"><b>Compliance checklist</b></p>
              <ul className="mini" style={{ marginTop: 6 }}>
                {(data?.complianceChecklist || []).map((item, idx) => (
                  <li key={`comp-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default function ProspectingDashboardPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading dashboard...</div>}>
      <ProspectingDashboardContent />
    </Suspense>
  );
}
