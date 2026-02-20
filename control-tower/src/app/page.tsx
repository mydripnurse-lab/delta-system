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
  integrationKey?: string;
  status: string;
  auth_type?: string | null;
  authType?: string | null;
  external_account_id?: string | null;
  externalAccountId?: string | null;
  external_property_id?: string | null;
  externalPropertyId?: string | null;
  config?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  scopes?: string[] | null;
  last_sync_at?: string | null;
  lastSyncAt?: string | null;
  last_error?: string | null;
  lastError?: string | null;
  display_name?: string;
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
  phone: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  status: "active" | "invited" | "disabled";
  invitedAt?: string | null;
  joinedAt?: string | null;
  lastActiveAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type AgencyStaffRow = TenantStaffRow & {
  tenantId: string;
  tenantName: string;
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

type AuthMeUser = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  globalRoles?: string[];
};

type AgencyUserRow = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  status?: "active" | "invited" | "disabled";
  createdAt: string;
  lastLoginAt?: string | null;
  globalRoles: string[];
  tenantCount: number;
  draftGlobalRole?: "" | "platform_admin" | "agency_admin" | "analytics";
};

type ConfirmTone = "neutral" | "danger";

type ConfirmState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone: ConfirmTone;
  onConfirm: (() => Promise<void> | void) | null;
};

const DEFAULT_INTEGRATION_KEY = "default";
const BING_DEFAULT_ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json";
const STAFF_ROLE_OPTIONS: TenantStaffRow["role"][] = ["owner", "admin", "analyst", "viewer"];
const STAFF_STATUS_OPTIONS: TenantStaffRow["status"][] = ["active", "invited", "disabled"];
const AGENCY_USER_STATUS_OPTIONS: Array<"active" | "invited" | "disabled"> = ["active", "invited", "disabled"];
const GLOBAL_ROLE_OPTIONS: Array<AgencyUserRow["draftGlobalRole"]> = ["", "agency_admin", "analytics", "platform_admin"];
const TABLE_PAGE_SIZE = 12;
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

