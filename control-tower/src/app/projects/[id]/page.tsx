// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UsaChoroplethProgressMap from "@/components/UsaChoroplethProgressMap";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

const JOBS = [
  { key: "build-sheet-rows", label: "Create DB" },
  { key: "build-counties", label: "Create Subaccount Json" },
  { key: "run-delta-system", label: "Run Delta System" },
  { key: "build-state-sitemaps", label: "Create Sitemaps" },
  { key: "build-state-index", label: "Create Search Index" },
  { key: "update-custom-values", label: "Update Custom Values (From Sheet)" },
  { key: "update-custom-values-one", label: "Update Custom Values (One)" },
];
const OAUTH_INTEGRATION_KEY = "default";
const DOMAIN_BOT_BASE_URL = "https://app.devasks.com/v2/location";

type SheetStateRow = {
  state: string;
  counties: {
    total: number;
    statusTrue: number;
    hasLocId: number;
    ready: number;
    domainsActive?: number;
  };
  cities: {
    total: number;
    statusTrue: number;
    hasLocId: number;
    ready: number;
    domainsActive?: number;
  };
};

type OverviewResponse = {
  tabs?: { counties?: string; cities?: string };
  states: SheetStateRow[];
  error?: string;
};

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type TenantIntegrationRow = {
  id: string;
  provider: string;
  integration_key?: string;
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
  last_error?: string | null;
  lastError?: string | null;
};

type TenantCustomValueRow = {
  id?: string;
  keyName: string;
  keyValue: string;
  isActive: boolean;
  description?: string | null;
};

type IntegrationHealthRow = {
  id: string;
  provider: string;
  integrationKey: string;
  status: string;
  authType: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  tokenExpiresInSec: number | null;
  needsRefresh: boolean;
  reconnectRecommended: boolean;
  lastError: string | null;
  updatedAt: string;
};

type TenantDetailResponse = {
  ok: boolean;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  settings?: {
    timezone?: string | null;
    locale?: string | null;
    currency?: string | null;
    root_domain?: string | null;
    snapshot_location_id?: string | null;
    cloudflare_cname_target?: string | null;
    has_cloudflare_api_token?: boolean | null;
    ghl_company_id?: string | null;
    owner_first_name?: string | null;
    owner_last_name?: string | null;
    owner_email?: string | null;
    owner_phone?: string | null;
    logo_url?: string | null;
    ads_alerts_enabled?: boolean | null;
    ads_alert_webhook_url?: string | null;
    ads_alert_sms_enabled?: boolean | null;
    ads_alert_sms_to?: string | null;
  } | null;
  integrations?: TenantIntegrationRow[] | null;
  error?: string;
};

type ProjectTab = "runner" | "sheet" | "activation" | "logs" | "details" | "webhooks";
type ProjectDetailsTab = "business" | "ghl" | "integrations" | "custom_values";

type StateDetailResponse = {
  state: string;
  tabs: { counties: string; cities: string };
  counties: {
    rows: any[];
    stats: {
      total: number;
      statusTrue: number;
      hasLocId: number;
      eligible: number;
    };
    counties: string[];
  };
  cities: {
    rows: any[];
    stats: {
      total: number;
      statusTrue: number;
      hasLocId: number;
      eligible: number;
    };
    counties: string[];
  };
  error?: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}
function isTrue(v: any) {
  const t = s(v).toLowerCase();
  return t === "true" || t === "1" || t === "yes" || t === "y";
}
function toUrlMaybe(domainOrUrl: string) {
  const d = s(domainOrUrl);
  if (!d) return "";
  if (d.startsWith("http://") || d.startsWith("https://")) return d;
  return `https://${d}`;
}

function formatStateLabel(raw: string) {
  const cleaned = s(raw).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function fmtInt(value: number) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

function fmtPair(a: number, b: number) {
  return `${fmtInt(a)}/${fmtInt(b)}`;
}

function fmtRelativeSeconds(sec: number | null) {
  if (!Number.isFinite(Number(sec))) return "—";
  const s0 = Number(sec || 0);
  const sign = s0 < 0 ? "-" : "";
  const abs = Math.abs(Math.round(s0));
  if (abs < 60) return `${sign}${abs}s`;
  const min = Math.floor(abs / 60);
  const remSec = abs % 60;
  if (min < 60) return `${sign}${min}m ${remSec}s`;
  const hh = Math.floor(min / 60);
  const remMin = min % 60;
  return `${sign}${hh}h ${remMin}m`;
}

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: `Non-JSON response (${res.status})`,
      raw: text.slice(0, 400),
    };
  }
}

