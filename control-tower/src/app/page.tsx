"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  root_domain?: string | null;
  app_display_name?: string | null;
  brand_name?: string | null;
  owner_location_id?: string | null;
  logo_url?: string | null;
  active_states?: number | null;
  total_subaccounts?: number | null;
  total_calls?: number | null;
  total_impressions?: number | null;
  total_revenue?: number | null;
  total_leads?: number | null;
  prev_calls?: number | null;
  prev_impressions?: number | null;
  prev_revenue?: number | null;
  prev_leads?: number | null;
  delta_pct_calls?: number | null;
  delta_pct_impressions?: number | null;
  delta_pct_revenue?: number | null;
  delta_pct_leads?: number | null;
};

type TenantListResponse = {
  ok: boolean;
  total?: number;
  rows?: TenantRow[];
  error?: string;
};

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TenantSettings = {
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  root_domain?: string | null;
  ghl_company_id?: string | null;
  snapshot_id?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  app_display_name?: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  ads_alert_webhook_url?: string | null;
  ads_alerts_enabled?: boolean | null;
  ads_alert_sms_enabled?: boolean | null;
  ads_alert_sms_to?: string | null;
  google_service_account_json?: Record<string, unknown> | null;
};

type TenantIntegration = {
  id: string;
  provider: string;
  integration_key: string;
  status: string;
  auth_type?: string | null;
  external_account_id?: string | null;
  external_property_id?: string | null;
  config?: Record<string, unknown> | null;
  scopes?: string[] | null;
  last_sync_at?: string | null;
  last_error?: string | null;
};

type TenantDetailResponse = {
  ok: boolean;
  tenant?: TenantDetail;
  settings?: TenantSettings | null;
  integrations?: TenantIntegration[];
  error?: string;
};