function staffStatusPillClass(statusRaw: unknown) {
  const status = s(statusRaw).toLowerCase();
  if (status === "active") return "statusPill success";
  if (status === "invited") return "statusPill warning";
  if (status === "disabled") return "statusPill";
  return "statusPill";
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
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<TenantStaffRow["role"]>("viewer");
  const [newStaffStatus, setNewStaffStatus] = useState<TenantStaffRow["status"]>("invited");
  const [agencyStaffRows, setAgencyStaffRows] = useState<AgencyStaffRow[]>([]);
  const [agencyStaffLoading, setAgencyStaffLoading] = useState(false);
  const [agencyStaffBusy, setAgencyStaffBusy] = useState(false);
  const [agencyStaffLoadedOnce, setAgencyStaffLoadedOnce] = useState(false);
  const [agencyStaffErr, setAgencyStaffErr] = useState("");
  const [agencyStaffOk, setAgencyStaffOk] = useState("");
  const [agencyStaffSearch, setAgencyStaffSearch] = useState("");
  const [staffScopeTab, setStaffScopeTab] = useState<"agency" | "projects">("agency");
  const [agencyStaffPage, setAgencyStaffPage] = useState(1);
  const [agencyNewStaffTenantId, setAgencyNewStaffTenantId] = useState("");
  const [agencyNewStaffFullName, setAgencyNewStaffFullName] = useState("");
  const [agencyNewStaffEmail, setAgencyNewStaffEmail] = useState("");
  const [agencyNewStaffPhone, setAgencyNewStaffPhone] = useState("");
  const [agencyNewStaffRole, setAgencyNewStaffRole] = useState<TenantStaffRow["role"]>("viewer");
  const [agencyNewStaffStatus, setAgencyNewStaffStatus] = useState<TenantStaffRow["status"]>("invited");
  const [integrationsTenantId, setIntegrationsTenantId] = useState("");
  const [integrationsRows, setIntegrationsRows] = useState<TenantIntegration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsBusyId, setIntegrationsBusyId] = useState("");
  const [integrationsErr, setIntegrationsErr] = useState("");
  const [integrationsOk, setIntegrationsOk] = useState("");
  const [settingsTenantId, setSettingsTenantId] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsErr, setSettingsErr] = useState("");
  const [settingsOk, setSettingsOk] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsSlug, setSettingsSlug] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("active");
  const [settingsTimezone, setSettingsTimezone] = useState("US/Eastern");
  const [settingsLocale, setSettingsLocale] = useState("en-US");
  const [settingsCurrency, setSettingsCurrency] = useState("USD");
  const [settingsRootDomain, setSettingsRootDomain] = useState("");
  const [settingsLogoUrl, setSettingsLogoUrl] = useState("");
  const [settingsOwnerEmail, setSettingsOwnerEmail] = useState("");
  const [settingsOwnerPhone, setSettingsOwnerPhone] = useState("");
  const [auditTenantId, setAuditTenantId] = useState("");
  const [auditRows, setAuditRows] = useState<TenantAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditErr, setAuditErr] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [authMe, setAuthMe] = useState<AuthMeUser | null>(null);
  const [agencyCanManageUsers, setAgencyCanManageUsers] = useState(false);
  const [agencyUsersRows, setAgencyUsersRows] = useState<AgencyUserRow[]>([]);
  const [agencyUsersLoading, setAgencyUsersLoading] = useState(false);
  const [agencyUsersLoadedOnce, setAgencyUsersLoadedOnce] = useState(false);
  const [agencyUsersBusy, setAgencyUsersBusy] = useState(false);
  const [agencyUsersErr, setAgencyUsersErr] = useState("");
  const [agencyUsersOk, setAgencyUsersOk] = useState("");
  const [agencyUsersSearch, setAgencyUsersSearch] = useState("");
  const [agencyUsersPage, setAgencyUsersPage] = useState(1);
  const [agencyNewUserEmail, setAgencyNewUserEmail] = useState("");
  const [agencyNewUserFullName, setAgencyNewUserFullName] = useState("");
  const [agencyNewUserPhone, setAgencyNewUserPhone] = useState("");
  const [agencyNewUserPassword, setAgencyNewUserPassword] = useState("");
  const [agencyNewUserRole, setAgencyNewUserRole] = useState<AgencyUserRow["draftGlobalRole"]>("");
  const [agencyNewUserStatus, setAgencyNewUserStatus] = useState<"active" | "invited" | "disabled">("invited");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [profileFullName, setProfileFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState("");
  const [profileOk, setProfileOk] = useState("");
  const [showAgencyUserEditModal, setShowAgencyUserEditModal] = useState(false);
  const [agencyUserEditRow, setAgencyUserEditRow] = useState<AgencyUserRow | null>(null);
  const [inviteWebhookUrl, setInviteWebhookUrl] = useState("");
  const [inviteActivationBaseUrl, setInviteActivationBaseUrl] = useState("");
  const [inviteWebhookBusy, setInviteWebhookBusy] = useState(false);
  const [inviteWebhookTestBusy, setInviteWebhookTestBusy] = useState(false);
  const [inviteWebhookErr, setInviteWebhookErr] = useState("");
  const [inviteWebhookOk, setInviteWebhookOk] = useState("");
  const [securityCurrentPassword, setSecurityCurrentPassword] = useState("");
  const [securityNewPassword, setSecurityNewPassword] = useState("");
  const [securityConfirmPassword, setSecurityConfirmPassword] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityErr, setSecurityErr] = useState("");
  const [securityOk, setSecurityOk] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirm",
    tone: "neutral",
    onConfirm: null,
  });
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

  function normalizeIntegrationRow(raw: TenantIntegration): TenantIntegration {
    const metadata =
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : {};
    const config =
      raw.config && typeof raw.config === "object" && !Array.isArray(raw.config)
        ? (raw.config as Record<string, unknown>)
        : {};
    const displayName =
      s(metadata.displayName) ||
      s(metadata.name) ||
      s(config.displayName) ||
      s(config.name) ||
      `${s(raw.provider)}:${s(raw.integration_key || raw.integrationKey)}`;
    return {
      ...raw,
      integration_key: s(raw.integration_key || raw.integrationKey),
      auth_type: s(raw.auth_type || raw.authType) || null,
      external_account_id: s(raw.external_account_id || raw.externalAccountId) || null,
      external_property_id: s(raw.external_property_id || raw.externalPropertyId) || null,
      last_sync_at: s(raw.last_sync_at || raw.lastSyncAt) || null,
      last_error: s(raw.last_error || raw.lastError) || null,
      metadata,
      config,
      display_name: displayName,
    };
  }

  function openConfirm(opts: {
    title: string;
    description: string;
    confirmLabel?: string;
    tone?: ConfirmTone;
    onConfirm: () => Promise<void> | void;
  }) {
    setConfirmState({
      open: true,
      title: opts.title,
      description: opts.description,
      confirmLabel: s(opts.confirmLabel) || "Confirm",
      tone: opts.tone || "neutral",
      onConfirm: opts.onConfirm,
    });
  }

  function closeConfirm() {
    if (confirmBusy) return;
    setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
  }

  async function runConfirmAction() {
    if (!confirmState.onConfirm) return;
    setConfirmBusy(true);
    try {
      await confirmState.onConfirm();
      setConfirmState((prev) => ({ ...prev, open: false, onConfirm: null }));
    } finally {
      setConfirmBusy(false);
    }
  }

  function currentRoleLabel() {
    const roles = Array.isArray(authMe?.globalRoles) ? authMe?.globalRoles : [];
    if (roles.length === 0) return "member";
    return s(roles[0]);
  }

  function accountDisplayName() {
    return s(authMe?.fullName) || s(authMe?.email) || "Account";
  }

  function accountInitials() {
    const label = accountDisplayName();
    return tenantInitials(label);
  }

  function openAgencyUserEdit(row: AgencyUserRow) {
    setAgencyUserEditRow({ ...row });
    setShowAgencyUserEditModal(true);
  }

  async function loadAuthMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; user?: AuthMeUser; error?: string } | null;
      if (!res.ok || !data?.ok || !data.user) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAuthMe(data.user);
      setProfileFullName(s(data.user.fullName));
      setProfileEmail(s(data.user.email));
      setProfilePhone(s(data.user.phone));
      setProfileAvatarUrl(s(data.user.avatarUrl));
    } catch {
      // keep UI functional even if auth profile endpoint fails transiently
    }
  }

  async function loadAgencyUsers() {
    setAgencyUsersLoading(true);
    setAgencyUsersErr("");
    setAgencyUsersOk("");
    try {
      const res = await fetch("/api/agency/users", { cache: "no-store" });
      const data = (await safeJson(res)) as
        | { ok?: boolean; rows?: AgencyUserRow[]; canManageAgency?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setAgencyCanManageUsers(Boolean(data.canManageAgency));
      setAgencyUsersRows(
        rows.map((row) => ({
          ...row,
          status: s((row as { status?: string }).status) === "invited"
            ? "invited"
            : s((row as { status?: string }).status) === "disabled"
              ? "disabled"
              : "active",
          globalRoles: Array.isArray(row.globalRoles) ? row.globalRoles : [],
          draftGlobalRole: (s(Array.isArray(row.globalRoles) ? row.globalRoles[0] : "") as AgencyUserRow["draftGlobalRole"]) || "",
        })),
      );
    } catch (error: unknown) {
      setAgencyUsersErr(error instanceof Error ? error.message : "Failed to load agency accounts");
      setAgencyUsersRows([]);
    } finally {
      setAgencyUsersLoadedOnce(true);
      setAgencyUsersLoading(false);
    }
  }

  async function createAgencyUserAccount() {
    if (!agencyCanManageUsers) return;
    if (!s(agencyNewUserEmail) || !s(agencyNewUserPhone)) {
      setAgencyUsersErr("Email and phone are required.");
      return;
    }
    setAgencyUsersBusy(true);
    setAgencyUsersErr("");
    setAgencyUsersOk("");
    try {
      const res = await fetch("/api/agency/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: s(agencyNewUserEmail),
          fullName: s(agencyNewUserFullName),
          phone: s(agencyNewUserPhone),
          password: s(agencyNewUserPassword) || undefined,
          status: agencyNewUserStatus,
          globalRoles: s(agencyNewUserRole) ? [agencyNewUserRole] : [],
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setAgencyNewUserEmail("");
      setAgencyNewUserFullName("");
      setAgencyNewUserPhone("");
      setAgencyNewUserPassword("");
      setAgencyNewUserRole("");
      setAgencyNewUserStatus("invited");
      const inviteDelivery = data && typeof data === "object" && "inviteDelivery" in data
        ? (data as { inviteDelivery?: { sent?: boolean; reason?: string } }).inviteDelivery
        : null;
      setAgencyUsersOk(
        inviteDelivery?.sent
          ? "Agency account created and invitation webhook sent."
          : `Agency account created.${inviteDelivery?.reason ? ` Invite: ${inviteDelivery.reason}` : ""}`,
      );
      await loadAgencyUsers();
    } catch (error: unknown) {
      setAgencyUsersErr(error instanceof Error ? error.message : "Failed to create agency account");
    } finally {
      setAgencyUsersBusy(false);
    }
  }

  async function updateAgencyUserAccount(row: AgencyUserRow) {
    if (!s(row.id)) return false;
    setAgencyUsersBusy(true);
    setAgencyUsersErr("");
    setAgencyUsersOk("");
    try {
      const role = s(row.draftGlobalRole);
      const res = await fetch(`/api/agency/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(row.fullName),
          email: s(row.email),
          phone: s(row.phone),
          avatarUrl: s(row.avatarUrl),
          status: row.status || (row.isActive ? "active" : "disabled"),
          globalRoles: role ? [role] : [],
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setAgencyUsersOk("Agency account updated.");
      await loadAgencyUsers();
      await loadAuthMe();
      return true;
    } catch (error: unknown) {
      setAgencyUsersErr(error instanceof Error ? error.message : "Failed to update agency account");
      return false;
    } finally {
      setAgencyUsersBusy(false);
    }
  }

  async function deleteAgencyUserAccount(userId: string) {
    if (!s(userId)) return;
    setAgencyUsersBusy(true);
    setAgencyUsersErr("");
    setAgencyUsersOk("");
    try {
      const res = await fetch(`/api/agency/users/${userId}`, { method: "DELETE" });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setAgencyUsersOk("Agency account deleted.");
      await loadAgencyUsers();
    } catch (error: unknown) {
      setAgencyUsersErr(error instanceof Error ? error.message : "Failed to delete agency account");
    } finally {
      setAgencyUsersBusy(false);
    }
  }

  async function saveProfile() {
    setProfileBusy(true);
    setProfileErr("");
    setProfileOk("");
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(profileFullName),
          email: s(profileEmail),
          phone: s(profilePhone),
          avatarUrl: s(profileAvatarUrl),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setProfileOk("Profile updated.");
      await loadAuthMe();
      if (activeMenu === "staff" && agencyUsersLoadedOnce) {
        await loadAgencyUsers();
      }
    } catch (error: unknown) {
      setProfileErr(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveSecurity() {
    if (s(securityNewPassword) !== s(securityConfirmPassword)) {
      setSecurityErr("New password and confirmation do not match.");
      return;
    }
    setSecurityBusy(true);
    setSecurityErr("");
    setSecurityOk("");
    try {
      const res = await fetch("/api/auth/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: s(securityCurrentPassword),
          newPassword: s(securityNewPassword),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSecurityCurrentPassword("");
      setSecurityNewPassword("");
      setSecurityConfirmPassword("");
      setSecurityOk("Password updated.");
    } catch (error: unknown) {
      setSecurityErr(error instanceof Error ? error.message : "Failed to update password");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
  }

  async function loadInviteWebhookSettings() {
    setInviteWebhookErr("");
    try {
      const res = await fetch("/api/agency/settings/staff-invite-webhooks", { cache: "no-store" });
      const data = (await safeJson(res)) as
        | {
            ok?: boolean;
            payload?: {
              webhookUrl?: string;
              activationBaseUrl?: string;
            };
            error?: string;
          }
        | null;
      if (!res.ok || !data?.ok || !data.payload) throw new Error(data?.error || `HTTP ${res.status}`);
      setInviteWebhookUrl(s(data.payload.webhookUrl));
      setInviteActivationBaseUrl(s(data.payload.activationBaseUrl));
    } catch (error: unknown) {
      setInviteWebhookErr(error instanceof Error ? error.message : "Failed to load invite webhooks.");
    }
  }

  async function saveInviteWebhookSettings() {
    setInviteWebhookBusy(true);
    setInviteWebhookErr("");
    setInviteWebhookOk("");
    try {
      const res = await fetch("/api/agency/settings/staff-invite-webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: s(inviteWebhookUrl),
          activationBaseUrl: s(inviteActivationBaseUrl),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setInviteWebhookOk("Invite webhook settings saved.");
    } catch (error: unknown) {
      setInviteWebhookErr(error instanceof Error ? error.message : "Failed to save invite webhooks.");
    } finally {
      setInviteWebhookBusy(false);
    }
  }

  async function sendInviteWebhookTest() {
    setInviteWebhookTestBusy(true);
    setInviteWebhookErr("");
    setInviteWebhookOk("");
    try {
      const res = await fetch("/api/agency/settings/staff-invite-webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: s(inviteWebhookUrl) }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setInviteWebhookOk("Test webhook sent successfully.");
    } catch (error: unknown) {
      setInviteWebhookErr(error instanceof Error ? error.message : "Failed to send test webhook.");
    } finally {
      setInviteWebhookTestBusy(false);
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
      await loadAuthMe();
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

  useEffect(() => {
    if (activeMenu !== "staff" || agencyStaffLoading || agencyStaffLoadedOnce) return;
    void loadAgencyStaff();
  }, [activeMenu, agencyStaffLoading, agencyStaffLoadedOnce]);

  useEffect(() => {
    if (activeMenu !== "staff" || agencyUsersLoading || agencyUsersLoadedOnce) return;
    void loadAgencyUsers();
  }, [activeMenu, agencyUsersLoading, agencyUsersLoadedOnce]);

  useEffect(() => {
    if (s(agencyNewStaffTenantId) || tenantRows.length === 0) return;
    setAgencyNewStaffTenantId(tenantRows[0].id);
  }, [agencyNewStaffTenantId, tenantRows]);

  useEffect(() => {
    if (s(integrationsTenantId) || tenantRows.length === 0) return;
    setIntegrationsTenantId(tenantRows[0].id);
  }, [integrationsTenantId, tenantRows]);

  useEffect(() => {
    if (s(settingsTenantId) || tenantRows.length === 0) return;
    setSettingsTenantId(tenantRows[0].id);
  }, [settingsTenantId, tenantRows]);

  useEffect(() => {
    if (s(auditTenantId) || tenantRows.length === 0) return;
    setAuditTenantId(tenantRows[0].id);
  }, [auditTenantId, tenantRows]);

  useEffect(() => {
    if (activeMenu === "integrations" && s(integrationsTenantId)) {
      void loadIntegrationsForTenant(integrationsTenantId);
    }
  }, [activeMenu, integrationsTenantId]);

  useEffect(() => {
    if (activeMenu === "settings" && s(settingsTenantId)) {
      void loadSettingsForTenant(settingsTenantId);
    }
  }, [activeMenu, settingsTenantId]);

  useEffect(() => {
    if (activeMenu !== "webhooks") return;
    void loadInviteWebhookSettings();
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu === "audit" && s(auditTenantId)) {
      void loadAuditForTenant(auditTenantId);
    }
  }, [activeMenu, auditTenantId]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [activeMenu]);

  useEffect(() => {
    setAgencyUsersPage(1);
  }, [agencyUsersSearch, agencyUsersRows.length]);

  useEffect(() => {
    setAgencyStaffPage(1);
  }, [agencyStaffSearch, agencyStaffRows.length]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch, auditRows.length, auditTenantId]);

  useEffect(() => {
    if (!showProfileModal) return;
    setProfileFullName(s(authMe?.fullName));
    setProfileEmail(s(authMe?.email));
    setProfilePhone(s(authMe?.phone));
    setProfileAvatarUrl(s(authMe?.avatarUrl));
    setProfileErr("");
    setProfileOk("");
  }, [showProfileModal, authMe]);

  useEffect(() => {
    if (!showSecurityModal) return;
    setSecurityCurrentPassword("");
    setSecurityNewPassword("");
    setSecurityConfirmPassword("");
    setSecurityErr("");
    setSecurityOk("");
  }, [showSecurityModal]);

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

  const filteredAgencyStaff = useMemo(() => {
    const q = s(agencyStaffSearch).toLowerCase();
    if (!q) return agencyStaffRows;
    return agencyStaffRows.filter((row) =>
      [row.fullName, row.email, row.phone, row.role, row.status, row.tenantName]
        .map(s)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [agencyStaffRows, agencyStaffSearch]);

  const filteredAgencyUsers = useMemo(() => {
    const q = s(agencyUsersSearch).toLowerCase();
    if (!q) return agencyUsersRows;
    return agencyUsersRows.filter((row) =>
      [row.fullName, row.email, row.phone, row.globalRoles.join(","), String(row.tenantCount)]
        .map(s)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [agencyUsersRows, agencyUsersSearch]);

  const agencyUsersTotalPages = Math.max(1, Math.ceil(filteredAgencyUsers.length / TABLE_PAGE_SIZE));
  const agencyUsersCurrentPage = Math.min(agencyUsersPage, agencyUsersTotalPages);
  const pagedAgencyUsers = useMemo(() => {
    const start = (agencyUsersCurrentPage - 1) * TABLE_PAGE_SIZE;
    return filteredAgencyUsers.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredAgencyUsers, agencyUsersCurrentPage]);

  const agencyStaffTotalPages = Math.max(1, Math.ceil(filteredAgencyStaff.length / TABLE_PAGE_SIZE));
  const agencyStaffCurrentPage = Math.min(agencyStaffPage, agencyStaffTotalPages);
  const pagedAgencyStaff = useMemo(() => {
    const start = (agencyStaffCurrentPage - 1) * TABLE_PAGE_SIZE;
    return filteredAgencyStaff.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredAgencyStaff, agencyStaffCurrentPage]);

  const filteredAuditRows = useMemo(() => {
    const q = s(auditSearch).toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter((row) =>
      [row.action, row.actorLabel, row.entityType, row.severity, row.entityId]
        .map(s)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [auditRows, auditSearch]);

  const auditTotalPages = Math.max(1, Math.ceil(filteredAuditRows.length / TABLE_PAGE_SIZE));
  const auditCurrentPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditRows = useMemo(() => {
    const start = (auditCurrentPage - 1) * TABLE_PAGE_SIZE;
    return filteredAuditRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredAuditRows, auditCurrentPage]);

  const billingSummary = useMemo(() => {
    const totalProjects = tenantRows.length;
    const activeProjects = tenantRows.filter((t) => s(t.status).toLowerCase() === "active").length;
    const totalRevenue = tenantRows.reduce((acc, row) => acc + (toNumberOrNull(row.total_revenue) || 0), 0);
    return { totalProjects, activeProjects, totalRevenue };
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
    setNewStaffPhone("");
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
    if (!s(newStaffFullName) || !s(newStaffEmail) || !s(newStaffPhone)) {
      setManageErr("Staff full name, email and phone are required.");
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
          phone: s(newStaffPhone),
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
      setNewStaffPhone("");
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
          email: s(row.email),
          phone: s(row.phone),
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

  async function loadAgencyStaff() {
    setAgencyStaffLoading(true);
    setAgencyStaffErr("");
    setAgencyStaffOk("");
    try {
      const sourceTenants = tenantRows.length > 0 ? tenantRows : await (async () => {
        const res = await fetch("/api/tenants", { cache: "no-store" });
        const data = (await safeJson(res)) as TenantListResponse | null;
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        return Array.isArray(data.rows) ? data.rows : [];
      })();
      if (tenantRows.length === 0) {
        setTenantRows(sourceTenants);
      }

      const results = await Promise.allSettled(
        sourceTenants.map(async (tenant) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);
          try {
            const res = await fetch(`/api/tenants/${tenant.id}/staff`, { cache: "no-store", signal: controller.signal });
            const data = (await safeJson(res)) as { ok?: boolean; rows?: TenantStaffRow[]; error?: string } | null;
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || `Failed to load staff for ${tenant.name}`);
            }
            const rows = Array.isArray(data.rows) ? data.rows : [];
            return rows.map((row) => ({
              ...row,
              tenantId: tenant.id,
              tenantName: tenant.name,
            }));
          } finally {
            clearTimeout(timeout);
          }
        }),
      );
      const fulfilled = results
        .filter((r): r is PromiseFulfilledResult<AgencyStaffRow[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      setAgencyStaffRows(fulfilled);
      if (rejected.length > 0) {
        setAgencyStaffErr(
          `${rejected.length} project(s) could not load staff. Showing ${fulfilled.length} records loaded.`,
        );
      }
    } catch (error: unknown) {
      setAgencyStaffErr(error instanceof Error ? error.message : "Failed to load staff");
      setAgencyStaffRows([]);
    } finally {
      setAgencyStaffLoadedOnce(true);
      setAgencyStaffLoading(false);
    }
  }

  async function createAgencyStaffMember() {
    if (!s(agencyNewStaffTenantId)) {
      setAgencyStaffErr("Select a project first.");
      return;
    }
    if (!s(agencyNewStaffFullName) || !s(agencyNewStaffEmail) || !s(agencyNewStaffPhone)) {
      setAgencyStaffErr("Staff full name, email and phone are required.");
      return;
    }
    setAgencyStaffBusy(true);
    setAgencyStaffErr("");
    setAgencyStaffOk("");
    try {
      const res = await fetch(`/api/tenants/${agencyNewStaffTenantId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(agencyNewStaffFullName),
          email: s(agencyNewStaffEmail),
          phone: s(agencyNewStaffPhone),
          role: agencyNewStaffRole,
          status: agencyNewStaffStatus,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAgencyNewStaffFullName("");
      setAgencyNewStaffEmail("");
      setAgencyNewStaffPhone("");
      setAgencyNewStaffRole("viewer");
      setAgencyNewStaffStatus("invited");
      setAgencyStaffOk("Staff member created.");
      await loadAgencyStaff();
    } catch (error: unknown) {
      setAgencyStaffErr(error instanceof Error ? error.message : "Failed to create staff member");
    } finally {
      setAgencyStaffBusy(false);
    }
  }

  async function updateAgencyStaffMember(row: AgencyStaffRow) {
    if (!s(row.tenantId) || !s(row.id)) return;
    setAgencyStaffBusy(true);
    setAgencyStaffErr("");
    setAgencyStaffOk("");
    try {
      const res = await fetch(`/api/tenants/${row.tenantId}/staff/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: s(row.fullName),
          email: s(row.email),
          phone: s(row.phone),
          role: row.role,
          status: row.status,
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAgencyStaffOk("Staff member updated.");
      await loadAgencyStaff();
    } catch (error: unknown) {
      setAgencyStaffErr(error instanceof Error ? error.message : "Failed to update staff member");
    } finally {
      setAgencyStaffBusy(false);
    }
  }

  async function deleteAgencyStaffMember(row: AgencyStaffRow) {
    if (!s(row.tenantId) || !s(row.id)) return;
    setAgencyStaffBusy(true);
    setAgencyStaffErr("");
    setAgencyStaffOk("");
    try {
      const res = await fetch(`/api/tenants/${row.tenantId}/staff/${row.id}`, { method: "DELETE" });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAgencyStaffOk("Staff member deleted.");
      await loadAgencyStaff();
    } catch (error: unknown) {
      setAgencyStaffErr(error instanceof Error ? error.message : "Failed to delete staff member");
    } finally {
      setAgencyStaffBusy(false);
    }
  }

  async function loadIntegrationsForTenant(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setIntegrationsLoading(true);
    setIntegrationsErr("");
    setIntegrationsOk("");
    try {
      const res = await fetch(`/api/tenants/${id}/integrations`, { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; rows?: TenantIntegration[]; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(data.rows) ? data.rows.map(normalizeIntegrationRow) : [];
      setIntegrationsRows(rows);
    } catch (error: unknown) {
      setIntegrationsErr(error instanceof Error ? error.message : "Failed to load integrations");
      setIntegrationsRows([]);
    } finally {
      setIntegrationsLoading(false);
    }
  }

  async function saveIntegrationRowForTenant(tenantId: string, row: TenantIntegration) {
    const id = s(tenantId);
    if (!id || !s(row.id)) return;
    setIntegrationsBusyId(s(row.id));
    setIntegrationsErr("");
    setIntegrationsOk("");
    try {
      const res = await fetch(`/api/tenants/${id}/integrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: s(row.id),
          integrationKey: s(row.integration_key),
          status: s(row.status),
          authType: s(row.auth_type),
          externalAccountId: s(row.external_account_id),
          externalPropertyId: s(row.external_property_id),
          lastError: s(row.last_error),
          metadata: {
            ...((row.metadata && typeof row.metadata === "object") ? row.metadata : {}),
            displayName: s(row.display_name),
          },
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setIntegrationsOk("Integration updated.");
    } catch (error: unknown) {
      setIntegrationsErr(error instanceof Error ? error.message : "Failed to update integration");
    } finally {
      setIntegrationsBusyId("");
    }
  }

  async function loadSettingsForTenant(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setSettingsLoading(true);
    setSettingsErr("");
    setSettingsOk("");
    try {
      const res = await fetch(`/api/tenants/${id}`, { cache: "no-store" });
      const data = (await safeJson(res)) as TenantDetailResponse | null;
      if (!res.ok || !data?.ok || !data.tenant) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const settings = data.settings || {};
      setSettingsName(s(data.tenant.name));
      setSettingsSlug(s(data.tenant.slug));
      setSettingsStatus(s(data.tenant.status).toLowerCase() || "active");
      setSettingsTimezone(s(settings.timezone) || "US/Eastern");
      setSettingsLocale(s(settings.locale) || "en-US");
      setSettingsCurrency(s(settings.currency) || "USD");
      setSettingsRootDomain(s(settings.root_domain));
      setSettingsLogoUrl(s(settings.logo_url));
      setSettingsOwnerEmail(s(settings.owner_email));
      setSettingsOwnerPhone(s(settings.owner_phone));
    } catch (error: unknown) {
      setSettingsErr(error instanceof Error ? error.message : "Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettingsForTenant() {
    const id = s(settingsTenantId);
    if (!id) return;
    setSettingsBusy(true);
    setSettingsErr("");
    setSettingsOk("");
    try {
      const res = await fetch(`/api/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s(settingsName),
          slug: s(settingsSlug),
          status: s(settingsStatus),
          timezone: s(settingsTimezone),
          locale: s(settingsLocale),
          currency: s(settingsCurrency),
          rootDomain: s(settingsRootDomain),
          logoUrl: s(settingsLogoUrl),
          ownerEmail: s(settingsOwnerEmail),
          ownerPhone: s(settingsOwnerPhone),
        }),
      });
      const data = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSettingsOk("Settings saved.");
      await loadTenants();
    } catch (error: unknown) {
      setSettingsErr(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function loadAuditForTenant(tenantId: string) {
    const id = s(tenantId);
    if (!id) return;
    setAuditLoading(true);
    setAuditErr("");
    try {
      const res = await fetch(`/api/tenants/${id}/audit?limit=120`, { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; rows?: TenantAuditRow[]; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setAuditRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: unknown) {
      setAuditErr(error instanceof Error ? error.message : "Failed to load audit logs");
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }

  function exportBillingCsv() {
    const headers = ["Project", "Status", "Revenue", "Calls", "Leads"];
    const lines = [
      headers.join(","),
      ...tenantRows.map((t) =>
        [
          `"${s(t.name).replace(/"/g, '""')}"`,
          s(t.status),
          String(toNumberOrNull(t.total_revenue) || 0),
          String(toNumberOrNull(t.total_calls) || 0),
          String(toNumberOrNull(t.total_leads) || 0),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              <span className="agencyProfileAvatar">
                {s(authMe?.avatarUrl) ? (
                  <img className="agencyProfileAvatarImg" src={s(authMe?.avatarUrl)} alt={accountDisplayName()} />
                ) : (
                  accountInitials()
                )}
              </span>
              <span className="agencyAccountIdentity">
                <strong>{accountDisplayName()}</strong>
                <small>{currentRoleLabel()}</small>
              </span>
              <span className="agencyAccountCaret" aria-hidden>▾</span>
            </button>
            {accountMenuOpen ? (
              <div className="agencyAccountMenu">
                <button type="button" className="agencyAccountMenuItem" onClick={() => { setShowProfileModal(true); setAccountMenuOpen(false); }}>
                  Profile
                </button>
                <button type="button" className="agencyAccountMenuItem" onClick={() => { setShowSecurityModal(true); setAccountMenuOpen(false); }}>
                  Security
                </button>
                <button type="button" className="agencyAccountMenuItem" onClick={() => void signOut()}>
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
          <button className={`agencyNavItem ${activeMenu === "projects" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("projects")}>Projects</button>
          <button className={`agencyNavItem ${activeMenu === "staff" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("staff")}>Staff</button>
          <button className={`agencyNavItem ${activeMenu === "integrations" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("integrations")}>Integrations</button>
          <button className={`agencyNavItem ${activeMenu === "settings" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("settings")}>App Settings</button>
          <button className={`agencyNavItem ${activeMenu === "webhooks" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("webhooks")}>Webhooks</button>
          <button className={`agencyNavItem ${activeMenu === "billing" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("billing")}>Billing</button>
          <button className={`agencyNavItem ${activeMenu === "audit" ? "agencyNavItemActive" : ""}`} type="button" onClick={() => setActiveMenu("audit")}>Audit Logs</button>
        </nav>
      </aside>

      <section className="agencyMain">
        {activeMenu === "projects" ? (
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
        ) : null}

        {activeMenu === "staff" ? (
          <section className="agencyProjectsCard">
            <div className="agencyProjectsHeader">
              <div>
                <h2>Staff</h2>
                <p>Tenant staff + Agency accounts (usuarios globales) en una sola vista.</p>
              </div>
              <div className="agencyProjectsHeaderRight">
                <div className="agencyTopActions agencyTopActionsMinimal">
                  <button type="button" className="btnGhost" disabled={agencyStaffLoading} onClick={() => void loadAgencyStaff()}>
                    {agencyStaffLoading ? "Loading..." : "Refresh staff"}
                  </button>
                </div>
                <div className="agencyProjectStats">
                  <div className="agencyPill">Total staff: {agencyStaffRows.length}</div>
                  <div className="agencyPill">Agency accounts: {agencyUsersRows.length}</div>
                  <div className="agencyPill">Shown staff: {filteredAgencyStaff.length}</div>
                </div>
              </div>
            </div>

            <div className="agencyScopeTabs">
              <button
                type="button"
                className={staffScopeTab === "agency" ? "agencyScopeTab agencyScopeTabActive" : "agencyScopeTab"}
                onClick={() => setStaffScopeTab("agency")}
              >
                Agency
              </button>
              <button
                type="button"
                className={staffScopeTab === "projects" ? "agencyScopeTab agencyScopeTabActive" : "agencyScopeTab"}
                onClick={() => setStaffScopeTab("projects")}
              >
                Projects
              </button>
            </div>

            {staffScopeTab === "agency" ? (
            <section className="agencyRoleOnboarding">
              <article className="agencyRoleCard">
                <h4>Agency Scope</h4>
                <p>Global users in <code>app.users</code>. Controls full platform visibility and account lifecycle.</p>
                <div className="agencyRoleChips">
                  <span className="agencyPill">platform_admin</span>
                  <span className="agencyPill">agency_admin</span>
                  <span className="agencyPill">analytics</span>
                </div>
              </article>
              <article className="agencyRoleCard">
                <h4>Tenant Scope</h4>
                <p>Project/company staff per tenant with business-level access and operational permissions.</p>
                <div className="agencyRoleChips">
                  <span className="agencyPill">owner</span>
                  <span className="agencyPill">admin</span>
                  <span className="agencyPill">analyst</span>
                  <span className="agencyPill">viewer</span>
                </div>
              </article>
              <article className="agencyRoleCard">
                <h4>Project Scope</h4>
                <p>Granular permissions inside project workspaces and dashboards.</p>
                <div className="agencyRoleChips">
                  <span className="agencyPill">tenant_admin</span>
                  <span className="agencyPill">project_manager</span>
                  <span className="agencyPill">member</span>
                </div>
              </article>
            </section>
            ) : null}

            {staffScopeTab === "agency" ? (
            <div className="agencyFormPanel agencyStaffCreateBox">
              <h4>Agency Accounts</h4>
              <p className="mini">Usuarios globales del agency. Aquí puedes editar tu cuenta y borrar cuentas creadas.</p>
              {agencyCanManageUsers ? (
                <div className="agencyWizardGrid agencyWizardGridFour">
                  <input
                    className="input"
                    placeholder="Full name"
                    value={agencyNewUserFullName}
                    onChange={(e) => setAgencyNewUserFullName(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Email"
                    value={agencyNewUserEmail}
                    onChange={(e) => setAgencyNewUserEmail(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Phone (required)"
                    value={agencyNewUserPhone}
                    onChange={(e) => setAgencyNewUserPhone(e.target.value)}
                  />
                  <input
                    className="input"
                    type="password"
                    placeholder="Temp password (optional)"
                    value={agencyNewUserPassword}
                    onChange={(e) => setAgencyNewUserPassword(e.target.value)}
                  />
                  <select className="input" value={agencyNewUserRole} onChange={(e) => setAgencyNewUserRole(e.target.value as AgencyUserRow["draftGlobalRole"])}>
                    {GLOBAL_ROLE_OPTIONS.map((role) => (
                      <option key={role || "none"} value={role || ""}>{role || "no global role"}</option>
                    ))}
                  </select>
                  <select className="input" value={agencyNewUserStatus} onChange={(e) => setAgencyNewUserStatus(e.target.value as "active" | "invited" | "disabled")}>
                    {AGENCY_USER_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="agencyCreateActions agencyCreateActionsSpaced">
                <button type="button" className="btnGhost agencyActionPrimary" disabled={agencyUsersBusy || !agencyCanManageUsers} onClick={() => void createAgencyUserAccount()}>
                  {agencyUsersBusy ? "Saving..." : "Add Agency Staff"}
                </button>
                <button type="button" className="btnGhost" disabled={agencyUsersLoading} onClick={() => void loadAgencyUsers()}>
                  {agencyUsersLoading ? "Loading..." : "Refresh accounts"}
                </button>
              </div>
            </div>
            ) : null}

            {staffScopeTab === "agency" ? (
            <div className="agencySearchRow">
              <input
                className="input"
                placeholder="Search agency accounts by name, email, phone, role..."
                value={agencyUsersSearch}
                onChange={(e) => setAgencyUsersSearch(e.target.value)}
              />
            </div>
            ) : null}
            {staffScopeTab === "agency" ? <>{agencyUsersErr ? <div className="errorText">{agencyUsersErr}</div> : null}</> : null}
            {staffScopeTab === "agency" ? <>{agencyUsersOk ? <div className="okText">{agencyUsersOk}</div> : null}</> : null}

            {staffScopeTab === "agency" ? (
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Global Role</th>
                    <th>Status</th>
                    <th>Tenants</th>
                    <th>Last Login</th>
                    <th className="agencyStickyCol">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyUsersLoading ? (
                    <tr>
                      <td colSpan={8}>Loading agency accounts...</td>
                    </tr>
                  ) : filteredAgencyUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No agency accounts found.</td>
                    </tr>
                  ) : (
                    pagedAgencyUsers.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="agencyUserIdentityCell">
                            <span className="agencyUserAvatar">
                              {s(row.avatarUrl) ? (
                                <img className="agencyUserAvatarImg" src={s(row.avatarUrl)} alt={s(row.fullName) || s(row.email)} />
                              ) : (
                                tenantInitials(s(row.fullName) || s(row.email))
                              )}
                            </span>
                            <span>{s(row.fullName) || "—"}</span>
                          </div>
                        </td>
                        <td>{s(row.email) || "—"}</td>
                        <td>{s(row.phone) || "—"}</td>
                        <td>{s(row.draftGlobalRole || row.globalRoles[0] || "no global role")}</td>
                        <td>
                          <div className="agencyStatusEditor">
                            <span className={staffStatusPillClass(row.status || (row.isActive ? "active" : "disabled"))}>
                              {row.status || (row.isActive ? "active" : "disabled")}
                            </span>
                          </div>
                        </td>
                        <td>{formatInt(row.tenantCount)}</td>
                        <td>{s(row.lastLoginAt) ? new Date(s(row.lastLoginAt)).toLocaleString() : "—"}</td>
                        <td className="agencyInlineActions agencyStickyCol">
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={agencyUsersBusy || !agencyCanManageUsers}
                            onClick={() => openAgencyUserEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={agencyUsersBusy || !agencyCanManageUsers || row.id === s(authMe?.id)}
                            onClick={() =>
                              openConfirm({
                                title: "Delete agency account?",
                                description: `This will permanently remove ${s(row.email)} and related memberships.`,
                                confirmLabel: "Delete",
                                tone: "danger",
                                onConfirm: () => deleteAgencyUserAccount(row.id),
                              })
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            ) : null}
            {staffScopeTab === "agency" ? (
            <div className="agencyTableFooter">
              <div className="mini">
                Showing {filteredAgencyUsers.length === 0 ? 0 : (agencyUsersCurrentPage - 1) * TABLE_PAGE_SIZE + 1}
                {"-"}
                {Math.min(agencyUsersCurrentPage * TABLE_PAGE_SIZE, filteredAgencyUsers.length)} of {filteredAgencyUsers.length}
              </div>
              <div className="agencyPager">
                <button type="button" className="btnGhost" disabled={agencyUsersCurrentPage <= 1} onClick={() => setAgencyUsersPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <span className="agencyPill">Page {agencyUsersCurrentPage} / {agencyUsersTotalPages}</span>
                <button type="button" className="btnGhost" disabled={agencyUsersCurrentPage >= agencyUsersTotalPages} onClick={() => setAgencyUsersPage((p) => Math.min(agencyUsersTotalPages, p + 1))}>
                  Next
                </button>
              </div>
            </div>
            ) : null}

            {staffScopeTab === "projects" ? (
            <div className="agencyFormPanel agencyStaffCreateBox">
              <h4>Add staff member</h4>
              <div className="agencyWizardGrid agencyWizardGridFour">
                <select className="input" value={agencyNewStaffTenantId} onChange={(e) => setAgencyNewStaffTenantId(e.target.value)}>
                  <option value="">Select project</option>
                  {tenantRows.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Full name"
                  value={agencyNewStaffFullName}
                  onChange={(e) => setAgencyNewStaffFullName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={agencyNewStaffEmail}
                  onChange={(e) => setAgencyNewStaffEmail(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Phone"
                  value={agencyNewStaffPhone}
                  onChange={(e) => setAgencyNewStaffPhone(e.target.value)}
                />
                <select className="input" value={agencyNewStaffRole} onChange={(e) => setAgencyNewStaffRole(e.target.value as TenantStaffRow["role"])}>
                  {STAFF_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <select className="input" value={agencyNewStaffStatus} onChange={(e) => setAgencyNewStaffStatus(e.target.value as TenantStaffRow["status"])}>
                  {STAFF_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="agencyCreateActions agencyCreateActionsSpaced">
                <button type="button" className="btnGhost agencyActionPrimary" disabled={agencyStaffBusy} onClick={() => void createAgencyStaffMember()}>
                  {agencyStaffBusy ? "Creating..." : "Add staff"}
                </button>
                <button type="button" className="btnGhost" disabled={agencyStaffLoading} onClick={() => void loadAgencyStaff()}>
                  {agencyStaffLoading ? "Loading..." : "Refresh project staff"}
                </button>
              </div>
            </div>
            ) : null}

            {staffScopeTab === "projects" ? (
            <div className="agencySearchRow">
              <input
                className="input"
                placeholder="Search by name, email, role, status, project..."
                value={agencyStaffSearch}
                onChange={(e) => setAgencyStaffSearch(e.target.value)}
              />
            </div>
            ) : null}

            {staffScopeTab === "projects" ? <>{agencyStaffErr ? <div className="errorText">{agencyStaffErr}</div> : null}</> : null}
            {staffScopeTab === "projects" ? <>{agencyStaffOk ? <div className="okText">{agencyStaffOk}</div> : null}</> : null}

            {staffScopeTab === "projects" ? (
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Invited</th>
                    <th>Last Active</th>
                    <th className="agencyStickyCol">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyStaffLoading ? (
                    <tr>
                      <td colSpan={9}>Loading staff...</td>
                    </tr>
                  ) : filteredAgencyStaff.length === 0 ? (
                    <tr>
                      <td colSpan={9}>No staff members yet.</td>
                    </tr>
                  ) : (
                    pagedAgencyStaff.map((row) => (
                      <tr key={`${row.tenantId}-${row.id}`}>
                        <td>{row.tenantName}</td>
                        <td>
                          <input
                            className="input"
                            value={s(row.fullName)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAgencyStaffRows((prev) =>
                                prev.map((it) =>
                                  it.tenantId === row.tenantId && it.id === row.id ? { ...it, fullName: value } : it,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            value={s(row.email)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAgencyStaffRows((prev) =>
                                prev.map((it) =>
                                  it.tenantId === row.tenantId && it.id === row.id ? { ...it, email: value } : it,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            value={s(row.phone)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAgencyStaffRows((prev) =>
                                prev.map((it) =>
                                  it.tenantId === row.tenantId && it.id === row.id ? { ...it, phone: value } : it,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className="input"
                            value={row.role}
                            onChange={(e) => {
                              const value = e.target.value as TenantStaffRow["role"];
                              setAgencyStaffRows((prev) =>
                                prev.map((it) =>
                                  it.tenantId === row.tenantId && it.id === row.id ? { ...it, role: value } : it,
                                ),
                              );
                            }}
                          >
                            {STAFF_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="agencyStatusEditor">
                            <span className={staffStatusPillClass(row.status)}>{row.status}</span>
                            <select
                              className="input"
                              value={row.status}
                              onChange={(e) => {
                                const value = e.target.value as TenantStaffRow["status"];
                                setAgencyStaffRows((prev) =>
                                  prev.map((it) =>
                                    it.tenantId === row.tenantId && it.id === row.id ? { ...it, status: value } : it,
                                  ),
                                );
                              }}
                            >
                              {STAFF_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td>{s(row.invitedAt) ? new Date(s(row.invitedAt)).toLocaleString() : "—"}</td>
                        <td>{s(row.lastActiveAt) ? new Date(s(row.lastActiveAt)).toLocaleString() : "—"}</td>
                        <td className="agencyInlineActions agencyStickyCol">
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={agencyStaffBusy}
                            onClick={() =>
                              openConfirm({
                                title: "Save staff changes?",
                                description: `Apply updates for ${s(row.email) || "this staff member"}.`,
                                confirmLabel: "Save",
                                onConfirm: () => updateAgencyStaffMember(row),
                              })
                            }
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={agencyStaffBusy}
                            onClick={() =>
                              openConfirm({
                                title: "Delete staff member?",
                                description: `Remove ${s(row.email)} from ${s(row.tenantName)}.`,
                                confirmLabel: "Delete",
                                tone: "danger",
                                onConfirm: () => deleteAgencyStaffMember(row),
                              })
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            ) : null}
            {staffScopeTab === "projects" ? (
            <div className="agencyTableFooter">
              <div className="mini">
                Showing {filteredAgencyStaff.length === 0 ? 0 : (agencyStaffCurrentPage - 1) * TABLE_PAGE_SIZE + 1}
                {"-"}
                {Math.min(agencyStaffCurrentPage * TABLE_PAGE_SIZE, filteredAgencyStaff.length)} of {filteredAgencyStaff.length}
              </div>
              <div className="agencyPager">
                <button type="button" className="btnGhost" disabled={agencyStaffCurrentPage <= 1} onClick={() => setAgencyStaffPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <span className="agencyPill">Page {agencyStaffCurrentPage} / {agencyStaffTotalPages}</span>
                <button type="button" className="btnGhost" disabled={agencyStaffCurrentPage >= agencyStaffTotalPages} onClick={() => setAgencyStaffPage((p) => Math.min(agencyStaffTotalPages, p + 1))}>
                  Next
                </button>
              </div>
            </div>
            ) : null}
          </section>
        ) : null}

        {activeMenu === "integrations" ? (
          <section className="agencyProjectsCard agencyMenuSection">
            <div className="agencyProjectsHeader">
              <div>
                <h2>Integrations</h2>
                <p>Gestiona conexiones con nombre identificable, estado y metadata técnica completa.</p>
              </div>
              <div className="agencyIntegrationsToolbar">
                <select className="input agencyTenantSelect" value={integrationsTenantId} onChange={(e) => setIntegrationsTenantId(e.target.value)}>
                  {tenantRows.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </select>
                <button type="button" className="btnGhost" disabled={integrationsLoading} onClick={() => void loadIntegrationsForTenant(integrationsTenantId)}>
                  {integrationsLoading ? "Loading..." : "Refresh"}
                </button>
                <span className="agencyPill">Rows: {integrationsRows.length}</span>
              </div>
            </div>
            {integrationsErr ? <div className="errorText">{integrationsErr}</div> : null}
            {integrationsOk ? <div className="okText">{integrationsOk}</div> : null}
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Auth</th>
                    <th>Account</th>
                    <th>Property</th>
                    <th>Last Sync</th>
                    <th>Last Error</th>
                    <th className="agencyStickyCol">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationsLoading ? (
                    <tr><td colSpan={10}>Loading integrations...</td></tr>
                  ) : integrationsRows.length === 0 ? (
                    <tr><td colSpan={10}>No integrations found.</td></tr>
                  ) : (
                    integrationsRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            className="input"
                            value={s(row.display_name)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setIntegrationsRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, display_name: value } : it)));
                            }}
                          />
                        </td>
                        <td>{s(row.provider)}</td>
                        <td>{s(row.integration_key)}</td>
                        <td>
                          <select
                            className="input"
                            value={s(row.status) || "connected"}
                            onChange={(e) => {
                              const value = e.target.value;
                              setIntegrationsRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, status: value } : it)));
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
                            value={s(row.auth_type)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setIntegrationsRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, auth_type: value } : it)));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            value={s(row.external_account_id)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setIntegrationsRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, external_account_id: value } : it)));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            value={s(row.external_property_id)}
                            onChange={(e) => {
                              const value = e.target.value;
                              setIntegrationsRows((prev) => prev.map((it) => (it.id === row.id ? { ...it, external_property_id: value } : it)));
                            }}
                          />
                        </td>
                        <td>{s(row.last_sync_at) ? new Date(s(row.last_sync_at)).toLocaleString() : "—"}</td>
                        <td title={s(row.last_error)}>{s(row.last_error) || "—"}</td>
                        <td className="agencyStickyCol">
                          <button
                            type="button"
                            className="btnGhost"
                            disabled={integrationsBusyId === row.id}
                            onClick={() =>
                              openConfirm({
                                title: "Save integration changes?",
                                description: `Apply updates for ${s(row.provider)}:${s(row.integration_key)}.`,
                                confirmLabel: "Save",
                                onConfirm: () => saveIntegrationRowForTenant(integrationsTenantId, row),
                              })
                            }
                          >
                            {integrationsBusyId === row.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeMenu === "settings" ? (
          <section className="agencyProjectsCard agencyMenuSection">
            <div className="agencyProjectsHeader">
              <div>
                <h2>App Settings</h2>
                <p>Configuración central del proyecto: identidad, locale y contacto.</p>
              </div>
              <div className="agencyTopActions agencyTopActionsMinimal">
                <select className="input agencyTenantSelect" value={settingsTenantId} onChange={(e) => setSettingsTenantId(e.target.value)}>
                  {tenantRows.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </select>
                <button type="button" className="btnGhost" disabled={settingsLoading} onClick={() => void loadSettingsForTenant(settingsTenantId)}>
                  {settingsLoading ? "Loading..." : "Reload"}
                </button>
              </div>
            </div>
            {settingsErr ? <div className="errorText">{settingsErr}</div> : null}
            {settingsOk ? <div className="okText">{settingsOk}</div> : null}
            <div className="agencySettingsGrid">
              <label className="agencyField">
                <span className="agencyFieldLabel">Project name</span>
                <input className="input" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Slug</span>
                <input className="input" value={settingsSlug} onChange={(e) => setSettingsSlug(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Status</span>
                <select className="input" value={settingsStatus} onChange={(e) => setSettingsStatus(e.target.value)}>
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Timezone</span>
                <input className="input" value={settingsTimezone} onChange={(e) => setSettingsTimezone(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Locale</span>
                <input className="input" value={settingsLocale} onChange={(e) => setSettingsLocale(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Currency</span>
                <input className="input" value={settingsCurrency} onChange={(e) => setSettingsCurrency(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Root domain</span>
                <input className="input" value={settingsRootDomain} onChange={(e) => setSettingsRootDomain(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Logo URL</span>
                <input className="input" value={settingsLogoUrl} onChange={(e) => setSettingsLogoUrl(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Owner email</span>
                <input className="input" value={settingsOwnerEmail} onChange={(e) => setSettingsOwnerEmail(e.target.value)} />
              </label>
              <label className="agencyField">
                <span className="agencyFieldLabel">Owner phone</span>
                <input className="input" value={settingsOwnerPhone} onChange={(e) => setSettingsOwnerPhone(e.target.value)} />
              </label>
            </div>
            <div className="agencyCreateActions agencyCreateActionsSpaced">
              <button
                type="button"
                className="btnPrimary"
                disabled={settingsBusy}
                onClick={() =>
                  openConfirm({
                    title: "Save app settings?",
                    description: "This updates identity and locale values for the selected project.",
                    confirmLabel: "Save",
                    onConfirm: () => saveSettingsForTenant(),
                  })
                }
              >
                {settingsBusy ? "Saving..." : "Save settings"}
              </button>
            </div>
          </section>
        ) : null}

        {activeMenu === "webhooks" ? (
          <section className="agencyProjectsCard agencyMenuSection">
            <div className="agencyProjectsHeader">
              <div>
                <h2>Webhooks</h2>
                <p>Automatizaciones agency-level para invitaciones de staff (SMS/Email via GHL).</p>
              </div>
            </div>
            <div className="agencyDangerBox agencyStaffCreateBox">
              <h4>Staff Invite Webhooks (GHL)</h4>
              <p className="mini">Configura el webhook de Staff Invite y envía un test para validar tu workflow.</p>
              <div className="agencySettingsGrid">
                <label className="agencyField">
                  <span className="agencyFieldLabel">Webhook URL</span>
                  <input className="input" value={inviteWebhookUrl} onChange={(e) => setInviteWebhookUrl(e.target.value)} placeholder="https://hooks..." />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Activation Base URL (optional)</span>
                  <input
                    className="input"
                    value={inviteActivationBaseUrl}
                    onChange={(e) => setInviteActivationBaseUrl(e.target.value)}
                    placeholder="Auto: APP_URL/activate"
                  />
                </label>
              </div>
              <p className="mini">Si dejas Activation Base URL vacío, el sistema usa automáticamente `APP_URL/activate`.</p>
              {inviteWebhookErr ? <div className="errorText">{inviteWebhookErr}</div> : null}
              {inviteWebhookOk ? <div className="okText">{inviteWebhookOk}</div> : null}
              <div className="agencyCreateActions agencyCreateActionsSpaced">
                <button type="button" className="btnPrimary" disabled={inviteWebhookBusy} onClick={() => void saveInviteWebhookSettings()}>
                  {inviteWebhookBusy ? "Saving..." : "Save webhook settings"}
                </button>
                <button type="button" className="btnGhost" disabled={inviteWebhookTestBusy} onClick={() => void sendInviteWebhookTest()}>
                  {inviteWebhookTestBusy ? "Sending..." : "Send test webhook"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeMenu === "billing" ? (
          <section className="agencyProjectsCard agencyMenuSection">
            <div className="agencyProjectsHeader">
              <div>
                <h2>Billing</h2>
                <p>Resumen financiero operativo del agency con export rápido.</p>
              </div>
              <div className="agencyTopActions agencyTopActionsMinimal">
                <button type="button" className="btnGhost" onClick={exportBillingCsv}>Export CSV</button>
              </div>
            </div>
            <div className="agencyTenantKpiGrid agencyBillingKpis">
              <div className="agencyTenantKpiItem">
                <span>Projects</span>
                <strong>{formatInt(billingSummary.totalProjects)}</strong>
              </div>
              <div className="agencyTenantKpiItem">
                <span>Active</span>
                <strong>{formatInt(billingSummary.activeProjects)}</strong>
              </div>
              <div className="agencyTenantKpiItem">
                <span>Total Revenue</span>
                <strong>{formatMoney(billingSummary.totalRevenue)}</strong>
              </div>
            </div>
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Revenue</th>
                    <th>Calls</th>
                    <th>Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{s(t.status) || "active"}</td>
                      <td>{formatMoney(toNumberOrNull(t.total_revenue))}</td>
                      <td>{formatInt(toNumberOrNull(t.total_calls))}</td>
                      <td>{formatInt(toNumberOrNull(t.total_leads))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeMenu === "audit" ? (
          <section className="agencyProjectsCard agencyMenuSection">
            <div className="agencyProjectsHeader">
              <div>
                <h2>Audit Logs</h2>
                <p>Historial de cambios y acciones por proyecto.</p>
              </div>
              <div className="agencyTopActions agencyTopActionsMinimal">
                <select className="input agencyTenantSelect" value={auditTenantId} onChange={(e) => setAuditTenantId(e.target.value)}>
                  {tenantRows.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </select>
                <button type="button" className="btnGhost" disabled={auditLoading} onClick={() => void loadAuditForTenant(auditTenantId)}>
                  {auditLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>
            <div className="agencySearchRow">
              <input
                className="input"
                placeholder="Search by action, actor, entity or severity..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />
            </div>
            {auditErr ? <div className="errorText">{auditErr}</div> : null}
            <div className="agencyTenantTableWrap">
              <table className="agencyTenantTable">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Severity</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr><td colSpan={5}>Loading logs...</td></tr>
                  ) : filteredAuditRows.length === 0 ? (
                    <tr><td colSpan={5}>No logs found.</td></tr>
                  ) : (
                    pagedAuditRows.map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.createdAt).toLocaleString()}</td>
                        <td><span className={`statusPill ${row.severity === "error" ? "error" : row.severity === "warning" ? "warning" : "success"}`}>{row.severity}</span></td>
                        <td>{row.action}</td>
                        <td>{s(row.actorLabel) || s(row.actorType) || "—"}</td>
                        <td>{[s(row.entityType), s(row.entityId)].filter(Boolean).join(":") || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="agencyTableFooter">
              <div className="mini">
                Showing {filteredAuditRows.length === 0 ? 0 : (auditCurrentPage - 1) * TABLE_PAGE_SIZE + 1}
                {"-"}
                {Math.min(auditCurrentPage * TABLE_PAGE_SIZE, filteredAuditRows.length)} of {filteredAuditRows.length}
              </div>
              <div className="agencyPager">
                <button type="button" className="btnGhost" disabled={auditCurrentPage <= 1} onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>
                  Prev
                </button>
                <span className="agencyPill">Page {auditCurrentPage} / {auditTotalPages}</span>
                <button type="button" className="btnGhost" disabled={auditCurrentPage >= auditTotalPages} onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}>
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </section>
      </div>

      {confirmState.open ? (
        <div className="agencyModalOverlay" role="dialog" aria-modal="true" onClick={closeConfirm}>
          <div className="agencyModalCard agencyConfirmModal" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>{confirmState.title}</h3>
                <p>{confirmState.description}</p>
              </div>
            </div>
            <div className="agencyModalActionBar agencyModalActionBarCompact">
              <button type="button" className="agencyModalBtn agencyModalBtnSecondary" disabled={confirmBusy} onClick={closeConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmState.tone === "danger" ? "agencyModalBtn agencyModalBtnDanger" : "agencyModalBtn agencyModalBtnPrimary"}
                disabled={confirmBusy}
                onClick={() => void runConfirmAction()}
              >
                {confirmBusy ? "Working..." : confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfileModal ? (
        <div className="agencyModalOverlay" role="dialog" aria-modal="true" onClick={() => { if (!profileBusy) setShowProfileModal(false); }}>
          <div className="agencyModalCard agencyModalCardProfile" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>Profile</h3>
                <p>Edit your account profile and login email.</p>
              </div>
            </div>
            <div className="agencyCreateFormModal">
              <div className="agencyWizardGrid">
                <label className="agencyField">
                  <span className="agencyFieldLabel">Full name</span>
                  <input className="input" value={profileFullName} onChange={(e) => setProfileFullName(e.target.value)} />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Email</span>
                  <input className="input" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Phone</span>
                  <input className="input" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
                </label>
                <label className="agencyField agencyFieldFull">
                  <span className="agencyFieldLabel">Profile image URL</span>
                  <input className="input" value={profileAvatarUrl} onChange={(e) => setProfileAvatarUrl(e.target.value)} placeholder="https://..." />
                </label>
                {s(profileAvatarUrl) ? (
                  <div className="agencyProfilePreview">
                    <img className="agencyProfilePreviewImg" src={s(profileAvatarUrl)} alt={s(profileFullName) || "Profile preview"} />
                    <span className="agencyFieldHint">Profile preview</span>
                  </div>
                ) : null}
              </div>
              {profileErr ? <div className="errorText">{profileErr}</div> : null}
              {profileOk ? <div className="okText">{profileOk}</div> : null}
              <div className="agencyModalActionBar">
                <div className="agencyModalActionMeta">Keep your profile details updated for invites and audit attribution.</div>
                <div className="agencyModalActionRight">
                  <button
                    type="button"
                    className="agencyModalBtn agencyModalBtnSecondary"
                    disabled={profileBusy}
                    onClick={() => setShowProfileModal(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="agencyModalBtn agencyModalBtnPrimary"
                    disabled={profileBusy}
                    onClick={() => void saveProfile()}
                  >
                    {profileBusy ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAgencyUserEditModal && agencyUserEditRow ? (
        <div className="agencyModalOverlay" role="dialog" aria-modal="true" onClick={() => { if (!agencyUsersBusy) setShowAgencyUserEditModal(false); }}>
          <div className="agencyModalCard agencyModalCardProfile" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>Edit Agency Staff</h3>
                <p>Update profile, role and status for this account.</p>
              </div>
            </div>
            <div className="agencyCreateFormModal">
              <div className="agencyWizardGrid">
                <label className="agencyField">
                  <span className="agencyFieldLabel">Full name</span>
                  <input
                    className="input"
                    value={s(agencyUserEditRow.fullName)}
                    onChange={(e) => setAgencyUserEditRow((prev) => (prev ? { ...prev, fullName: e.target.value } : prev))}
                  />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Email</span>
                  <input
                    className="input"
                    value={s(agencyUserEditRow.email)}
                    onChange={(e) => setAgencyUserEditRow((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
                  />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Phone</span>
                  <input
                    className="input"
                    value={s(agencyUserEditRow.phone)}
                    onChange={(e) => setAgencyUserEditRow((prev) => (prev ? { ...prev, phone: e.target.value } : prev))}
                  />
                </label>
                <label className="agencyField agencyFieldFull">
                  <span className="agencyFieldLabel">Profile image URL</span>
                  <input
                    className="input"
                    value={s(agencyUserEditRow.avatarUrl)}
                    onChange={(e) => setAgencyUserEditRow((prev) => (prev ? { ...prev, avatarUrl: e.target.value } : prev))}
                    placeholder="https://..."
                  />
                </label>
                {s(agencyUserEditRow.avatarUrl) ? (
                  <div className="agencyProfilePreview">
                    <img className="agencyProfilePreviewImg" src={s(agencyUserEditRow.avatarUrl)} alt={s(agencyUserEditRow.fullName) || "Avatar preview"} />
                    <span className="agencyFieldHint">Profile preview</span>
                  </div>
                ) : null}
                <label className="agencyField">
                  <span className="agencyFieldLabel">Global role</span>
                  <select
                    className="input"
                    value={agencyUserEditRow.draftGlobalRole || ""}
                    onChange={(e) =>
                      setAgencyUserEditRow((prev) =>
                        prev ? { ...prev, draftGlobalRole: e.target.value as AgencyUserRow["draftGlobalRole"] } : prev,
                      )
                    }
                  >
                    {GLOBAL_ROLE_OPTIONS.map((role) => (
                      <option key={role || "none"} value={role || ""}>{role || "no global role"}</option>
                    ))}
                  </select>
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Status</span>
                  <select
                    className="input"
                    value={agencyUserEditRow.status || (agencyUserEditRow.isActive ? "active" : "disabled")}
                    onChange={(e) =>
                      setAgencyUserEditRow((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: e.target.value as "active" | "invited" | "disabled",
                              isActive: e.target.value === "active",
                            }
                          : prev,
                      )
                    }
                  >
                    {AGENCY_USER_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>
              {agencyUsersErr ? <div className="errorText">{agencyUsersErr}</div> : null}
              {agencyUsersOk ? <div className="okText">{agencyUsersOk}</div> : null}
              <div className="agencyModalActionBar">
                <div className="agencyModalActionMeta">Changes apply to this agency account globally.</div>
                <div className="agencyModalActionRight">
                  <button
                    type="button"
                    className="agencyModalBtn agencyModalBtnSecondary"
                    disabled={agencyUsersBusy}
                    onClick={() => setShowAgencyUserEditModal(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="agencyModalBtn agencyModalBtnPrimary"
                    disabled={agencyUsersBusy}
                    onClick={async () => {
                      if (!agencyUserEditRow) return;
                      const ok = await updateAgencyUserAccount(agencyUserEditRow);
                      if (ok) setShowAgencyUserEditModal(false);
                    }}
                  >
                    {agencyUsersBusy ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showSecurityModal ? (
        <div className="agencyModalOverlay" role="dialog" aria-modal="true" onClick={() => { if (!securityBusy) setShowSecurityModal(false); }}>
          <div className="agencyModalCard agencyModalCardManage" onClick={(e) => e.stopPropagation()}>
            <div className="agencyModalHeader">
              <div>
                <h3>Security</h3>
                <p>Change your password.</p>
              </div>
              <button type="button" className="agencyModalBtn agencyModalBtnSecondary" disabled={securityBusy} onClick={() => setShowSecurityModal(false)}>
                Close
              </button>
            </div>
            <div className="agencyCreateFormModal">
              <div className="agencyWizardGrid">
                <label className="agencyField">
                  <span className="agencyFieldLabel">Current password</span>
                  <input className="input" type="password" value={securityCurrentPassword} onChange={(e) => setSecurityCurrentPassword(e.target.value)} />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">New password</span>
                  <input className="input" type="password" value={securityNewPassword} onChange={(e) => setSecurityNewPassword(e.target.value)} />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Confirm new password</span>
                  <input className="input" type="password" value={securityConfirmPassword} onChange={(e) => setSecurityConfirmPassword(e.target.value)} />
                </label>
              </div>
              {securityErr ? <div className="errorText">{securityErr}</div> : null}
              {securityOk ? <div className="okText">{securityOk}</div> : null}
              <div className="agencyCreateActions agencyCreateActionsSpaced">
                <button
                  type="button"
                  className="btnPrimary"
                  disabled={securityBusy}
                  onClick={() =>
                    openConfirm({
                      title: "Update password?",
                      description: "You will need to use the new password on the next login.",
                      confirmLabel: "Update",
                      onConfirm: () => saveSecurity(),
                    })
                  }
                >
                  {securityBusy ? "Saving..." : "Save password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                <div className="agencyFormPanel agencyStaffCreateBox">
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
                    <input
                      className="input"
                      placeholder="Phone"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                    />
                    <select className="input" value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value as TenantStaffRow["role"])}>
                      {STAFF_ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <select className="input" value={newStaffStatus} onChange={(e) => setNewStaffStatus(e.target.value as TenantStaffRow["status"])}>
                      {STAFF_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="agencyCreateActions agencyCreateActionsSpaced">
                    <button type="button" className="btnGhost agencyActionPrimary" disabled={manageStaffBusy} onClick={() => void createStaffMember()}>
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
                        <th>Phone</th>
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
                          <td colSpan={8}>Loading staff...</td>
                        </tr>
                      ) : manageStaffRows.length === 0 ? (
                        <tr>
                          <td colSpan={8}>No staff members yet.</td>
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
                            <td>
                              <input
                                className="input"
                                value={s(row.email)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageStaffRows((prev) =>
                                    prev.map((it) => (it.id === row.id ? { ...it, email: value } : it)),
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="input"
                                value={s(row.phone)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManageStaffRows((prev) =>
                                    prev.map((it) => (it.id === row.id ? { ...it, phone: value } : it)),
                                  );
                                }}
                              />
                            </td>
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
                                {STAFF_ROLE_OPTIONS.map((role) => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <div className="agencyStatusEditor">
                                <span className={staffStatusPillClass(row.status)}>{row.status}</span>
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
                                  {STAFF_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
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