function tsLocal() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function buildRobotsTxt(sitemapUrl: string) {
  const sm = s(sitemapUrl);
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# Allow all AI crawlers",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "",
    "User-agent: Applebot",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "",
    "User-agent: Bytespider",
    "Allow: /",
    "",
    "User-agent: Amazonbot",
    "Allow: /",
    "",
    "User-agent: FacebookBot",
    "Allow: /",
    "",
    "User-agent: Twitterbot",
    "Allow: /",
    "",
    sm ? `Sitemap: ${sm}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type ChecklistTabKey = "domain" | "sitemap" | "robots" | "headers";
type HeadersSubTabKey = "head" | "footer" | "favicon";

type HeadersPayload = {
  head: string;
  footer: string;
  favicon: string;
  source?: { row?: number | null; key?: string };
  cols?: {
    locationId?: string;
    head?: string;
    footer?: string;
    favicon?: string;
  };
};

type SitemapVerifyResponse = {
  ok: boolean;
  health?: "green" | "yellow" | "red";
  summary?: string;
  active?: boolean;
  matches?: boolean;
  expectedHost?: string;
  responseHost?: string;
  responseStatus?: number;
  requestedPath?: string;
  responsePath?: string;
  contentType?: string;
  pathMatchesSitemap?: boolean;
  xmlDetected?: boolean;
  blockedByProtection?: boolean;
  checks?: {
    statusOk?: boolean;
    pathIsSitemapXml?: boolean;
    xmlDetected?: boolean;
    hostMatches?: boolean;
    protectedByWaf?: boolean;
  };
  sampleHosts?: string[];
  checkedAt?: string;
  error?: string;
};

type IndexSubmitResponse = {
  ok: boolean;
  target: "google";
  domainUrl?: string;
  host?: string;
  google?: {
    ok: boolean;
    mode?: "inspect" | "discovery";
    status?: number;
    siteUrl?: string;
    siteProperty?: string;
    fetch?: {
      status?: number;
      finalUrl?: string;
      contentType?: string;
      error?: string;
    };
    inspection?: {
      verdict?: string;
      coverageState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      robotsTxtState?: string;
    };
    discovery?: {
      attempted: boolean;
      sitemapUrl: string;
      submitted: boolean;
      submittedBy?: string;
      submitError?: string;
    };
    bodyPreview?: string;
    error?: string;
  };
  error?: string;
};

type TabSitemapResultItem = {
  key: string;
  rowName: string;
  domainUrl: string;
  ok: boolean;
  error?: string;
};

type TabSitemapReport = {
  kind: "counties" | "cities";
  action: "inspect" | "discovery" | "bing_indexnow";
  total: number;
  success: number;
  failed: number;
  mode: "all" | "retry";
  items: TabSitemapResultItem[];
  updatedAt: string;
};

type TabSitemapRunItem = {
  key: string;
  rowName: string;
  domainUrl: string;
  status: "pending" | "running" | "done" | "failed";
  error?: string;
};

type TabAction = "inspect" | "discovery" | "bing_indexnow";

/** ---- Progress / Runner UX (client-only) ---- */
type RunnerTotals = {
  allTotal: number;
  countiesTotal: number;
  citiesTotal: number;
};

type RunnerProgress = {
  pct: number; // 0..1
  allDone: number;
  countiesDone: number;
  citiesDone: number;
  message: string;
  etaSec: number | null;
  status: "idle" | "running" | "stopping" | "done" | "error";
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const s0 = Math.round(sec);
  const hh = Math.floor(s0 / 3600);
  const mm = Math.floor((s0 % 3600) / 60);
  const ss = s0 % 60;
  if (hh > 0) return `${hh}h ${mm}m`;
  if (mm > 0) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

function normalizePct(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return clamp01(n);
  if (n >= 0 && n <= 100) return clamp01(n / 100);
  return null;
}

export default function Home() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const routeTenantId = s(params?.id || "");
  const [activeProjectTab, setActiveProjectTab] = useState<ProjectTab>("runner");
  const [detailsTab, setDetailsTab] = useState<ProjectDetailsTab>("business");
  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(
    null,
  );
  const [tenantIntegrations, setTenantIntegrations] = useState<TenantIntegrationRow[]>([]);
  const [tenantDetailErr, setTenantDetailErr] = useState("");
  const [tenantSaving, setTenantSaving] = useState(false);
  const [tenantSaveMsg, setTenantSaveMsg] = useState("");
  const [tenantStateSeedLoading, setTenantStateSeedLoading] = useState(false);
  const [tenantStateSeedMsg, setTenantStateSeedMsg] = useState("");

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantStatus, setTenantStatus] = useState<"active" | "disabled">("active");
  const [tenantRootDomain, setTenantRootDomain] = useState("");
  const [tenantCloudflareCnameTarget, setTenantCloudflareCnameTarget] = useState("");
  const [tenantCloudflareApiToken, setTenantCloudflareApiToken] = useState("");
  const [tenantCloudflareHasToken, setTenantCloudflareHasToken] = useState(false);
  const [tenantTimezone, setTenantTimezone] = useState("UTC");
  const [tenantLocale, setTenantLocale] = useState("en-US");
  const [tenantCurrency, setTenantCurrency] = useState("USD");
  const [tenantSnapshotLocationId, setTenantSnapshotLocationId] = useState("");
  const [tenantOwnerLocationId, setTenantOwnerLocationId] = useState("");
  const [tenantCompanyId, setTenantCompanyId] = useState("");
  const [tenantOwnerFirstName, setTenantOwnerFirstName] = useState("");
  const [tenantOwnerLastName, setTenantOwnerLastName] = useState("");
  const [tenantOwnerEmail, setTenantOwnerEmail] = useState("");
  const [tenantOwnerPhone, setTenantOwnerPhone] = useState("");
  const [tenantLogoUrl, setTenantLogoUrl] = useState("");
  const [tenantAdsAlertsEnabled, setTenantAdsAlertsEnabled] = useState(true);
  const [tenantAdsAlertWebhookUrl, setTenantAdsAlertWebhookUrl] = useState("");
  const [tenantAdsAlertSmsEnabled, setTenantAdsAlertSmsEnabled] = useState(false);
  const [tenantAdsAlertSmsTo, setTenantAdsAlertSmsTo] = useState("");
  const [tenantAdsSampleBusy, setTenantAdsSampleBusy] = useState(false);
  const [tenantAdsSampleResult, setTenantAdsSampleResult] = useState("");
  const [tenantCustomValues, setTenantCustomValues] = useState<TenantCustomValueRow[]>([]);
  const [tenantCustomValuesLoading, setTenantCustomValuesLoading] = useState(false);
  const [tenantCustomValuesSaving, setTenantCustomValuesSaving] = useState(false);
  const [tenantCustomValuesSnapshotBusy, setTenantCustomValuesSnapshotBusy] = useState(false);
  const [tenantCustomValuesMsg, setTenantCustomValuesMsg] = useState("");
  const [tenantCustomValuesPage, setTenantCustomValuesPage] = useState(1);
  const [tenantCustomValuesSearch, setTenantCustomValuesSearch] = useState("");
  const [tenantBingWebmasterApiKey, setTenantBingWebmasterApiKey] = useState("");
  const [tenantBingWebmasterSiteUrl, setTenantBingWebmasterSiteUrl] = useState("");
  const [tenantBingIndexNowKey, setTenantBingIndexNowKey] = useState("");
  const [tenantBingIndexNowKeyLocation, setTenantBingIndexNowKeyLocation] = useState("");
  const [tenantBingSaving, setTenantBingSaving] = useState(false);
  const [tenantBingMsg, setTenantBingMsg] = useState("");
  const [tenantGooglePlacesApiKey, setTenantGooglePlacesApiKey] = useState("");
  const [tenantGooglePlacesSaving, setTenantGooglePlacesSaving] = useState(false);
  const [tenantGooglePlacesMsg, setTenantGooglePlacesMsg] = useState("");
  const [tenantProspectingWebhookUrl, setTenantProspectingWebhookUrl] = useState("");
  const [tenantProspectingWebhookEnabled, setTenantProspectingWebhookEnabled] = useState(true);
  const [tenantProspectingWebhookBusy, setTenantProspectingWebhookBusy] = useState(false);
  const [tenantProspectingWebhookTestBusy, setTenantProspectingWebhookTestBusy] = useState(false);
  const [tenantProspectingWebhookPushBusy, setTenantProspectingWebhookPushBusy] = useState(false);
  const [tenantProspectingWebhookErr, setTenantProspectingWebhookErr] = useState("");
  const [tenantProspectingWebhookOk, setTenantProspectingWebhookOk] = useState("");
  const [actCvApplying, setActCvApplying] = useState(false);
  const [actCvMsg, setActCvMsg] = useState("");
  const [actCvErr, setActCvErr] = useState("");
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [oauthErr, setOauthErr] = useState("");
  const [oauthMsg, setOauthMsg] = useState("");
  const [oauthSaving, setOauthSaving] = useState<"" | "gsc" | "ads" | "ghl">("");
  const [oauthHealthLoading, setOauthHealthLoading] = useState(false);
  const [oauthHealthRows, setOauthHealthRows] = useState<IntegrationHealthRow[]>([]);
  const gscIntegrationKey = OAUTH_INTEGRATION_KEY;
  const [gscClientId, setGscClientId] = useState("");
  const [gscClientSecret, setGscClientSecret] = useState("");
  const [gscRedirectUri, setGscRedirectUri] = useState("");
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [gscGa4PropertyId, setGscGa4PropertyId] = useState("");
  const adsIntegrationKey = OAUTH_INTEGRATION_KEY;
  const [adsClientId, setAdsClientId] = useState("");
  const [adsClientSecret, setAdsClientSecret] = useState("");
  const [adsRedirectUri, setAdsRedirectUri] = useState("");
  const [adsCustomerId, setAdsCustomerId] = useState("");
  const [adsLoginCustomerId, setAdsLoginCustomerId] = useState("");
  const [adsDeveloperToken, setAdsDeveloperToken] = useState("");
  const ghlIntegrationKey = "owner";
  const [ghlClientId, setGhlClientId] = useState("");
  const [ghlClientSecret, setGhlClientSecret] = useState("");
  const [ghlRedirectUri, setGhlRedirectUri] = useState("");
  const [ghlScopes, setGhlScopes] = useState("contacts.readonly contacts.write opportunities.readonly opportunities.write");
  const [ghlUserType, setGhlUserType] = useState("Location");
  type CelebrateParticle = {
    kind: "rocket" | "spark";
    originX: number;
    tx: number;
    ty: number;
    size: number;
    delay: number;
    duration: number;
    spin: number;
    hue: number;
    alpha: number;
  };

  const [statesOut, setStatesOut] = useState<string[]>([]);
  const [job, setJob] = useState(JOBS[0].key);
  const [stateOut, setStateOut] = useState<string>("all");
  const [mode, setMode] = useState<"dry" | "live">("live");
  const [debug, setDebug] = useState(true);

  // ✅ Runner params for single location jobs
  const [runLocId, setRunLocId] = useState("");
  const [runKind, setRunKind] = useState<"" | "counties" | "cities">("");

  const [runId, setRunId] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRetryCountRef = useRef(0);
  const MAX_SSE_RETRIES = 8;
  const [activeRuns, setActiveRuns] = useState<
    Array<{
      id: string;
      createdAt: number;
      meta?: {
        job?: string;
        state?: string;
        mode?: string;
        tenantId?: string;
        locId?: string;
        kind?: string;
      };
      linesCount?: number;
      lastLine?: string;
      finished?: boolean;
      stopped?: boolean;
      exitCode?: number | null;
      error?: string | null;
      progress?: {
        pct: number | null;
        doneAll: number;
        doneCounties: number;
        doneCities: number;
        totalAll: number;
        totalCounties: number;
        totalCities: number;
        lastMessage: string;
        etaSec: number | null;
        updatedAt: number;
      } | null;
    }>
  >([]);
  const [runCardStatusFilter, setRunCardStatusFilter] = useState<
    "all" | "running" | "done" | "error" | "stopped"
  >("all");
  const [runCardSearch, setRunCardSearch] = useState("");
  const currentRunIdRef = useRef<string>("");
  const isRunningRef = useRef<boolean>(false);

  const runStartedAtRef = useRef<number | null>(null);

  const [sheet, setSheet] = useState<OverviewResponse | null>(null);
  const [sheetErr, setSheetErr] = useState<string>("");
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [q, setQ] = useState("");

  const [openState, setOpenState] = useState<string>("");
  const [detail, setDetail] = useState<StateDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailTab, setDetailTab] = useState<"counties" | "cities">("counties");
  const [countyFilter, setCountyFilter] = useState<string>("all");
  const [detailSearch, setDetailSearch] = useState("");
  const [tabSitemapSubmitting, setTabSitemapSubmitting] = useState("");
  const [tabSitemapStatus, setTabSitemapStatus] = useState<{
    kind: "counties" | "cities";
    ok: boolean;
    message: string;
  } | null>(null);
  const [tabSitemapReports, setTabSitemapReports] = useState<
    Record<string, TabSitemapReport>
  >({});
  const [tabSitemapShowDetails, setTabSitemapShowDetails] = useState<
    Record<string, boolean>
  >({});
  const [tabSitemapRunOpen, setTabSitemapRunOpen] = useState(false);
  const [tabSitemapRunKind, setTabSitemapRunKind] = useState<
    "counties" | "cities"
  >("counties");
  const [tabSitemapRunAction, setTabSitemapRunAction] =
    useState<TabAction>("inspect");
  const [tabSitemapRunMode, setTabSitemapRunMode] = useState<"all" | "retry">(
    "all",
  );
  const [tabSitemapRunItems, setTabSitemapRunItems] = useState<
    TabSitemapRunItem[]
  >([]);
  const [tabSitemapRunDone, setTabSitemapRunDone] = useState(false);
  const [tabSitemapRunStartedAt, setTabSitemapRunStartedAt] = useState("");
  const [domainBotBusy, setDomainBotBusy] = useState(false);

  const [actOpen, setActOpen] = useState(false);
  const [actTitle, setActTitle] = useState("");
  const [actDomainToPaste, setActDomainToPaste] = useState("");
  const [actActivationUrl, setActActivationUrl] = useState("");
  const [actIsActive, setActIsActive] = useState<boolean>(false);
  const [actCopied, setActCopied] = useState<boolean>(false);

  // ✅ Website URL (Open Website button in modal)
  const [actWebsiteUrl, setActWebsiteUrl] = useState("");

  // extra meta
  const [actAccountName, setActAccountName] = useState("");
  const [actTimezone, setActTimezone] = useState("");

  // sitemap + robots in modal
  const [actSitemapUrl, setActSitemapUrl] = useState("");
  const [actSitemapChecking, setActSitemapChecking] = useState(false);
  const [actSitemapVerify, setActSitemapVerify] = useState<SitemapVerifyResponse | null>(null);
  const [actIndexing, setActIndexing] = useState<boolean>(false);
  const [actIndexResult, setActIndexResult] = useState<IndexSubmitResponse | null>(null);
  const [actChecklistTab, setActChecklistTab] =
    useState<ChecklistTabKey>("domain");
  const [robotsCopied, setRobotsCopied] = useState(false);

  // ✅ Headers tab states
  const [actHeaders, setActHeaders] = useState<HeadersPayload | null>(null);
  const [actHeadersLoading, setActHeadersLoading] = useState(false);
  const [actHeadersErr, setActHeadersErr] = useState("");
  const [actHeadersTab, setActHeadersTab] = useState<HeadersSubTabKey>("head");
  const [actHeadersCopied, setActHeadersCopied] = useState(false);

  // ✅ Complete states
  const [actLocId, setActLocId] = useState("");
  const [actMarking, setActMarking] = useState(false);
  const [actMarkErr, setActMarkErr] = useState("");
  const [actMarkDone, setActMarkDone] = useState(false);
  const [actDnsReady, setActDnsReady] = useState(false);
  const [actDnsChecking, setActDnsChecking] = useState(false);
  const [actKind, setActKind] = useState<"" | "counties" | "cities">("");
  const [actCelebrateOn, setActCelebrateOn] = useState(false);
  const [actCelebrateKey, setActCelebrateKey] = useState(0);

  // ✅ Runner UX: running + progress
  const [isRunning, setIsRunning] = useState(false);
  const [progressTotals, setProgressTotals] = useState<RunnerTotals>({
    allTotal: 0,
    countiesTotal: 0,
    citiesTotal: 0,
  });

  const [progress, setProgress] = useState<RunnerProgress>({
    pct: 0,
    allDone: 0,
    countiesDone: 0,
    citiesDone: 0,
    message: "Idle",
    etaSec: null,
    status: "idle",
  });

  // ✅ Map modal
  const [mapOpen, setMapOpen] = useState(false);

  type MapMetric = "ready" | "domains";
  const [mapMetric, setMapMetric] = useState<MapMetric>("ready");
  const [mapSelected, setMapSelected] = useState<string>("");
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const webhooksRef = useRef<HTMLElement | null>(null);
  const logsRef = useRef<HTMLElement | null>(null);

  const celebrationParticles = useMemo<CelebrateParticle[]>(() => {
    const palette = [198, 160, 46, 278, 332, 118, 24, 214];

    const rockets: CelebrateParticle[] = Array.from({ length: 58 }, (_, i) => {
      const lane = i % 9;
      const wave = Math.floor(i / 9);
      const hue = palette[i % palette.length];
      const originX = 6 + lane * 10.6 + (wave % 2 ? 1.9 : 0);
      const dir = lane % 2 === 0 ? -1 : 1;
      const tx = dir * (36 + (i % 6) * 13);
      const ty = -(360 + (wave % 5) * 105 + (i % 4) * 34);
      const size = 4 + (i % 4);
      const delay = wave * 0.055 + (i % 3) * 0.014;
      const duration = 1.15 + (i % 6) * 0.1;
      const spin = -34 + (i % 9) * 8;
      const alpha = 0.74 + (i % 4) * 0.06;
      return {
        kind: "rocket" as const,
        originX,
        tx,
        ty,
        size,
        delay,
        duration,
        spin,
        hue,
        alpha,
      };
    });

    const sparks: CelebrateParticle[] = Array.from({ length: 86 }, (_, i) => {
      const lane = i % 11;
      const wave = Math.floor(i / 11);
      const hue = palette[(i + 3) % palette.length];
      const originX = 4 + lane * 9 + (wave % 2 ? 3.1 : 0.4);
      const dir = lane % 2 === 0 ? -1 : 1;
      const tx = dir * (65 + (i % 8) * 14);
      const ty = -(240 + (wave % 4) * 72 + (i % 5) * 20);
      const size = 2 + (i % 3);
      const delay = 0.08 + wave * 0.05 + (i % 4) * 0.012;
      const duration = 0.88 + (i % 5) * 0.08;
      const spin = -58 + (i % 12) * 10;
      const alpha = 0.62 + (i % 5) * 0.05;
      return {
        kind: "spark" as const,
        originX,
        tx,
        ty,
        size,
        delay,
        duration,
        spin,
        hue,
        alpha,
      };
    });

    return rockets.concat(sparks);
  }, []);

  function openMap() {
    setMapOpen(true);
  }
  function closeMap() {
    setMapOpen(false);
  }

  function pushLog(line: string) {
    const msg = `[${tsLocal()}] ${String(line ?? "")}`;
    setLogs((p) =>
      p.length > 4000 ? p.slice(-3500).concat(msg) : p.concat(msg),
    );
  }

  useEffect(() => {
    currentRunIdRef.current = runId;
  }, [runId]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    return () => {
      try {
        esRef.current?.close();
      } catch {}
      esRef.current = null;
      if (sseRetryTimerRef.current) {
        clearTimeout(sseRetryTimerRef.current);
        sseRetryTimerRef.current = null;
      }
    };
  }, []);

  // DB-first: for tenant projects, states list comes from app.organization_state_files.
  useEffect(() => {
    let ignore = false;

    const url = routeTenantId
      ? `/api/states?source=tenant_db&tenantId=${encodeURIComponent(routeTenantId)}`
      : "/api/states?source=resources";

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (ignore) return;
        const next = Array.isArray(d?.states) ? d.states : [];
        setStatesOut(next);

        // ✅ If current selected state is not available in new list, reset safely
        if (stateOut !== "all" && stateOut && !next.includes(stateOut)) {
          setStateOut("all");
        }
      })
      .catch(() => {
        if (!ignore) setStatesOut([]);
      });

    return () => {
      ignore = true;
    };
  }, [job, routeTenantId]); // 👈 only depends on job (minimal change)

  async function loadOverview() {
    setSheetErr("");
    setSheetLoading(true);
    try {
      const endpoint = routeTenantId
        ? `/api/sheet/overview?tenantId=${encodeURIComponent(routeTenantId)}`
        : "/api/sheet/overview";
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await safeJson(res)) as OverviewResponse | any;
      if (!res.ok || data?.error)
        throw new Error(data?.error || `HTTP ${res.status}`);
      setSheet(data);
    } catch (e: any) {
      setSheet(null);
      setSheetErr(e?.message || "Failed to load sheet overview");
    } finally {
      setSheetLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [routeTenantId]);

  async function loadTenantCustomValues() {
    if (!routeTenantId) {
      setTenantCustomValues([]);
      return;
    }
    setTenantCustomValuesLoading(true);
    try {
      const qs = new URLSearchParams({
        provider: "ghl",
        scope: "module",
        module: "custom_values",
      });
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values?${qs.toString()}`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      setTenantCustomValues(
        rows.map((r: any) => ({
          id: s(r.id),
          keyName: s(r.keyName),
          keyValue: s(r.keyValue),
          isActive: r.isActive !== false,
          description: s(r.description) || null,
        })),
      );
      setTenantCustomValuesPage(1);
    } catch (e: any) {
      setTenantCustomValues([]);
      setTenantDetailErr(e?.message || "Failed to load custom values template.");
    } finally {
      setTenantCustomValuesLoading(false);
    }
  }

  function updateTenantCustomValueAt(index: number, patch: Partial<TenantCustomValueRow>) {
    setTenantCustomValues((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function snapshotOwnerCustomValuesTemplate() {
    if (!routeTenantId) return;
    setTenantCustomValuesMsg("");
    setTenantCustomValuesSnapshotBusy(true);
    setTenantDetailErr("");
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values/snapshot-owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshotLocationId: s(tenantSnapshotLocationId) || undefined,
          }),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await loadTenantCustomValues();
      setTenantCustomValuesMsg(
        `Snapshot synced. Found ${(data as any)?.totalFromOwner || 0}, inserted ${(data as any)?.inserted || 0}.`,
      );
    } catch (e: any) {
      setTenantCustomValuesMsg("");
      setTenantDetailErr(e?.message || "Failed to snapshot owner custom values.");
    } finally {
      setTenantCustomValuesSnapshotBusy(false);
    }
  }

  async function saveTenantCustomValuesTemplate() {
    if (!routeTenantId) return;
    setTenantCustomValuesMsg("");
    setTenantCustomValuesSaving(true);
    setTenantDetailErr("");
    try {
      const rows = tenantCustomValues
        .map((r) => ({
          provider: "ghl",
          scope: "module",
          module: "custom_values",
          keyName: s(r.keyName),
          keyValue: s(r.keyValue),
          isActive: r.isActive !== false,
          description: s(r.description) || undefined,
        }))
        .filter((r) => !!r.keyName);

      if (!rows.length) {
        throw new Error("No custom values rows to save.");
      }

      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await loadTenantCustomValues();
      setTenantCustomValuesMsg(`Saved ${Number((data as any)?.upserted || 0)} custom values in DB.`);
    } catch (e: any) {
      setTenantCustomValuesMsg("");
      setTenantDetailErr(e?.message || "Failed to save custom values template.");
    } finally {
      setTenantCustomValuesSaving(false);
    }
  }

  function hydrateBingFormFromIntegrations(rows: TenantIntegrationRow[]) {
    const key = "default";
    const pick =
      rows.find(
        (it) =>
          s(it.provider).toLowerCase() === "bing_webmaster" &&
          s(it.integration_key || it.integrationKey).toLowerCase() === key.toLowerCase(),
      ) ||
      rows.find((it) => s(it.provider).toLowerCase() === "bing_webmaster") ||
      null;
    if (!pick) {
      setTenantBingWebmasterApiKey("");
      setTenantBingWebmasterSiteUrl("");
      setTenantBingIndexNowKey("");
      setTenantBingIndexNowKeyLocation("");
      return;
    }
    const cfg =
      pick.config && typeof pick.config === "object"
        ? (pick.config as Record<string, unknown>)
        : {};
    const auth =
      cfg.auth && typeof cfg.auth === "object"
        ? (cfg.auth as Record<string, unknown>)
        : {};
    setTenantBingWebmasterApiKey(
      s(cfg.webmasterApiKey) ||
        s(cfg.webmaster_api_key) ||
        s(cfg.apiKey) ||
        s(cfg.api_key) ||
        s(auth.webmasterApiKey) ||
        s(auth.webmaster_api_key) ||
        s(auth.apiKey) ||
        s(auth.api_key),
    );
    setTenantBingWebmasterSiteUrl(
      s(pick.external_property_id || pick.externalPropertyId) ||
        s(cfg.siteUrl) ||
        s(cfg.site_url),
    );
    setTenantBingIndexNowKey(
      s(cfg.indexNowKey) ||
        s(cfg.index_now_key) ||
        s(cfg.apiKey) ||
        s(cfg.api_key) ||
        s(auth.indexNowKey) ||
        s(auth.index_now_key),
    );
    setTenantBingIndexNowKeyLocation(
      s(cfg.indexNowKeyLocation) ||
        s(cfg.index_now_key_location) ||
        s(cfg.keyLocation) ||
        s(cfg.key_location),
    );
  }

  function hydrateGooglePlacesFormFromIntegrations(rows: TenantIntegrationRow[]) {
    const pick =
      rows.find(
        (it) =>
          (s(it.provider).toLowerCase() === "google_maps" ||
            s(it.provider).toLowerCase() === "google_places") &&
          s(it.integration_key || it.integrationKey || "default").toLowerCase() === "default",
      ) ||
      rows.find(
        (it) =>
          s(it.provider).toLowerCase() === "google_maps" ||
          s(it.provider).toLowerCase() === "google_places",
      ) ||
      null;
    if (!pick) {
      setTenantGooglePlacesApiKey("");
      return;
    }
    const cfg =
      pick.config && typeof pick.config === "object"
        ? (pick.config as Record<string, unknown>)
        : {};
    const auth =
      cfg.auth && typeof cfg.auth === "object"
        ? (cfg.auth as Record<string, unknown>)
        : {};
    setTenantGooglePlacesApiKey(
      s(cfg.apiKey) ||
        s(cfg.mapsApiKey) ||
        s(cfg.placesApiKey) ||
        s(cfg.key) ||
        s(cfg.api_key) ||
        s(auth.apiKey) ||
        s(auth.api_key),
    );
  }

  async function loadTenantProspectingWebhookSettings() {
    if (!routeTenantId) return;
    setTenantProspectingWebhookErr("");
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/webhooks/prospecting`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const payload = ((data as any)?.payload || {}) as Record<string, unknown>;
      setTenantProspectingWebhookUrl(s(payload.webhookUrl));
      setTenantProspectingWebhookEnabled(payload.enabled !== false);
    } catch (e: any) {
      setTenantProspectingWebhookErr(e?.message || "Failed to load webhook settings.");
    }
  }

  async function saveTenantBingIntegration() {
    if (!routeTenantId) return;
    setTenantBingMsg("");
    setTenantBingSaving(true);
    setTenantDetailErr("");
    try {
      if (!s(tenantBingWebmasterApiKey)) {
        throw new Error("Bing Webmaster API key is required.");
      }
      if (!s(tenantBingWebmasterSiteUrl)) {
        throw new Error("Bing Webmaster site URL is required.");
      }
      if (!s(tenantBingIndexNowKey)) {
        throw new Error("Bing IndexNow key is required.");
      }
      const payload = {
        provider: "bing_webmaster",
        integrationKey: "default",
        status: "connected",
        authType: "api_key",
        externalPropertyId: s(tenantBingWebmasterSiteUrl) || undefined,
        config: {
          webmasterApiKey: s(tenantBingWebmasterApiKey),
          webmasterEndpoint: "https://ssl.bing.com/webmaster/api.svc/json",
          siteUrl: s(tenantBingWebmasterSiteUrl),
          indexNowKey: s(tenantBingIndexNowKey),
          indexNowKeyLocation: s(tenantBingIndexNowKeyLocation) || undefined,
          indexNowEndpoint: "https://api.indexnow.org/indexnow",
        },
      };
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/integrations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await refreshIntegrationsSnapshot();
      setTenantBingMsg("Bing integration saved in tenant DB.");
    } catch (e: any) {
      setTenantBingMsg("");
      setTenantDetailErr(e?.message || "Failed to save Bing integration.");
    } finally {
      setTenantBingSaving(false);
    }
  }

  async function saveTenantGooglePlacesIntegration() {
    if (!routeTenantId) return;
    setTenantGooglePlacesMsg("");
    setTenantGooglePlacesSaving(true);
    setTenantDetailErr("");
    try {
      if (!s(tenantGooglePlacesApiKey)) {
        throw new Error("Google Places API key is required.");
      }
      const payload = {
        provider: "google_maps",
        integrationKey: "default",
        status: "connected",
        authType: "api_key",
        config: {
          apiKey: s(tenantGooglePlacesApiKey),
          mapsApiKey: s(tenantGooglePlacesApiKey),
          placesApiKey: s(tenantGooglePlacesApiKey),
        },
      };
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/integrations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await refreshIntegrationsSnapshot();
      setTenantGooglePlacesMsg("Google Places integration saved in tenant DB.");
    } catch (e: any) {
      setTenantGooglePlacesMsg("");
      setTenantDetailErr(e?.message || "Failed to save Google Places integration.");
    } finally {
      setTenantGooglePlacesSaving(false);
    }
  }

  async function applyCustomValuesForActivationLocation() {
    if (!routeTenantId || !s(actLocId)) return;
    setActCvMsg("");
    setActCvErr("");
    setActCvApplying(true);
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locId: s(actLocId), kind: s(actKind) || undefined }),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const updated = Number((data as any)?.updated || 0);
      const noMatch = Number((data as any)?.noMatch || 0);
      setActCvMsg(`Custom Values updated (${updated}). No match: ${noMatch}.`);
    } catch (e: any) {
      setActCvErr(e?.message || "Failed to update custom values.");
    } finally {
      setActCvApplying(false);
    }
  }

  useEffect(() => {
    void loadTenantCustomValues();
  }, [routeTenantId]);

  useEffect(() => {
    void loadTenantProspectingWebhookSettings();
  }, [routeTenantId]);

  useEffect(() => {
    const tab = s(searchParams?.get("detailsTab")).toLowerCase();
    if (tab === "business" || tab === "ghl" || tab === "integrations" || tab === "custom_values") {
      setDetailsTab(tab as ProjectDetailsTab);
      if (tab && activeProjectTab !== "details") setActiveProjectTab("details");
    }
  }, [searchParams, activeProjectTab]);

  useEffect(() => {
    hydrateBingFormFromIntegrations(tenantIntegrations);
    hydrateGooglePlacesFormFromIntegrations(tenantIntegrations);
  }, [tenantIntegrations]);

  async function saveTenantProspectingWebhookSettings() {
    if (!routeTenantId) return;
    setTenantProspectingWebhookBusy(true);
    setTenantProspectingWebhookErr("");
    setTenantProspectingWebhookOk("");
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/webhooks/prospecting`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          webhookUrl: s(tenantProspectingWebhookUrl),
          enabled: tenantProspectingWebhookEnabled,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await refreshIntegrationsSnapshot();
      setTenantProspectingWebhookOk("Webhook settings saved.");
    } catch (e: any) {
      setTenantProspectingWebhookErr(e?.message || "Failed to save webhook settings.");
    } finally {
      setTenantProspectingWebhookBusy(false);
    }
  }

  async function pushApprovedProspectsNow() {
    if (!routeTenantId) return;
    setTenantProspectingWebhookOk("");
    setTenantProspectingWebhookErr("");
    setTenantProspectingWebhookPushBusy(true);
    try {
      const res = await fetch(`/api/dashboard/prospecting/push-ghl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: routeTenantId,
          maxLeads: 100,
          statuses: ["validated", "new"],
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const sent = Number((data as any)?.sent || 0);
      const reason = s((data as any)?.reason);
      setTenantProspectingWebhookOk(reason || `Approved leads pushed. Sent: ${sent}.`);
    } catch (e: any) {
      setTenantProspectingWebhookErr(e?.message || "Failed to push approved leads.");
    } finally {
      setTenantProspectingWebhookPushBusy(false);
    }
  }

  async function sendProspectingWebhookTest() {
    if (!routeTenantId) return;
    setTenantProspectingWebhookTestBusy(true);
    setTenantProspectingWebhookErr("");
    setTenantProspectingWebhookOk("");
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/webhooks/prospecting/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: s(tenantProspectingWebhookUrl) || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      setTenantProspectingWebhookOk("Test webhook sent successfully.");
    } catch (e: any) {
      setTenantProspectingWebhookErr(e?.message || "Failed to send test webhook.");
    } finally {
      setTenantProspectingWebhookTestBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadTenantSummary() {
      if (!routeTenantId) {
        setTenantSummary(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/tenants/${encodeURIComponent(routeTenantId)}`,
          { cache: "no-store" },
        );
        const data = await safeJson(res);
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data?.tenant) {
          setTenantSummary(null);
          setTenantIntegrations([]);
          return;
        }
        const t = data.tenant || {};
        const settings = data.settings || {};
        const integrations = Array.isArray(data.integrations)
          ? (data.integrations as TenantIntegrationRow[])
          : [];
        const owner = integrations.find(
          (it) =>
            s(it.provider).toLowerCase() === "ghl" &&
            s(it.integration_key || it.integrationKey).toLowerCase() === "owner",
        );
        const ownerCfg =
          owner && owner.config && typeof owner.config === "object"
            ? (owner.config as Record<string, any>)
            : {};

        setTenantSummary({
          id: s(t.id),
          name: s(t.name),
          slug: s(t.slug),
          status: s(t.status || "active"),
        });
        setTenantIntegrations(integrations);
        hydrateBingFormFromIntegrations(integrations);
        hydrateGooglePlacesFormFromIntegrations(integrations);
        setTenantDetailErr("");

        setTenantName(s(t.name));
        setTenantSlug(s(t.slug));
        setTenantStatus(
          s(t.status).toLowerCase() === "disabled" ? "disabled" : "active",
        );
        setTenantRootDomain(s(settings.root_domain));
        setTenantCloudflareCnameTarget(s(settings.cloudflare_cname_target));
        setTenantCloudflareHasToken(settings.has_cloudflare_api_token === true);
        setTenantCloudflareApiToken("");
        setTenantTimezone(s(settings.timezone) || "UTC");
        setTenantLocale(s(settings.locale) || "en-US");
        setTenantCurrency(s(settings.currency) || "USD");
        setTenantSnapshotLocationId(s(settings.snapshot_location_id));
        setTenantCompanyId(s(settings.ghl_company_id) || s(ownerCfg.companyId));
        setTenantOwnerFirstName(s(settings.owner_first_name));
        setTenantOwnerLastName(s(settings.owner_last_name));
        setTenantOwnerEmail(s(settings.owner_email));
        setTenantOwnerPhone(s(settings.owner_phone));
        setTenantLogoUrl(s(settings.logo_url));
        setTenantAdsAlertsEnabled(settings.ads_alerts_enabled !== false);
        setTenantAdsAlertWebhookUrl(s(settings.ads_alert_webhook_url));
        setTenantAdsAlertSmsEnabled(settings.ads_alert_sms_enabled === true);
        setTenantAdsAlertSmsTo(s(settings.ads_alert_sms_to));
        setTenantOwnerLocationId(
          s(owner?.external_account_id || owner?.externalAccountId),
        );
      } catch {
        if (!cancelled) {
          setTenantSummary(null);
          setTenantIntegrations([]);
          setTenantDetailErr("Failed to load tenant details.");
        }
      }
    }
    void loadTenantSummary();
    return () => {
      cancelled = true;
    };
  }, [routeTenantId]);

  useEffect(() => {
    if (!routeTenantId) return;
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const oauth = s(url.searchParams.get("oauth"));
    if (!oauth) return;
    const hasRefresh = s(url.searchParams.get("hasRefresh")) === "1";
    setOauthErr("");
    setOauthMsg(
      oauth === "gsc_ok"
        ? `GSC/GA OAuth connected${hasRefresh ? " with refresh token." : "."}`
        : oauth === "ads_ok"
          ? `Google Ads OAuth connected${hasRefresh ? " with refresh token." : "."}`
          : oauth === "ghl_ok"
            ? `GHL OAuth connected${hasRefresh ? " with refresh token." : "."}`
          : "OAuth connected.",
    );
    hydrateOAuthFormFromIntegrations();
    setOauthModalOpen(true);
    void loadOAuthHealth();
    url.searchParams.delete("oauth");
    url.searchParams.delete("hasRefresh");
    url.searchParams.delete("integrationKey");
    window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));
  }, [routeTenantId, tenantIntegrations]);

  async function saveTenantDetails() {
    if (!routeTenantId) return;
    setTenantSaveMsg("");
    setTenantSaving(true);
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tenantName,
          slug: tenantSlug,
          status: tenantStatus,
          rootDomain: tenantRootDomain || undefined,
          cloudflareCnameTarget: tenantCloudflareCnameTarget || undefined,
          cloudflareApiToken: tenantCloudflareApiToken || undefined,
          timezone: tenantTimezone || undefined,
          locale: tenantLocale || undefined,
          currency: tenantCurrency || undefined,
          snapshotLocationId: tenantSnapshotLocationId || undefined,
          ownerLocationId: tenantOwnerLocationId || undefined,
          companyId: tenantCompanyId || undefined,
          ownerFirstName: tenantOwnerFirstName || undefined,
          ownerLastName: tenantOwnerLastName || undefined,
          ownerEmail: tenantOwnerEmail || undefined,
          ownerPhone: tenantOwnerPhone || undefined,
          logoUrl: tenantLogoUrl || undefined,
          adsAlertsEnabled: tenantAdsAlertsEnabled,
          adsAlertWebhookUrl: tenantAdsAlertWebhookUrl || undefined,
          adsAlertSmsEnabled: tenantAdsAlertSmsEnabled,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setTenantSaveMsg("Saved");
      setTenantDetailErr("");
      if (s(tenantCloudflareApiToken)) {
        setTenantCloudflareHasToken(true);
        setTenantCloudflareApiToken("");
      }
      // refresh snapshot
      const fresh = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}`, {
        cache: "no-store",
      });
      const freshData = (await safeJson(fresh)) as TenantDetailResponse | null;
      if (fresh.ok && freshData?.ok && freshData.tenant) {
        setTenantSummary({
          id: s(freshData.tenant.id),
          name: s(freshData.tenant.name),
          slug: s(freshData.tenant.slug),
          status: s(freshData.tenant.status || "active"),
        });
        setTenantIntegrations(Array.isArray(freshData.integrations) ? freshData.integrations : []);
      }
    } catch (e: any) {
      setTenantSaveMsg("");
      setTenantDetailErr(e?.message || "Failed to save tenant.");
    } finally {
      setTenantSaving(false);
    }
  }

  async function saveTenantAdsWebhookFromWebhooksTab() {
    if (!routeTenantId) return;
    setTenantProspectingWebhookErr("");
    setTenantProspectingWebhookOk("");
    setTenantProspectingWebhookBusy(true);
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adsAlertsEnabled: tenantAdsAlertsEnabled,
          adsAlertWebhookUrl: s(tenantAdsAlertWebhookUrl) || undefined,
          adsAlertSmsEnabled: tenantAdsAlertSmsEnabled,
          adsAlertSmsTo: s(tenantAdsAlertSmsTo) || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      setTenantProspectingWebhookOk("GHL webhook setting saved.");
    } catch (e: any) {
      setTenantProspectingWebhookErr(e?.message || "Failed to save GHL webhook setting.");
    } finally {
      setTenantProspectingWebhookBusy(false);
    }
  }

  async function sendProjectAdsWebhookSample() {
    if (!routeTenantId) return;
    setTenantAdsSampleBusy(true);
    setTenantAdsSampleResult("");
    setTenantDetailErr("");
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/integrations/ghl-alerts/sample`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhookUrl: tenantAdsAlertWebhookUrl || undefined,
            smsEnabled: tenantAdsAlertSmsEnabled,
          }),
        },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setTenantAdsSampleResult(
        JSON.stringify(
          {
            responseStatus: data?.responseStatus || 200,
            responsePreview: data?.responsePreview || "",
            payload: data?.payload || {},
          },
          null,
          2,
        ),
      );
    } catch (e: any) {
      setTenantDetailErr(e?.message || "Failed to send webhook sample.");
    } finally {
      setTenantAdsSampleBusy(false);
    }
  }

  async function seedTenantStateFiles() {
    if (!routeTenantId) return;
    setTenantStateSeedMsg("");
    setTenantStateSeedLoading(true);
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/state-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootDomain: s(tenantRootDomain) || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const upserted = Number(data?.seeded?.upserted || 0);
      setTenantStateSeedMsg(`Seed complete: ${upserted} state files saved in DB.`);
      setTenantDetailErr("");
    } catch (e: any) {
      setTenantStateSeedMsg("");
      setTenantDetailErr(e?.message || "Failed to seed tenant state files.");
    } finally {
      setTenantStateSeedLoading(false);
    }
  }

  function findIntegration(provider: string, key: string) {
    const p = s(provider).toLowerCase();
    const k = s(key || "default").toLowerCase();
    return (
      tenantIntegrations.find(
        (it) =>
          s(it.provider).toLowerCase() === p &&
          s(it.integration_key || it.integrationKey || "default").toLowerCase() === k,
      ) || null
    );
  }

  function hydrateOAuthFormFromIntegrations() {
    const gscRow =
      findIntegration("google_search_console", gscIntegrationKey) ||
      findIntegration("google_search_console", "default");
    const gscCfg =
      gscRow && gscRow.config && typeof gscRow.config === "object"
        ? (gscRow.config as Record<string, any>)
        : {};
    const gscOAuth =
      gscCfg.oauthClient && typeof gscCfg.oauthClient === "object"
        ? (gscCfg.oauthClient as Record<string, any>)
        : {};
    setGscClientId(s(gscOAuth.clientId || gscOAuth.client_id || gscCfg.clientId || gscCfg.client_id));
    setGscClientSecret(
      s(gscOAuth.clientSecret || gscOAuth.client_secret || gscCfg.clientSecret || gscCfg.client_secret),
    );
    setGscRedirectUri(
      s(gscOAuth.redirectUri || gscOAuth.redirect_uri || gscCfg.redirectUri || gscCfg.redirect_uri),
    );
    setGscSiteUrl(s(gscRow?.external_property_id || gscRow?.externalPropertyId || gscCfg.siteUrl || gscCfg.gscSiteUrl));
    setGscGa4PropertyId(s(gscCfg.ga4PropertyId || gscCfg.propertyId));

    const adsRow =
      findIntegration("google_ads", adsIntegrationKey) ||
      findIntegration("google_ads", "default");
    const adsCfg =
      adsRow && adsRow.config && typeof adsRow.config === "object"
        ? (adsRow.config as Record<string, any>)
        : {};
    const adsOAuth =
      adsCfg.oauthClient && typeof adsCfg.oauthClient === "object"
        ? (adsCfg.oauthClient as Record<string, any>)
        : {};
    setAdsClientId(s(adsOAuth.clientId || adsOAuth.client_id || adsCfg.clientId || adsCfg.client_id));
    setAdsClientSecret(
      s(adsOAuth.clientSecret || adsOAuth.client_secret || adsCfg.clientSecret || adsCfg.client_secret),
    );
    setAdsRedirectUri(
      s(adsOAuth.redirectUri || adsOAuth.redirect_uri || adsCfg.redirectUri || adsCfg.redirect_uri),
    );
    setAdsCustomerId(s(adsRow?.external_account_id || adsRow?.externalAccountId || adsCfg.customerId || adsCfg.googleAdsCustomerId));
    setAdsLoginCustomerId(s(adsCfg.loginCustomerId || adsCfg.googleAdsLoginCustomerId));
    setAdsDeveloperToken(s(adsCfg.developerToken || adsCfg.googleAdsDeveloperToken));

    const ghlRow =
      findIntegration("ghl", ghlIntegrationKey) ||
      findIntegration("custom", ghlIntegrationKey) ||
      findIntegration("ghl", "owner") ||
      findIntegration("custom", "owner");
    const ghlCfg =
      ghlRow && ghlRow.config && typeof ghlRow.config === "object"
        ? (ghlRow.config as Record<string, any>)
        : {};
    const ghlOAuth =
      ghlCfg.oauthClient && typeof ghlCfg.oauthClient === "object"
        ? (ghlCfg.oauthClient as Record<string, any>)
        : {};
    const scopesJoined = Array.isArray(ghlCfg.oauthScopes)
      ? ghlCfg.oauthScopes.map((x: unknown) => s(x)).filter(Boolean).join(" ")
      : s(ghlCfg.oauthScopes);
    setGhlClientId(s(ghlOAuth.clientId || ghlOAuth.client_id || ghlCfg.clientId || ghlCfg.client_id));
    setGhlClientSecret(
      s(ghlOAuth.clientSecret || ghlOAuth.client_secret || ghlCfg.clientSecret || ghlCfg.client_secret),
    );
    setGhlRedirectUri(
      s(ghlOAuth.redirectUri || ghlOAuth.redirect_uri || ghlCfg.redirectUri || ghlCfg.redirect_uri),
    );
    setGhlScopes(scopesJoined || "contacts.readonly contacts.write opportunities.readonly opportunities.write");
    setGhlUserType(s(ghlCfg.oauthUserType) || "Location");
  }

  async function loadOAuthHealth() {
    if (!routeTenantId) return;
    setOauthHealthLoading(true);
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/integrations/health`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(data.rows) ? (data.rows as IntegrationHealthRow[]) : [];
      setOauthHealthRows(rows);
    } catch {
      setOauthHealthRows([]);
    } finally {
      setOauthHealthLoading(false);
    }
  }

  function openOAuthManager() {
    setOauthErr("");
    setOauthMsg("");
    hydrateOAuthFormFromIntegrations();
    setOauthModalOpen(true);
    void loadOAuthHealth();
  }

  function closeOAuthManager() {
    if (oauthSaving) return;
    setOauthModalOpen(false);
  }

  async function upsertOAuthIntegration(kind: "gsc" | "ads" | "ghl") {
    if (!routeTenantId) throw new Error("Missing tenantId");
    if (kind === "gsc") {
      const integrationKey = s(gscIntegrationKey) || "default";
      if (!s(gscClientId) || !s(gscClientSecret) || !s(gscRedirectUri)) {
        throw new Error("GSC: clientId, clientSecret y redirectUri son obligatorios.");
      }
      if (!s(gscSiteUrl)) {
        throw new Error("GSC: siteUrl (propiedad Search Console) es obligatorio.");
      }
      const payload = {
        provider: "google_search_console",
        integrationKey,
        status: "needs_reconnect",
        authType: "oauth",
        externalPropertyId: s(gscSiteUrl),
        scopes: [
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
        config: {
          oauthClient: {
            clientId: s(gscClientId),
            clientSecret: s(gscClientSecret),
            redirectUri: s(gscRedirectUri),
          },
          siteUrl: s(gscSiteUrl),
          ga4PropertyId: s(gscGa4PropertyId),
        },
      };
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return integrationKey;
    }

    if (kind === "ghl") {
      const integrationKey = s(ghlIntegrationKey) || "owner";
      if (!s(ghlClientId) || !s(ghlClientSecret) || !s(ghlRedirectUri)) {
        throw new Error("GHL: clientId, clientSecret y redirectUri son obligatorios.");
      }
      const ownerRow =
        findIntegration("ghl", integrationKey) ||
        findIntegration("custom", integrationKey) ||
        findIntegration("ghl", "owner") ||
        findIntegration("custom", "owner");
      const existingCfg =
        ownerRow && ownerRow.config && typeof ownerRow.config === "object"
          ? (ownerRow.config as Record<string, any>)
          : {};
      const nextProvider =
        s(ownerRow?.provider).toLowerCase() === "custom"
          ? "custom"
          : "ghl";
      const nextScopes = s(ghlScopes)
        .split(/[\s,]+/)
        .map((x) => s(x))
        .filter(Boolean);
      const payload = {
        provider: nextProvider,
        integrationKey,
        status: "needs_reconnect",
        authType: "oauth",
        externalAccountId: s(tenantOwnerLocationId) || s(ownerRow?.external_account_id || ownerRow?.externalAccountId) || undefined,
        metadata: {
          ...(ownerRow?.metadata || {}),
          companyId: s(tenantCompanyId) || undefined,
        },
        config: {
          ...existingCfg,
          companyId: s(tenantCompanyId) || s(existingCfg.companyId) || undefined,
          oauthClient: {
            ...(existingCfg.oauthClient || {}),
            clientId: s(ghlClientId),
            clientSecret: s(ghlClientSecret),
            redirectUri: s(ghlRedirectUri),
          },
          oauthScopes: nextScopes.length ? nextScopes : undefined,
          oauthUserType: s(ghlUserType) || "Location",
        },
      };
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return integrationKey;
    }

    const integrationKey = s(adsIntegrationKey) || "default";
    if (!s(adsClientId) || !s(adsClientSecret) || !s(adsRedirectUri)) {
      throw new Error("Google Ads: clientId, clientSecret y redirectUri son obligatorios.");
    }
    if (!s(adsCustomerId) || !s(adsDeveloperToken)) {
      throw new Error("Google Ads: customerId y developerToken son obligatorios.");
    }
    const payload = {
      provider: "google_ads",
      integrationKey,
      status: "needs_reconnect",
      authType: "oauth",
      externalAccountId: s(adsCustomerId),
      scopes: ["https://www.googleapis.com/auth/adwords"],
      config: {
        oauthClient: {
          clientId: s(adsClientId),
          clientSecret: s(adsClientSecret),
          redirectUri: s(adsRedirectUri),
        },
        customerId: s(adsCustomerId),
        loginCustomerId: s(adsLoginCustomerId),
        developerToken: s(adsDeveloperToken),
      },
    };
    const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(res);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return integrationKey;
  }

  async function refreshIntegrationsSnapshot() {
    if (!routeTenantId) return;
    const fresh = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}`, {
      cache: "no-store",
    });
    const freshData = (await safeJson(fresh)) as TenantDetailResponse | null;
    if (fresh.ok && freshData?.ok && freshData.tenant) {
      const rows = Array.isArray(freshData.integrations) ? freshData.integrations : [];
      setTenantIntegrations(rows);
      hydrateBingFormFromIntegrations(rows);
      hydrateGooglePlacesFormFromIntegrations(rows);
    }
  }

  async function saveOAuthConfig(kind: "gsc" | "ads" | "ghl") {
    setOauthErr("");
    setOauthMsg("");
    setOauthSaving(kind);
    try {
      await upsertOAuthIntegration(kind);
      await refreshIntegrationsSnapshot();
      await loadOAuthHealth();
      setOauthMsg(
        kind === "gsc"
          ? "GSC/GA config saved in DB."
          : kind === "ads"
            ? "Google Ads config saved in DB."
            : "GHL OAuth config saved in DB.",
      );
    } catch (e: any) {
      setOauthErr(e?.message || "Failed to save OAuth config.");
    } finally {
      setOauthSaving("");
    }
  }

  async function connectOAuth(kind: "gsc" | "ads" | "ghl") {
    if (!routeTenantId) return;
    setOauthErr("");
    setOauthMsg("");
    setOauthSaving(kind);
    try {
      const integrationKey = await upsertOAuthIntegration(kind);
      await refreshIntegrationsSnapshot();
      await loadOAuthHealth();
      const startPath =
        kind === "gsc"
          ? "/api/auth/gsc/start"
          : kind === "ads"
            ? "/api/auth/ads/start"
            : "/api/auth/ghl/start";
      const returnTo = `/projects/${routeTenantId}`;
      const target =
        `${startPath}?tenantId=${encodeURIComponent(routeTenantId)}` +
        `&integrationKey=${encodeURIComponent(integrationKey)}` +
        `&returnTo=${encodeURIComponent(returnTo)}`;
      window.location.assign(target);
    } catch (e: any) {
      setOauthErr(e?.message || "Failed to start OAuth connect.");
      setOauthSaving("");
    }
  }

  function jumpTo(tab: ProjectTab) {
    setActiveProjectTab(tab);
    const byTab: Record<ProjectTab, HTMLElement | null> = {
      details: detailsRef.current,
      runner: runnerRef.current,
      sheet: sheetRef.current,
      activation: sheetRef.current,
      webhooks: webhooksRef.current,
      logs: logsRef.current,
    };
    const target = byTab[tab];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectedJob = useMemo(() => JOBS.find((j) => j.key === job), [job]);

  const filteredSheetStates = useMemo(() => {
    const rows = sheet?.states || [];
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.state.toLowerCase().includes(term));
  }, [sheet, q]);

  const totals = useMemo(() => {
    const rows = sheet?.states || [];
    let countiesTotal = 0,
      countiesReady = 0,
      countiesDomainsActive = 0,
      citiesTotal = 0,
      citiesReady = 0,
      citiesDomainsActive = 0;

    for (const r of rows) {
      countiesTotal += r.counties.total || 0;
      countiesReady += r.counties.ready || 0;
      countiesDomainsActive += r.counties.domainsActive || 0;

      citiesTotal += r.cities.total || 0;
      citiesReady += r.cities.ready || 0;
      citiesDomainsActive += r.cities.domainsActive || 0;
    }

    return {
      countiesTotal,
      countiesReady,
      countiesDomainsActive,
      citiesTotal,
      citiesReady,
      citiesDomainsActive,
    };
  }, [sheet]);

  const isStateJob = useMemo(() => {
    return job === "build-state-sitemaps" || job === "build-state-index";
  }, [job]);

  const isOneLocJob = useMemo(() => {
    return job === "update-custom-values-one";
  }, [job]);

  const runScopeTotals = useMemo<RunnerTotals>(() => {
    const rows = sheet?.states || [];
    if (!rows.length) return { allTotal: 0, countiesTotal: 0, citiesTotal: 0 };

    // ✅ single loc job is always 1 unit (for UX only)
    if (isOneLocJob) return { allTotal: 1, countiesTotal: 0, citiesTotal: 0 };

    if (isStateJob) {
      if (stateOut === "all")
        return { allTotal: rows.length, countiesTotal: 0, citiesTotal: 0 };
      return { allTotal: 1, countiesTotal: 0, citiesTotal: 0 };
    }

    if (stateOut === "all") {
      const allTotal = (totals.countiesTotal || 0) + (totals.citiesTotal || 0);
      return {
        allTotal,
        countiesTotal: totals.countiesTotal,
        citiesTotal: totals.citiesTotal,
      };
    }

    const row = rows.find((r) => r.state === stateOut);
    const c = row?.counties?.total || 0;
    const ci = row?.cities?.total || 0;
    return { allTotal: c + ci, countiesTotal: c, citiesTotal: ci };
  }, [
    sheet,
    stateOut,
    totals.countiesTotal,
    totals.citiesTotal,
    isStateJob,
    isOneLocJob,
  ]);

  // ✅ DERIVED METRICS PER STATE (single source of truth)
  const stateMetrics = useMemo(() => {
    const rows = sheet?.states || [];
    const map: Record<
      string,
      {
        readyPct: number;
        domainsPct: number;
        countiesReady: number;
        countiesTotal: number;
        citiesReady: number;
        citiesTotal: number;
        countiesDomains: number;
        citiesDomains: number;
      }
    > = {};

    for (const r of rows) {
      const countiesTotal = r.counties.total || 0;
      const citiesTotal = r.cities.total || 0;

      const countiesReady = r.counties.ready || 0;
      const citiesReady = r.cities.ready || 0;

      const countiesDomains = r.counties.domainsActive || 0;
      const citiesDomains = r.cities.domainsActive || 0;

      const denom = countiesTotal + citiesTotal;

      map[r.state] = {
        readyPct: denom ? (countiesReady + citiesReady) / denom : 0,
        domainsPct: denom ? (countiesDomains + citiesDomains) / denom : 0,
        countiesReady,
        countiesTotal,
        citiesReady,
        citiesTotal,
        countiesDomains,
        citiesDomains,
      };
    }

    return map;
  }, [sheet]);

  const selectedStateMetrics = useMemo(() => {
    if (!mapSelected) return null;
    return stateMetrics[mapSelected] || null;
  }, [mapSelected, stateMetrics]);

  const tabRunKey = (
    kind: "counties" | "cities",
    action: TabAction,
  ) => `${kind}:${action}`;
  const currentTabRunKey = tabRunKey(detailTab, tabSitemapRunAction);

  const currentTabSitemapReport = useMemo(
    () => tabSitemapReports[currentTabRunKey],
    [tabSitemapReports, currentTabRunKey],
  );

  const filteredDetailRows = useMemo(() => {
    if (!detail) return [];
    const rows =
      detailTab === "counties"
        ? detail.counties.rows || []
        : detail.cities.rows || [];
    const q0 = detailSearch.trim().toLowerCase();
    return rows
      .filter((r) =>
        countyFilter === "all"
          ? true
          : String(r["County"] || "").trim() === countyFilter,
      )
      .filter((r) => {
        if (!q0) return true;
        const locId = s(r["Location Id"]).toLowerCase();
        const county = s(r["County"]).toLowerCase();
        const city = s(r["City"]).toLowerCase();
        return (
          locId.includes(q0) ||
          county.includes(q0) ||
          city.includes(q0)
        );
      });
  }, [detail, detailTab, countyFilter, detailSearch]);

  const firstDomainBotLocId = useMemo(() => {
    const firstPending = filteredDetailRows.find(
      (r) =>
        !!r.__eligible &&
        !isTrue(r["Domain Created"]) &&
        !!s(r["Location Id"]),
    );
    if (firstPending) return s(firstPending["Location Id"]);
    const firstAny = filteredDetailRows.find((r) => !!s(r["Location Id"]));
    return firstAny ? s(firstAny["Location Id"]) : "";
  }, [filteredDetailRows]);

  const tabSitemapRunCounts = useMemo(() => {
    let pending = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    for (const it of tabSitemapRunItems) {
      if (it.status === "pending") pending += 1;
      else if (it.status === "running") running += 1;
      else if (it.status === "done") done += 1;
      else if (it.status === "failed") failed += 1;
    }
    const total = tabSitemapRunItems.length;
    const completed = done + failed;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { pending, running, done, failed, total, completed, pct };
  }, [tabSitemapRunItems]);

  // ✅ Puerto Rico metrics (separado)
  const prMetrics = useMemo(() => {
    const rows = sheet?.states || [];
    const prRow =
      rows.find((r) => r.state === "Puerto Rico") ||
      rows.find((r) => r.state === "PR");

    if (!prRow) return null;

    const countiesTotal = prRow.counties.total || 0;
    const citiesTotal = prRow.cities.total || 0;

    const countiesReady = prRow.counties.ready || 0;
    const citiesReady = prRow.cities.ready || 0;

    const countiesDomains = prRow.counties.domainsActive || 0;
    const citiesDomains = prRow.cities.domainsActive || 0;

    const denom = countiesTotal + citiesTotal;

    return {
      state: prRow.state,
      readyPct: denom ? (countiesReady + citiesReady) / denom : 0,
      domainsPct: denom ? (countiesDomains + citiesDomains) / denom : 0,
      countiesReady,
      countiesTotal,
      citiesReady,
      citiesTotal,
      countiesDomains,
      citiesDomains,
    };
  }, [sheet]);

  async function loadHeadersForLocation(locId: string) {
    const id = s(locId);
    if (!id) return;

    setActHeaders(null);
    setActHeadersErr("");
    setActHeadersLoading(true);

    try {
      const qp = new URLSearchParams({ locId: id });
      if (routeTenantId) qp.set("tenantId", routeTenantId);
      const res = await fetch(
        `/api/sheet/headers?${qp.toString()}`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);

      if (!res.ok || (data as any)?.error) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }

      setActHeaders({
        head: s((data as any)?.head),
        footer: s((data as any)?.footer),
        favicon: s((data as any)?.favicon),
        source: (data as any)?.source,
        cols: (data as any)?.cols,
      });
    } catch (e: any) {
      setActHeadersErr(e?.message || "Failed to load Headers tab");
    } finally {
      setActHeadersLoading(false);
    }
  }

  // ✅ Mark Domain Created TRUE and refresh UI (CORRECT payload)
  async function markDomainCreatedTrue() {
    const locId = s(actLocId);
    if (!locId) return;

    if (actIsActive) {
      setActMarkDone(true);
      triggerActivationCelebrate();
      setTimeout(() => setActMarkDone(false), 900);
      return;
    }

    setActMarkErr("");
    setActMarkDone(false);
    setActMarking(true);

    try {
      const dnsReady = await refreshActivationDnsStatus();
      if (!dnsReady) {
        throw new Error("Cannot complete until Cloudflare CNAME is active for this domain.");
      }

      const domainUrlForDnsDelete = s(toUrlMaybe(actDomainToPaste));
      if (routeTenantId && domainUrlForDnsDelete) {
        const dnsRes = await fetch("/api/tools/cloudflare-dns-cname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            tenantId: routeTenantId,
            domainUrl: domainUrlForDnsDelete,
            action: "delete",
          }),
        });
        const dnsData = await safeJson(dnsRes);
        if (!dnsRes.ok || !(dnsData as any)?.ok) {
          throw new Error((dnsData as any)?.error || `Cloudflare delete failed (HTTP ${dnsRes.status})`);
        }
      }

      const res = await fetch("/api/sheet/domain-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          tenantId: routeTenantId || "",
          locId,
          value: true,
          kind: actKind,
        }),
      });

      const data = await safeJson(res);

      if (!res.ok || (data as any)?.error) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }

      setActIsActive(true);
      setActMarkDone(true);
      triggerActivationCelebrate();

      const keepTab = detailTab;
      await loadOverview();
      if (openState) {
        await openDetail(openState);
        setDetailTab(keepTab);
      }

      setTimeout(() => setActMarkDone(false), 1400);
    } catch (e: any) {
      setActMarkErr(e?.message || "Failed to mark Domain Created");
    } finally {
      setActMarking(false);
    }
  }

  async function openActivationWithDns() {
    const activationUrl = s(actActivationUrl);
    if (!activationUrl) return;
    setActMarkErr("");

    try {
      const domainUrlForDns = s(toUrlMaybe(actDomainToPaste));
      if (!actIsActive && routeTenantId && domainUrlForDns) {
        const dnsRes = await fetch("/api/tools/cloudflare-dns-cname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            tenantId: routeTenantId,
            domainUrl: domainUrlForDns,
            action: "upsert",
          }),
        });
        const dnsData = await safeJson(dnsRes);
        if (!dnsRes.ok || !(dnsData as any)?.ok) {
          throw new Error((dnsData as any)?.error || `Cloudflare create failed (HTTP ${dnsRes.status})`);
        }
        setActDnsReady(true);
      } else if (actIsActive) {
        setActDnsReady(true);
      }

      window.open(activationUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setActMarkErr(e?.message || "Failed to create Cloudflare DNS record.");
    }
  }

  async function refreshActivationDnsStatus(domainOverride?: string) {
    const domainUrl = s(toUrlMaybe(domainOverride || actDomainToPaste));
    if (!routeTenantId || !domainUrl) {
      setActDnsReady(false);
      return false;
    }
    setActDnsChecking(true);
    try {
      const res = await fetch("/api/tools/cloudflare-dns-cname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          tenantId: routeTenantId,
          domainUrl,
          action: "check",
        }),
      });
      const data = await safeJson(res);
      const ready = !!(data as any)?.ready;
      const ok = !!res.ok && !!(data as any)?.ok && ready;
      setActDnsReady(ok);
      return ok;
    } catch {
      setActDnsReady(false);
      return false;
    } finally {
      setActDnsChecking(false);
    }
  }

  function triggerActivationCelebrate() {
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }
    setActCelebrateKey((n) => n + 1);
    setActCelebrateOn(true);
    celebrateTimerRef.current = setTimeout(() => {
      setActCelebrateOn(false);
      celebrateTimerRef.current = null;
    }, 1550);
  }

  async function loadActiveRuns() {
    try {
      const res = await fetch("/api/run?limit=30", {
        cache: "no-store",
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !Array.isArray(data?.runs)) return;
      const filtered = data.runs
        .map((r: any) => ({
          id: String(r?.id || ""),
          createdAt: Number(r?.createdAt || 0),
          meta: r?.meta || {},
          linesCount: Number(r?.linesCount || 0),
          lastLine: String(r?.lastLine || ""),
          finished: !!r?.finished,
          stopped: !!r?.stopped,
          exitCode:
            r?.exitCode === null || r?.exitCode === undefined
              ? null
              : Number(r?.exitCode),
          error: r?.error ? String(r.error) : null,
          progress: r?.progress || null,
        }))
        .filter((r: any) =>
          routeTenantId
            ? s(r?.meta?.tenantId) === s(routeTenantId)
            : true,
        )
        .slice(0, 12);
      setActiveRuns(filtered);
      setRunId((curr) => {
        const current = s(curr);
        if (!current) return curr;
        const exists = filtered.some((r: any) => s(r?.id) === current);
        return exists ? curr : "";
      });
    } catch {
      // ignore background polling errors
    }
  }

  useEffect(() => {
    loadActiveRuns();
    const id = setInterval(loadActiveRuns, 5000);
    return () => clearInterval(id);
  }, [routeTenantId]);

  // ✅ Unified runner (supports optional locId/kind)
  async function run(opts?: { job?: string; locId?: string; kind?: string }) {
    const jobKey = s(opts?.job || job);
    const locId = s(opts?.locId || (isOneLocJob ? runLocId : ""));
    const kind = s(opts?.kind || (isOneLocJob ? runKind : ""));
    const metaState =
      jobKey === "update-custom-values-one" ? s(openState) || "one" : stateOut;

    const duplicate = activeRuns.find((r) => {
      const m = r.meta || {};
      return (
        s(m.tenantId) === s(routeTenantId) &&
        s(m.job) === jobKey &&
        s(m.state) === metaState &&
        s(m.locId) === locId &&
        s(m.kind) === kind
      );
    });
    if (duplicate) {
      pushLog(
        `⚠ Duplicate blocked: run already active (${duplicate.id}) for same job/state scope.`,
      );
      return;
    }

    if (jobKey === "update-custom-values-one" && !locId) {
      pushLog("❌ Missing locId for update-custom-values-one");
      return;
    }

    setLogs([]);
    runStartedAtRef.current = Date.now();
    sseRetryCountRef.current = 0;
    if (sseRetryTimerRef.current) {
      clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }
    setIsRunning(true);

    setProgressTotals(runScopeTotals);
    setProgress({
      pct: 0,
      allDone: 0,
      countiesDone: 0,
      citiesDone: 0,
      message: "Starting…",
      etaSec: null,
      status: "running",
    });

    try {
      esRef.current?.close();
    } catch {}
    esRef.current = null;

    try {
      pushLog(
        `▶ Starting job="${jobKey}" state="${metaState}" mode="${mode}" debug="${debug ? "on" : "off"}"${
          locId ? ` extra={locId:"${locId}",kind:"${kind || "auto"}"}` : ""
        }...`,
      );

      // Force SSE mode on both local and deployed environments so runner can
      // render real-time progress/ETA from server events.
      const useSyncRun = false;

      const res = await fetch(useSyncRun ? "/api/run?sync=1" : "/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: jobKey,
          state: metaState, // ✅ PRO
          mode,
          debug,
          locId: locId || "",
          kind: kind || "",
          tenantId: routeTenantId || "",
        }),
      });

      const text = await res.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        const msg = payload?.error || text || `HTTP ${res.status}`;
        if (res.status === 409 && payload?.runId) {
          setRunId(String(payload.runId));
        }
        throw new Error(msg);
      }

      const id = payload?.runId as string;
      if (!id) throw new Error("Missing runId");

      setRunId(id);
      if (payload?.sync) {
        pushLog(`✅ runId=${id} (sync mode)`);
        const syncLines = Array.isArray(payload?.logs) ? payload.logs : [];
        for (const line of syncLines) {
          pushLog(String(line || ""));
        }
        const ms = runStartedAtRef.current
          ? Date.now() - runStartedAtRef.current
          : null;
        const msTxt =
          ms === null ? "" : ` • duration=${(ms / 1000).toFixed(2)}s`;
        pushLog(
          `🏁 END ${JSON.stringify({
            runId: id,
            ok: !!payload?.ok,
            exitCode: payload?.exitCode ?? null,
          })}${msTxt}`,
        );
        setIsRunning(false);
        setProgress((p) => ({
          ...p,
          pct: 1,
          etaSec: 0,
          message: payload?.ok ? "Done" : "Error",
          status: payload?.ok ? "done" : "error",
        }));
        setTimeout(() => {
          loadOverview();
          if (openState) openDetail(openState);
        }, 350);
        return;
      }

      pushLog(`✅ runId=${id} (connecting SSE...)`);
      const connectStream = (targetRunId: string, reconnecting = false) => {
        if (sseRetryTimerRef.current) {
          clearTimeout(sseRetryTimerRef.current);
          sseRetryTimerRef.current = null;
        }

        const es = new EventSource(`/api/stream/${targetRunId}`);
        esRef.current = es;

        const onHello = (ev: MessageEvent) => {
          sseRetryCountRef.current = 0;
          pushLog(
            reconnecting
              ? `🔁 SSE reconnected: ${ev.data}`
              : `🟢 SSE connected: ${ev.data}`,
          );
          setProgress((p) => ({ ...p, message: "Running…", status: "running" }));
        };

        const onLine = (ev: MessageEvent) => {
          const raw = String(ev.data ?? "");
          if (!raw || raw === "__HB__" || raw === "__END__") return;
          if (
            raw.startsWith("__PROGRESS__ ") ||
            raw.startsWith("__PROGRESS_INIT__ ") ||
            raw.startsWith("__PROGRESS_END__ ")
          ) {
            return;
          }
          pushLog(raw);
        };

        const onProgress = (ev: MessageEvent) => {
          let data: any = null;
          try {
            data = JSON.parse(String(ev.data ?? ""));
          } catch {
            return;
          }

          const totalsAll = Number(data?.totals?.all ?? 0);
          const totalsCounties = Number(data?.totals?.counties ?? 0);
          const totalsCities = Number(data?.totals?.cities ?? 0);

          const doneAll = Number(data?.done?.all ?? 0);
          const doneCounties = Number(data?.done?.counties ?? 0);
          const doneCities = Number(data?.done?.cities ?? 0);

          const pctFromPayload = normalizePct(data?.pct);
          const pctComputed = totalsAll > 0 ? clamp01(doneAll / totalsAll) : 0;
          const pctFinal =
            typeof pctFromPayload === "number" ? pctFromPayload : pctComputed;

          setProgressTotals((prev) => ({
            allTotal: totalsAll || prev.allTotal || runScopeTotals.allTotal,
            countiesTotal:
              totalsCounties ||
              prev.countiesTotal ||
              runScopeTotals.countiesTotal,
            citiesTotal:
              totalsCities || prev.citiesTotal || runScopeTotals.citiesTotal,
          }));

          const startedAt = runStartedAtRef.current;
          let etaSec: number | null = null;
          if (startedAt && totalsAll > 0 && doneAll > 0) {
            const elapsedSec = (Date.now() - startedAt) / 1000;
            const rate = doneAll / Math.max(0.5, elapsedSec);
            const remaining = Math.max(0, totalsAll - doneAll);
            etaSec = rate > 0 ? remaining / rate : null;
            if (etaSec !== null && !Number.isFinite(etaSec)) etaSec = null;
          }

          const last = data?.last;
          const msg =
            last?.kind === "state"
              ? `🗺️ ${s(last?.state)} • ${s(last?.action)}`
              : last?.kind === "city"
                ? `🏙️ ${s(last?.city)} • ${s(last?.action)}`
                : last?.kind === "county"
                  ? `🧩 ${s(last?.county)} • ${s(last?.action)}`
                  : "Running…";

          setProgress((p) => ({
            ...p,
            pct: pctFinal,
            allDone: Number.isFinite(doneAll) ? doneAll : p.allDone,
            countiesDone: Number.isFinite(doneCounties)
              ? doneCounties
              : p.countiesDone,
            citiesDone: Number.isFinite(doneCities) ? doneCities : p.citiesDone,
            message: msg,
            etaSec,
            status: "running",
          }));
        };

        const onEnd = (ev: MessageEvent) => {
          let data: any = ev.data;
          try {
            data = JSON.parse(String(ev.data ?? ""));
          } catch {}

          const ms = runStartedAtRef.current
            ? Date.now() - runStartedAtRef.current
            : null;
          const msTxt =
            ms === null ? "" : ` • duration=${(ms / 1000).toFixed(2)}s`;

          pushLog(
            `🏁 END ${
              typeof data === "object" ? JSON.stringify(data) : String(data)
            }${msTxt}`,
          );

          try {
            es.close();
          } catch {}

          setIsRunning(false);
          setRunId((curr) => (s(curr) === s(targetRunId) ? "" : curr));
          setProgress((p) => ({
            ...p,
            pct: data?.ok === false ? p.pct : 1,
            etaSec: 0,
            message: data?.ok === false ? s(data?.reason || data?.error || "Run ended with error") : "Done",
            status: data?.ok === false ? "error" : "done",
          }));

          setTimeout(() => {
            loadOverview();
            loadActiveRuns();
            if (openState) openDetail(openState);
          }, 350);
        };

        es.addEventListener("hello", onHello as any);
        es.addEventListener("line", onLine as any);
        es.addEventListener("progress", onProgress as any);
        es.addEventListener("end", onEnd as any);

        es.onerror = () => {
          try {
            es.close();
          } catch {}

          if (!isRunningRef.current || currentRunIdRef.current !== targetRunId)
            return;

          const nextAttempt = sseRetryCountRef.current + 1;
          if (nextAttempt > MAX_SSE_RETRIES) {
            pushLog("❌ SSE retry limit reached. Detaching run.");
            setIsRunning(false);
            setRunId((curr) => (s(curr) === s(targetRunId) ? "" : curr));
            setProgress((p) => ({
              ...p,
              status: "error",
              message: "SSE disconnected (retry limit reached)",
            }));
            return;
          }
          sseRetryCountRef.current = nextAttempt;
          const waitMs = Math.min(10000, 1000 * Math.pow(1.6, nextAttempt - 1));
          pushLog(
            `⚠ SSE disconnected. Reconnecting in ${(waitMs / 1000).toFixed(1)}s (attempt ${nextAttempt})...`,
          );
          setProgress((p) => ({
            ...p,
            message: "SSE reconnecting…",
            status: "running",
          }));

          sseRetryTimerRef.current = setTimeout(() => {
            connectStream(targetRunId, true);
          }, waitMs);
        };
      };

      connectStream(id, false);
      loadActiveRuns();
    } catch (e: any) {
      pushLog(`❌ /api/run failed: ${e?.message || e}`);
      setIsRunning(false);
      setProgress((p) => ({
        ...p,
        message: `Error: ${e?.message || e}`,
        status: "error",
      }));
    }
  }

  async function stop() {
    if (!runId) return;

    setProgress((p) => ({ ...p, message: "Stopping…", status: "stopping" }));

    try {
      await fetch(`/api/stop/${runId}`, { method: "POST" });
      pushLog("🛑 Stop requested");
    } catch {
      pushLog("❌ Stop failed (network)");
      setProgress((p) => ({
        ...p,
        message: "Stop failed (network)",
        status: "error",
      }));
    }
  }

  async function attachToActiveRun(targetRunId: string) {
    const id = s(targetRunId);
    if (!id) return;

    try {
      esRef.current?.close();
    } catch {}
    esRef.current = null;
    if (sseRetryTimerRef.current) {
      clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }
    sseRetryCountRef.current = 0;

    setRunId(id);
    setIsRunning(true);
    if (!runStartedAtRef.current) runStartedAtRef.current = Date.now();
    pushLog(`🔎 Attaching to active run ${id}...`);
    // Reuse existing run() stream logic by opening /api/stream directly here.
    const es = new EventSource(`/api/stream/${id}`);
    esRef.current = es;
    es.addEventListener("hello", (ev: MessageEvent) => {
      pushLog(`🟢 SSE connected: ${ev.data}`);
      setProgress((p) => ({ ...p, status: "running", message: "Running…" }));
    });
    es.addEventListener("line", (ev: MessageEvent) => {
      const raw = String(ev.data ?? "");
      if (!raw || raw === "__HB__" || raw === "__END__") return;
      pushLog(raw);
    });
    es.addEventListener("end", (ev: MessageEvent) => {
      let data: any = ev.data;
      try {
        data = JSON.parse(String(ev.data ?? ""));
      } catch {}
      pushLog(
        `🏁 END ${
          typeof data === "object" ? JSON.stringify(data) : String(data)
        }`,
      );
      try {
        es.close();
      } catch {}
      setIsRunning(false);
      setRunId((curr) => (s(curr) === s(id) ? "" : curr));
      setProgress((p) => ({
        ...p,
        pct: data?.ok === false ? p.pct : 1,
        etaSec: 0,
        message: data?.ok === false ? s(data?.reason || data?.error || "Run ended with error") : "Done",
        status: data?.ok === false ? "error" : "done",
      }));
      loadActiveRuns();
    });
    es.onerror = () => {
      try {
        es.close();
      } catch {}
      if (!isRunningRef.current || currentRunIdRef.current !== id) return;
      const nextAttempt = sseRetryCountRef.current + 1;
      if (nextAttempt > MAX_SSE_RETRIES) {
        pushLog("❌ SSE retry limit reached. Detaching run.");
        setIsRunning(false);
        setRunId((curr) => (s(curr) === s(id) ? "" : curr));
        setProgress((p) => ({
          ...p,
          status: "error",
          message: "SSE disconnected (retry limit reached)",
        }));
        return;
      }
      sseRetryCountRef.current = nextAttempt;
      const waitMs = Math.min(10000, 1000 * Math.pow(1.6, nextAttempt - 1));
      setProgress((p) => ({ ...p, message: "SSE reconnecting…" }));
      sseRetryTimerRef.current = setTimeout(() => {
        void attachToActiveRun(id);
      }, waitMs);
    };
  }

  async function openDetail(stateName: string) {
    setOpenState(stateName);
    setDetail(null);
    setDetailErr("");
    setTabSitemapSubmitting("");
    setTabSitemapStatus(null);
    setTabSitemapReports({});
    setTabSitemapShowDetails({});
    setTabSitemapRunOpen(false);
    setTabSitemapRunAction("inspect");
    setTabSitemapRunItems([]);
    setTabSitemapRunDone(false);
    setCountyFilter("all");
    setDetailSearch("");
    setDetailTab("counties");
    setDetailLoading(true);

    try {
      const endpoint = routeTenantId
        ? `/api/sheet/state?name=${encodeURIComponent(stateName)}&tenantId=${encodeURIComponent(routeTenantId)}`
        : `/api/sheet/state?name=${encodeURIComponent(stateName)}`;
      const res = await fetch(endpoint, {
        cache: "no-store",
      });
      const data = (await safeJson(res)) as StateDetailResponse | any;
      if (!res.ok || data?.error)
        throw new Error(data?.error || `HTTP ${res.status}`);
      setDetail(data);
    } catch (e: any) {
      setDetailErr(e?.message || "Failed to load state detail");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setOpenState("");
    setDetail(null);
    setDetailErr("");
    setTabSitemapSubmitting("");
    setTabSitemapStatus(null);
    setTabSitemapReports({});
    setTabSitemapShowDetails({});
    setTabSitemapRunOpen(false);
    setTabSitemapRunAction("inspect");
    setTabSitemapRunItems([]);
    setTabSitemapRunDone(false);
  }

  function openActivationHelper(opts: {
    title: string;
    domainToPaste: string;
    activationUrl: string;
    isActive: boolean;
    accountName?: string;
    timezone?: string;
    sitemapUrl?: string;
    locId?: string;
    kind?: "counties" | "cities";
  }) {
    setActTitle(opts.title);
    setActDomainToPaste(opts.domainToPaste);
    setActActivationUrl(opts.activationUrl);
    setActIsActive(opts.isActive);

    setActAccountName(s(opts.accountName));
    setActTimezone(s(opts.timezone));

    setActSitemapUrl(s(opts.sitemapUrl));
    setActSitemapVerify(null);
    setActSitemapChecking(false);
    setActIndexing(false);
    setActIndexResult(null);
    setActChecklistTab("domain");

    setActWebsiteUrl(toUrlMaybe(opts.domainToPaste));

    setActCopied(false);
    setRobotsCopied(false);

    setActHeaders(null);
    setActHeadersErr("");
    setActHeadersTab("favicon");
    setActHeadersCopied(false);

    const lid = s(opts.locId);
    setActLocId(lid);
    setActKind((opts.kind as any) || "");
    setActMarking(false);
    setActMarkErr("");
    setActMarkDone(false);
    setActDnsReady(false);
    setActDnsChecking(false);
    setActCvMsg("");
    setActCvErr("");
    setActCvApplying(false);

    if (lid) loadHeadersForLocation(lid);
    void refreshActivationDnsStatus(opts.domainToPaste);

    setActOpen(true);
  }

  async function verifySitemap() {
    const sitemapUrl = s(actSitemapUrl);
    if (!sitemapUrl) {
      setActSitemapVerify({
        ok: false,
        error: "Missing sitemap URL.",
      });
      return;
    }

    const expectedDomain = s(actDomainToPaste);
    setActSitemapChecking(true);
    setActSitemapVerify(null);

    try {
      const qs = new URLSearchParams();
      qs.set("url", sitemapUrl);
      if (expectedDomain) qs.set("expectedDomain", expectedDomain);

      const res = await fetch(`/api/tools/sitemap-verify?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = (await safeJson(res)) as SitemapVerifyResponse | null;
      if (!data || !res.ok || !data.ok) {
        setActSitemapVerify({
          ok: false,
          error: data?.error || `HTTP ${res.status}`,
        });
        return;
      }
      setActSitemapVerify(data);
    } catch (e: any) {
      setActSitemapVerify({
        ok: false,
        error: e?.message || "Failed to verify sitemap.",
      });
    } finally {
      setActSitemapChecking(false);
    }
  }

  async function submitGoogleIndex() {
    const domainUrl = s(toUrlMaybe(s(actWebsiteUrl) || s(actDomainToPaste)));
    if (!domainUrl) {
      setActIndexResult({
        ok: false,
        target: "google",
        error: "Missing domain URL.",
      });
      return;
    }
    setActIndexing(true);
    setActIndexResult(null);
    try {
      const res = await fetch("/api/tools/index-submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: routeTenantId || "",
          target: "google",
          domainUrl,
          mode: "inspect",
        }),
      });
      const data = (await safeJson(res)) as IndexSubmitResponse | null;
      if (!data || !res.ok || !data.ok) {
        setActIndexResult({
          ok: false,
          target: "google",
          error: data?.error || `HTTP ${res.status}`,
        });
        return;
      }
      setActIndexResult(data);
    } catch (e: any) {
      setActIndexResult({
        ok: false,
        target: "google",
        error: e?.message || "Index submit failed.",
      });
    } finally {
      setActIndexing(false);
    }
  }

  function getActiveRowsForTab(kind: "counties" | "cities"): any[] {
    if (!detail) return [];
    const rows =
      kind === "counties"
        ? (detail.counties.rows || [])
        : (detail.cities.rows || []);

    return rows.filter((r) => {
      const eligible = !!r.__eligible;
      const isActive = isTrue(r["Domain Created"]);
      const domainToPaste =
        kind === "cities"
          ? s(r["City Domain"]) || s(r["city domain"])
          : s(r["Domain"]) || s(r["County Domain"]);
      const locId = s(r["Location Id"]);
      return eligible && isActive && !!domainToPaste && !!locId;
    });
  }

  function getTabRowName(kind: "counties" | "cities", r: any) {
    return kind === "cities" ? s(r["City"]) || s(r["County"]) : s(r["County"]);
  }

  function getTabRowDomainUrl(kind: "counties" | "cities", r: any) {
    const domainToPaste =
      kind === "cities"
        ? s(r["City Domain"]) || s(r["city domain"])
        : s(r["Domain"]) || s(r["County Domain"]);
    return s(toUrlMaybe(domainToPaste));
  }

  async function runTabSitemaps(
    kind: "counties" | "cities",
    action: TabAction,
    rowsToRun: any[],
    mode: "all" | "retry",
  ) {
    const runKey = tabRunKey(kind, action);
    setTabSitemapSubmitting(runKey);
    setTabSitemapStatus(null);
    setTabSitemapRunKind(kind);
    setTabSitemapRunAction(action);
    setTabSitemapRunMode(mode);
    setTabSitemapRunDone(false);
    setTabSitemapRunStartedAt(new Date().toISOString());

    if (rowsToRun.length === 0) {
      setTabSitemapRunItems([]);
      setTabSitemapRunOpen(true);
      setTabSitemapRunDone(true);
      setTabSitemapStatus({
        kind,
        ok: false,
        message:
          mode === "retry"
            ? "No hay filas fallidas para reintentar."
            : "No hay filas activas con domain válido en este tab.",
      });
      setTabSitemapSubmitting("");
      return;
    }

    let okCount = 0;
    const items: TabSitemapResultItem[] = [];
    const runItemsSeed: TabSitemapRunItem[] = rowsToRun.map((r) => {
      const rowName = getTabRowName(kind, r) || "row";
      const domainUrl = getTabRowDomainUrl(kind, r);
      const key = `${kind}:${s(r["Location Id"])}:${rowName}:${domainUrl}`;
      return {
        key,
        rowName,
        domainUrl,
        status: "pending",
      };
    });
    setTabSitemapRunItems(runItemsSeed);
    setTabSitemapRunOpen(true);

    const updateRunItem = (
      key: string,
      status: TabSitemapRunItem["status"],
      error?: string,
    ) => {
      setTabSitemapRunItems((prev) =>
        prev.map((it) =>
          it.key === key ? { ...it, status, error: error || undefined } : it,
        ),
      );
    };

    for (const r of rowsToRun) {
      const domainUrl = getTabRowDomainUrl(kind, r);
      const rowName = getTabRowName(kind, r);
      const key = `${kind}:${s(r["Location Id"])}:${rowName}:${domainUrl}`;
      updateRunItem(key, "running");

      if (!domainUrl) {
        items.push({
          key,
          rowName: rowName || "row",
          domainUrl: "",
          ok: false,
          error: "missing domain URL",
        });
        updateRunItem(key, "failed", "missing domain URL");
        continue;
      }

      try {
        const isBingAction = action === "bing_indexnow";
        const endpoint = isBingAction
          ? "/api/tools/bing-indexnow-submit"
          : "/api/tools/index-submit";
        const payload = isBingAction
          ? {
              tenantId: routeTenantId || "",
              integrationKey: "default",
              domainUrl,
            }
          : {
              tenantId: routeTenantId || "",
              target: "google",
              domainUrl,
              mode: action,
            };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await safeJson(res);
        const submitted = !!(data as any)?.google?.discovery?.submitted;
        const actionOk =
          action === "discovery"
            ? submitted
            : action === "bing_indexnow"
              ? !!(data as any)?.ok
              : !!(data as any)?.ok;
        if (res.ok && data && actionOk) {
          okCount += 1;
          items.push({
            key,
            rowName: rowName || domainUrl,
            domainUrl,
            ok: true,
          });
          updateRunItem(key, "done");
        } else {
          const errMsg =
            (data as any)?.error ||
            (data as any)?.google?.error ||
            `HTTP ${res.status}`;
          items.push({
            key,
            rowName: rowName || domainUrl,
            domainUrl,
            ok: false,
            error: errMsg,
          });
          updateRunItem(key, "failed", errMsg);
        }
      } catch (e: any) {
        const errMsg = e?.message || "request failed";
        items.push({
          key,
          rowName: rowName || domainUrl,
          domainUrl,
          ok: false,
          error: errMsg,
        });
        updateRunItem(key, "failed", errMsg);
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const failCount = rowsToRun.length - okCount;
    const actionLabel =
      action === "inspect"
        ? "URL inspection"
        : action === "discovery"
          ? "Sitemap discovery"
          : "Bing IndexNow";
    setTabSitemapStatus({
      kind,
      ok: failCount === 0,
      message:
        failCount === 0
          ? `${actionLabel} completado para ${okCount}/${rowsToRun.length} ${kind}.`
          : `${actionLabel} completado ${okCount}/${rowsToRun.length}. Fallos: ${failCount}.`,
    });

    setTabSitemapReports((prev) => ({
      ...prev,
      [runKey]: {
        kind,
        action,
        total: rowsToRun.length,
        success: okCount,
        failed: failCount,
        mode,
        items,
        updatedAt: new Date().toISOString(),
      },
    }));

    setTabSitemapRunDone(true);
    setTabSitemapSubmitting("");
  }

  async function submitTabAction(
    kind: "counties" | "cities",
    action: TabAction,
  ) {
    await runTabSitemaps(kind, action, getActiveRowsForTab(kind), "all");
  }

  function domainBotUrlFromLocId(locId: string) {
    const id = s(locId);
    if (!id) return "";
    return `${DOMAIN_BOT_BASE_URL}/${encodeURIComponent(id)}/settings/domain`;
  }

  function openDomainBotByLocId(locId: string) {
    const url = domainBotUrlFromLocId(locId);
    if (!url) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: "Missing Location Id for Domain Bot.",
      });
      return;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setTabSitemapStatus({
      kind: detailTab,
      ok: true,
      message: `Domain Bot opened: ${locId}`,
    });
  }

  function openDomainBotFirst() {
    if (!firstDomainBotLocId) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: "No rows with Location Id in current filter.",
      });
      return;
    }
    openDomainBotByLocId(firstDomainBotLocId);
  }

  async function runDomainBotForLocId(locId: string) {
    const id = s(locId);
    if (!id) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: "Missing Location Id for Domain Bot.",
      });
      return;
    }
    setDomainBotBusy(true);
    setTabSitemapStatus({
      kind: detailTab,
      ok: true,
      message: `Starting Domain Bot for ${id}...`,
    });
    try {
      const res = await fetch("/api/tools/domain-bot-click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId: id, maxAttempts: 180, intervalMs: 700 }),
      });
      const data = (await safeJson(res)) as
        | { ok?: boolean; clicked?: string; attempts?: number; error?: string; lastResult?: string; url?: string }
        | null;
      if (!res.ok || !data?.ok) {
        const details = s(data?.lastResult);
        throw new Error(`${s(data?.error) || `HTTP ${res.status}`}${details ? ` | ${details}` : ""}`);
      }
      setTabSitemapStatus({
        kind: detailTab,
        ok: true,
        message: `Domain Bot OK (${id}) → clicked ${s(data.clicked)} in ${Number(data.attempts || 0)} attempts.`,
      });
    } catch (e: any) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: `Domain Bot failed (${id}): ${e?.message || "request failed"}`,
      });
    } finally {
      setDomainBotBusy(false);
    }
  }

  async function runDomainBotFirst() {
    if (!firstDomainBotLocId) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: "No rows with Location Id in current filter.",
      });
      return;
    }
    await runDomainBotForLocId(firstDomainBotLocId);
  }

  function buildDevasksDomainAutoClickScript() {
    return `(() => {
  const CONNECT_ID = "connect-domain-button";
  const CONNECT_FALLBACK_ID = "connect-domain-button-text";
  const MANAGE_ID = "manage-domain";
  const MAX_ATTEMPTS = 60;
  const INTERVAL_MS = 500;

  const clickPreferred = () => {
    const connect =
      document.querySelector("button#connect-domain-button") ||
      document.querySelector("button[data-testid='connect-domain-button']") ||
      document.querySelector("button[aria-label='Connect a domain']") ||
      document.getElementById(CONNECT_ID);
    if (connect && typeof connect.click === "function") {
      connect.click();
      console.log("[DomainBot] clicked #connect-domain-button");
      return true;
    }
    const connectFallback = document.getElementById(CONNECT_FALLBACK_ID)?.closest("button") || document.getElementById(CONNECT_FALLBACK_ID);
    if (connectFallback && typeof connectFallback.click === "function") {
      connectFallback.click();
      console.log("[DomainBot] clicked #connect-domain-button-text");
      return true;
    }
    const manage = document.getElementById(MANAGE_ID);
    if (manage && typeof manage.click === "function") {
      manage.click();
      console.log("[DomainBot] clicked #manage-domain");
      return true;
    }
    return false;
  };

  if (clickPreferred()) return;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (clickPreferred() || attempts >= MAX_ATTEMPTS) {
      clearInterval(timer);
      if (attempts >= MAX_ATTEMPTS) {
        console.warn("[DomainBot] No matching button found after retries.");
      }
    }
  }, INTERVAL_MS);
})();`;
  }

  async function copyDomainBotAutoClickScript() {
    try {
      await navigator.clipboard.writeText(buildDevasksDomainAutoClickScript());
      setTabSitemapStatus({
        kind: detailTab,
        ok: true,
        message:
          "Auto-click script copied. Paste it in Devasks console on the opened domain page.",
      });
    } catch (e: any) {
      setTabSitemapStatus({
        kind: detailTab,
        ok: false,
        message: e?.message || "Unable to copy auto-click script.",
      });
    }
  }

  async function openDomainBotFirstAndCopyScript() {
    openDomainBotFirst();
    await copyDomainBotAutoClickScript();
  }

  async function retryFailedTabSitemaps(
    kind: "counties" | "cities",
    action: TabAction,
  ) {
    const runKey = tabRunKey(kind, action);
    const last = tabSitemapReports[runKey];
    if (!last) {
      setTabSitemapStatus({
        kind,
        ok: false,
        message: "No hay ejecución previa para reintentar.",
      });
      return;
    }
    const failedSet = new Set(last.items.filter((it) => !it.ok).map((it) => it.key));
    if (failedSet.size === 0) {
      setTabSitemapStatus({
        kind,
        ok: true,
        message: "No hay fallos pendientes.",
      });
      return;
    }
    const rowsToRetry = getActiveRowsForTab(kind).filter((r) => {
      const rowName = getTabRowName(kind, r);
      const domainUrl = getTabRowDomainUrl(kind, r);
      const key = `${kind}:${s(r["Location Id"])}:${rowName}:${domainUrl}`;
      return failedSet.has(key);
    });
    await runTabSitemaps(kind, action, rowsToRetry, "retry");
  }

  function closeActivationHelper() {
    setActOpen(false);
    setActCopied(false);
    setRobotsCopied(false);
    setActHeadersCopied(false);
    setActCelebrateOn(false);
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }

    setActLocId("");
    setActKind("counties");
    setActMarking(false);
    setActMarkErr("");
    setActMarkDone(false);
    setActCvMsg("");
    setActCvErr("");
    setActCvApplying(false);
  }

  async function copyDomain() {
    try {
      await navigator.clipboard.writeText(actDomainToPaste);
      setActCopied(true);
      setTimeout(() => setActCopied(false), 1300);
    } catch {}
  }

  async function copyRobots() {
    try {
      const txt = buildRobotsTxt(actSitemapUrl);
      await navigator.clipboard.writeText(txt);
      setRobotsCopied(true);
      setTimeout(() => setRobotsCopied(false), 1300);
    } catch {}
  }

  const headersCopyLabel = useMemo(() => {
    if (actHeadersTab === "head") return "Copy Head";
    if (actHeadersTab === "footer") return "Copy Footer";
    return "Copy Favicon";
  }, [actHeadersTab]);

  async function copyHeadersActive() {
    try {
      const txt =
        actHeadersTab === "head"
          ? s(actHeaders?.head)
          : actHeadersTab === "footer"
            ? s(actHeaders?.footer)
            : s(actHeaders?.favicon);

      await navigator.clipboard.writeText(txt);
      setActHeadersCopied(true);
      setTimeout(() => setActHeadersCopied(false), 1300);
    } catch {}
  }

  const robotsTxt = useMemo(
    () => buildRobotsTxt(actSitemapUrl),
    [actSitemapUrl],
  );

  const runCards = useMemo(() => {
    return activeRuns.map((r) => {
      const p = r.progress || null;
      const pct =
        p && p.pct !== null && Number.isFinite(Number(p.pct))
          ? Math.round(clamp01(Number(p.pct)) * 100)
          : 0;
      const doneLabel = p
        ? p.totalAll > 0
          ? `${p.doneAll}/${p.totalAll}`
          : `${p.doneAll}`
        : "—";
      const countiesLabel = p
        ? p.totalCounties > 0
          ? `${p.doneCounties}/${p.totalCounties}`
          : `${p.doneCounties}`
        : "—";
      const citiesLabel = p
        ? p.totalCities > 0
          ? `${p.doneCities}/${p.totalCities}`
          : `${p.doneCities}`
        : "—";
      const status = r.finished
        ? r.exitCode === 0
          ? "done"
          : "error"
        : r.stopped
          ? "stopped"
          : "running";
      const stateLabel = s(r.meta?.state) || "all";
      return {
        ...r,
        pct,
        doneLabel,
        countiesLabel,
        citiesLabel,
        status,
        isRunning: status === "running",
        stateLabel,
        eta:
          p && p.etaSec !== null
            ? formatDuration(Math.max(0, Number(p.etaSec || 0)))
            : "—",
        elapsed: formatDuration(
          Math.max(0, Math.floor((Date.now() - Number(r.createdAt || 0)) / 1000)),
        ),
        message:
          s(p?.lastMessage) || s(r.lastLine) || (status === "running" ? "Running…" : "Idle"),
      };
    });
  }, [activeRuns]);

  const filteredRunCards = useMemo(() => {
    const term = s(runCardSearch).toLowerCase();
    return runCards.filter((r) => {
      const statusOk =
        runCardStatusFilter === "all" ? true : r.status === runCardStatusFilter;
      if (!statusOk) return false;
      if (!term) return true;
      const haystack = [
        s(r.id),
        s(r.meta?.job),
        s(r.stateLabel),
        s(r.message),
        s(r.meta?.locId),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [runCards, runCardSearch, runCardStatusFilter]);

  const tenantCustomValuesPageSize = 20;
  const tenantCustomValuesFiltered = useMemo(() => {
    const q = s(tenantCustomValuesSearch).toLowerCase();
    const indexed = tenantCustomValues.map((row, originalIndex) => ({
      row,
      originalIndex,
    }));
    if (!q) return indexed;
    return indexed.filter(({ row }) => s(row.keyName).toLowerCase().includes(q));
  }, [tenantCustomValues, tenantCustomValuesSearch]);
  const tenantCustomValuesPages = Math.max(
    1,
    Math.ceil(tenantCustomValuesFiltered.length / tenantCustomValuesPageSize),
  );
  const tenantCustomValuesPageSafe = Math.min(
    tenantCustomValuesPages,
    Math.max(1, tenantCustomValuesPage),
  );
  const tenantCustomValuesPagedRows = useMemo(() => {
    const start = (tenantCustomValuesPageSafe - 1) * tenantCustomValuesPageSize;
    return tenantCustomValuesFiltered.slice(start, start + tenantCustomValuesPageSize);
  }, [tenantCustomValuesFiltered, tenantCustomValuesPageSafe]);

  const runSummary = useMemo(() => {
    const out = { total: runCards.length, running: 0, done: 0, error: 0, stopped: 0 };
    for (const r of runCards) {
      if (r.status === "running") out.running += 1;
      else if (r.status === "done") out.done += 1;
      else if (r.status === "error") out.error += 1;
      else if (r.status === "stopped") out.stopped += 1;
    }
    return out;
  }, [runCards]);

  const gscHealth = oauthHealthRows.find(
    (r) =>
      s(r.provider).toLowerCase() === "google_search_console" &&
      s(r.integrationKey).toLowerCase() === s(gscIntegrationKey || "default").toLowerCase(),
  );
  const adsHealth = oauthHealthRows.find(
    (r) =>
      s(r.provider).toLowerCase() === "google_ads" &&
      s(r.integrationKey).toLowerCase() === s(adsIntegrationKey || "default").toLowerCase(),
  );
  const ghlHealth = oauthHealthRows.find(
    (r) =>
      (s(r.provider).toLowerCase() === "ghl" || s(r.provider).toLowerCase() === "custom") &&
      s(r.integrationKey).toLowerCase() === s(ghlIntegrationKey || "owner").toLowerCase(),
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          {tenantLogoUrl ? (
            <img
              className="logo tenantLogo"
              src={tenantLogoUrl}
              alt={tenantSummary?.name ? `${tenantSummary.name} logo` : "Tenant logo"}
            />
          ) : (
            <div className="logo" />
          )}
          <div>
            <h1>
              {tenantSummary?.name || "Project"} — Delta Control Tower
            </h1>
            <div className="subtle">
              {tenantSummary?.slug
                ? `@${tenantSummary.slug}`
                : routeTenantId
                  ? `tenant ${routeTenantId}`
                  : "tenant pending"}
            </div>
          </div>
        </div>

        <div className="topbarActions">
          <Link className="smallBtn" href="/">
            Agency View
          </Link>
          <Link
            className="smallBtn"
            href={
              routeTenantId
                ? `/dashboard?tenantId=${encodeURIComponent(routeTenantId)}&integrationKey=owner`
                : "/dashboard"
            }
          >
            Dashboard - Reports
          </Link>
          <Link
            className="smallBtn"
            href={
              routeTenantId
                ? `/dashboard/prospecting?tenantId=${encodeURIComponent(routeTenantId)}&integrationKey=owner`
                : "/dashboard/prospecting"
            }
          >
            Dashboard - Prospecting
          </Link>
        </div>
        <div className="pills">
          <div className="pill">
            <span className="dot" />
            <span>Live</span>
          </div>
          <div className="pill">
            <span style={{ color: "var(--muted)" }}>Created by</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Axel Castro</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Devasks</span>
          </div>
        </div>
      </header>

      <section className="agencySubnav" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "details" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("details")}
        >
          Project Details
        </button>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "runner" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("runner")}
        >
          Runs Center
        </button>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "sheet" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("sheet")}
        >
          Sheet Explorer
        </button>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "activation" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("activation")}
        >
          Activation
        </button>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "webhooks" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("webhooks")}
        >
          Webhooks
        </button>
        <button
          type="button"
          className={`agencySubnavItem ${activeProjectTab === "logs" ? "agencySubnavItemActive" : ""}`}
          onClick={() => jumpTo("logs")}
        >
          Logs
        </button>
      </section>

      {activeProjectTab === "details" ? (
      <section className="card" style={{ marginTop: 12 }} ref={detailsRef}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Project Details</h2>
            <div className="cardSubtitle">
              Tenant overview + integrations bound to this project.
            </div>
          </div>
          <div className="cardHeaderActions">
            {tenantSaveMsg ? <span className="badge">{tenantSaveMsg}</span> : null}
            {tenantStateSeedMsg ? <span className="badge">{tenantStateSeedMsg}</span> : null}
            <button
              className="smallBtn"
              onClick={() => void seedTenantStateFiles()}
              disabled={tenantStateSeedLoading}
              title="Seed template state files from resources/statesFiles into tenant DB (with tenant root domain)."
            >
              {tenantStateSeedLoading ? "Seeding..." : "Seed State Files to DB"}
            </button>
            <button className="smallBtn" onClick={saveTenantDetails} disabled={tenantSaving}>
              {tenantSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          {tenantDetailErr ? (
            <div className="mini" style={{ color: "var(--danger)", marginBottom: 10 }}>
              ❌ {tenantDetailErr}
            </div>
          ) : null}

          <div className="detailsTabs">
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "business" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("business")}
            >
              Business Profile
            </button>
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "ghl" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("ghl")}
            >
              GHL + Cloudflare
            </button>
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "integrations" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("integrations")}
            >
              Integrations
            </button>
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "custom_values" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("custom_values")}
            >
              Custom Values
            </button>
          </div>

          {detailsTab === "business" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">Business Profile</div>
                <div className="detailsPaneSub">Core identity, owner profile and branding.</div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Project name</label>
                  <input className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Slug</label>
                  <input className="input" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
                </div>
                <div className="field">
                  <label>Status</label>
                  <select className="select" value={tenantStatus} onChange={(e) => setTenantStatus(e.target.value === "disabled" ? "disabled" : "active")}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="field">
                  <label>Root domain</label>
                  <input className="input" value={tenantRootDomain} onChange={(e) => setTenantRootDomain(e.target.value)} />
                </div>
                <div className="field">
                  <label>Timezone</label>
                  <input className="input" value={tenantTimezone} onChange={(e) => setTenantTimezone(e.target.value)} />
                </div>
                <div className="field">
                  <label>Locale</label>
                  <input className="input" value={tenantLocale} onChange={(e) => setTenantLocale(e.target.value)} />
                </div>
                <div className="field">
                  <label>Currency</label>
                  <input className="input" value={tenantCurrency} onChange={(e) => setTenantCurrency(e.target.value)} />
                </div>
                <div className="field">
                  <label>Logo URL</label>
                  <input className="input" value={tenantLogoUrl} onChange={(e) => setTenantLogoUrl(e.target.value)} />
                </div>
                <div className="field">
                  <label>Owner first name</label>
                  <input className="input" value={tenantOwnerFirstName} onChange={(e) => setTenantOwnerFirstName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Owner last name</label>
                  <input className="input" value={tenantOwnerLastName} onChange={(e) => setTenantOwnerLastName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Owner email</label>
                  <input className="input" value={tenantOwnerEmail} onChange={(e) => setTenantOwnerEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label>Owner phone</label>
                  <input className="input" value={tenantOwnerPhone} onChange={(e) => setTenantOwnerPhone(e.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {detailsTab === "ghl" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">GHL + Cloudflare Setup</div>
                <div className="detailsPaneSub">Tenant-level DNS and owner account linkage used by activation flows.</div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Owner Location ID</label>
                  <input className="input" value={tenantOwnerLocationId} onChange={(e) => setTenantOwnerLocationId(e.target.value)} />
                </div>
                <div className="field">
                  <label>Company ID (GHL)</label>
                  <input className="input" value={tenantCompanyId} onChange={(e) => setTenantCompanyId(e.target.value)} />
                </div>
                <div className="field">
                  <label>Cloudflare CNAME target</label>
                  <input
                    className="input"
                    value={tenantCloudflareCnameTarget}
                    onChange={(e) => setTenantCloudflareCnameTarget(e.target.value)}
                    placeholder="sites.ludicrous.cloud"
                  />
                </div>
                <div className="field">
                  <label>Cloudflare API token</label>
                  <input
                    className="input"
                    type="password"
                    value={tenantCloudflareApiToken}
                    onChange={(e) => setTenantCloudflareApiToken(e.target.value)}
                    placeholder={
                      tenantCloudflareHasToken
                        ? "Token saved. Enter a new token only if you want to rotate it."
                        : "cf_api_token..."
                    }
                  />
                </div>
                <div className="field">
                  <label>Ads Alerts Enabled</label>
                  <select
                    className="select"
                    value={tenantAdsAlertsEnabled ? "enabled" : "disabled"}
                    onChange={(e) => setTenantAdsAlertsEnabled(e.target.value === "enabled")}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="field">
                  <label>Enable SMS signal to GHL</label>
                  <select
                    className="select"
                    value={tenantAdsAlertSmsEnabled ? "enabled" : "disabled"}
                    onChange={(e) => setTenantAdsAlertSmsEnabled(e.target.value === "enabled")}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="enabled">Enabled</option>
                  </select>
                </div>
              </div>

            </div>
          ) : null}

          {detailsTab === "integrations" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">Integrations</div>
                <div className="detailsPaneSub">OAuth and provider connections. These credentials can be shared across tenants from Agency View.</div>
              </div>

              {routeTenantId ? (
                <div className="detailsIntegrationsActions">
                  <button
                    type="button"
                    className="smallBtn"
                    onClick={openOAuthManager}
                  >
                    Open OAuth Integration Manager
                  </button>
                </div>
              ) : null}

              <div className="detailsCustomTop" style={{ marginTop: 8 }}>
                <div className="detailsPaneHeader" style={{ marginBottom: 8 }}>
                  <div className="detailsPaneTitle">Bing (Tenant)</div>
                  <div className="detailsPaneSub">
                    One Bing connection per tenant. Dashboard uses Webmaster key; Bing Counties/Cities use IndexNow key.
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Bing Webmaster API Key</label>
                    <input
                      className="input"
                      type="password"
                      value={tenantBingWebmasterApiKey}
                      onChange={(e) => setTenantBingWebmasterApiKey(e.target.value)}
                      placeholder="Bing Webmaster API key"
                    />
                  </div>
                  <div className="field">
                    <label>Bing Webmaster Site URL</label>
                    <input
                      className="input"
                      value={tenantBingWebmasterSiteUrl}
                      onChange={(e) => setTenantBingWebmasterSiteUrl(e.target.value)}
                      placeholder="https://mydripnurse.com"
                    />
                  </div>
                  <div className="field">
                    <label>IndexNow Key</label>
                    <input
                      className="input"
                      type="password"
                      value={tenantBingIndexNowKey}
                      onChange={(e) => setTenantBingIndexNowKey(e.target.value)}
                      placeholder="IndexNow key"
                    />
                  </div>
                  <div className="field">
                    <label>IndexNow Key Location (optional)</label>
                    <input
                      className="input"
                      value={tenantBingIndexNowKeyLocation}
                      onChange={(e) => setTenantBingIndexNowKeyLocation(e.target.value)}
                      placeholder="https://mydripnurse.com/{key}.txt"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {tenantBingMsg ? <span className="badge">{tenantBingMsg}</span> : null}
                  <button
                    type="button"
                    className="smallBtn"
                    disabled={!routeTenantId || tenantBingSaving}
                    onClick={() => void saveTenantBingIntegration()}
                  >
                    {tenantBingSaving ? "Saving..." : "Save Bing Config"}
                  </button>
                </div>
              </div>

              <div className="detailsCustomTop" style={{ marginTop: 12 }}>
                <div className="detailsPaneHeader" style={{ marginBottom: 8 }}>
                  <div className="detailsPaneTitle">Google Places (Tenant)</div>
                  <div className="detailsPaneSub">
                    API key used by Prospecting discovery runs to search businesses in Google Places.
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Google Places API Key</label>
                    <input
                      className="input"
                      type="password"
                      value={tenantGooglePlacesApiKey}
                      onChange={(e) => setTenantGooglePlacesApiKey(e.target.value)}
                      placeholder="AIza..."
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {tenantGooglePlacesMsg ? <span className="badge">{tenantGooglePlacesMsg}</span> : null}
                  <button
                    type="button"
                    className="smallBtn"
                    disabled={!routeTenantId || tenantGooglePlacesSaving}
                    onClick={() => void saveTenantGooglePlacesIntegration()}
                  >
                    {tenantGooglePlacesSaving ? "Saving..." : "Save Google Places Config"}
                  </button>
                </div>
              </div>

              <div className="tableWrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Provider</th>
                      <th className="th">Key</th>
                      <th className="th">Status</th>
                      <th className="th">External Account</th>
                      <th className="th">Auth</th>
                      <th className="th">Last Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantIntegrations.length === 0 ? (
                      <tr>
                        <td className="td" colSpan={6}>
                          <span className="mini">No integrations found.</span>
                        </td>
                      </tr>
                    ) : (
                      tenantIntegrations.map((it) => (
                        <tr key={it.id} className="tr">
                          <td className="td">{s(it.provider) || "—"}</td>
                          <td className="td">{s(it.integration_key || it.integrationKey) || "—"}</td>
                          <td className="td">{s(it.status) || "—"}</td>
                          <td className="td">{s(it.external_account_id || it.externalAccountId) || "—"}</td>
                          <td className="td">{s(it.auth_type || it.authType) || "—"}</td>
                          <td className="td">{s(it.last_error || it.lastError) || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {detailsTab === "custom_values" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">Custom Values Template</div>
                <div className="detailsPaneSub">Snapshot from Snapshot Location ID. Edit values in DB and apply to child subaccounts.</div>
              </div>

              <div className="detailsCustomTop">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div className="field">
                    <label>Snapshot Location ID (Custom Values Source)</label>
                    <input
                      className="input"
                      value={tenantSnapshotLocationId}
                      onChange={(e) => setTenantSnapshotLocationId(e.target.value)}
                      placeholder="Location ID used for Custom Values sync"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <div className="mini">
                    Dynamic fields (`Business - County Domain`, `Business - County Name`, `Business ID`, `County Name And State`, `Website Url`) are managed automatically per county/city.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {tenantCustomValuesMsg ? <span className="badge">{tenantCustomValuesMsg}</span> : null}
                    <button
                      type="button"
                      className="smallBtn"
                      disabled={!routeTenantId || tenantCustomValuesSnapshotBusy}
                      onClick={() => void snapshotOwnerCustomValuesTemplate()}
                      title="Sync custom value names from Snapshot Location ID."
                    >
                      {tenantCustomValuesSnapshotBusy ? "Syncing..." : "Sync from Snapshot Location"}
                    </button>
                    <button
                      type="button"
                      className="smallBtn"
                      disabled={
                        !routeTenantId ||
                        tenantCustomValuesSaving ||
                        tenantCustomValuesLoading ||
                        tenantCustomValues.length === 0
                      }
                      onClick={() => void saveTenantCustomValuesTemplate()}
                      title="Save edited template in DB."
                    >
                      {tenantCustomValuesSaving ? "Saving..." : "Save Custom Values"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ maxWidth: 360 }}
                    value={tenantCustomValuesSearch}
                    onChange={(e) => {
                      setTenantCustomValuesSearch(e.target.value);
                      setTenantCustomValuesPage(1);
                    }}
                    placeholder="Search custom values..."
                  />
                  <span className="badge">{tenantCustomValuesFiltered.length} results</span>
                </div>
              </div>

              <div className="tableWrap detailsCustomTableWrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Active</th>
                      <th className="th">Name</th>
                      <th className="th">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantCustomValuesLoading ? (
                      <tr>
                        <td className="td" colSpan={3}>
                          <span className="mini">Loading custom values template...</span>
                        </td>
                      </tr>
                    ) : tenantCustomValuesFiltered.length === 0 ? (
                      <tr>
                        <td className="td" colSpan={3}>
                          <span className="mini">
                            {tenantCustomValues.length === 0
                              ? <>No rows found. Use <b>Sync from Snapshot Location</b> first.</>
                              : <>No matches found for current search.</>}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      tenantCustomValuesPagedRows.map(({ row, originalIndex }) => {
                        return (
                        <tr key={`${row.id || row.keyName || "row"}:${originalIndex}`} className="tr">
                          <td className="td" style={{ width: 110 }}>
                            <input
                              type="checkbox"
                              checked={row.isActive !== false}
                              onChange={(e) =>
                                updateTenantCustomValueAt(originalIndex, { isActive: e.target.checked })
                              }
                            />
                          </td>
                          <td className="td" style={{ minWidth: 260 }}>
                            <input className="input" value={row.keyName} readOnly />
                          </td>
                          <td className="td" style={{ minWidth: 320 }}>
                            <input
                              className="input"
                              value={row.keyValue}
                              onChange={(e) =>
                                updateTenantCustomValueAt(originalIndex, { keyValue: e.target.value })
                              }
                              placeholder="Leave empty to skip this key on apply."
                            />
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {tenantCustomValuesFiltered.length > tenantCustomValuesPageSize ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <div className="mini">
                      Showing{" "}
                      {Math.min(
                        tenantCustomValuesFiltered.length,
                        (tenantCustomValuesPageSafe - 1) * tenantCustomValuesPageSize + 1,
                      )}{" "}
                      to{" "}
                      {Math.min(
                        tenantCustomValuesFiltered.length,
                        tenantCustomValuesPageSafe * tenantCustomValuesPageSize,
                      )}{" "}
                      of {tenantCustomValuesFiltered.length}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="smallBtn"
                        disabled={tenantCustomValuesPageSafe <= 1}
                        onClick={() => setTenantCustomValuesPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </button>
                      <span className="badge">
                        Page {tenantCustomValuesPageSafe} / {tenantCustomValuesPages}
                      </span>
                      <button
                        type="button"
                        className="smallBtn"
                        disabled={tenantCustomValuesPageSafe >= tenantCustomValuesPages}
                        onClick={() =>
                          setTenantCustomValuesPage((p) =>
                            Math.min(tenantCustomValuesPages, p + 1),
                          )
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeProjectTab === "runner" ? (
      <section className="card runCenterCard" ref={runnerRef} style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Runs Center</h2>
            <div className="cardSubtitle">
              Ejecuta y monitorea jobs por tenant con progreso individual, ETA y control por run.
            </div>
          </div>
          <div className="cardHeaderActions">
            <div className="badge">{runId ? `attached: ${runId}` : "no attachment"}</div>
            <button className="smallBtn" onClick={loadActiveRuns}>
              Refresh runs
            </button>
          </div>
        </div>

        <div className="cardBody">
          <div className="row">
            <div className="field">
              <label>Job</label>
              <select
                className="select"
                value={job}
                onChange={(e) => setJob(e.target.value)}
              >
                {JOBS.map((j) => (
                  <option key={j.key} value={j.key}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>State</label>
              <select
                className="select"
                value={stateOut}
                onChange={(e) => setStateOut(e.target.value)}
                disabled={isOneLocJob}
                title={
                  isOneLocJob
                    ? "Single-location job does not require state"
                    : ""
                }
              >
                <option value="all">ALL</option>
                {statesOut.map((s0) => (
                  <option key={s0} value={s0}>
                    {formatStateLabel(s0)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Mode</label>
              <select
                className="select"
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
              >
                <option value="dry">Dry Run</option>
                <option value="live">Live Run</option>
              </select>
            </div>

            <div className="field">
              <label>Debug</label>
              <select
                className="select"
                value={debug ? "on" : "off"}
                onChange={(e) => setDebug(e.target.value === "on")}
              >
                <option value="on">ON</option>
                <option value="off">OFF</option>
              </select>
            </div>
          </div>

          {isOneLocJob ? (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="field" style={{ flex: 2 }}>
                <label>Location Id (locId)</label>
                <input
                  className="input"
                  placeholder="e.g. 2rYTkmtMkwdUQLNCdCfB"
                  value={runLocId}
                  onChange={(e) => setRunLocId(e.target.value)}
                />
              </div>

              <div className="field" style={{ maxWidth: 220 }}>
                <label>Kind</label>
                <select
                  className="select"
                  value={runKind}
                  onChange={(e) => setRunKind(e.target.value as any)}
                  title="Optional"
                >
                  <option value="">auto</option>
                  <option value="counties">counties</option>
                  <option value="cities">cities</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="actions">
            <button className="btn btnPrimary" onClick={() => run()} title="Run">
              Run
            </button>
            <button
              className="btn btnDanger"
              onClick={stop}
              disabled={!runId}
              title={!runId ? "No active runId" : "Stop"}
            >
              Stop attached
            </button>
            <div className="mini" style={{ alignSelf: "center" }}>
              Job: <b>{selectedJob?.label}</b>{" "}
              {isOneLocJob ? (
                <>• locId: <b>{runLocId || "—"}</b></>
              ) : (
                <>• State: <b>{stateOut === "all" ? "ALL" : formatStateLabel(stateOut)}</b></>
              )}{" "}
              • Mode: <b>{mode}</b>
            </div>
          </div>

          <div className="runCenterSummary">
            <span className="badge">Total: {runSummary.total}</span>
            <span className="badge">Running: {runSummary.running}</span>
            <span className="badge">Done: {runSummary.done}</span>
            <span className="badge">Stopped: {runSummary.stopped}</span>
            <span className="badge">Error: {runSummary.error}</span>
          </div>

          <div className="runCenterFilters">
            <input
              className="input"
              placeholder="Search runId, job, state, message, locId..."
              value={runCardSearch}
              onChange={(e) => setRunCardSearch(e.target.value)}
            />
            <select
              className="select"
              value={runCardStatusFilter}
              onChange={(e) =>
                setRunCardStatusFilter(
                  e.target.value as "all" | "running" | "done" | "error" | "stopped",
                )
              }
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="done">Done</option>
              <option value="stopped">Stopped</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="runCardsGrid" style={{ marginTop: 10 }}>
            {filteredRunCards.length === 0 ? (
              <div className="mini">No runs for current filter.</div>
            ) : (
              filteredRunCards.map((r) => (
                <article
                  key={r.id}
                  className={`runCard runCardStatus${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`}
                >
                  <div className="runCardHead">
                    <div className="runCardTitle">
                      <b>{s(r.meta?.job) || "run"}</b>
                      <span className="mini">state: {formatStateLabel(r.stateLabel) || "ALL"}</span>
                      <span className="mini">runId: {r.id}</span>
                    </div>
                    <span className="badge">{r.pct}%</span>
                  </div>

                  <div className="runCardMeta mini">
                    <span>Done: <b>{r.doneLabel}</b></span>
                    <span>ETA: <b>{r.eta}</b></span>
                    <span>Elapsed: <b>{r.elapsed}</b></span>
                    <span>Counties: <b>{r.countiesLabel}</b></span>
                    <span>Cities: <b>{r.citiesLabel}</b></span>
                  </div>

                  <div className="runCardMsg mini">{r.message}</div>

                  <div className="runCardBar" aria-hidden>
                    <div
                      className="runCardBarFill"
                      style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                    />
                  </div>

                  <div className="runCardActions">
                    <button
                      type="button"
                      className="smallBtn"
                      onClick={() => attachToActiveRun(r.id)}
                    >
                      Attach
                    </button>
                    {!r.finished ? (
                      <button
                        type="button"
                        className="smallBtn"
                        onClick={async () => {
                          await fetch(`/api/stop/${r.id}`, { method: "POST" });
                          pushLog(`🛑 Stop requested for ${r.id}`);
                          loadActiveRuns();
                        }}
                      >
                        Stop
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
      ) : null}

      {/* Sheet Explorer */}
      {activeProjectTab === "sheet" || activeProjectTab === "activation" ? (
      <section className="card sheetExplorerCard" style={{ marginTop: 14 }} ref={sheetRef}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Sheet Explorer</h2>
            <div className="cardSubtitle">
              Estados + progreso de Counties/Cities desde Google Sheets.
            </div>
          </div>

          <div className="sheetExplorerHeadTools">
            <input
              className="input sheetExplorerSearch"
              placeholder="Search state (e.g., Alabama, Florida...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="badge">{filteredSheetStates.length} shown</div>
          </div>
        </div>

        <div className="cardBody">
          {!sheet ? (
            <div className="mini">
              {sheetLoading ? "Loading sheet overview..." : "No data loaded."}
            </div>
          ) : (
            <div className="tableWrap tableWrapTall sheetExplorerTableWrap">
              <table className="table sheetExplorerTable">
                <thead>
                  <tr>
                    <th className="th">State</th>
                    <th className="th">Counties</th>
                    <th className="th">County Domains Activated</th>
                    <th className="th">Cities</th>
                    <th className="th">City Domains Activated</th>
                    <th className="th">Ready %</th>
                    <th className="th" style={{ width: 120 }} />
                  </tr>
                </thead>

                <tbody>
                  {filteredSheetStates.map((r) => {
                    const cTotal = r.counties.total || 0;
                    const ciTotal = r.cities.total || 0;

                    const totalRows = cTotal + ciTotal;

                    const readyDone =
                      (r.counties.ready || 0) + (r.cities.ready || 0);
                    const domainDone =
                      (r.counties.domainsActive || 0) +
                      (r.cities.domainsActive || 0);

                    const denom = totalRows > 0 ? totalRows * 2 : 0;
                    const overall = denom
                      ? (readyDone + domainDone) / denom
                      : 0;

                    const pillClass =
                      domainDone === 0
                        ? "pillOff"
                        : overall >= 0.85
                          ? "pillOk"
                          : overall >= 0.55
                            ? "pillWarn"
                            : "pillOff";

                    const rowClass =
                      domainDone === 0
                        ? "stateRow stateRowPending"
                        : overall >= 0.9
                          ? "stateRow stateRowActive"
                          : overall >= 0.4
                            ? "stateRow stateRowProgress"
                            : "stateRow stateRowPending";

                    return (
                      <tr key={r.state} className={`tr ${rowClass}`}>
                        <td className="td">
                          <b>{r.state}</b>
                        </td>

                        <td className="td">
                          <span className={pillClass}>
                            {r.counties.ready}/{r.counties.total} ready
                          </span>
                        </td>

                        <td className="td">
                          <span className={pillClass}>
                            {r.counties.domainsActive || 0}/{r.counties.total}{" "}
                            active
                          </span>
                        </td>

                        <td className="td">
                          <span className={pillClass}>
                            {r.cities.ready}/{r.cities.total} ready
                          </span>
                        </td>

                        <td className="td">
                          <span className={pillClass}>
                            {r.cities.domainsActive || 0}/{r.cities.total}{" "}
                            active
                          </span>
                        </td>

                        <td className="td">
                          <span className={pillClass}>
                            {Math.round(overall * 100)}%
                          </span>
                        </td>

                        <td className="td" style={{ textAlign: "right" }}>
                          <button
                            className="smallBtn"
                            onClick={() => openDetail(r.state)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mini" style={{ marginTop: 10 }}>
            Phase 4+: View → detalle del estado + Domain Activation helper.
          </div>
        </div>
      </section>
      ) : null}

      {/* Logs */}
      {activeProjectTab === "webhooks" ? (
        <section className="card" style={{ marginTop: 12 }} ref={webhooksRef}>
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Webhooks</h2>
              <div className="cardSubtitle">
                Configure and test tenant webhook endpoints.
              </div>
            </div>
          </div>
          <div className="cardBody">
            <div className="agencyFormPanel agencyWebhookPanel">
              <h4>GHL Webhook Ads Notification</h4>
              <div className="agencyWizardGrid agencyWizardGridTwo">
                <label className="agencyField agencyFieldFull">
                  <span className="agencyFieldLabel">Webhook URL</span>
                  <input
                    className="input"
                    value={tenantAdsAlertWebhookUrl}
                    onChange={(e) => setTenantAdsAlertWebhookUrl(e.target.value)}
                    placeholder="https://services.leadconnectorhq.com/hooks/..."
                  />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Ads Alerts Enabled</span>
                  <select
                    className="input"
                    value={tenantAdsAlertsEnabled ? "enabled" : "disabled"}
                    onChange={(e) => setTenantAdsAlertsEnabled(e.target.value === "enabled")}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Enable SMS signal to GHL</span>
                  <select
                    className="input"
                    value={tenantAdsAlertSmsEnabled ? "enabled" : "disabled"}
                    onChange={(e) => setTenantAdsAlertSmsEnabled(e.target.value === "enabled")}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="enabled">Enabled</option>
                  </select>
                </label>
              </div>
              {tenantProspectingWebhookErr ? <div className="errorText">{tenantProspectingWebhookErr}</div> : null}
              {tenantProspectingWebhookOk ? <div className="okText">{tenantProspectingWebhookOk}</div> : null}
              <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btnGhost agencyActionPrimary"
                  disabled={tenantProspectingWebhookBusy}
                  onClick={() => void saveTenantAdsWebhookFromWebhooksTab()}
                >
                  {tenantProspectingWebhookBusy ? "Saving..." : "Save webhook settings"}
                </button>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={tenantAdsSampleBusy}
                  onClick={() => void sendProjectAdsWebhookSample()}
                >
                  {tenantAdsSampleBusy ? "Sending..." : "Send test webhook"}
                </button>
              </div>
              {tenantAdsSampleResult ? (
                <textarea
                  className="input agencyTextarea"
                  rows={8}
                  value={tenantAdsSampleResult}
                  readOnly
                  style={{ marginTop: 10 }}
                />
              ) : null}
            </div>

            <div className="agencyFormPanel agencyWebhookPanel" style={{ marginTop: 12 }}>
              <h4>Prospecting Review Webhook (Manual Approval Flow)</h4>
              <div className="agencyWizardGrid agencyWizardGridTwo">
                <label className="agencyField agencyFieldFull">
                  <span className="agencyFieldLabel">Webhook URL</span>
                  <input
                    className="input"
                    value={tenantProspectingWebhookUrl}
                    onChange={(e) => setTenantProspectingWebhookUrl(e.target.value)}
                    placeholder="https://hooks...."
                  />
                </label>
                <label className="agencyField">
                  <span className="agencyFieldLabel">Enabled</span>
                  <select
                    className="input"
                    value={tenantProspectingWebhookEnabled ? "enabled" : "disabled"}
                    onChange={(e) => setTenantProspectingWebhookEnabled(e.target.value === "enabled")}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
              <div className="agencyCreateActions agencyCreateActionsSpaced" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btnGhost agencyActionPrimary"
                  disabled={tenantProspectingWebhookBusy}
                  onClick={() => void saveTenantProspectingWebhookSettings()}
                >
                  {tenantProspectingWebhookBusy ? "Saving..." : "Save webhook settings"}
                </button>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={tenantProspectingWebhookTestBusy}
                  onClick={() => void sendProspectingWebhookTest()}
                >
                  {tenantProspectingWebhookTestBusy ? "Sending..." : "Send test webhook"}
                </button>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={tenantProspectingWebhookPushBusy}
                  onClick={() => void pushApprovedProspectsNow()}
                >
                  {tenantProspectingWebhookPushBusy ? "Pushing..." : "Push approved leads now"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Logs */}
      {activeProjectTab === "logs" ? (
      <section className="console" ref={logsRef}>
        <div className="consoleHeader">
          <div>
            <b>Logs</b> <span className="mini">(live)</span>
          </div>
          <div className="badge">{logs.length} lines</div>
        </div>

        <div className="consoleBody">
          {logs.length === 0 ? (
            <div className="mini">Run a job to see live output here.</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="logLine">
                {l}
              </div>
            ))
          )}
        </div>
      </section>
      ) : null}

      {/* Drawer: State Detail */}
      {openState && (
        <>
          <div className="drawerBackdrop" onClick={closeDetail} />
          <div className="drawer">
            <div className="drawerHeader">
              <div className="drawerHeaderMain">
                <div className="badge">STATE</div>
                <h2 style={{ marginTop: 6, marginBottom: 0 }}>{openState}</h2>

                <div className="mini" style={{ marginTop: 6 }}>
                  {detail?.tabs ? (
                    <>
                      Tabs: <b>{detail.tabs.counties}</b> /{" "}
                      <b>{detail.tabs.cities}</b>
                    </>
                  ) : (
                    <>Loading…</>
                  )}
                </div>

                <div className="tabs">
                  <button
                    className={`tabBtn ${detailTab === "counties" ? "tabBtnActive" : ""}`}
                    onClick={() => setDetailTab("counties")}
                  >
                    Counties
                  </button>
                  <button
                    className={`tabBtn ${detailTab === "cities" ? "tabBtnActive" : ""}`}
                    onClick={() => setDetailTab("cities")}
                  >
                    Cities
                  </button>
                </div>
                <div className="tabs" style={{ marginTop: 8 }}>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("counties", "inspect")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Run URL Inspection para todos los counties activos."
                  >
                    {tabSitemapSubmitting === tabRunKey("counties", "inspect")
                      ? "Inspect Counties..."
                      : "Inspect Counties"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("cities", "inspect")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Run URL Inspection para todas las cities activas."
                  >
                    {tabSitemapSubmitting === tabRunKey("cities", "inspect")
                      ? "Inspect Cities..."
                      : "Inspect Cities"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("counties", "discovery")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Enviar sitemap.xml a Google Search Console para todos los counties activos."
                  >
                    {tabSitemapSubmitting === tabRunKey("counties", "discovery")
                      ? "Sitemap Counties..."
                      : "Sitemap Counties"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("cities", "discovery")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Enviar sitemap.xml a Google Search Console para todas las cities activas."
                  >
                    {tabSitemapSubmitting === tabRunKey("cities", "discovery")
                      ? "Sitemap Cities..."
                      : "Sitemap Cities"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("counties", "bing_indexnow")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Enviar URL principal a Bing IndexNow para todos los counties activos."
                  >
                    {tabSitemapSubmitting === tabRunKey("counties", "bing_indexnow")
                      ? "Bing Counties..."
                      : "Bing Counties"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => submitTabAction("cities", "bing_indexnow")}
                    disabled={tabSitemapSubmitting !== ""}
                    title="Enviar URL principal a Bing IndexNow para todas las cities activas."
                  >
                    {tabSitemapSubmitting === tabRunKey("cities", "bing_indexnow")
                      ? "Bing Cities..."
                      : "Bing Cities"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() =>
                      retryFailedTabSitemaps(detailTab, tabSitemapRunAction)
                    }
                    disabled={
                      tabSitemapSubmitting !== "" ||
                      !tabSitemapReports[currentTabRunKey] ||
                      (tabSitemapReports[currentTabRunKey]?.failed || 0) === 0
                    }
                    title="Reintenta solo los fallidos del tab actual."
                  >
                    {tabSitemapSubmitting === currentTabRunKey
                      ? "Retry failed..."
                      : `Retry failed (${tabSitemapReports[currentTabRunKey]?.failed || 0})`}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() =>
                      setTabSitemapShowDetails((p) => ({
                        ...p,
                        [currentTabRunKey]: !p[currentTabRunKey],
                      }))
                    }
                    disabled={!currentTabSitemapReport}
                    title="Ver detalle de resultados por fila."
                  >
                    {tabSitemapShowDetails[currentTabRunKey]
                      ? "Hide details"
                      : "View details"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => void runDomainBotFirst()}
                    disabled={!firstDomainBotLocId || domainBotBusy}
                    title="One-click bot: abre Domain Settings y hace click connect/manage."
                  >
                    {domainBotBusy ? "Running Bot..." : "Run Domain Bot"}
                  </button>
                  <button
                    className="smallBtn"
                    onClick={() => void openDomainBotFirstAndCopyScript()}
                    disabled={!firstDomainBotLocId}
                    title="Abre el primer Domain Bot y copia script para auto-click connect/manage."
                  >
                    Open Bot + Copy AutoClick
                  </button>
                  <button
                    className="smallBtn"
                    onClick={copyDomainBotAutoClickScript}
                    title="Copia script que hace click en connect-domain-button-text o fallback manage-domain."
                  >
                    Copy AutoClick Script
                  </button>
                </div>
              </div>

              <div className="drawerHeaderActions">
                <button
                  className="smallBtn"
                  onClick={() => openDetail(openState)}
                  disabled={detailLoading}
                  type="button"
                >
                  {detailLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button className="smallBtn" onClick={closeDetail} type="button">
                  Close
                </button>
              </div>
            </div>

            <div className="drawerBody">
              {detailErr ? (
                <div className="mini" style={{ color: "var(--danger)" }}>
                  ❌ {detailErr}
                </div>
              ) : detailLoading && !detail ? (
                <div className="mini">Loading…</div>
              ) : !detail ? (
                <div className="mini">No detail loaded.</div>
              ) : (
                <>
                  <div className="kpiRow">
                    <div className="kpi">
                      <p className="n">{detail.counties.stats.eligible}</p>
                      <p className="l">Eligible counties</p>
                    </div>
                    <div className="kpi">
                      <p className="n">{detail.cities.stats.eligible}</p>
                      <p className="l">Eligible cities</p>
                    </div>
                    <div className="kpi">
                      <p className="n">
                        {(() => {
                          const eligible = detail.counties.stats.eligible || 0;
                          const active = (detail.counties.rows || []).filter(
                            (r) => !!r.__eligible && isTrue(r["Domain Created"]),
                          ).length;
                          if (!eligible) return "0%";
                          return `${Math.round((active / eligible) * 100)}%`;
                        })()}
                      </p>
                      <p className="l">County domains activated %</p>
                    </div>
                    <div className="kpi">
                      <p className="n">
                        {(() => {
                          const eligible = detail.cities.stats.eligible || 0;
                          const active = (detail.cities.rows || []).filter(
                            (r) => !!r.__eligible && isTrue(r["Domain Created"]),
                          ).length;
                          if (!eligible) return "0%";
                          return `${Math.round((active / eligible) * 100)}%`;
                        })()}
                      </p>
                      <p className="l">City domains activated %</p>
                    </div>
                  </div>

                  <div
                    className="detailFiltersRow"
                    style={{ marginTop: 14 }}
                  >
                    <div className="mini" style={{ minWidth: 110 }}>
                      Filter county
                    </div>

                    <select
                      className="select"
                      value={countyFilter}
                      onChange={(e) => setCountyFilter(e.target.value)}
                      style={{ maxWidth: 360 }}
                    >
                      <option value="all">ALL</option>
                      {(detailTab === "counties"
                        ? detail.counties.counties
                        : detail.cities.counties
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      </select>
                    <input
                      className="input detailSearchInput"
                      placeholder={
                        detailTab === "cities"
                          ? "Search county, city, location id..."
                          : "Search county, location id..."
                      }
                      value={detailSearch}
                      onChange={(e) => setDetailSearch(e.target.value)}
                    />
                  </div>

                  {tabSitemapStatus && (
                    <div
                      className="mini"
                      style={{
                        marginTop: 10,
                        color: tabSitemapStatus.ok
                          ? "var(--ok)"
                          : "var(--danger)",
                      }}
                    >
                      {tabSitemapStatus.ok ? "✅ " : "❌ "}
                      {tabSitemapStatus.kind === "counties"
                        ? "Counties:"
                        : "Cities:"}{" "}
                      {tabSitemapStatus.message}
                    </div>
                  )}

                  {currentTabSitemapReport &&
                    tabSitemapShowDetails[currentTabRunKey] && (
                    <div
                      className="card"
                      style={{
                        marginTop: 10,
                        borderColor: "rgba(255,255,255,0.14)",
                      }}
                    >
                      <div className="cardBody" style={{ padding: 10 }}>
                        <div
                          className="mini"
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            <b>{detailTab === "counties" ? "Counties" : "Cities"}</b>{" "}
                            {currentTabSitemapReport.action === "inspect"
                              ? "inspect"
                              : currentTabSitemapReport.action === "discovery"
                                ? "sitemap"
                                : "bing"}{" "}
                            run ({currentTabSitemapReport.mode}) •{" "}
                            {currentTabSitemapReport.success}/{currentTabSitemapReport.total} ok •{" "}
                            {currentTabSitemapReport.failed} failed
                          </span>
                          <span>
                            {new Date(currentTabSitemapReport.updatedAt).toLocaleString()}
                          </span>
                        </div>

                        <div
                          className="tableWrap tableScrollX"
                          style={{ marginTop: 8, maxHeight: 220 }}
                        >
                          <table className="table">
                            <thead>
                              <tr>
                                <th className="th">Status</th>
                                <th className="th">
                                  {detailTab === "counties" ? "County" : "City"}
                                </th>
                                <th className="th">Domain</th>
                                <th className="th">Error</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentTabSitemapReport.items.map((it) => (
                                <tr key={it.key} className="tr">
                                  <td
                                    className="td"
                                    style={{ color: it.ok ? "var(--ok)" : "var(--danger)" }}
                                  >
                                    {it.ok ? "OK" : "FAIL"}
                                  </td>
                                  <td className="td">{it.rowName || "—"}</td>
                                  <td className="td">
                                    <span className="mini">{it.domainUrl || "—"}</span>
                                  </td>
                                  <td className="td">
                                    <span className="mini">{it.error || "—"}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    className="tableWrap tableScrollX detailTableWrap"
                    style={{ marginTop: 12 }}
                  >
                    <table
                      className={`table detailDataTable ${detailTab === "cities" ? "tableWideCities" : ""}`}
                    >
                      <thead>
                        <tr>
                          <th className="th">Eligible</th>
                          <th className="th">Active</th>
                          <th className="th">Location Id</th>
                          <th className="th">County</th>
                          {detailTab === "cities" && (
                            <th className="th">City</th>
                          )}
                          <th className="th">Setup</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredDetailRows.map((r, i) => {
                            const eligible = !!r.__eligible;
                            const locId = s(r["Location Id"]);
                            const hasLocId = !!locId;
                            const county = s(r["County"]);
                            const city = s(r["City"]);

                            const domainCreated = isTrue(r["Domain Created"]);
                            const activationUrl = s(r["Domain URL Activation"]);

                            const domainToPaste =
                              detailTab === "cities"
                                ? s(r["City Domain"]) || s(r["city domain"])
                                : s(r["Domain"]) || s(r["County Domain"]);

                            const sitemap = s(r["Sitemap"]);

                            const title =
                              detailTab === "cities"
                                ? `${openState} • ${county || "County"} • ${city || "City"}`
                                : `${openState} • ${county || "County"}`;

                            const accountName = s(r["Account Name"]);
                            const timezone = s(r["Timezone"]);

                            const rowTone = domainCreated
                              ? "rowDomainActive"
                              : eligible
                                ? "rowDomainPending"
                                : "rowDomainIdle";

                            return (
                              <tr
                                key={i}
                                className={`tr ${eligible ? "rowEligible" : ""} ${rowTone}`}
                              >
                                <td className="td">{eligible ? "✅" : "—"}</td>

                                <td className="td">
                                  {domainCreated ? (
                                    <span className="pillOk">Active</span>
                                  ) : (
                                    <span className="pillOff">Pending</span>
                                  )}
                                </td>

                                <td className="td">
                                  <span className="mini">{locId || "—"}</span>
                                </td>

                                <td className="td">{county || "—"}</td>

                                {detailTab === "cities" && (
                                  <td className="td">{city || "—"}</td>
                                )}

                                <td className="td">
                                  {hasLocId ? (
                                    <div className="rowActions">
                                      <button
                                        className="smallBtn"
                                        onClick={() => void runDomainBotForLocId(locId)}
                                        title="Open Domain Settings bot page"
                                      >
                                        Bot
                                      </button>
                                      <button
                                        className="smallBtn"
                                        onClick={() =>
                                          openActivationHelper({
                                            title,
                                            domainToPaste,
                                            activationUrl,
                                            isActive: domainCreated,
                                            accountName,
                                            timezone,
                                            sitemapUrl: sitemap,
                                            locId,
                                            kind: detailTab, // ✅ kind carried
                                          })
                                        }
                                      >
                                        View
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="mini">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mini" style={{ marginTop: 10 }}>
                    Activation helper usa: <b>Domain URL Activation</b> + el
                    domain a pegar (<b>City Domain</b> o <b>Domain</b>).
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {oauthModalOpen && (
        <>
          <div className="modalBackdrop" onClick={closeOAuthManager} />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(1120px, calc(100vw - 24px))",
              height: "min(760px, calc(100vh - 24px))",
            }}
          >
            <div className="modalHeader modalHeaderPro">
              <div style={{ minWidth: 0 }}>
                <div className="badge">OAUTH INTEGRATION MANAGER</div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  Tenant OAuth Setup & Connect
                </h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  Configure OAuth credentials per tenant, persist in DB, then click Connect to generate tokens via callback.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {oauthHealthLoading ? <span className="badge">Health syncing...</span> : null}
                <button className="smallBtn" onClick={() => void loadOAuthHealth()} disabled={oauthSaving !== ""}>
                  Refresh Health
                </button>
                <button className="smallBtn" onClick={closeOAuthManager} disabled={oauthSaving !== ""}>
                  Close
                </button>
              </div>
            </div>

            <div className="modalBody modalBodyPro" style={{ padding: 14, overflowY: "auto" }}>
              {oauthErr ? (
                <div className="mini" style={{ color: "var(--danger)", marginBottom: 10 }}>
                  ❌ {oauthErr}
                </div>
              ) : null}
              {oauthMsg ? (
                <div className="mini" style={{ color: "var(--ok)", marginBottom: 10 }}>
                  ✅ {oauthMsg}
                </div>
              ) : null}

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <section className="card">
                  <div className="cardHeader">
                    <div>
                      <h4 className="cardTitle">Google Search Console / Analytics OAuth</h4>
                      <div className="cardSubtitle">One OAuth integration can power GSC and GA sync for this tenant.</div>
                    </div>
                    <div className="badge">{s(gscHealth?.status) || "not_saved"}</div>
                  </div>
                  <div className="cardBody">
                    <div className="row">
                      <div className="field">
                        <label>GSC Site URL (property)</label>
                        <input className="input" placeholder="https://example.com/" value={gscSiteUrl} onChange={(e) => setGscSiteUrl(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>GA4 Property ID</label>
                        <input className="input" placeholder="123456789" value={gscGa4PropertyId} onChange={(e) => setGscGa4PropertyId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Client ID</label>
                        <input className="input" value={gscClientId} onChange={(e) => setGscClientId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Client Secret</label>
                        <input className="input" value={gscClientSecret} onChange={(e) => setGscClientSecret(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Redirect URI</label>
                        <input className="input" value={gscRedirectUri} onChange={(e) => setGscRedirectUri(e.target.value)} />
                      </div>
                    </div>
                    <div className="mini" style={{ marginTop: 8 }}>
                      Token health: refresh={gscHealth?.hasRefreshToken ? "yes" : "no"} · expires in {fmtRelativeSeconds(gscHealth?.tokenExpiresInSec ?? null)}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="smallBtn" onClick={() => void saveOAuthConfig("gsc")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "gsc" ? "Saving..." : "Save Config"}
                      </button>
                      <button className="smallBtn smallBtnOn" onClick={() => void connectOAuth("gsc")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "gsc" ? "Connecting..." : "Save + Connect OAuth"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="cardHeader">
                    <div>
                      <h4 className="cardTitle">Google Ads OAuth</h4>
                      <div className="cardSubtitle">OAuth + developer token + customer IDs for tenant-scoped Ads API calls.</div>
                    </div>
                    <div className="badge">{s(adsHealth?.status) || "not_saved"}</div>
                  </div>
                  <div className="cardBody">
                    <div className="row">
                      <div className="field">
                        <label>Customer ID</label>
                        <input className="input" placeholder="123-456-7890" value={adsCustomerId} onChange={(e) => setAdsCustomerId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Login Customer ID (MCC)</label>
                        <input className="input" value={adsLoginCustomerId} onChange={(e) => setAdsLoginCustomerId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Developer Token</label>
                        <input className="input" value={adsDeveloperToken} onChange={(e) => setAdsDeveloperToken(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Client ID</label>
                        <input className="input" value={adsClientId} onChange={(e) => setAdsClientId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Client Secret</label>
                        <input className="input" value={adsClientSecret} onChange={(e) => setAdsClientSecret(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Redirect URI</label>
                        <input className="input" value={adsRedirectUri} onChange={(e) => setAdsRedirectUri(e.target.value)} />
                      </div>
                    </div>
                    <div className="mini" style={{ marginTop: 8 }}>
                      Token health: refresh={adsHealth?.hasRefreshToken ? "yes" : "no"} · expires in {fmtRelativeSeconds(adsHealth?.tokenExpiresInSec ?? null)}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="smallBtn" onClick={() => void saveOAuthConfig("ads")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "ads" ? "Saving..." : "Save Config"}
                      </button>
                      <button className="smallBtn smallBtnOn" onClick={() => void connectOAuth("ads")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "ads" ? "Connecting..." : "Save + Connect OAuth"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="cardHeader">
                    <div>
                      <h4 className="cardTitle">GoHighLevel OAuth (Owner)</h4>
                      <div className="cardSubtitle">Tenant owner integration. Tokens and refresh stay in DB and are reused by runner/APIs.</div>
                    </div>
                    <div className="badge">{s(ghlHealth?.status) || "not_saved"}</div>
                  </div>
                  <div className="cardBody">
                    <div className="row">
                      <div className="field">
                        <label>OAuth Client ID</label>
                        <input className="input" value={ghlClientId} onChange={(e) => setGhlClientId(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Client Secret</label>
                        <input className="input" value={ghlClientSecret} onChange={(e) => setGhlClientSecret(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>OAuth Redirect URI</label>
                        <input className="input" value={ghlRedirectUri} onChange={(e) => setGhlRedirectUri(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>User Type</label>
                        <input className="input" placeholder="Location" value={ghlUserType} onChange={(e) => setGhlUserType(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Scopes (space/comma separated)</label>
                        <input className="input" value={ghlScopes} onChange={(e) => setGhlScopes(e.target.value)} />
                      </div>
                    </div>
                    <div className="mini" style={{ marginTop: 8 }}>
                      Token health: refresh={ghlHealth?.hasRefreshToken ? "yes" : "no"} · expires in {fmtRelativeSeconds(ghlHealth?.tokenExpiresInSec ?? null)}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="smallBtn" onClick={() => void saveOAuthConfig("ghl")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "ghl" ? "Saving..." : "Save Config"}
                      </button>
                      <button className="smallBtn smallBtnOn" onClick={() => void connectOAuth("ghl")} disabled={oauthSaving !== ""}>
                        {oauthSaving === "ghl" ? "Connecting..." : "Save + Connect OAuth"}
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <div className="tableWrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Provider</th>
                      <th className="th">Key</th>
                      <th className="th">Status</th>
                      <th className="th">Refresh Token</th>
                      <th className="th">Expires In</th>
                      <th className="th">Reconnect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oauthHealthRows.length === 0 ? (
                      <tr>
                        <td className="td" colSpan={6}>
                          <span className="mini">No health rows yet for this tenant.</span>
                        </td>
                      </tr>
                    ) : (
                      oauthHealthRows.map((row) => (
                        <tr key={row.id} className="tr">
                          <td className="td">{row.provider}</td>
                          <td className="td">{row.integrationKey}</td>
                          <td className="td">{row.status}</td>
                          <td className="td">{row.hasRefreshToken ? "yes" : "no"}</td>
                          <td className="td">{fmtRelativeSeconds(row.tokenExpiresInSec)}</td>
                          <td className="td">{row.reconnectRecommended ? "yes" : "no"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {tabSitemapRunOpen && (
        <>
          <div
            className="modalBackdrop"
            onClick={() => {
              if (!tabSitemapSubmitting) setTabSitemapRunOpen(false);
            }}
          />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(980px, calc(100vw - 24px))",
              height: "min(620px, calc(100vh - 24px))",
            }}
          >
            <div className="modalHeader">
              <div>
                <div className="badge">
                  {tabSitemapRunAction === "inspect"
                    ? "GOOGLE URL INSPECTION RUN"
                    : tabSitemapRunAction === "discovery"
                      ? "GOOGLE SITEMAP DISCOVERY RUN"
                      : "BING INDEXNOW RUN"}
                </div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  {openState} •{" "}
                  {tabSitemapRunKind === "counties" ? "Counties" : "Cities"} •{" "}
                  {tabSitemapRunAction === "inspect"
                    ? "URL Inspect"
                    : tabSitemapRunAction === "discovery"
                      ? "Sitemap Discovery"
                      : "Bing IndexNow"}{" "}
                  •{" "}
                  {tabSitemapRunMode === "retry" ? "Retry Failed" : "Full Run"}
                </h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  Started:{" "}
                  {tabSitemapRunStartedAt
                    ? new Date(tabSitemapRunStartedAt).toLocaleString()
                    : "—"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge">{tabSitemapRunCounts.pct}%</span>
                <span className="badge">
                  Done {tabSitemapRunCounts.done}/{tabSitemapRunCounts.total}
                </span>
                <span className="badge" style={{ color: "var(--danger)" }}>
                  Failed {tabSitemapRunCounts.failed}
                </span>
                <button
                  className="smallBtn"
                  onClick={() => setTabSitemapRunOpen(false)}
                  disabled={!!tabSitemapSubmitting}
                >
                  {tabSitemapSubmitting ? "Running..." : "Close"}
                </button>
              </div>
            </div>

            <div className="modalBody" style={{ padding: 14 }}>
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="cardBody" style={{ padding: 10 }}>
                  <div className="mini" style={{ marginBottom: 8 }}>
                    {tabSitemapRunDone ? "Run completed." : "Processing..."}
                  </div>
                  <div
                    className="progressWrap"
                    style={{
                      width: "100%",
                      height: 10,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      className="progressBar"
                      style={{
                        width: `${tabSitemapRunCounts.pct}%`,
                        height: "100%",
                        background:
                          "linear-gradient(90deg, rgba(96,165,250,0.95), rgba(74,222,128,0.92))",
                        transition: "width 180ms ease",
                      }}
                    />
                  </div>
                  <div
                    className="chips"
                    style={{ marginTop: 8, display: "flex", gap: 8 }}
                  >
                    <span className="badge">Pending {tabSitemapRunCounts.pending}</span>
                    <span className="badge">Running {tabSitemapRunCounts.running}</span>
                    <span className="badge" style={{ color: "var(--ok)" }}>
                      Done {tabSitemapRunCounts.done}
                    </span>
                    <span className="badge" style={{ color: "var(--danger)" }}>
                      Failed {tabSitemapRunCounts.failed}
                    </span>
                  </div>
                </div>
              </div>

              <div className="tableWrap tableScrollX" style={{ maxHeight: 390 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Status</th>
                      <th className="th">
                        {tabSitemapRunKind === "counties" ? "County" : "City"}
                      </th>
                      <th className="th">Domain</th>
                      <th className="th">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabSitemapRunItems.map((it) => (
                      <tr key={it.key} className="tr">
                        <td className="td">
                          {it.status === "done" && (
                            <span className="pillOk">Done</span>
                          )}
                          {it.status === "failed" && (
                            <span className="pillOff">Failed</span>
                          )}
                          {it.status === "running" && (
                            <span className="pillWarn">Running</span>
                          )}
                          {it.status === "pending" && (
                            <span className="badge">Pending</span>
                          )}
                        </td>
                        <td className="td">{it.rowName}</td>
                        <td className="td">
                          <span className="mini">{it.domainUrl || "—"}</span>
                        </td>
                        <td className="td">
                          <span className="mini">{it.error || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ✅ Activation Modal */}
      {actOpen && (
        <>
          <div className="modalBackdrop" onClick={closeActivationHelper} />

          <div className="modal" role="dialog" aria-modal="true">
            {/* Header */}
            <div className="modalHeader">
              <div style={{ minWidth: 0 }}>
                <div className="badge">DOMAIN ACTIVATION</div>

                <div className="modalTitleRow" style={{ marginTop: 8 }}>
                  <h3 className="modalTitle" style={{ margin: 0 }}>
                    {actTitle || "Domain Activation"}
                  </h3>

                  <div className="modalStatus">
                    {actIsActive ? (
                      <span className="pillOk">Active</span>
                    ) : (
                      <span className="pillOff">Pending</span>
                    )}
                  </div>
                </div>

                <div className="modalMeta">
                  <div className="metaItem">
                    <div className="metaLabel">GHL Subaccount</div>
                    <div className="metaValue">{actAccountName || "—"}</div>
                  </div>

                  <div className="metaItem">
                    <div className="metaLabel">Timezone</div>
                    <div className="metaValue">{actTimezone || "—"}</div>
                  </div>
                </div>

                {actMarkErr ? (
                  <div
                    className="mini"
                    style={{ color: "var(--danger)", marginTop: 8 }}
                  >
                    ❌ {actMarkErr}
                  </div>
                ) : null}
                {actCvErr ? (
                  <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>
                    ❌ {actCvErr}
                  </div>
                ) : null}
                {actCvMsg ? (
                  <div className="mini" style={{ color: "var(--ok)", marginTop: 8 }}>
                    ✅ {actCvMsg}
                  </div>
                ) : null}

              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  className={`smallBtn ${actMarkDone || actIsActive ? "smallBtnOn" : ""}`}
                  onClick={markDomainCreatedTrue}
                  disabled={!actLocId || actMarking || actIsActive || actDnsChecking || !actDnsReady}
                  title={
                    !actLocId
                      ? "Missing Location Id"
                      : actIsActive
                        ? "Already Active"
                        : actDnsChecking
                          ? "Checking Cloudflare DNS..."
                          : !actDnsReady
                            ? "Cloudflare CNAME is not active yet for this domain."
                        : `Set Domain Created = TRUE (${actKind})`
                  }
                  type="button"
                >
                  {actIsActive
                    ? "Complete ✅"
                    : actMarking
                      ? "Completing…"
                      : actMarkDone
                        ? "Completed ✅"
                        : "Complete"}
                </button>

                {/* ✅ NEW: Update Custom Values for this locId */}
                <button
                  className="smallBtn"
                  onClick={() => void applyCustomValuesForActivationLocation()}
                  disabled={!actLocId || actCvApplying}
                  title={
                    !actLocId
                      ? "Missing Location Id"
                      : "Update Custom Values in this subaccount from DB template"
                  }
                  type="button"
                >
                  {actCvApplying ? "Updating..." : "Update Custom Values"}
                </button>

                <button className="smallBtn" onClick={closeActivationHelper}>
                  Close
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="modalBody">
              <div className="modalGrid">
                {/* LEFT */}
                <div style={{ minWidth: 0 }}>
                  <div className="sectionTitle">DOMAIN TO PASTE</div>
                  <div className="sectionHint">
                    Click to copy (pégalo en GHL field{" "}
                    <span className="kbd">Domain</span>)
                  </div>

                  <div
                    className="copyField"
                    onClick={copyDomain}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="copyFieldTop">
                      <div className="copyValue">{actDomainToPaste || "—"}</div>
                      <div
                        className={`copyBadge ${actCopied ? "copyBadgeOn" : ""}`}
                      >
                        {actCopied ? "Copied" : "Copy"}
                      </div>
                    </div>
                    <div className="copyFieldSub">
                      Tip: si pega raro, haz click nuevamente (clipboard).
                    </div>
                  </div>

                  <div className="modalQuickActions">
                    <button className="btn btnPrimary" onClick={copyDomain}>
                      Copy Domain
                    </button>

                    <button
                      className="btn"
                      onClick={() => void openActivationWithDns()}
                      disabled={!actActivationUrl}
                      style={{
                        opacity: actActivationUrl ? 1 : 0.55,
                        pointerEvents: actActivationUrl ? "auto" : "none",
                      }}
                      type="button"
                    >
                      Open Activation
                    </button>

                    <a
                      className="btn"
                      href={actWebsiteUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        opacity: actWebsiteUrl ? 1 : 0.55,
                        pointerEvents: actWebsiteUrl ? "auto" : "none",
                      }}
                    >
                      Open Website
                    </a>
                  </div>

                  <div
                    className="mini"
                    style={{ marginTop: 12, lineHeight: 1.5 }}
                  >
                    Cuando completes el Checklist, presiona{" "}
                    <span className="kbd">Complete</span> (arriba) y luego{" "}
                    <span className="kbd">Update Custom Values</span>.
                  </div>
                </div>

                {/* RIGHT */}
                <div style={{ minWidth: 0 }}>
                  <div className="stepCard">
                    <div className="stepCardHeader stepCardHeaderTabs">
                      <div className="stepPill">Checklist</div>

                      <div className="stepTabs">
                        <button
                          className={`stepTab ${actChecklistTab === "domain" ? "stepTabOn" : ""}`}
                          onClick={() => setActChecklistTab("domain")}
                          type="button"
                        >
                          Domain
                        </button>

                        <button
                          className={`stepTab ${actChecklistTab === "sitemap" ? "stepTabOn" : ""}`}
                          onClick={() => setActChecklistTab("sitemap")}
                          type="button"
                        >
                          Sitemap
                        </button>

                        <button
                          className={`stepTab ${actChecklistTab === "robots" ? "stepTabOn" : ""}`}
                          onClick={() => setActChecklistTab("robots")}
                          type="button"
                        >
                          Robots.txt
                        </button>

                        <button
                          className={`stepTab ${actChecklistTab === "headers" ? "stepTabOn" : ""}`}
                          onClick={() => setActChecklistTab("headers")}
                          type="button"
                        >
                          Headers
                        </button>
                      </div>
                    </div>

                    {/* DOMAIN */}
                    {actChecklistTab === "domain" && (
                      <div style={{ padding: 12 }}>
                        <div className="sectionTitle">Domain</div>
                        <div className="sectionHint" style={{ marginTop: 6 }}>
                          Activa el dominio en GHL.
                        </div>

                        <ol className="stepsList">
                          <li>
                            Abre <span className="kbd">Open Activation</span>.
                          </li>
                          <li>
                            Pega el domain en el campo de{" "}
                            <span className="kbd">Domain</span>.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Continue</span>.
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">Add record manually</span>.
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">Verify records</span> y espera
                            propagación.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Website</span>.
                          </li>
                          <li>
                            En{" "}
                            <span className="kbd">
                              Link domain with website
                            </span>{" "}
                            selecciona <span className="kbd">County</span>.
                          </li>
                          <li>
                            En{" "}
                            <span className="kbd">
                              Select default step/page for Domain
                            </span>{" "}
                            selecciona <span className="kbd">** Home Page</span>
                            .
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">Proceed to finish</span>.
                          </li>
                          <li>Valida que el site responda.</li>
                        </ol>
                      </div>
                    )}

                    {/* SITEMAP */}
                    {actChecklistTab === "sitemap" && (
                      <div style={{ padding: 12 }}>
                        <div className="sectionTitle">Sitemap</div>
                        <div className="sectionHint" style={{ marginTop: 6 }}>
                          Genera el sitemap en GHL.
                        </div>

                        <div className="miniCardGrid" style={{ marginTop: 10 }}>
                          <div className="miniCard">
                            <div className="miniCardLabel">Sitemap URL</div>
                            <div className="miniCardValue">
                              {actSitemapUrl ? (
                                <a
                                  className="link"
                                  href={actSitemapUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {actSitemapUrl}
                                </a>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>

                          <div className="miniCard miniCardAction">
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <a
                                className="smallBtn"
                                href={actSitemapUrl || "#"}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  opacity: actSitemapUrl ? 1 : 0.55,
                                  pointerEvents: actSitemapUrl ? "auto" : "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                Open
                              </a>
                              <button
                                className="smallBtn"
                                type="button"
                                onClick={verifySitemap}
                                disabled={!actSitemapUrl || actSitemapChecking}
                                title="Verifica que el sitemap esté activo y que coincida con este dominio."
                              >
                                {actSitemapChecking ? "Checking..." : "Verify"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {actSitemapVerify ? (
                          (() => {
                            const status = Number(actSitemapVerify.responseStatus || 0);
                            const verified =
                              !!actSitemapVerify.ok &&
                              (status === 200 || status === 403) &&
                              actSitemapVerify.pathMatchesSitemap !== false &&
                              !!actSitemapVerify.matches;
                            return (
                          <div
                            className="mini"
                            style={{
                              marginTop: 10,
                              color: verified ? "var(--ok)" : "var(--danger)",
                            }}
                          >
                            {actSitemapVerify.ok ? (
                              <>
                                {verified ? "Verificado" : "No existe o no se"}
                                {actSitemapVerify.responseStatus
                                  ? ` • status: ${actSitemapVerify.responseStatus}`
                                  : ""}
                                {actSitemapVerify.expectedHost
                                  ? ` • expected: ${actSitemapVerify.expectedHost}`
                                  : ""}
                                {actSitemapVerify.responseHost
                                  ? ` • response: ${actSitemapVerify.responseHost}`
                                  : ""}
                              </>
                            ) : (
                              <>X {actSitemapVerify.error || "Sitemap verify failed"}</>
                            )}
                          </div>
                            );
                          })()
                        ) : null}

                        <ol className="stepsList" style={{ marginTop: 10 }}>
                          <li>
                            Haz click en <span className="kbd">Manage</span>.
                          </li>
                          <li>
                            Haz click en <span className="kbd">⋮</span>.
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">&lt;&gt; XML Sitemap</span>.
                          </li>
                          <li>
                            Abre County y marca el checkbox solamente en las
                            paginas que contengan{" "}
                            <span className="kbd">**</span> al principio.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Proceed</span>.
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">Generate & Save</span>.
                          </li>
                          <li>
                            Haz click en{" "}
                            <span className="kbd">Generate & Save</span>.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Okay</span>.
                          </li>
                          <li>
                            Valida el sitemap a traves del boton que dice{" "}
                            <span className="kbd">Open</span> en esta ventana.
                          </li>
                        </ol>
                      </div>
                    )}

                    {/* ROBOTS */}
                    {actChecklistTab === "robots" && (
                      <div style={{ padding: 12 }}>
                        <div className="robotsHeaderRow" style={{ padding: 0 }}>
                          <div>
                            <div className="sectionTitle">Robots.txt</div>
                            <div
                              className="sectionHint"
                              style={{ marginTop: 6 }}
                            >
                              Genera el file robots.txt
                            </div>
                          </div>

                          <button className="smallBtn" onClick={copyRobots}>
                            {robotsCopied ? "Copied" : "Copy Robots"}
                          </button>
                        </div>

                        <div className="robotsBox" style={{ marginTop: 12 }}>
                          <pre className="robotsPre">{robotsTxt}</pre>
                        </div>

                        <ol className="stepsList" style={{ marginTop: 10 }}>
                          <li>
                            Haz click en <span className="kbd">⋮</span>.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Edit</span>.
                          </li>
                          <li>
                            En <span className="kbd">Robots.txt code</span> haz
                            paste del codigo.
                          </li>
                          <li>
                            Haz click en <span className="kbd">Save</span>.
                          </li>
                          <li>
                            Valida en el browser que{" "}
                            <span className="kbd">/robots.txt</span> responda
                            200 OK.
                          </li>
                        </ol>
                      </div>
                    )}

                    {/* HEADERS */}
                    {actChecklistTab === "headers" && (
                      <div style={{ padding: 12 }}>
                        <div className="sectionTitle">Headers</div>
                        <div className="sectionHint" style={{ marginTop: 6 }}>
                          Head / Footer / Favicon (copiar y pegar en los
                          settings del website).
                        </div>

                        <div className="stepTabs" style={{ marginTop: 10 }}>
                          <button
                            className={`stepTab ${actHeadersTab === "favicon" ? "stepTabOn" : ""}`}
                            onClick={() => setActHeadersTab("favicon")}
                            type="button"
                          >
                            Favicon
                          </button>
                          <button
                            className={`stepTab ${actHeadersTab === "head" ? "stepTabOn" : ""}`}
                            onClick={() => setActHeadersTab("head")}
                            type="button"
                          >
                            Head
                          </button>
                          <button
                            className={`stepTab ${actHeadersTab === "footer" ? "stepTabOn" : ""}`}
                            onClick={() => setActHeadersTab("footer")}
                            type="button"
                          >
                            Body
                          </button>

                          <button
                            className={`smallBtn ${actHeadersCopied ? "smallBtnOn" : ""}`}
                            onClick={copyHeadersActive}
                            style={{ marginLeft: "auto" }}
                            type="button"
                            disabled={actHeadersLoading || !!actHeadersErr}
                            title={
                              actHeadersErr ? actHeadersErr : "Copy active tab"
                            }
                          >
                            {actHeadersCopied ? "Copied" : "Copy"}
                          </button>
                        </div>

                        {actHeadersLoading ? (
                          <div className="mini" style={{ marginTop: 12 }}>
                            Loading headers...
                          </div>
                        ) : actHeadersErr ? (
                          <div
                            className="mini"
                            style={{ marginTop: 12, color: "var(--danger)" }}
                          >
                            ❌ {actHeadersErr}
                          </div>
                        ) : (
                          <>
                            <div className="codeBox" style={{ marginTop: 12 }}>
                              <pre className="codePre">
                                {actHeadersTab === "head"
                                  ? s(actHeaders?.head)
                                  : actHeadersTab === "footer"
                                    ? s(actHeaders?.footer)
                                    : s(actHeaders?.favicon)}
                              </pre>
                            </div>
                            {/* <div
                              className="mini"
                              style={{ marginTop: 10, lineHeight: 1.5 }}
                            >
                              Fuente:{" "}
                              {actHeaders?.source?.row ? (
                                <>
                                  row <b>{actHeaders.source.row}</b>
                                </>
                              ) : (
                                "—"
                              )}
                            </div> */}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ✅ MAP MODAL */}
      {mapOpen && (
        <>
          <div className="mapBackdrop" onClick={closeMap} />
          <div className="mapModal" role="dialog" aria-modal="true">
            <div className="mapModalHeader">
              <div>
                <div className="badge">VISUALIZATION</div>
                <h3 className="mapModalTitle">US Progress Map</h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  Vista rápida por estado para priorizar producción y dominios
                  activos.
                </div>
              </div>

              <div className="mapModalActions">
                <div className="mapMetricTabs">
                  <button
                    className={`tabBtn ${mapMetric === "ready" ? "tabBtnActive" : ""}`}
                    onClick={() => setMapMetric("ready")}
                    type="button"
                  >
                    GHL Subaccounts Created
                  </button>
                  <button
                    className={`tabBtn ${mapMetric === "domains" ? "tabBtnActive" : ""}`}
                    onClick={() => setMapMetric("domains")}
                    type="button"
                  >
                    Domains Created
                  </button>
                </div>

                <button className="smallBtn" onClick={closeMap} type="button">
                  Close
                </button>
              </div>
            </div>

            <div className="mapModalBody">
              <div className="mapLayout">
                {/* Left */}
                <div className="mapPane">
                  <div className="mapFrame">
                    <UsaChoroplethProgressMap
                      rows={sheet?.states || []}
                      metric={mapMetric}
                      selectedState={mapSelected}
                      onPick={(name) =>
                        setMapSelected(String(name || "").trim())
                      }
                    />
                  </div>
                </div>

                {/* Right */}
                <aside className="mapSide">
                  <div className="mapSideCard">
                    <div className="mini" style={{ opacity: 0.8 }}>
                      Selection
                    </div>

                    {!selectedStateMetrics ? (
                      <div style={{ marginTop: 12 }} className="mini">
                        Click a state
                      </div>
                    ) : (
                      <>
                        <h4 style={{ marginTop: 8 }}>{mapSelected}</h4>

                        <div className="mapSideStats">
                          <div className="mapStat">
                            <div className="mapStatLabel">
                              GHL Subaccounts Created
                            </div>
                            <div className="mapStatValue">
                              {Math.round(selectedStateMetrics.readyPct * 100)}%
                            </div>
                            <div className="mini">
                              Counties {selectedStateMetrics.countiesReady}/
                              {selectedStateMetrics.countiesTotal} • Cities{" "}
                              {selectedStateMetrics.citiesReady}/
                              {selectedStateMetrics.citiesTotal}
                            </div>
                          </div>

                          <div className="mapStat">
                            <div className="mapStatLabel">Domains Created</div>
                            <div className="mapStatValue">
                              {Math.round(
                                selectedStateMetrics.domainsPct * 100,
                              )}
                              %
                            </div>
                            <div className="mini">
                              County domains{" "}
                              {selectedStateMetrics.countiesDomains} • City
                              domains {selectedStateMetrics.citiesDomains}
                            </div>
                          </div>
                        </div>

                        <div className="mapSideActions">
                          <button
                            className="smallBtn"
                            onClick={() => {
                              closeMap();
                              openDetail(mapSelected);
                            }}
                          >
                            Open State
                          </button>

                          <button
                            className="smallBtn"
                            onClick={() => setMapSelected("")}
                          >
                            Clear
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        key={actCelebrateKey}
        className={`modalCelebrate ${actCelebrateOn ? "isOn" : ""}`}
        aria-hidden="true"
      >
        <div className="modalCelebrateGlow" />
        <div className="modalCelebrateHeadlineWrap">
          <div className="modalCelebrateHeadline">
            <span className="modalCelebrateHeadlineTop">Yo soy de</span>
            <span className="modalCelebrateHeadlineMain">P FKN R</span>
          </div>
        </div>
        {celebrationParticles.map((p, idx) => (
          <span
            key={idx}
            className={`modalCelebrateParticle ${p.kind === "spark" ? "isSpark" : "isRocket"}`}
            style={
              {
                "--ox": `${p.originX}%`,
                "--tx": `${p.tx}px`,
                "--ty": `${p.ty}px`,
                "--sz": `${p.size}px`,
                "--delay": `${p.delay}s`,
                "--dur": `${p.duration}s`,
                "--h": `${p.hue}`,
                "--a": `${p.alpha}`,
                "--spin": `${p.spin}deg`,
              } as any
            }
          />
        ))}
      </div>
    </div>
  );
}
