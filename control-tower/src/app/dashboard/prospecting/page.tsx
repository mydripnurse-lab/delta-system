"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";

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

function fmtDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function ProspectingDashboardContent() {
  const searchParams = useBrowserSearchParams();
  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);

  const integrationKey = String(searchParams?.get("integrationKey") || "owner").trim() || "owner";
  const backHref = tenantId
    ? `/dashboard?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard";

  const [preset, setPreset] = useState<RangePreset>("28d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const computedRange = useMemo(
    () => computeDashboardRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProspectingResponse | null>(null);

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
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMessage, setAutoMessage] = useState("");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

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
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
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
          }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const r = json.results || {};
      setRunMessage(
        `Run complete. Discovered ${fmtInt(r.discovered)}; created ${fmtInt(r.created)}; updated ${fmtInt(r.updated)}; with email ${fmtInt(r.withEmail)}; with phone ${fmtInt(r.withPhone)}.`,
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

  return (
    <div className="shell callsDash ceoDash">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>Prospecting Dashboard</h1>
            <div className="subtle">County by county and city by city lead intelligence.</div>
          </div>
        </div>
        <div className="pills">
          <Link className="smallBtn" href={backHref}>
            Back to Executive Dashboard
          </Link>
        </div>
      </header>

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
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
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
            <div className="cardSubtitle">Derived from impressions, lost bookings, and lead flow for this tenant.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="kpiRow kpiRowWide">
            <div className="kpi">
              <p className="n">{fmtInt(signals?.lostBookings)}</p>
              <p className="l">Lost bookings</p>
              <div className="mini">Lost value: {fmtMoney(signals?.lostBookingValue)}</div>
            </div>
            <div className="kpi">
              <p className="n">{fmtInt(signals?.impressions)}</p>
              <p className="l">Search impressions</p>
              <div className="mini">Clicks: {fmtInt(signals?.clicks)}</div>
            </div>
            <div className="kpi">
              <p className="n">{fmtInt(signals?.leadVolume)}</p>
              <p className="l">Current leads</p>
              <div className="mini">Tenant scope: {profile?.targetGeoScope || "USA + PR"}</div>
            </div>
            <div className="kpi">
              <p className="n">{fmtInt(leadSummary?.total)}</p>
              <p className="l">Leads captured</p>
              <div className="mini">
                Contactable: {fmtInt(leadSummary?.contactable)} ({fmtInt(leadSummary?.withEmail)} email / {fmtInt(leadSummary?.withPhone)} phone)
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Business Profile Enrichment</h2>
            <div className="cardSubtitle">Add structured fields to improve matching against similar businesses nationwide.</div>
          </div>
          <button className="smallBtn" type="button" onClick={() => void saveBusinessProfile()} disabled={profileSaving || !tenantId}>
            {profileSaving ? "Saving..." : "Save profile fields"}
          </button>
        </div>
        <div className="cardBody">
          <div className="tableWrap">
            <div className="toolbar" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(240px, 1fr))", gap: 10 }}>
              <input
                placeholder="Business category (e.g. Mobile IV Therapy)"
                value={profileDraft.businessCategory}
                onChange={(e) => setProfileDraft((p) => ({ ...p, businessCategory: e.target.value }))}
              />
              <input
                placeholder="Services offered (comma separated)"
                value={profileDraft.servicesOffered}
                onChange={(e) => setProfileDraft((p) => ({ ...p, servicesOffered: e.target.value }))}
              />
              <input
                placeholder="Target geo scope"
                value={profileDraft.targetGeoScope}
                onChange={(e) => setProfileDraft((p) => ({ ...p, targetGeoScope: e.target.value }))}
              />
              <input
                placeholder="Target industries"
                value={profileDraft.targetIndustries}
                onChange={(e) => setProfileDraft((p) => ({ ...p, targetIndustries: e.target.value }))}
              />
              <input
                placeholder="Ideal customer profile"
                value={profileDraft.idealCustomerProfile}
                onChange={(e) => setProfileDraft((p) => ({ ...p, idealCustomerProfile: e.target.value }))}
              />
              <input
                placeholder="High impression low booking services"
                value={profileDraft.highImpressionLowBookingServices}
                onChange={(e) => setProfileDraft((p) => ({ ...p, highImpressionLowBookingServices: e.target.value }))}
              />
              <input
                placeholder="Lost booking reasons"
                value={profileDraft.lostBookingReasons}
                onChange={(e) => setProfileDraft((p) => ({ ...p, lostBookingReasons: e.target.value }))}
              />
              <label className="mini" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={profileDraft.prospectingAutoEnabled}
                  onChange={(e) => setProfileDraft((p) => ({ ...p, prospectingAutoEnabled: e.target.checked }))}
                />
                Auto prospecting enabled (continuous search via cron auto-run)
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
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Geo</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(notifications?.latest || []).map((row) => (
                  <tr key={`notif-${row.leadId}`}>
                    <td>{row.businessName}</td>
                    <td>{[row.city, row.county, row.state].filter(Boolean).join(", ") || "-"}</td>
                    <td>{row.reviewStatus}</td>
                    <td>{fmtDateTime(row.createdAt)}</td>
                  </tr>
                ))}
                {(notifications?.latest || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="mini">No notifications yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Geo Opportunity Queue</h2>
            <div className="cardSubtitle">Priority candidates to discover and enrich by state, county, and city.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid">
            <div className="moduleCard">
              <p className="l moduleTitle">Top States</p>
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>State</th>
                      <th>Opp</th>
                      <th>Value</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.geoQueue?.states || []).slice(0, 8).map((r) => (
                      <tr key={`state-${r.name}`}>
                        <td>{r.name}</td>
                        <td>{fmtInt(r.opportunities)}</td>
                        <td>{fmtMoney(r.value)}</td>
                        <td>{fmtInt(r.priorityScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="moduleCard">
              <p className="l moduleTitle">Top Counties</p>
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>County</th>
                      <th>Opp</th>
                      <th>Value</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.geoQueue?.counties || []).slice(0, 8).map((r) => (
                      <tr key={`county-${r.name}`}>
                        <td>{r.name}</td>
                        <td>{fmtInt(r.opportunities)}</td>
                        <td>{fmtMoney(r.value)}</td>
                        <td>{fmtInt(r.priorityScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="moduleCard">
              <p className="l moduleTitle">Top Cities</p>
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Opp</th>
                      <th>Value</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.geoQueue?.cities || []).slice(0, 8).map((r) => (
                      <tr key={`city-${r.name}`}>
                        <td>{r.name}</td>
                        <td>{fmtInt(r.opportunities)}</td>
                        <td>{fmtMoney(r.value)}</td>
                        <td>{fmtInt(r.priorityScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Discovery Runner</h2>
            <div className="cardSubtitle">Automated business discovery + email/phone enrichment via Google Places + website scan.</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="toolbar" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
            <select value={runGeoType} onChange={(e) => setRunGeoType(e.target.value as "state" | "county" | "city")}>
              <option value="state">State</option>
              <option value="county">County</option>
              <option value="city">City</option>
            </select>
            <input list="prospecting-geo-options" placeholder="Geo name" value={runGeoName} onChange={(e) => setRunGeoName(e.target.value)} />
            <datalist id="prospecting-geo-options">
              {geoCandidates.slice(0, 100).map((name) => (
                <option key={`geo-opt-${name}`} value={name} />
              ))}
            </datalist>
            <input placeholder="State context (optional)" value={runState} onChange={(e) => setRunState(e.target.value)} />
            <input placeholder="County context (optional)" value={runCounty} onChange={(e) => setRunCounty(e.target.value)} />
            <input placeholder="City context (optional)" value={runCity} onChange={(e) => setRunCity(e.target.value)} />
            <input placeholder="Max results" value={runMaxResults} onChange={(e) => setRunMaxResults(e.target.value)} />
            <input placeholder="Services (comma separated)" value={runServices} onChange={(e) => setRunServices(e.target.value)} />
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn btnPrimary" type="button" onClick={() => void runDiscovery()} disabled={runLoading}>
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
            API key source priority: tenant integration `google_maps:default` config.apiKey, then env `GOOGLE_MAPS_API_KEY`.
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
          <div className="toolbar" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 10 }}>
            <input placeholder="Business name" value={leadDraft.businessName} onChange={(e) => setLeadDraft((p) => ({ ...p, businessName: e.target.value }))} />
            <input placeholder="Website" value={leadDraft.website} onChange={(e) => setLeadDraft((p) => ({ ...p, website: e.target.value }))} />
            <input placeholder="Email" value={leadDraft.email} onChange={(e) => setLeadDraft((p) => ({ ...p, email: e.target.value }))} />
            <input placeholder="Phone" value={leadDraft.phone} onChange={(e) => setLeadDraft((p) => ({ ...p, phone: e.target.value }))} />
            <input placeholder="State" value={leadDraft.state} onChange={(e) => setLeadDraft((p) => ({ ...p, state: e.target.value }))} />
            <input placeholder="County" value={leadDraft.county} onChange={(e) => setLeadDraft((p) => ({ ...p, county: e.target.value }))} />
            <input placeholder="City" value={leadDraft.city} onChange={(e) => setLeadDraft((p) => ({ ...p, city: e.target.value }))} />
            <input placeholder="Category" value={leadDraft.category} onChange={(e) => setLeadDraft((p) => ({ ...p, category: e.target.value }))} />
            <input placeholder="Services" value={leadDraft.services} onChange={(e) => setLeadDraft((p) => ({ ...p, services: e.target.value }))} />
            <input placeholder="Source URL / Notes source" value={leadDraft.source} onChange={(e) => setLeadDraft((p) => ({ ...p, source: e.target.value }))} />
            <input placeholder="Notes" value={leadDraft.notes} onChange={(e) => setLeadDraft((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn btnPrimary" type="button" onClick={() => void addLead()} disabled={leadSaving}>
              {leadSaving ? "Saving..." : "Add lead"}
            </button>
            {leadMessage ? <div className="mini">{leadMessage}</div> : null}
          </div>

          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div>{lead.businessName}</div>
                      <div className="mini">{lead.website || "-"}</div>
                    </td>
                    <td>{lead.category || "-"}</td>
                    <td>{[lead.city, lead.county, lead.state].filter(Boolean).join(", ") || "-"}</td>
                    <td>{lead.email || "-"}</td>
                    <td>{lead.phone || "-"}</td>
                    <td>{lead.status}</td>
                    <td>
                      <div className="mini">{lead.reviewStatus || "pending"}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button className="smallBtn" type="button" onClick={() => void reviewLead(lead.id, "approved")} disabled={leadSaving}>
                          Approve
                        </button>
                        <button className="smallBtn" type="button" onClick={() => void reviewLead(lead.id, "rejected")} disabled={leadSaving}>
                          Reject
                        </button>
                      </div>
                    </td>
                    <td>{fmtDateTime(lead.updatedAt)}</td>
                    <td>
                      <button className="smallBtn" type="button" onClick={() => void deleteLead(lead.id)} disabled={leadSaving}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="mini">No leads saved yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

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