type TenantStaffRow = {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  status: "active" | "invited" | "disabled";
  invitedAt?: string | null;
  joinedAt?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type TenantAuditRow = {
  id: string;
  organizationId: string;
  actorType: string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  severity: "info" | "warning" | "error";
  payload?: unknown;
  createdAt: string;
};

const DEFAULT_INTEGRATION_KEY = "default";
const BING_DEFAULT_ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json";
type KpiRangePreset = "7d" | "28d" | "3m" | "6m" | "1y" | "custom";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slugify(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatInt(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

function formatMoney(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDeltaPct(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}% vs prev`;
}

function deltaClass(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "agencyKpiDelta agencyKpiDeltaNeutral";
  return v > 0 ? "agencyKpiDelta agencyKpiDeltaUp" : "agencyKpiDelta agencyKpiDeltaDown";
}

function tenantInitials(name: string) {
  const parts = s(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "T";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function rangeFromPreset(preset: KpiRangePreset, customStart: string, customEnd: string) {
  const range = computeDashboardRange(
    preset as DashboardRangePreset,
    s(customStart),
    s(customEnd),
  );
  return { start: s(range.start), end: s(range.end), preset };
}

export default function AgencyHomePage() {
  const router = useRouter();
  const [tenantRows, setTenantRows] = useState<TenantRow[]>([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantErr, setTenantErr] = useState("");
  const [tenantKpiSyncBusy, setTenantKpiSyncBusy] = useState(false);
  const [tenantKpiSyncMsg, setTenantKpiSyncMsg] = useState("");
  const [tenantKpiPreset, setTenantKpiPreset] = useState<KpiRangePreset>("28d");
  const [tenantKpiCompare, setTenantKpiCompare] = useState(true);
  const [tenantKpiStart, setTenantKpiStart] = useState("");
  const [tenantKpiEnd, setTenantKpiEnd] = useState("");
  const [tenantKpiPrefsReady, setTenantKpiPrefsReady] = useState(false);
  const [tenantSearch, setTenantSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createConnectionTab, setCreateConnectionTab] = useState<"owner" | "messaging" | "google">("owner");

  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newOwnerLocationId, setNewOwnerLocationId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newTwilioSid, setNewTwilioSid] = useState("");
  const [newTwilioAuthToken, setNewTwilioAuthToken] = useState("");
  const [newMailgunApiKey, setNewMailgunApiKey] = useState("");
  const [newMailgunDomain, setNewMailgunDomain] = useState("");
  const [newAdsAlertWebhookUrl, setNewAdsAlertWebhookUrl] = useState("");
  const [newAdsAlertsEnabled, setNewAdsAlertsEnabled] = useState(true);
  const [newAdsAlertSmsEnabled, setNewAdsAlertSmsEnabled] = useState(false);
  const [newAdsAlertSmsTo, setNewAdsAlertSmsTo] = useState("");
  const [newGoogleCloudProjectId, setNewGoogleCloudProjectId] = useState("");
  const [newGoogleServiceAccountEmail, setNewGoogleServiceAccountEmail] = useState("");
  const [newGoogleServiceAccountKeyfilePath, setNewGoogleServiceAccountKeyfilePath] = useState("");
  const [newGoogleServiceAccountJson, setNewGoogleServiceAccountJson] = useState("");
  const [newGoogleSheetId, setNewGoogleSheetId] = useState("");
  const [newGscProperty, setNewGscProperty] = useState("");
  const [newGa4PropertyId, setNewGa4PropertyId] = useState("");
  const [newSnapshotId, setNewSnapshotId] = useState("");
  const [newOwnerFirstName, setNewOwnerFirstName] = useState("");
  const [newOwnerLastName, setNewOwnerLastName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerPhone, setNewOwnerPhone] = useState("");
  const [newRootDomain, setNewRootDomain] = useState("");
  const [newTimezone, setNewTimezone] = useState("US/Eastern");
  const [newLocale, setNewLocale] = useState("en-US");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [newLogoUrl, setNewLogoUrl] = useState("");

  const [showManage, setShowManage] = useState(false);
  const [manageTab, setManageTab] = useState<"overview" | "integrations" | "staff" | "audit" | "danger">("overview");
  const [manageOverviewTab, setManageOverviewTab] = useState<"identity" | "owner" | "messaging" | "google">("identity");
  const [manageBusy, setManageBusy] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageErr, setManageErr] = useState("");
  const [manageOk, setManageOk] = useState("");
  const [manageTenantId, setManageTenantId] = useState("");
  const [manageTenantName, setManageTenantName] = useState("");
  const [manageName, setManageName] = useState("");
  const [manageSlug, setManageSlug] = useState("");
  const [manageStatus, setManageStatus] = useState("active");
  const [manageOwnerLocationId, setManageOwnerLocationId] = useState("");
  const [manageCompanyId, setManageCompanyId] = useState("");
  const [manageTwilioSid, setManageTwilioSid] = useState("");
  const [manageTwilioAuthToken, setManageTwilioAuthToken] = useState("");
  const [manageMailgunApiKey, setManageMailgunApiKey] = useState("");
  const [manageMailgunDomain, setManageMailgunDomain] = useState("");
  const [manageAdsAlertWebhookUrl, setManageAdsAlertWebhookUrl] = useState("");
  const [manageAdsAlertsEnabled, setManageAdsAlertsEnabled] = useState(true);
  const [manageAdsAlertSmsEnabled, setManageAdsAlertSmsEnabled] = useState(false);
  const [manageAdsAlertSmsTo, setManageAdsAlertSmsTo] = useState("");
  const [manageGoogleCloudProjectId, setManageGoogleCloudProjectId] = useState("");
  const [manageGoogleServiceAccountEmail, setManageGoogleServiceAccountEmail] = useState("");
  const [manageGoogleServiceAccountKeyfilePath, setManageGoogleServiceAccountKeyfilePath] = useState("");
  const [manageGoogleServiceAccountJson, setManageGoogleServiceAccountJson] = useState("");
  const [manageGoogleSheetId, setManageGoogleSheetId] = useState("");
  const [manageGscProperty, setManageGscProperty] = useState("");
  const [manageGa4PropertyId, setManageGa4PropertyId] = useState("");
  const [manageSnapshotId, setManageSnapshotId] = useState("");
  const [manageOwnerFirstName, setManageOwnerFirstName] = useState("");
  const [manageOwnerLastName, setManageOwnerLastName] = useState("");
  const [manageOwnerEmail, setManageOwnerEmail] = useState("");
  const [manageOwnerPhone, setManageOwnerPhone] = useState("");
  const [manageRootDomain, setManageRootDomain] = useState("");
  const [manageTimezone, setManageTimezone] = useState("US/Eastern");
  const [manageLocale, setManageLocale] = useState("en-US");
  const [manageCurrency, setManageCurrency] = useState("USD");
  const [manageLogoUrl, setManageLogoUrl] = useState("");
  const [manageDeleteText, setManageDeleteText] = useState("");
  const [manageIntegrations, setManageIntegrations] = useState<TenantIntegration[]>([]);
  const [manageIntegrationsBusyId, setManageIntegrationsBusyId] = useState("");
  const [manageBingApiKey, setManageBingApiKey] = useState("");
  const [manageBingSiteUrl, setManageBingSiteUrl] = useState("");
  const [manageBingSiteUrls, setManageBingSiteUrls] = useState("");
  const [manageBingEndpoint, setManageBingEndpoint] = useState(BING_DEFAULT_ENDPOINT);
  const [manageBingBusy, setManageBingBusy] = useState(false);
  const [manageAdsSampleBusy, setManageAdsSampleBusy] = useState(false);
  const [manageAdsSampleResult, setManageAdsSampleResult] = useState("");
  const [manageStaffRows, setManageStaffRows] = useState<TenantStaffRow[]>([]);
  const [manageStaffLoading, setManageStaffLoading] = useState(false);
  const [manageStaffBusy, setManageStaffBusy] = useState(false);
  const [manageAuditRows, setManageAuditRows] = useState<TenantAuditRow[]>([]);
  const [manageAuditLoading, setManageAuditLoading] = useState(false);
  const [newStaffFullName, setNewStaffFullName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<TenantStaffRow["role"]>("viewer");
  const [newStaffStatus, setNewStaffStatus] = useState<TenantStaffRow["status"]>("invited");
  const [activeMenu, setActiveMenu] = useState("projects");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const autoSyncRanRef = useRef(false);
  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncReqSeqRef = useRef(0);
  const kpiPresetRef = useRef<KpiRangePreset>("28d");
  const kpiCompareRef = useRef(true);
  const kpiStartRef = useRef("");
  const kpiEndRef = useRef("");

  async function safeJson(res: Response) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Non-JSON response (${res.status})`, raw: text.slice(0, 400) };
    }
  }

  async function loadTenants() {
    setTenantLoading(true);
    setTenantErr("");
    try {
      const res = await fetch("/api/tenants", { cache: "no-store" });
      const data = (await safeJson(res)) as TenantListResponse | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setTenantRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load tenants";
      setTenantErr(message);
      setTenantRows([]);
    } finally {
      setTenantLoading(false);
    }
  }

  async function loadTenantKpiPrefs() {
    try {
      const res = await fetch("/api/agency/settings/projects-kpis", { cache: "no-store" });
      const data = (await safeJson(res)) as
        | { ok?: boolean; payload?: { preset?: string; compare?: number; start?: string; end?: string } }
        | null;
      if (!res.ok || !data?.ok || !data.payload) return;
      const p = s(data.payload.preset).toLowerCase();
      if (p === "7d" || p === "28d" || p === "3m" || p === "6m" || p === "1y" || p === "custom") {
        kpiPresetRef.current = p as KpiRangePreset;
        setTenantKpiPreset(p as KpiRangePreset);
      }
      const nextCompare = Number(data.payload.compare || 0) !== 0;
      const nextStart = s(data.payload.start).slice(0, 10);
      const nextEnd = s(data.payload.end).slice(0, 10);
      kpiCompareRef.current = nextCompare;
      kpiStartRef.current = nextStart;
      kpiEndRef.current = nextEnd;
      setTenantKpiCompare(nextCompare);
      setTenantKpiStart(nextStart);
      setTenantKpiEnd(nextEnd);
    } catch {
      // best effort
    }
  }

  async function saveTenantKpiPrefs() {
    try {
      const range = rangeFromPreset(tenantKpiPreset, tenantKpiStart, tenantKpiEnd);
      await fetch("/api/agency/settings/projects-kpis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: range.preset,
          compare: tenantKpiCompare ? 1 : 0,
          start: range.start,
          end: range.end,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  async function syncTenantKpis(force = false, opts?: { silent?: boolean; reloadTenants?: boolean }) {
    const silent = !!opts?.silent;
    const reloadTenants = opts?.reloadTenants !== false;
    const reqSeq = ++syncReqSeqRef.current;
    setTenantKpiSyncBusy(true);
    if (!silent) {
      setTenantKpiSyncMsg("");
      setTenantErr("");
    }
    try {
      const range = rangeFromPreset(kpiPresetRef.current, kpiStartRef.current, kpiEndRef.current);
      const res = await fetch("/api/tenants/kpis/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force,
          preset: range.preset,
          start: range.start,
          end: range.end,
          compare: kpiCompareRef.current ? 1 : 0,
        }),
      });
      const data = (await safeJson(res)) as
        | { ok?: boolean; synced?: number; total?: number; failed?: number; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const synced = Number(data.synced || 0);
      const total = Number(data.total || 0);
      const failed = Number(data.failed || 0);
      if (reqSeq !== syncReqSeqRef.current) return;
      if (!silent) {
        setTenantKpiSyncMsg(`KPIs synced: ${synced}/${total}${failed > 0 ? ` (${failed} failed)` : ""}.`);
      }
      if (reloadTenants) {
        await loadTenants();
      }
    } catch (error: unknown) {
      if (reqSeq !== syncReqSeqRef.current) return;
      if (!silent) {
        setTenantErr(error instanceof Error ? error.message : "Failed to sync KPIs");
      }
    } finally {
      if (reqSeq === syncReqSeqRef.current) {
        setTenantKpiSyncBusy(false);
      }
    }
  }

  useEffect(() => {
    kpiPresetRef.current = tenantKpiPreset;
    kpiCompareRef.current = tenantKpiCompare;
    kpiStartRef.current = tenantKpiStart;
    kpiEndRef.current = tenantKpiEnd;
  }, [tenantKpiPreset, tenantKpiCompare, tenantKpiStart, tenantKpiEnd]);

  useEffect(() => {
    if (autoSyncRanRef.current) return;
    autoSyncRanRef.current = true;
    void (async () => {
      await loadTenantKpiPrefs();
      setTenantKpiPrefsReady(true);
      await loadTenants();
      await syncTenantKpis(false, { silent: true, reloadTenants: false });
      await loadTenants();
    })();
    autoSyncIntervalRef.current = setInterval(() => {
      void syncTenantKpis(false, { silent: true });
    }, 10 * 60 * 1000);
    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!tenantKpiPrefsReady) return;
    if (!autoSyncRanRef.current) return;
    if (tenantKpiPreset === "custom" && (!s(tenantKpiStart) || !s(tenantKpiEnd))) return;
    const t = setTimeout(() => {
      void saveTenantKpiPrefs();
      void syncTenantKpis(false, { silent: true });
    }, 300);
    return () => clearTimeout(t);
  }, [tenantKpiPreset, tenantKpiCompare, tenantKpiStart, tenantKpiEnd, tenantKpiPrefsReady]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!accountMenuRef.current) return;
      if (!accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
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

  useEffect(() => {
    if (!showManage || !s(manageTenantId)) return;
    if (manageTab === "staff" && manageStaffRows.length === 0 && !manageStaffLoading) {
      void loadManageStaff(manageTenantId);
    }
    if (manageTab === "audit" && manageAuditRows.length === 0 && !manageAuditLoading) {
      void loadManageAudit(manageTenantId);
    }
  }, [showManage, manageTab, manageTenantId, manageStaffRows.length, manageAuditRows.length, manageStaffLoading, manageAuditLoading]);

  const filteredTenants = useMemo(() => {
    const q = s(tenantSearch).toLowerCase();
    if (!q) return tenantRows;
    return tenantRows.filter((t) => {
      const blob = [t.name, t.slug, t.root_domain].map(s).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [tenantRows, tenantSearch]);

  const tenantStats = useMemo(() => {
    const total = tenantRows.length;
    const active = tenantRows.filter((t) => s(t.status).toLowerCase() === "active").length;
    const withDomain = tenantRows.filter((t) => !!s(t.root_domain)).length;
    return { total, active, withDomain };
  }, [tenantRows]);

  function hydrateBingFields(rows: TenantIntegration[]) {
    const bingRow = rows.find(
      (it) =>
        s(it.provider).toLowerCase() === "bing_webmaster" &&
        s(it.integration_key || DEFAULT_INTEGRATION_KEY).toLowerCase() === DEFAULT_INTEGRATION_KEY,
    );
    const cfg = bingRow?.config && typeof bingRow.config === "object" ? (bingRow.config as Record<string, unknown>) : {};
    const apiKey =
      s(cfg.apiKey) ||
      s(cfg.api_key) ||
      s((cfg.auth as Record<string, unknown> | undefined)?.apiKey) ||
      s((cfg.auth as Record<string, unknown> | undefined)?.api_key);
    const siteUrl = s(bingRow?.external_property_id) || s(cfg.siteUrl) || s(cfg.site_url);
    const rawSiteUrls = cfg.siteUrls ?? cfg.site_urls;
    const siteUrls = Array.isArray(rawSiteUrls)
      ? rawSiteUrls.map((x) => s(x)).filter(Boolean).join("\n")
      : s(rawSiteUrls);
    const endpoint = s(cfg.endpoint) || BING_DEFAULT_ENDPOINT;
    setManageBingApiKey(apiKey);
    setManageBingSiteUrl(siteUrl);
    setManageBingSiteUrls(siteUrls);
    setManageBingEndpoint(endpoint);
  }

  async function refreshManageTenantIntegrations(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    const res = await fetch(`/api/tenants/${id}`, { cache: "no-store" });
    const data = (await safeJson(res)) as TenantDetailResponse | null;
    if (!res.ok || !data?.ok || !data.tenant) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    const nextRows = Array.isArray(data.integrations) ? data.integrations : [];
    setManageIntegrations(nextRows);
    hydrateBingFields(nextRows);
  }

  function resetManageState() {
    setManageTab("overview");
    setManageOverviewTab("identity");
    setManageBusy(false);
    setManageLoading(false);
    setManageErr("");
    setManageOk("");
    setManageTenantId("");
    setManageTenantName("");
    setManageName("");
    setManageSlug("");
    setManageStatus("active");
    setManageOwnerLocationId("");
    setManageCompanyId("");
    setManageTwilioSid("");
    setManageTwilioAuthToken("");
    setManageMailgunApiKey("");
    setManageMailgunDomain("");
    setManageAdsAlertWebhookUrl("");
    setManageAdsAlertsEnabled(true);
    setManageAdsAlertSmsEnabled(false);
    setManageAdsAlertSmsTo("");
    setManageGoogleCloudProjectId("");
    setManageGoogleServiceAccountEmail("");
    setManageGoogleServiceAccountKeyfilePath("");
    setManageGoogleServiceAccountJson("");
    setManageGoogleSheetId("");
    setManageGscProperty("");
    setManageGa4PropertyId("");
    setManageSnapshotId("");
    setManageOwnerFirstName("");
    setManageOwnerLastName("");
    setManageOwnerEmail("");
    setManageOwnerPhone("");
    setManageRootDomain("");
    setManageTimezone("US/Eastern");
    setManageLocale("en-US");
    setManageCurrency("USD");
    setManageLogoUrl("");
    setManageDeleteText("");
    setManageIntegrations([]);
    setManageIntegrationsBusyId("");
    setManageBingApiKey("");
    setManageBingSiteUrl("");
    setManageBingSiteUrls("");
    setManageBingEndpoint(BING_DEFAULT_ENDPOINT);
    setManageBingBusy(false);
    setManageAdsSampleBusy(false);
    setManageAdsSampleResult("");
    setManageStaffRows([]);
    setManageStaffLoading(false);
    setManageStaffBusy(false);
    setManageAuditRows([]);
    setManageAuditLoading(false);
    setNewStaffFullName("");
    setNewStaffEmail("");
    setNewStaffRole("viewer");
    setNewStaffStatus("invited");
  }

  async function openManageTenant(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setShowManage(true);
    setManageLoading(true);
    setManageErr("");
    setManageOk("");
    setManageTab("overview");
    setManageOverviewTab("identity");
    setManageIntegrations([]);
    setManageStaffRows([]);
    setManageAuditRows([]);
    try {
      const res = await fetch(`/api/tenants/${id}`, { cache: "no-store" });
      const data = (await safeJson(res)) as TenantDetailResponse | null;
      if (!res.ok || !data?.ok || !data.tenant) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const tenant = data.tenant;
      const settings = data.settings || {};
      const ownerIntegration =
        (data.integrations || []).find(
          (it) => s(it.provider).toLowerCase() === "ghl" && s(it.integration_key).toLowerCase() === "owner",
        ) ||
        (data.integrations || []).find((it) => s(it.integration_key).toLowerCase() === "owner");
      const ownerConfig = ((ownerIntegration?.config as Record<string, unknown> | null) || {}) as Record<string, unknown>;
      const twilioCfg = (ownerConfig.twilio as Record<string, unknown> | undefined) || {};
      const mailgunCfg = (ownerConfig.mailgun as Record<string, unknown> | undefined) || {};
      const alertsCfg = (ownerConfig.alerts as Record<string, unknown> | undefined) || {};
      const googleCfg = (ownerConfig.google as Record<string, unknown> | undefined) || {};
      setManageTenantId(tenant.id);
      setManageTenantName(tenant.name);
      setManageName(tenant.name);
      setManageSlug(tenant.slug);
      setManageStatus(s(tenant.status).toLowerCase() || "active");
      setManageOwnerLocationId(s(ownerIntegration?.external_account_id));
      setManageCompanyId(s(settings.ghl_company_id) || s(ownerConfig.companyId));
      setManageTwilioSid(s(twilioCfg.sid));
      setManageTwilioAuthToken(s(twilioCfg.authToken));
      setManageMailgunApiKey(s(mailgunCfg.apiKey));
      setManageMailgunDomain(s(mailgunCfg.domain));
      setManageAdsAlertsEnabled(
        settings.ads_alerts_enabled !== false && alertsCfg.adsEnabled !== false,
      );
      setManageAdsAlertWebhookUrl(s(settings.ads_alert_webhook_url) || s(alertsCfg.adsWebhookUrl));
      setManageAdsAlertSmsEnabled(
        settings.ads_alert_sms_enabled === true || alertsCfg.adsSmsEnabled === true,
      );
      setManageAdsAlertSmsTo(s(settings.ads_alert_sms_to) || s(alertsCfg.adsSmsTo));
      setManageGoogleCloudProjectId(s(googleCfg.cloudProjectId));
      setManageGoogleServiceAccountEmail(s(googleCfg.serviceAccountEmail));
      setManageGoogleServiceAccountKeyfilePath(s(googleCfg.serviceAccountKeyfilePath));
      setManageGoogleServiceAccountJson(
        settings.google_service_account_json
          ? JSON.stringify(settings.google_service_account_json, null, 2)
          : "",
      );
      setManageGoogleSheetId(s(googleCfg.sheetId));
      setManageGscProperty(s(googleCfg.gscProperty));
      setManageGa4PropertyId(s(googleCfg.ga4PropertyId));
      setManageSnapshotId(s(settings.snapshot_id));
      setManageOwnerFirstName(s(settings.owner_first_name));
      setManageOwnerLastName(s(settings.owner_last_name));
      setManageOwnerEmail(s(settings.owner_email));
      setManageOwnerPhone(s(settings.owner_phone));
      setManageRootDomain(s(settings.root_domain));
      setManageTimezone(s(settings.timezone) || "US/Eastern");
      setManageLocale(s(settings.locale) || "en-US");
      setManageCurrency(s(settings.currency) || "USD");
      setManageLogoUrl(s(settings.logo_url));
      const nextRows = Array.isArray(data.integrations) ? data.integrations : [];
      setManageIntegrations(nextRows);
      hydrateBingFields(nextRows);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to load project");
    } finally {
      setManageLoading(false);
    }
  }

  async function loadManageStaff(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setManageStaffLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/staff`, { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; rows?: TenantStaffRow[]; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageStaffRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to load staff");
      setManageStaffRows([]);
    } finally {
      setManageStaffLoading(false);
    }
  }

  async function loadManageAudit(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setManageAuditLoading(true);
    try {
      const res = await fetch(`/api/tenants/${id}/audit?limit=80`, { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; rows?: TenantAuditRow[]; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageAuditRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to load audit logs");
      setManageAuditRows([]);
    } finally {
      setManageAuditLoading(false);
    }
  }

  async function saveIntegrationRow(row: TenantIntegration) {
    const id = s(row.id);
    if (!id || !s(manageTenantId)) return;
    setManageIntegrationsBusyId(id);
    setManageErr("");
    setManageOk("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}/integrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: s(row.status),
          authType: s(row.auth_type),
          externalAccountId: s(row.external_account_id),
          externalPropertyId: s(row.external_property_id),
          lastError: s(row.last_error),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageOk(`Integration ${s(row.provider)}:${s(row.integration_key)} updated.`);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to update integration");
    } finally {
      setManageIntegrationsBusyId("");
    }
  }

  async function saveBingIntegration() {
    if (!s(manageTenantId)) return;
    if (!s(manageBingApiKey)) {
      setManageErr("Bing API key is required.");
      return;
    }
    if (!s(manageBingSiteUrl) && !s(manageBingSiteUrls)) {
      setManageErr("Bing site URL or site URL list is required.");
      return;
    }

    setManageBingBusy(true);
    setManageErr("");
    setManageOk("");
    try {
      const siteUrlLines = s(manageBingSiteUrls)
        .split(/[\n,;]+/)
        .map((x) => s(x))
        .filter(Boolean);
      const payload = {
        provider: "bing_webmaster",
        integrationKey: DEFAULT_INTEGRATION_KEY,
        status: "connected",
        authType: "api_key",
        externalPropertyId: s(manageBingSiteUrl) || undefined,
        config: {
          apiKey: s(manageBingApiKey),
          siteUrl: s(manageBingSiteUrl) || undefined,
          siteUrls: siteUrlLines.length ? siteUrlLines.join("\n") : undefined,
          endpoint: s(manageBingEndpoint) || BING_DEFAULT_ENDPOINT,
        },
      };
      const res = await fetch(`/api/tenants/${manageTenantId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      await refreshManageTenantIntegrations(manageTenantId);
      setManageOk("Bing integration saved in DB for this tenant.");
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to save Bing integration");
    } finally {
      setManageBingBusy(false);
    }
  }

  async function sendAdsWebhookSample() {
    if (!s(manageTenantId)) return;
    setManageAdsSampleBusy(true);
    setManageErr("");
    setManageOk("");
    setManageAdsSampleResult("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}/integrations/ghl-alerts/sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: s(manageAdsAlertWebhookUrl) || undefined,
          smsEnabled: manageAdsAlertSmsEnabled,
        }),
      });
      const data = (await safeJson(res)) as
        | {
            ok?: boolean;
            sent?: boolean;
            error?: string;
            responseStatus?: number;
            responsePreview?: string;
            payload?: unknown;
          }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageOk(`Sample sent (${data.responseStatus || 200}).`);
      setManageAdsSampleResult(
        JSON.stringify(
          {
            responseStatus: data.responseStatus || 200,
            responsePreview: data.responsePreview || "",
            payload: data.payload || {},
          },
          null,
          2,
        ),
      );
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to send sample webhook");
    } finally {
      setManageAdsSampleBusy(false);
    }
  }

  async function createStaffMember() {
    if (!s(manageTenantId)) return;
    if (!s(newStaffFullName) || !s(newStaffEmail)) {
      setManageErr("Staff full name and email are required.");
      return;
    }
    setManageStaffBusy(true);
    setManageErr("");
    setManageOk("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(newStaffFullName),
          email: s(newStaffEmail),
          role: newStaffRole,
          status: newStaffStatus,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setNewStaffFullName("");
      setNewStaffEmail("");
      setNewStaffRole("viewer");
      setNewStaffStatus("invited");
      setManageOk("Staff member created.");
      await loadManageStaff(manageTenantId);
      await loadManageAudit(manageTenantId);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to create staff member");
    } finally {
      setManageStaffBusy(false);
    }
  }

  async function updateStaffMember(row: TenantStaffRow) {
    if (!s(manageTenantId) || !s(row.id)) return;
    setManageStaffBusy(true);
    setManageErr("");
    setManageOk("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}/staff/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(row.fullName),
          role: row.role,
          status: row.status,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageOk("Staff member updated.");
      await loadManageAudit(manageTenantId);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to update staff member");
    } finally {
      setManageStaffBusy(false);
    }
  }

  async function deleteStaffMember(staffId: string) {
    if (!s(manageTenantId) || !s(staffId)) return;
    setManageStaffBusy(true);
    setManageErr("");
    setManageOk("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}/staff/${staffId}`, {
        method: "DELETE",
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageOk("Staff member deleted.");
      await loadManageStaff(manageTenantId);
      await loadManageAudit(manageTenantId);
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to delete staff member");
    } finally {
      setManageStaffBusy(false);
    }
  }

  async function onSaveManageTenant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!s(manageTenantId)) return;
    setManageBusy(true);
    setManageErr("");
    setManageOk("");
    try {
      const res = await fetch(`/api/tenants/${manageTenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s(manageName) || undefined,
          slug: s(manageSlug) || undefined,
          status: s(manageStatus) || undefined,
          ownerLocationId: s(manageOwnerLocationId) || undefined,
          companyId: s(manageCompanyId) || undefined,
          twilioSid: s(manageTwilioSid) || undefined,
          twilioAuthToken: s(manageTwilioAuthToken) || undefined,
          mailgunApiKey: s(manageMailgunApiKey) || undefined,
          mailgunDomain: s(manageMailgunDomain) || undefined,
          adsAlertsEnabled: manageAdsAlertsEnabled,
          adsAlertWebhookUrl: s(manageAdsAlertWebhookUrl) || undefined,
          adsAlertSmsEnabled: manageAdsAlertSmsEnabled,
          googleCloudProjectId: s(manageGoogleCloudProjectId) || undefined,
          googleServiceAccountEmail: s(manageGoogleServiceAccountEmail) || undefined,
          googleServiceAccountKeyfilePath: s(manageGoogleServiceAccountKeyfilePath) || undefined,
          googleServiceAccountJson: s(manageGoogleServiceAccountJson) || undefined,
          googleSheetId: s(manageGoogleSheetId) || undefined,
          gscProperty: s(manageGscProperty) || undefined,
          ga4PropertyId: s(manageGa4PropertyId) || undefined,
          snapshotId: s(manageSnapshotId) || undefined,
          ownerFirstName: s(manageOwnerFirstName) || undefined,
          ownerLastName: s(manageOwnerLastName) || undefined,
          ownerEmail: s(manageOwnerEmail) || undefined,
          ownerPhone: s(manageOwnerPhone) || undefined,
          rootDomain: s(manageRootDomain) || undefined,
          timezone: s(manageTimezone) || undefined,
          locale: s(manageLocale) || undefined,
          currency: s(manageCurrency) || undefined,
          logoUrl: s(manageLogoUrl) || undefined,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setManageOk("Project updated successfully.");
      await loadTenants();
    } catch (error: unknown) {
      setManageErr(error instanceof Error ? error.message : "Failed to update project");
    } finally {
      setManageBusy(false);
    }
  }

  async function onCreateTenant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = s(newName);
    const slug = slugify(s(newSlug) || name);
    const ownerLocationId = s(newOwnerLocationId);

    if (!name) {
      setCreateErr("Name is required");
      return;
    }
    if (!slug) {
      setCreateErr("Slug is invalid");
      return;
    }
    if (!ownerLocationId) {
      setCreateErr("Owner Location ID is required");
      return;
    }

    setCreateBusy(true);
    setCreateErr("");
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          ownerLocationId,
          companyId: s(newCompanyId) || undefined,
          twilioSid: s(newTwilioSid) || undefined,
          twilioAuthToken: s(newTwilioAuthToken) || undefined,
          mailgunApiKey: s(newMailgunApiKey) || undefined,
          mailgunDomain: s(newMailgunDomain) || undefined,
          adsAlertsEnabled: newAdsAlertsEnabled,
          adsAlertWebhookUrl: s(newAdsAlertWebhookUrl) || undefined,
          adsAlertSmsEnabled: newAdsAlertSmsEnabled,
          googleCloudProjectId: s(newGoogleCloudProjectId) || undefined,
          googleServiceAccountEmail: s(newGoogleServiceAccountEmail) || undefined,
          googleServiceAccountKeyfilePath: s(newGoogleServiceAccountKeyfilePath) || undefined,
          googleServiceAccountJson: s(newGoogleServiceAccountJson) || undefined,
          googleSheetId: s(newGoogleSheetId) || undefined,
          gscProperty: s(newGscProperty) || undefined,
          ga4PropertyId: s(newGa4PropertyId) || undefined,
          snapshotId: s(newSnapshotId) || undefined,
          ownerFirstName: s(newOwnerFirstName) || undefined,
          ownerLastName: s(newOwnerLastName) || undefined,
          ownerEmail: s(newOwnerEmail) || undefined,
          ownerPhone: s(newOwnerPhone) || undefined,
          timezone: s(newTimezone) || "US/Eastern",
          locale: s(newLocale) || "en-US",
          currency: s(newCurrency) || "USD",
          rootDomain: s(newRootDomain) || undefined,
          logoUrl: s(newLogoUrl) || undefined,
          appDisplayName: name,
          brandName: name,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setNewName("");
      setNewSlug("");
      setNewOwnerLocationId("");
      setNewCompanyId("");
      setNewTwilioSid("");
      setNewTwilioAuthToken("");
      setNewMailgunApiKey("");
      setNewMailgunDomain("");
      setNewAdsAlertsEnabled(true);
      setNewAdsAlertWebhookUrl("");
      setNewAdsAlertSmsEnabled(false);
      setNewAdsAlertSmsTo("");
      setNewGoogleCloudProjectId("");
      setNewGoogleServiceAccountEmail("");
      setNewGoogleServiceAccountKeyfilePath("");
      setNewGoogleServiceAccountJson("");
      setNewGoogleSheetId("");
      setNewGscProperty("");
      setNewGa4PropertyId("");
      setNewSnapshotId("");
      setNewOwnerFirstName("");
      setNewOwnerLastName("");
      setNewOwnerEmail("");
      setNewOwnerPhone("");
      setNewRootDomain("");
      setNewTimezone("US/Eastern");
      setNewLocale("en-US");
      setNewCurrency("USD");
      setNewLogoUrl("");
      setShowCreate(false);
      setCreateStep(1);
      setCreateConnectionTab("owner");
      await loadTenants();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create tenant";
      setCreateErr(message);
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <main className="agencyShell">
      <header className="agencyGlobalTopbar">
        <div className="agencyGlobalBrand">
          <div className="agencyBrandLogo agencyBrandLogoDelta" />
          <div>
            <h1>Delta System</h1>
            <p>Agency Control Center</p>
          </div>
        </div>

        <nav className="agencyGlobalNav agencyGlobalNavRight">
          <div className="agencyAccountWrap" ref={accountMenuRef}>
            <button
              type="button"
              className="agencyAccountTrigger"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
            >
              <span className="agencyProfileAvatar">AC</span>
              <span className="agencyAccountIdentity">
                <strong>Axel Castro</strong>
                <small>Account</small>
              </span>
              <span className="agencyAccountCaret" aria-hidden>▾</span>
            </button>
            {accountMenuOpen ? (
              <div className="agencyAccountMenu">
                <button type="button" className="agencyAccountMenuItem">Profile</button>
                <button type="button" className="agencyAccountMenuItem">Security</button>
                <button type="button" className="agencyAccountMenuItem">Sign out</button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <div className="agencyRoot">
      <aside className="agencySidebar">
        <nav className="agencyNav">
          <button className={`agencyNavItem ${activeMenu === "projects" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("projects")}>Projects</button>
          <button className={`agencyNavItem ${activeMenu === "staff" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("staff")}>Staff</button>
          <button className={`agencyNavItem ${activeMenu === "integrations" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("integrations")}>Integrations</button>
          <button className={`agencyNavItem ${activeMenu === "settings" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("settings")}>App Settings</button>
          <button className={`agencyNavItem ${activeMenu === "billing" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("billing")}>Billing</button>
          <button className={`agencyNavItem ${activeMenu === "audit" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("audit")}>Audit Logs</button>
        </nav>
      </aside>

      <section className="agencyMain">
        <section className="agencyProjectsCard">
          <div className="agencyProjectsHeader">
            <div>
              <h2>Projects</h2>
              <p>Agency home only. Runners and state jobs live inside each project.</p>
            </div>
            <div className="agencyProjectsHeaderRight">
              <div className="agencyTopActions agencyTopActionsMinimal">
                <button type="button" className="btnGhost" onClick={() => setViewMode("grid")}>
                  Grid
                </button>
                <button type="button" className="btnGhost" onClick={() => setViewMode("list")}>
                  List
                </button>
                <button type="button" className="btnGhost" onClick={() => void loadTenants()}>
                  Refresh
                </button>
                <button
                  type="button"
                  className="btnGhost"
                  onClick={() => void syncTenantKpis(false)}
                  disabled={tenantKpiSyncBusy || tenantLoading}
                >
                  {tenantKpiSyncBusy ? "Syncing KPIs..." : "Sync KPIs"}
                </button>
                <button
                  type="button"
                  className="btnGhost agencyCreateProjectBtn"
                  onClick={() => {
                    setShowCreate(true);
                    setCreateStep(1);
                  }}
                >
                  <span aria-hidden>+</span> New Project
                </button>
              </div>
              <div className="agencyTopActions agencyTopActionsMinimal" style={{ marginTop: 8 }}>
                {(["7d", "28d", "3m", "6m", "1y", "custom"] as KpiRangePreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btnGhost"
                    onClick={() => setTenantKpiPreset(p)}
                    style={tenantKpiPreset === p ? { borderColor: "rgba(96,165,250,.7)" } : undefined}
                  >
                    {p === "custom" ? "Custom" : p}
                  </button>
                ))}
                <button
                  type="button"
                  className="btnGhost"
                  onClick={() => setTenantKpiCompare((v) => !v)}
                >
                  Compare: {tenantKpiCompare ? "On" : "Off"}
                </button>
                {tenantKpiPreset === "custom" ? (
                  <>
                    <input
                      className="input"
                      type="date"
                      value={tenantKpiStart}
                      onChange={(e) => setTenantKpiStart(e.target.value)}
                      style={{ width: 150 }}
                    />
                    <input
                      className="input"
                      type="date"
                      value={tenantKpiEnd}
                      onChange={(e) => setTenantKpiEnd(e.target.value)}
                      style={{ width: 150 }}
                    />
                  </>
                ) : null}
              </div>
              <div className="agencyProjectStats">
                <div className="agencyPill">Total: {tenantStats.total}</div>
                <div className="agencyPill">Active: {tenantStats.active}</div>
                <div className="agencyPill">With domain: {tenantStats.withDomain}</div>
                <div className="agencyPill">{filteredTenants.length} shown</div>
              </div>
            </div>
          </div>

          <div className="agencySearchRow">
            <input
              className="input"
              placeholder="Search by name, slug, domain..."
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
            />
          </div>

          {tenantErr ? <div className="errorText">{tenantErr}</div> : null}
          {tenantKpiSyncMsg ? <div className="okText">{tenantKpiSyncMsg}</div> : null}

          {tenantLoading ? <div className="mutedText">Loading projects...</div> : null}

          {!tenantLoading && !tenantErr && filteredTenants.length === 0 ? (
            <div className="mutedText">No projects found.</div>
          ) : null}

          {!tenantLoading && viewMode === "grid" ? (
            <div className="agencyTenantGrid">
              {filteredTenants.map((t, idx) => (
                <article
                  className="agencyTenantCardLink"
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/projects/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/projects/${t.id}`);
                    }
                  }}
                >
                  <article className="agencyTenantCard">
                    <div className="agencyTenantPosterGlow" />
                    <div className="agencyTenantTopRow">
                      <div className="agencyTenantIdx">{String(idx + 1).padStart(2, "0")}</div>
                      <div className="agencyTenantTopMeta">
                        <div
                          className={`agencyTenantBadge agencyTenantBadge--${
                            (() => {
                              const status = s(t.status).toLowerCase();
                              if (status === "active" || status === "connected" || status === "ready") return "success";
                              if (status === "pending" || status === "stale" || status === "warning") return "warning";
                              if (status === "inactive" || status === "failed" || status === "error") return "danger";
                              return "neutral";
                            })()
                          }`}
                        >
                          {s(t.status) || "active"}
                        </div>
                        <button
                          type="button"
                          className="agencyTenantManageBtn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void openManageTenant(t.id);
                          }}
                        >
                          Manage
                        </button>
                        <button
                          type="button"
                          className="agencyTenantManageBtn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/projects/${t.id}?detailsTab=integrations`);
                          }}
                        >
                          Integrations
                        </button>
                      </div>
                    </div>
                    <div className="agencyTenantWide">
                      <div className="agencyTenantIdentity">
                        <div className="agencyTenantBrandRow">
                          <div className="agencyTenantLogoWrap">
                            {s(t.logo_url) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s(t.logo_url)}
                                alt={`${t.name} logo`}
                                className="agencyTenantLogoImg"
                                loading="lazy"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                            <div className="agencyTenantLogoFallback">{tenantInitials(t.name)}</div>
                          </div>
                          <h3>{t.name}</h3>
                        </div>
                        <p>@{t.slug}</p>
                        <p>{s(t.root_domain) || "No root domain"}</p>
                      </div>

                      <div className="agencyTenantKpiGrid">
                        <div className="agencyTenantKpiItem">
                          <span>Active States</span>
                          <strong>{formatInt(toNumberOrNull(t.active_states))}</strong>
                        </div>
                        <div className="agencyTenantKpiItem">
                          <span>Subaccounts</span>
                          <strong>{formatInt(toNumberOrNull(t.total_subaccounts))}</strong>
                        </div>
                        <div className="agencyTenantKpiItem">
                          <span>Calls</span>
                          <strong>{formatInt(toNumberOrNull(t.total_calls))}</strong>
                          {tenantKpiCompare ? (
                            <small className={deltaClass(toNumberOrNull(t.delta_pct_calls))}>
                              {formatDeltaPct(toNumberOrNull(t.delta_pct_calls))}
                            </small>
                          ) : null}
                        </div>
                        <div className="agencyTenantKpiItem">
                          <span>Impressions</span>
                          <strong>{formatInt(toNumberOrNull(t.total_impressions))}</strong>
                          {tenantKpiCompare ? (
                            <small className={deltaClass(toNumberOrNull(t.delta_pct_impressions))}>
                              {formatDeltaPct(toNumberOrNull(t.delta_pct_impressions))}
                            </small>
                          ) : null}
                        </div>
                        <div className="agencyTenantKpiItem">
                          <span>Revenue</span>
                          <strong>{formatMoney(toNumberOrNull(t.total_revenue))}</strong>
                          {tenantKpiCompare ? (
                            <small className={deltaClass(toNumberOrNull(t.delta_pct_revenue))}>
                              {formatDeltaPct(toNumberOrNull(t.delta_pct_revenue))}
                            </small>
                          ) : null}
                        </div>
                        <div className="agencyTenantKpiItem">
                          <span>Leads</span>
                          <strong>{formatInt(toNumberOrNull(t.total_leads))}</strong>
                          {tenantKpiCompare ? (
                            <small className={deltaClass(toNumberOrNull(t.delta_pct_leads))}>
                              {formatDeltaPct(toNumberOrNull(t.delta_pct_leads))}
                            </small>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="agencyTenantCardOpenGlyph" aria-hidden>↗</div>
                  </article>
                </article>
              ))}
            </div>
          ) : null}

          {!tenantLoading && viewMode === "list" ? (
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Slug</th>
                    <th>Root Domain</th>
                    <th>Owner Location</th>
                    <th>Status</th>
                    <th>Open</th>
                    <th>Integrations</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>@{t.slug}</td>
                      <td>{s(t.root_domain) || "—"}</td>
                      <td>{s(t.owner_location_id) || "—"}</td>
                      <td>
                        <span className={s(t.status).toLowerCase() === "active" ? "statusPill success" : "statusPill"}>
                          {s(t.status) || "active"}
                        </span>
                      </td>
                      <td>
                        <Link className="btnGhost" href={`/projects/${t.id}`}>Open</Link>
                      </td>
                      <td>
                        <Link className="btnGhost" href={`/projects/${t.id}?detailsTab=integrations`}>Open</Link>
                      </td>
                      <td>
                        <button type="button" className="btnGhost" onClick={() => void openManageTenant(t.id)}>
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </section>
      </div>

      {showCreate ? (
        <div
          className="agencyModalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!createBusy) {
              setShowCreate(false);
              setCreateStep(1);
              setCreateConnectionTab("owner");
              setCreateErr("");
            }
          }}
        >
          <div className="agencyModalCard agencyModalCardEnhanced" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>New Project Setup</h3>
                <p>Configura identidad, locale y conexión principal del tenant.</p>
              </div>
              <button
                type="button"
                className="agencyModalBtn agencyModalBtnSecondary"
              onClick={() => { setShowCreate(false); setCreateStep(1); setCreateConnectionTab("owner"); setCreateErr(""); }}
                disabled={createBusy}
              >
                Close
              </button>
            </div>

            <div className="agencyWizardTop">
              <div className="agencyWizardProgressTrack">
                <div className="agencyWizardProgressFill" style={{ width: `${(createStep / 3) * 100}%` }} />
              </div>
              <div className="agencyWizardSteps">
                <button type="button" className={createStep === 1 ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setCreateStep(1)}>1. Basics</button>
                <button type="button" className={createStep === 2 ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setCreateStep(2)}>2. Locale</button>
                <button type="button" className={createStep === 3 ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setCreateStep(3)}>3. Connection</button>
              </div>
            </div>

            <form className="agencyCreateFormModal" onSubmit={onCreateTenant}>
              <div className="agencyWizardLayout">
                <div className="agencyWizardMain">
                  <div className="agencyWizardStepHeader">
                    <div className="agencyWizardStepMeta">Step {createStep} of 3</div>
                    <p className="agencyWizardHint">
                      {createStep === 1 ? "Project identity and domain setup." : createStep === 2 ? "Regional defaults for time, language and currency." : "Main GHL connection and owner profile."}
                    </p>
                  </div>
                  {createStep === 1 ? (
                    <div className="agencyWizardSectionCard">
                      <div className="agencyWizardSectionHead">
                        <h4>Identity</h4>
                        <p>Define the project name, URL structure and brand asset.</p>
                      </div>
                      <div className="agencyWizardGrid">
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Project name <span className="agencyFieldRequired">*</span></span>
                          <input className="input" placeholder="My Drip Nurse" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                          <span className="agencyFieldHint">Visible name across the app.</span>
                        </label>
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Slug</span>
                          <input className="input" placeholder="my-drip-nurse (optional)" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
                          <span className="agencyFieldHint">If empty, it is generated from project name.</span>
                        </label>
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Root domain</span>
                          <input className="input" placeholder="mydripnurse.com (optional)" value={newRootDomain} onChange={(e) => setNewRootDomain(e.target.value)} />
                          <span className="agencyFieldHint">Used as base domain for tenant assets.</span>
                        </label>
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Logo URL</span>
                          <input className="input" placeholder="https://... (optional)" value={newLogoUrl} onChange={(e) => setNewLogoUrl(e.target.value)} />
                          <span className="agencyFieldHint">Square image recommended (PNG/WebP).</span>
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {createStep === 2 ? (
                    <div className="agencyWizardSectionCard">
                      <div className="agencyWizardSectionHead">
                        <h4>Locale</h4>
                        <p>Default regional settings used in date, number and currency formatting.</p>
                      </div>
                      <div className="agencyWizardGrid">
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Timezone <span className="agencyFieldRequired">*</span></span>
                          <input className="input" placeholder="US/Eastern" value={newTimezone} onChange={(e) => setNewTimezone(e.target.value)} required />
                        </label>
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Locale <span className="agencyFieldRequired">*</span></span>
                          <input className="input" placeholder="en-US" value={newLocale} onChange={(e) => setNewLocale(e.target.value)} required />
                        </label>
                        <label className="agencyField">
                          <span className="agencyFieldLabel">Currency <span className="agencyFieldRequired">*</span></span>
                          <input className="input" placeholder="USD" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)} required />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {createStep === 3 ? (
                    <div className="agencyWizardSectionCard">
                      <div className="agencyWizardSectionHead">
                        <h4>Connection</h4>
                        <p>Link this tenant with the owner GHL account and owner profile metadata.</p>
                      </div>
                      <div className="agencySubTabs">
                        <button type="button" className={createConnectionTab === "owner" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setCreateConnectionTab("owner")}>Owner</button>
                        <button type="button" className={createConnectionTab === "messaging" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setCreateConnectionTab("messaging")}>Messaging</button>
                        <button type="button" className={createConnectionTab === "google" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setCreateConnectionTab("google")}>Google</button>
                      </div>
                      <div className="agencySubTabPanel">
                        {createConnectionTab === "owner" ? (
                          <div className="agencyWizardGrid agencyWizardGridTwo">
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Owner Location ID <span className="agencyFieldRequired">*</span></span>
                              <input className="input" placeholder="required" value={newOwnerLocationId} onChange={(e) => setNewOwnerLocationId(e.target.value)} required />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Company ID (GHL)</span>
                              <input className="input" placeholder="optional" value={newCompanyId} onChange={(e) => setNewCompanyId(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Snapshot ID</span>
                              <input className="input" placeholder="optional" value={newSnapshotId} onChange={(e) => setNewSnapshotId(e.target.value)} />
                              <span className="agencyFieldHint">Snapshot owner identifier used by current jobs.</span>
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Owner first name</span>
                              <input className="input" placeholder="Keishla" value={newOwnerFirstName} onChange={(e) => setNewOwnerFirstName(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Owner last name</span>
                              <input className="input" placeholder="Caraballo" value={newOwnerLastName} onChange={(e) => setNewOwnerLastName(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Owner email</span>
                              <input className="input" placeholder="owner@email.com" value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Owner phone</span>
                              <input className="input" placeholder="+19392749203" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} />
                            </label>
                          </div>
                        ) : null}

                        {createConnectionTab === "messaging" ? (
                          <div className="agencyWizardGrid agencyWizardGridTwo">
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Twilio SID</span>
                              <input className="input" placeholder="optional" value={newTwilioSid} onChange={(e) => setNewTwilioSid(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Twilio Auth Token</span>
                              <input className="input" placeholder="optional" value={newTwilioAuthToken} onChange={(e) => setNewTwilioAuthToken(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Mailgun API Key</span>
                              <input className="input" placeholder="optional" value={newMailgunApiKey} onChange={(e) => setNewMailgunApiKey(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Mailgun Domain</span>
                              <input className="input" placeholder="optional" value={newMailgunDomain} onChange={(e) => setNewMailgunDomain(e.target.value)} />
                            </label>
                            <label className="agencyField agencyFieldFull">
                              <span className="agencyFieldLabel">GHL Webhook Ads Notification</span>
                              <input
                                className="input"
                                placeholder="https://services.leadconnectorhq.com/hooks/..."
                                value={newAdsAlertWebhookUrl}
                                onChange={(e) => setNewAdsAlertWebhookUrl(e.target.value)}
                              />
                              <span className="agencyFieldHint">Webhook por tenant para alertas AI de Google Ads.</span>
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Ads Alerts Enabled</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42 }}>
                                <input
                                  type="checkbox"
                                  checked={newAdsAlertsEnabled}
                                  onChange={(e) => setNewAdsAlertsEnabled(e.target.checked)}
                                />
                                <span className="agencyFieldHint">Activa o desactiva alertas AI para este tenant.</span>
                              </div>
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Enable SMS signal to GHL</span>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42 }}>
                                <input
                                  type="checkbox"
                                  checked={newAdsAlertSmsEnabled}
                                  onChange={(e) => setNewAdsAlertSmsEnabled(e.target.checked)}
                                />
                                <span className="agencyFieldHint">Envía `action.sendSms=true`; GHL decide el destino.</span>
                              </div>
                            </label>
                          </div>
                        ) : null}

                        {createConnectionTab === "google" ? (
                          <div className="agencyWizardGrid agencyWizardGridTwo">
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Google Cloud Project ID</span>
                              <input className="input" placeholder="my-gcp-project-id" value={newGoogleCloudProjectId} onChange={(e) => setNewGoogleCloudProjectId(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Google Service Account Email</span>
                              <input className="input" placeholder="service-account@project.iam.gserviceaccount.com" value={newGoogleServiceAccountEmail} onChange={(e) => setNewGoogleServiceAccountEmail(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Google Keyfile Path</span>
                              <input className="input" placeholder="resources/config/google-cloud.json" value={newGoogleServiceAccountKeyfilePath} onChange={(e) => setNewGoogleServiceAccountKeyfilePath(e.target.value)} />
                              <span className="agencyFieldHint">Fallback local. Recomendado: usar JSON por tenant para aislar credenciales.</span>
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">Google Sheet ID</span>
                              <input className="input" placeholder="optional" value={newGoogleSheetId} onChange={(e) => setNewGoogleSheetId(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">GSC Property</span>
                              <input className="input" placeholder="sc-domain:mydomain.com" value={newGscProperty} onChange={(e) => setNewGscProperty(e.target.value)} />
                            </label>
                            <label className="agencyField">
                              <span className="agencyFieldLabel">GA4 Property ID</span>
                              <input className="input" placeholder="123456789" value={newGa4PropertyId} onChange={(e) => setNewGa4PropertyId(e.target.value)} />
                            </label>
                            <label className="agencyField agencyFieldFull">
                              <span className="agencyFieldLabel">Google Service Account JSON</span>
                              <textarea
                                className="input agencyTextarea"
                                placeholder='{"type":"service_account", ...}'
                                value={newGoogleServiceAccountJson}
                                onChange={(e) => setNewGoogleServiceAccountJson(e.target.value)}
                                rows={6}
                              />
                              <span className="agencyFieldHint">Optional. Stored per tenant in DB and used to avoid single shared keyfile dependency.</span>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="agencyModalActionBar">
                    <div className="agencyModalActionMeta">Fields marked with <span className="agencyFieldRequired">*</span> are required.</div>
                    <div className="agencyModalActionRight">
                      <button
                        type="button"
                        className="agencyModalBtn agencyModalBtnSecondary"
                        disabled={createBusy || createStep === 1}
                        onClick={() => setCreateStep((s) => Math.max(1, s - 1))}
                      >
                        ← Back
                      </button>

                      {createStep < 3 ? (
                        <button
                          type="button"
                          className="agencyModalBtn agencyModalBtnPrimary"
                          disabled={createBusy}
                          onClick={() => setCreateStep((s) => Math.min(3, s + 1))}
                        >
                          Next →
                        </button>
                      ) : (
                        <button className="agencyModalBtn agencyModalBtnPrimary" type="submit" disabled={createBusy}>
                          {createBusy ? "Creating project..." : "Create Project"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <aside className="agencyWizardPreview">
                  <div className="agencyWizardPreviewHead">
                    <span className="agencyWizardPreviewLabel">Live Preview</span>
                    <span className="agencyWizardPreviewStep">Step {createStep}</span>
                  </div>
                  <div className="agencyWizardPreviewBrand">
                    <div className="agencyWizardPreviewLogoWrap">
                      {s(newLogoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s(newLogoUrl)}
                          alt="Project logo preview"
                          className="agencyWizardPreviewLogo"
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="agencyWizardPreviewLogoFallback">{tenantInitials(s(newName) || "Project")}</div>
                    </div>
                    <div className="agencyWizardPreviewTitles">
                      <strong>{s(newName) || "Project Name"}</strong>
                      <span>@{slugify(s(newSlug) || s(newName)) || "project-slug"}</span>
                      <small>{s(newRootDomain) || "no-domain-configured.com"}</small>
                    </div>
                  </div>

                  <div className="agencyWizardPreviewGrid">
                    <div className="agencyWizardPreviewItem">
                      <span>Timezone</span>
                      <strong>{s(newTimezone) || "US/Eastern"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Locale</span>
                      <strong>{s(newLocale) || "en-US"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Currency</span>
                      <strong>{s(newCurrency) || "USD"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Owner Location</span>
                      <strong>{s(newOwnerLocationId) || "pending"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Company ID</span>
                      <strong>{s(newCompanyId) || "optional"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Google Project</span>
                      <strong>{s(newGoogleCloudProjectId) || "optional"}</strong>
                    </div>
                    <div className="agencyWizardPreviewItem">
                      <span>Owner Contact</span>
                      <strong>{[s(newOwnerFirstName), s(newOwnerLastName)].filter(Boolean).join(" ") || "optional"}</strong>
                    </div>
                  </div>
                </aside>
              </div>

              {createErr ? <div className="errorText agencyModalErrorInline">{createErr}</div> : null}
            </form>
          </div>
        </div>
      ) : null}

      {showManage ? (
        <div
          className="agencyModalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!manageBusy) {
              setShowManage(false);
              resetManageState();
            }
          }}
        >
          <div className="agencyModalCard agencyModalCardEnhanced agencyModalCardManage" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>Project Management</h3>
                <p>{manageTenantName || "Manage tenant settings, integrations and lifecycle actions."}</p>
              </div>
              <button
                type="button"
                className="agencyModalBtn agencyModalBtnSecondary"
                onClick={() => {
                  setShowManage(false);
                  resetManageState();
                }}
                disabled={manageBusy}
              >
                Close
              </button>
            </div>

            <div className="agencyWizardTop">
              <div className="agencyWizardSteps">
                <button type="button" className={manageTab === "overview" ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setManageTab("overview")}>Overview</button>
                <button type="button" className={manageTab === "integrations" ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setManageTab("integrations")}>Integrations</button>
                <button type="button" className={manageTab === "staff" ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setManageTab("staff")}>Staff</button>
                <button type="button" className={manageTab === "audit" ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setManageTab("audit")}>Audit</button>
                <button type="button" className={manageTab === "danger" ? "agencyWizardStep agencyWizardStepActive" : "agencyWizardStep"} onClick={() => setManageTab("danger")}>Danger Zone</button>
              </div>
            </div>

            {manageLoading ? <div className="mutedText">Loading project data...</div> : null}
            {manageErr ? <div className="errorText">{manageErr}</div> : null}
            {manageOk ? <div className="okText">{manageOk}</div> : null}

            {!manageLoading && manageTab === "overview" ? (
              <form className="agencyCreateFormModal agencyManageForm" onSubmit={onSaveManageTenant}>
                <div className="agencySubTabs">
                  <button type="button" className={manageOverviewTab === "identity" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setManageOverviewTab("identity")}>Identity</button>
                  <button type="button" className={manageOverviewTab === "owner" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setManageOverviewTab("owner")}>Owner</button>
                  <button type="button" className={manageOverviewTab === "messaging" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setManageOverviewTab("messaging")}>Messaging</button>
                  <button type="button" className={manageOverviewTab === "google" ? "agencySubTab agencySubTabActive" : "agencySubTab"} onClick={() => setManageOverviewTab("google")}>Google</button>
                </div>

                <div className="agencySubTabPanel">
                  {manageOverviewTab === "identity" ? (
                    <div className="agencyWizardGrid agencyWizardGridTwo">
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Project name</span>
                        <input className="input" value={manageName} onChange={(e) => setManageName(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Slug</span>
                        <input className="input" value={manageSlug} onChange={(e) => setManageSlug(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Root domain</span>
                        <input className="input" value={manageRootDomain} onChange={(e) => setManageRootDomain(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Logo URL</span>
                        <input className="input" value={manageLogoUrl} onChange={(e) => setManageLogoUrl(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Timezone</span>
                        <input className="input" value={manageTimezone} onChange={(e) => setManageTimezone(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Locale</span>
                        <input className="input" value={manageLocale} onChange={(e) => setManageLocale(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Currency</span>
                        <input className="input" value={manageCurrency} onChange={(e) => setManageCurrency(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Status</span>
                        <select className="input" value={manageStatus} onChange={(e) => setManageStatus(e.target.value)}>
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {manageOverviewTab === "owner" ? (
                    <div className="agencyWizardGrid agencyWizardGridTwo">
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Owner Location ID</span>
                        <input className="input" value={manageOwnerLocationId} onChange={(e) => setManageOwnerLocationId(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Company ID (GHL)</span>
                        <input className="input" value={manageCompanyId} onChange={(e) => setManageCompanyId(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Snapshot ID</span>
                        <input className="input" value={manageSnapshotId} onChange={(e) => setManageSnapshotId(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Owner first name</span>
                        <input className="input" value={manageOwnerFirstName} onChange={(e) => setManageOwnerFirstName(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Owner last name</span>
                        <input className="input" value={manageOwnerLastName} onChange={(e) => setManageOwnerLastName(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Owner email</span>
                        <input className="input" value={manageOwnerEmail} onChange={(e) => setManageOwnerEmail(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Owner phone</span>
                        <input className="input" value={manageOwnerPhone} onChange={(e) => setManageOwnerPhone(e.target.value)} />
                      </label>
                    </div>
                  ) : null}

                  {manageOverviewTab === "messaging" ? (
                    <div className="agencyWizardGrid agencyWizardGridTwo">
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Twilio SID</span>
                        <input className="input" value={manageTwilioSid} onChange={(e) => setManageTwilioSid(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Twilio Auth Token</span>
                        <input className="input" value={manageTwilioAuthToken} onChange={(e) => setManageTwilioAuthToken(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Mailgun API Key</span>
                        <input className="input" value={manageMailgunApiKey} onChange={(e) => setManageMailgunApiKey(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Mailgun Domain</span>
                        <input className="input" value={manageMailgunDomain} onChange={(e) => setManageMailgunDomain(e.target.value)} />
                      </label>
                      <label className="agencyField agencyFieldFull">
                        <span className="agencyFieldLabel">GHL Webhook Ads Notification</span>
                        <input
                          className="input"
                          value={manageAdsAlertWebhookUrl}
                          onChange={(e) => setManageAdsAlertWebhookUrl(e.target.value)}
                          placeholder="https://services.leadconnectorhq.com/hooks/..."
                        />
                        <span className="agencyFieldHint">Webhook por tenant para alertas AI de Google Ads.</span>
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Ads Alerts Enabled</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42 }}>
                          <input
                            type="checkbox"
                            checked={manageAdsAlertsEnabled}
                            onChange={(e) => setManageAdsAlertsEnabled(e.target.checked)}
                          />
                          <span className="agencyFieldHint">Activa o desactiva alertas AI para este tenant.</span>
                        </div>
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Enable SMS signal to GHL</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 42 }}>
                          <input
                            type="checkbox"
                            checked={manageAdsAlertSmsEnabled}
                            onChange={(e) => setManageAdsAlertSmsEnabled(e.target.checked)}
                          />
                          <span className="agencyFieldHint">Envía `action.sendSms=true`; GHL decide el destino.</span>
                        </div>
                      </label>
                      <div className="agencyField agencyFieldFull">
                        <span className="agencyFieldLabel">Webhook sample</span>
                        <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={manageAdsSampleBusy || !s(manageTenantId)}
                            onClick={() => void sendAdsWebhookSample()}
                          >
                            {manageAdsSampleBusy ? "Sending sample..." : "Send sample to GHL webhook"}
                          </button>
                          <span className="agencyFieldHint">
                            Envia un payload de prueba con el formato real de alertas Ads AI.
                          </span>
                        </div>
                        {manageAdsSampleResult ? (
                          <textarea
                            className="input agencyTextarea"
                            rows={10}
                            value={manageAdsSampleResult}
                            readOnly
                            style={{ marginTop: 10 }}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {manageOverviewTab === "google" ? (
                    <div className="agencyWizardGrid agencyWizardGridTwo">
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Google Cloud Project ID</span>
                        <input className="input" value={manageGoogleCloudProjectId} onChange={(e) => setManageGoogleCloudProjectId(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Google Service Account Email</span>
                        <input className="input" value={manageGoogleServiceAccountEmail} onChange={(e) => setManageGoogleServiceAccountEmail(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Google Keyfile Path</span>
                        <input className="input" value={manageGoogleServiceAccountKeyfilePath} onChange={(e) => setManageGoogleServiceAccountKeyfilePath(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">Google Sheet ID</span>
                        <input className="input" value={manageGoogleSheetId} onChange={(e) => setManageGoogleSheetId(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">GSC Property</span>
                        <input className="input" value={manageGscProperty} onChange={(e) => setManageGscProperty(e.target.value)} />
                      </label>
                      <label className="agencyField">
                        <span className="agencyFieldLabel">GA4 Property ID</span>
                        <input className="input" value={manageGa4PropertyId} onChange={(e) => setManageGa4PropertyId(e.target.value)} />
                      </label>
                      <label className="agencyField agencyFieldFull">
                        <span className="agencyFieldLabel">Google Service Account JSON</span>
                        <textarea
                          className="input agencyTextarea"
                          rows={6}
                          placeholder='{"type":"service_account", ...}'
                          value={manageGoogleServiceAccountJson}
                          onChange={(e) => setManageGoogleServiceAccountJson(e.target.value)}
                        />
                        <span className="agencyFieldHint">Se guarda por tenant en DB. Si está vacío, se usa el keyfile path configurado.</span>
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="agencyModalActionBar">
                  <div className="agencyModalActionMeta">Update project identity, locale and owner contact details.</div>
                  <div className="agencyModalActionRight">
                    <button className="agencyModalBtn agencyModalBtnPrimary" type="submit" disabled={manageBusy}>
                      {manageBusy ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}

            {!manageLoading && manageTab === "integrations" ? (
              <div className="agencyCreateFormModal">
                <div className="agencyDangerBox agencyStaffCreateBox">
                  <h4>Bing Webmaster (tenant)</h4>
                  <p className="agencyDangerHint">
                    Guarda la API key y los sitios en DB (`bing_webmaster:default`). El dashboard de Bing usa esta integración.
                  </p>
                  <div className="agencyWizardGrid agencyWizardGridTwo">
                    <label className="agencyField">
                      <span className="agencyFieldLabel">Bing API Key</span>
                      <input
                        className="input"
                        value={manageBingApiKey}
                        onChange={(e) => setManageBingApiKey(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                    </label>
                    <label className="agencyField">
                      <span className="agencyFieldLabel">Primary Site URL</span>
                      <input
                        className="input"
                        value={manageBingSiteUrl}
                        onChange={(e) => setManageBingSiteUrl(e.target.value)}
                        placeholder="https://mydripnurse.com"
                      />
                    </label>
                    <label className="agencyField agencyFieldFull">
                      <span className="agencyFieldLabel">Additional Site URLs (one per line)</span>
                      <textarea
                        className="input agencyTextarea"
                        rows={4}
                        value={manageBingSiteUrls}
                        onChange={(e) => setManageBingSiteUrls(e.target.value)}
                        placeholder={"https://mydripnurse.com\nhttps://www.mydripnurse.com"}
                      />
                    </label>
                    <label className="agencyField agencyFieldFull">
                      <span className="agencyFieldLabel">Endpoint</span>
                      <input
                        className="input"
                        value={manageBingEndpoint}
                        onChange={(e) => setManageBingEndpoint(e.target.value)}
                        placeholder={BING_DEFAULT_ENDPOINT}
                      />
                    </label>
                  </div>
                  <div className="agencyCreateActions agencyCreateActionsSpaced">
                    <button
                      type="button"
                      className="btnPrimary"
                      disabled={manageBingBusy || manageBusy}
                      onClick={() => void saveBingIntegration()}
                    >
                      {manageBingBusy ? "Saving..." : "Save Bing Integration"}
                    </button>
                    <button
                      type="button"
                      className="btnGhost"
                      disabled={manageBingBusy || manageBusy}
                      onClick={() => {
                        setManageBingEndpoint(BING_DEFAULT_ENDPOINT);
                      }}
                    >
                      Reset endpoint
                    </button>
                  </div>
                </div>

                <div className="agencyTenantTableWrap">
                  <table className="agencyTenantTable">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Key</th>
                        <th>Status</th>
                        <th>Auth</th>
                        <th>Account</th>
                        <th>Property</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manageIntegrations.length === 0 ? (
                        <tr>
                          <td colSpan={7}>No integrations found.</td>
                        </tr>
                      ) : (
                        manageIntegrations.map((it) => (
                          <tr key={it.id}>
                            <td>{s(it.provider)}</td>
                            <td>{s(it.integration_key)}</td>
                            <td>
                              <select
                                className="input"
                                value={s(it.status) || "connected"}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageIntegrations((prev) =>
                                    prev.map((row) => (row.id === it.id ? { ...row, status: value } : row)),
                                  );
                                }}
                              >
                                <option value="connected">connected</option>
                                <option value="disconnected">disconnected</option>
                                <option value="error">error</option>
                              </select>
                            </td>
                            <td>
                              <input
                                className="input"
                                value={s(it.auth_type)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageIntegrations((prev) =>
                                    prev.map((row) => (row.id === it.id ? { ...row, auth_type: value } : row)),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                value={s(it.external_account_id)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageIntegrations((prev) =>
                                    prev.map((row) => (row.id === it.id ? { ...row, external_account_id: value } : row)),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                value={s(it.external_property_id)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageIntegrations((prev) =>
                                    prev.map((row) => (row.id === it.id ? { ...row, external_property_id: value } : row)),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btnGhost"
                                disabled={manageIntegrationsBusyId === it.id || manageBusy}
                                onClick={() => void saveIntegrationRow(it)}
                              >
                                {manageIntegrationsBusyId === it.id ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {!manageLoading && manageTab === "staff" ? (
              <div className="agencyCreateFormModal">
                <div className="agencyDangerBox agencyStaffCreateBox">
                  <h4>Add staff member</h4>
                  <div className="agencyWizardGrid agencyWizardGridFour">
                    <input
                      className="input"
                      placeholder="Full name"
                      value={newStaffFullName}
                      onChange={(e) => setNewStaffFullName(e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Email"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                    />
                    <select className="input" value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as TenantStaffRow["role"])}>
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="analyst">analyst</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <select className="input" value={newStaffStatus} onChange={(e) => setNewStaffStatus(e.target.value as TenantStaffRow["status"])}>
                      <option value="invited">invited</option>
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </div>
                  <div className="agencyCreateActions agencyCreateActionsSpaced">
                    <button type="button" className="btnPrimary" disabled={manageStaffBusy} onClick={() => void createStaffMember()}>
                      {manageStaffBusy ? "Creating..." : "Add staff"}
                    </button>
                    <button type="button" className="btnGhost" disabled={manageStaffLoading} onClick={() => void loadManageStaff(manageTenantId)}>
                      Refresh staff
                    </button>
                  </div>
                </div>

                <div className="agencyTenantTableWrap">
                  <table className="agencyTenantTable">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Invited</th>
                        <th>Last Active</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manageStaffLoading ? (
                        <tr>
                          <td colSpan={7}>Loading staff...</td>
                        </tr>
                      ) : manageStaffRows.length === 0 ? (
                        <tr>
                          <td colSpan={7}>No staff members yet.</td>
                        </tr>
                      ) : (
                        manageStaffRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <input
                                className="input"
                                value={s(row.fullName)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageStaffRows((prev) =>
                                    prev.map((it) => (it.id === row.id ? { ...it, fullName: value } : it)),
                                  );
                                }}
                              />
                            </td>
                            <td>{s(row.email)}</td>
                            <td>
                              <select
                                className="input"
                                value={row.role}
                                onChange={(e) => {
                                  const value = e.target.value as TenantStaffRow["role"];
                                  setManageStaffRows((prev) =>
                                    prev.map((it) => (it.id === row.id ? { ...it, role: value } : it)),
                                  );
                                }}
                              >
                                <option value="owner">owner</option>
                                <option value="admin">admin</option>
                                <option value="analyst">analyst</option>
                                <option value="viewer">viewer</option>
                              </select>
                            </td>
                            <td>
                              <select
                                className="input"
                                value={row.status}
                                onChange={(e) => {
                                  const value = e.target.value as TenantStaffRow["status"];
                                  setManageStaffRows((prev) =>
                                    prev.map((it) => (it.id === row.id ? { ...it, status: value } : it)),
                                  );
                                }}
                              >
                                <option value="active">active</option>
                                <option value="invited">invited</option>
                                <option value="disabled">disabled</option>
                              </select>
                            </td>
                            <td>{s(row.invitedAt) ? new Date(s(row.invitedAt)).toLocaleString() : "—"}</td>
                            <td>{s(row.lastActiveAt) ? new Date(s(row.lastActiveAt)).toLocaleString() : "—"}</td>
                            <td className="agencyInlineActions">
                              <button type="button" className="btnGhost" disabled={manageStaffBusy} onClick={() => void updateStaffMember(row)}>
                                Save
                              </button>
                              <button type="button" className="btnGhost" disabled={manageStaffBusy} onClick={() => void deleteStaffMember(row.id)}>
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {!manageLoading && manageTab === "audit" ? (
              <div className="agencyCreateFormModal">
                <div className="agencyCreateActions agencyCreateActionsSpaced">
                  <button type="button" className="btnGhost" disabled={manageAuditLoading} onClick={() => void loadManageAudit(manageTenantId)}>
                    {manageAuditLoading ? "Refreshing..." : "Refresh audit"}
                  </button>
                </div>
                <div className="agencyTenantTableWrap">
                  <table className="agencyTenantTable">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Severity</th>
                        <th>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manageAuditLoading ? (
                        <tr>
                          <td colSpan={5}>Loading audit logs...</td>
                        </tr>
                      ) : manageAuditRows.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No audit rows yet.</td>
                        </tr>
                      ) : (
                        manageAuditRows.map((row) => (
                          <tr key={row.id}>
                            <td>{s(row.createdAt) ? new Date(s(row.createdAt)).toLocaleString() : "—"}</td>
                            <td>{s(row.action)}</td>
                            <td>{`${s(row.entityType) || "—"}${s(row.entityId) ? ` · ${s(row.entityId)}` : ""}`}</td>
                            <td>{s(row.severity) || "info"}</td>
                            <td>{s(row.actorLabel) || s(row.actorType) || "system"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {!manageLoading && manageTab === "danger" ? (
              <div className="agencyCreateFormModal">
                <div className="agencyDangerBox">
                  <h4>Project lifecycle</h4>
                  <p>Use these actions to control tenant availability. Archive sets status to disabled.</p>
                  <div className="agencyCreateActions">
                    <button
                      type="button"
                      className="btnGhost"
                      disabled={manageBusy || s(manageTenantId) === ""}
                      onClick={async () => {
                        setManageBusy(true);
                        setManageErr("");
                        setManageOk("");
                        try {
                          const res = await fetch(`/api/tenants/${manageTenantId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "active" }),
                          });
                          const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
                          if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                          setManageStatus("active");
                          setManageOk("Project activated.");
                          await loadTenants();
                        } catch (error: unknown) {
                          setManageErr(error instanceof Error ? error.message : "Failed to activate");
                        } finally {
                          setManageBusy(false);
                        }
                      }}
                    >
                      Activate
                    </button>
                    <button
                      type="button"
                      className="btnGhost"
                      disabled={manageBusy || s(manageTenantId) === ""}
                      onClick={async () => {
                        setManageBusy(true);
                        setManageErr("");
                        setManageOk("");
                        try {
                          const res = await fetch(`/api/tenants/${manageTenantId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "disabled" }),
                          });
                          const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
                          if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                          setManageStatus("disabled");
                          setManageOk("Project archived (disabled).");
                          await loadTenants();
                        } catch (error: unknown) {
                          setManageErr(error instanceof Error ? error.message : "Failed to archive");
                        } finally {
                          setManageBusy(false);
                        }
                      }}
                    >
                      Archive (disable)
                    </button>
                  </div>
                </div>
                <div className="agencyDangerBox agencyDangerBoxHardDelete">
                  <h4>Permanent delete</h4>
                  <p>
                    This action removes the tenant and related settings/integrations/state files. Type the project slug to confirm.
                  </p>
                  <input
                    className="input"
                    placeholder={`Type slug: ${manageSlug || "project-slug"}`}
                    value={manageDeleteText}
                    onChange={(e) => setManageDeleteText(e.target.value)}
                  />
                  <div className="agencyCreateActions">
                    <button
                      type="button"
                      className="btnGhost"
                      disabled={manageBusy || s(manageDeleteText) !== s(manageSlug)}
                      onClick={async () => {
                        if (s(manageDeleteText) !== s(manageSlug)) return;
                        setManageBusy(true);
                        setManageErr("");
                        setManageOk("");
                        try {
                          const res = await fetch(`/api/tenants/${manageTenantId}`, {
                            method: "DELETE",
                          });
                          const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
                          if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
                          setShowManage(false);
                          resetManageState();
                          await loadTenants();
                        } catch (error: unknown) {
                          setManageErr(error instanceof Error ? error.message : "Failed to delete project");
                        } finally {
                          setManageBusy(false);
                        }
                      }}
                    >
                      Delete project permanently
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
