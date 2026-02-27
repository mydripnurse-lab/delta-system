// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UsaChoroplethProgressMap from "@/components/UsaChoroplethProgressMap";
import PuertoRicoMunicipioProgressMap from "@/components/PuertoRicoMunicipioProgressMap";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

const JOBS = [
  { key: "run-delta-system", label: "Run Delta System" },
  { key: "build-state-sitemaps", label: "Create Sitemaps" },
];
const OAUTH_INTEGRATION_KEY = "default";
const DOMAIN_BOT_BASE_URL = "https://app.devasks.com/v2/location";
const DOMAIN_BOT_TIMEOUT_MIN_DEFAULT = 35;
const DOMAIN_BOT_TIMEOUT_MIN_MIN = 5;
const DOMAIN_BOT_TIMEOUT_MIN_MAX = 120;
const SEARCH_EMBEDDED_HOST = "search-embedded.telahagocrecer.com";
const SEARCH_BUILDER_FONT_OPTIONS = [
  { key: "lato", label: "Lato", family: "Lato", importUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" },
  { key: "inter", label: "Inter", family: "Inter", importUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" },
  { key: "poppins", label: "Poppins", family: "Poppins", importUrl: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" },
  { key: "montserrat", label: "Montserrat", family: "Montserrat", importUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" },
  { key: "oswald", label: "Oswald", family: "Oswald", importUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;700&display=swap" },
  { key: "raleway", label: "Raleway", family: "Raleway", importUrl: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&display=swap" },
  { key: "nunito", label: "Nunito", family: "Nunito", importUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" },
  { key: "dm_sans", label: "DM Sans", family: "DM Sans", importUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&display=swap" },
  { key: "plus_jakarta_sans", label: "Plus Jakarta Sans", family: "Plus Jakarta Sans", importUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" },
  { key: "manrope", label: "Manrope", family: "Manrope", importUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" },
  { key: "rubik", label: "Rubik", family: "Rubik", importUrl: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&display=swap" },
  { key: "merriweather", label: "Merriweather", family: "Merriweather", importUrl: "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&display=swap" },
] as const;

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

type AuthMeUser = {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  preferredLocale?: string | null;
  globalRoles?: string[];
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

type TenantProductServiceRow = {
  id?: string;
  serviceId: string;
  name: string;
  description: string;
  landingPath: string;
  formPath: string;
  bookingPath: string;
  cta: string;
  ctaSecondary: string;
  isActive: boolean;
};

type SearchBuilderProject = {
  id: string;
  name: string;
  companyName: string;
  buttonText: string;
  modalTitle: string;
  host: string;
  folder: string;
  pageSlug: string;
  query: string;
  buttonColor: string;
  headerColor: string;
  searchTitle: string;
  searchSubtitle: string;
  searchPlaceholder: string;
  defaultBookingPath: string;
  buttonPosition: "left" | "center" | "right";
  fontKey: string;
  buttonRadius: number;
  buttonPaddingY: number;
  buttonPaddingX: number;
  buttonFontSize: number;
  buttonFontWeight: number;
  buttonShadow: number;
  modalRadius: number;
  modalWidth: number;
  modalHeight: number;
  modalBackdropOpacity: number;
  modalHeaderHeight: number;
  inputRadius: number;
  previewTone?: "dark" | "light";
  updatedAt?: string;
};

type SearchBuilderManifest = {
  searchId: string;
  searchName?: string;
  folder: string;
  host: string;
  generatedAt: string;
  count: number;
  files: Array<{ serviceId: string; name: string; fileName: string; relativePath: string; blobPath?: string; url?: string }>;
};

type SeoCanvaIdeaRow = {
  keyword: string;
  stage: "unaware" | "problem_aware" | "solution_aware" | "product_aware" | "most_aware";
  stageLabel: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowTopBid: number;
  highTopBid: number;
};

type SeoCanvaUrlStrategyRow = {
  url: string;
  format:
    | "service_page"
    | "location_page"
    | "pricing_page"
    | "comparison_page"
    | "faq_page"
    | "how_to_page"
    | "template_page"
    | "alternatives_page"
    | "insights_page";
  traffic: number;
  value: number;
  keywords: number;
  topKeyword: string;
};

type SeoCanvaServiceResult = {
  serviceId: string;
  name: string;
  landingPath: string;
  seeds: string[];
  ideas: SeoCanvaIdeaRow[];
  board: Array<{
    stage: SeoCanvaIdeaRow["stage"];
    stageLabel: string;
    count: number;
    topKeywords: SeoCanvaIdeaRow[];
  }>;
  urlStrategyRows: SeoCanvaUrlStrategyRow[];
  howToUrls: SeoCanvaUrlStrategyRow[];
  error: string;
};

type SeoCanvaPayload = {
  generatedAt: string;
  rootDomain?: string;
  industryProfile?: "healthcare" | "legal" | "home_services" | "saas" | "ecommerce" | "generic";
  businessCategory?: string;
  services: SeoCanvaServiceResult[];
  boardSummary: Array<{
    stage: SeoCanvaIdeaRow["stage"];
    stageLabel: string;
    count: number;
  }>;
  urlStrategyRows?: SeoCanvaUrlStrategyRow[];
  formatMix?: Array<{ format: SeoCanvaUrlStrategyRow["format"]; count: number }>;
  planner: {
    ok: boolean;
    source: string;
    totalIdeas: number;
    mappedIdeas: number;
    services: number;
    errors?: string[];
  };
};

type TenantStateFileRow = {
  id: string;
  organization_id: string;
  state_slug: string;
  state_name: string;
  payload: Record<string, unknown>;
  root_domain: string | null;
  source: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
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

type ProjectTab = "runner" | "search_builder" | "sheet" | "activation" | "logs" | "details" | "webhooks";
const PROJECT_TAB_TO_SLUG: Record<ProjectTab, string> = {
  activation: "home",
  runner: "run-center",
  search_builder: "search-builder",
  sheet: "sheet-explorer",
  details: "project-details",
  webhooks: "webhooks",
  logs: "logs",
};
const PROJECT_SLUG_TO_TAB: Record<string, ProjectTab> = {
  home: "activation",
  "run-center": "runner",
  "search-builder": "search_builder",
  "sheet-explorer": "sheet",
  "project-details": "details",
  webhooks: "webhooks",
  logs: "logs",
};
type ProjectDetailsTab =
  | "business"
  | "ghl"
  | "integrations"
  | "custom_values"
  | "products_services"
  | "seo_canva"
  | "state_files";

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

function slugToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function kebabToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeRelativePath(input: string) {
  const raw = s(input);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function hostOnly(input: string) {
  const raw = s(input);
  if (!raw) return "";
  const noProto = raw.replace(/^https?:\/\//i, "");
  return noProto.split("/")[0].replace(/^www\./i, "").trim();
}

function escapeHtmlAttr(input: string) {
  return s(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileSlugFromService(input: string) {
  const base = kebabToken(input).replace(/-locations$/, "");
  return base ? `${base}-locations` : "locations";
}

function formatStateLabel(raw: string) {
  const cleaned = s(raw).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isPuertoRicoState(raw: string) {
  const v = s(raw).toLowerCase();
  return v === "pr" || v === "puerto rico";
}

function initialsFromLabel(label: string) {
  const cleaned = s(label).replace(/\s+/g, " ").trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
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

function pickTextFromObj(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = s(obj[key]);
    if (v) return v;
  }
  return "";
}

type StateGeoSearchRow = {
  state: string;
  county: string;
  city: string;
  countyIndex: number;
  cityIndex: number;
  cityPath: string;
};

function extractStateGeoRows(payload: Record<string, unknown> | null): StateGeoSearchRow[] {
  if (!payload) return [];
  const countiesRaw = payload.counties;
  const counties = Array.isArray(countiesRaw) ? countiesRaw : [];
  const stateName = pickTextFromObj(payload, ["stateName", "state", "name"]);
  const rows: StateGeoSearchRow[] = [];
  for (let i = 0; i < counties.length; i += 1) {
    const c0 = counties[i];
    if (!c0 || typeof c0 !== "object" || Array.isArray(c0)) continue;
    const countyObj = c0 as Record<string, unknown>;
    const countyName = pickTextFromObj(countyObj, ["countyName", "county", "name"]);
    const citiesRaw = countyObj.cities;
    const cities = Array.isArray(citiesRaw) ? citiesRaw : [];
    if (!cities.length) {
      rows.push({
        state: stateName,
        county: countyName,
        city: "",
        countyIndex: i,
        cityIndex: -1,
        cityPath: `counties[${i}]`,
      });
      continue;
    }
    for (let j = 0; j < cities.length; j += 1) {
      const city0 = cities[j];
      if (!city0 || typeof city0 !== "object" || Array.isArray(city0)) continue;
      const cityObj = city0 as Record<string, unknown>;
      const cityName = pickTextFromObj(cityObj, ["cityName", "city", "name"]);
      rows.push({
        state: stateName,
        county: countyName,
        city: cityName,
        countyIndex: i,
        cityIndex: j,
        cityPath: `counties[${i}].cities[${j}]`,
      });
    }
  }
  return rows;
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

type DomainBotRunItem = {
  key: string;
  locId: string;
  rowName: string;
  domainUrl: string;
  status: "pending" | "running" | "done" | "failed" | "stopped";
  error?: string;
};

type DomainBotFailureItem = {
  id: number;
  kind: "counties" | "cities";
  locId: string;
  rowName: string;
  domainUrl: string;
  activationUrl: string;
  failedStep: string;
  errorMessage: string;
  logs: string[];
  failCount: number;
  status: "open" | "resolved" | "ignored";
  lastSeenAt: string;
  updatedAt: string;
};

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
type RunFlowStepStatus = "pending" | "running" | "done" | "error";
type RunFlowStatus = {
  createDb: RunFlowStepStatus;
  createJson: RunFlowStepStatus;
  runDelta: RunFlowStepStatus;
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
  const params = useParams<{ id: string; tab?: string }>();
  const searchParams = useSearchParams();
  const routeTenantId = s(params?.id || "");
  const routeTabSlug = s(params?.tab || "").toLowerCase();
  const notificationHubHref = routeTenantId
    ? `/dashboard/notification-hub?tenantId=${encodeURIComponent(routeTenantId)}&integrationKey=owner`
    : "/dashboard/notification-hub";
  const [activeProjectTab, setActiveProjectTab] = useState<ProjectTab>("activation");
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
  const [stateFileSelectedSlug, setStateFileSelectedSlug] = useState("");
  const [stateFileLoading, setStateFileLoading] = useState(false);
  const [stateFileSaving, setStateFileSaving] = useState(false);
  const [stateFileMsg, setStateFileMsg] = useState("");
  const [stateFileErr, setStateFileErr] = useState("");
  const [stateFileStateName, setStateFileStateName] = useState("");
  const [stateFilePayloadText, setStateFilePayloadText] = useState("");
  const [stateFileMetaUpdatedAt, setStateFileMetaUpdatedAt] = useState("");
  const [stateFileMetaSource, setStateFileMetaSource] = useState("");
  const [stateFileSearchState, setStateFileSearchState] = useState("");
  const [stateFileSearchCounty, setStateFileSearchCounty] = useState("");
  const [stateFileSearchCity, setStateFileSearchCity] = useState("");

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
  const [tenantProductsServices, setTenantProductsServices] = useState<TenantProductServiceRow[]>([]);
  const [tenantProductsServicesLoading, setTenantProductsServicesLoading] = useState(false);
  const [tenantProductsServicesSaving, setTenantProductsServicesSaving] = useState(false);
  const [tenantProductsServicesMsg, setTenantProductsServicesMsg] = useState("");
  const [tenantProductsServicesSearch, setTenantProductsServicesSearch] = useState("");
  const [tenantProductsServicesPage, setTenantProductsServicesPage] = useState(1);
  const [seoCanvaLoading, setSeoCanvaLoading] = useState(false);
  const [seoCanvaMsg, setSeoCanvaMsg] = useState("");
  const [seoCanvaErr, setSeoCanvaErr] = useState("");
  const [seoCanvaData, setSeoCanvaData] = useState<SeoCanvaPayload | null>(null);
  const [seoCanvaExpandedServiceId, setSeoCanvaExpandedServiceId] = useState("");
  const [seoCanvaIndustryProfile, setSeoCanvaIndustryProfile] = useState<
    "healthcare" | "legal" | "home_services" | "saas" | "ecommerce" | "generic"
  >("healthcare");
  const [seoCanvaBusinessCategory, setSeoCanvaBusinessCategory] = useState("");
  const [seoCanvaQueueing, setSeoCanvaQueueing] = useState(false);
  const [tenantBingWebmasterApiKey, setTenantBingWebmasterApiKey] = useState("");
  const [tenantBingWebmasterSiteUrl, setTenantBingWebmasterSiteUrl] = useState("");
  const [tenantBingIndexNowKey, setTenantBingIndexNowKey] = useState("");
  const [tenantBingIndexNowKeyLocation, setTenantBingIndexNowKeyLocation] = useState("");
  const [tenantBingSaving, setTenantBingSaving] = useState(false);
  const [tenantBingMsg, setTenantBingMsg] = useState("");
  const [tenantGooglePlacesApiKey, setTenantGooglePlacesApiKey] = useState("");
  const [tenantGooglePlacesSaving, setTenantGooglePlacesSaving] = useState(false);
  const [tenantGooglePlacesMsg, setTenantGooglePlacesMsg] = useState("");
  const [authMe, setAuthMe] = useState<AuthMeUser | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [tenantProspectingWebhookUrl, setTenantProspectingWebhookUrl] = useState("");
  const [tenantProspectingWebhookEnabled, setTenantProspectingWebhookEnabled] = useState(true);
  const [tenantProspectingWebhookBusy, setTenantProspectingWebhookBusy] = useState(false);
  const [tenantProspectingWebhookTestBusy, setTenantProspectingWebhookTestBusy] = useState(false);
  const [tenantProspectingWebhookPushBusy, setTenantProspectingWebhookPushBusy] = useState(false);
  const [tenantProspectingWebhookErr, setTenantProspectingWebhookErr] = useState("");
  const [tenantProspectingWebhookOk, setTenantProspectingWebhookOk] = useState("");
  const [searchBuilderCompanyName, setSearchBuilderCompanyName] = useState("");
  const [searchBuilderButtonText, setSearchBuilderButtonText] = useState("Book An Appointment");
  const [searchBuilderModalTitle, setSearchBuilderModalTitle] = useState("Locations");
  const [searchBuilderHost, setSearchBuilderHost] = useState(SEARCH_EMBEDDED_HOST);
  const [searchBuilderFolder, setSearchBuilderFolder] = useState("company-search");
  const [searchBuilderPageSlug, setSearchBuilderPageSlug] = useState("mobile-iv-therapy-locations");
  const [searchBuilderQuery, setSearchBuilderQuery] = useState("embed=1");
  const [searchBuilderButtonPosition, setSearchBuilderButtonPosition] = useState<"left" | "center" | "right">("center");
  const [searchBuilderButtonColor, setSearchBuilderButtonColor] = useState("#044c5c");
  const [searchBuilderHeaderColor, setSearchBuilderHeaderColor] = useState("#a4d8e4");
  const [searchBuilderSearchTitle, setSearchBuilderSearchTitle] = useState("Choose your location");
  const [searchBuilderSearchSubtitle, setSearchBuilderSearchSubtitle] = useState("Search by State, County/Parish, or City. Then click Book Now.");
  const [searchBuilderSearchPlaceholder, setSearchBuilderSearchPlaceholder] = useState("Choose your City, State, or Country");
  const [searchBuilderDefaultBookingPath, setSearchBuilderDefaultBookingPath] = useState("/");
  const [searchBuilderFontKey, setSearchBuilderFontKey] = useState("lato");
  const [searchBuilderButtonRadius, setSearchBuilderButtonRadius] = useState(999);
  const [searchBuilderButtonPaddingY, setSearchBuilderButtonPaddingY] = useState(12);
  const [searchBuilderButtonPaddingX, setSearchBuilderButtonPaddingX] = useState(22);
  const [searchBuilderButtonFontSize, setSearchBuilderButtonFontSize] = useState(15);
  const [searchBuilderButtonFontWeight, setSearchBuilderButtonFontWeight] = useState(800);
  const [searchBuilderButtonShadow, setSearchBuilderButtonShadow] = useState(18);
  const [searchBuilderModalRadius, setSearchBuilderModalRadius] = useState(16);
  const [searchBuilderModalWidth, setSearchBuilderModalWidth] = useState(800);
  const [searchBuilderModalHeight, setSearchBuilderModalHeight] = useState(680);
  const [searchBuilderModalBackdropOpacity, setSearchBuilderModalBackdropOpacity] = useState(55);
  const [searchBuilderModalHeaderHeight, setSearchBuilderModalHeaderHeight] = useState(56);
  const [searchBuilderInputRadius, setSearchBuilderInputRadius] = useState(10);
  const [searchBuilderProjects, setSearchBuilderProjects] = useState<SearchBuilderProject[]>([]);
  const [searchBuilderProjectsLoading, setSearchBuilderProjectsLoading] = useState(false);
  const [searchBuilderActiveSearchId, setSearchBuilderActiveSearchId] = useState("");
  const [searchBuilderEditorOpen, setSearchBuilderEditorOpen] = useState(false);
  const [searchBuilderCreating, setSearchBuilderCreating] = useState(false);
  const [searchBuilderDeletingId, setSearchBuilderDeletingId] = useState("");
  const [searchBuilderName, setSearchBuilderName] = useState("");
  const [searchBuilderSelectedArtifactId, setSearchBuilderSelectedArtifactId] = useState("");
  const [searchBuilderSaving, setSearchBuilderSaving] = useState(false);
  const [searchBuilderPublishing, setSearchBuilderPublishing] = useState(false);
  const [searchBuilderMsg, setSearchBuilderMsg] = useState("");
  const [searchBuilderErr, setSearchBuilderErr] = useState("");
  const [searchBuilderLastPublish, setSearchBuilderLastPublish] = useState<SearchBuilderManifest | null>(null);
  const [searchBuilderShowEmbedPreview, setSearchBuilderShowEmbedPreview] = useState(false);
  const [searchBuilderCopiedArtifactId, setSearchBuilderCopiedArtifactId] = useState("");
  const [searchBuilderCopiedFileArtifactId, setSearchBuilderCopiedFileArtifactId] = useState("");
  const [searchBuilderCopiedFolderPath, setSearchBuilderCopiedFolderPath] = useState(false);
  const [searchBuilderEditorPanel, setSearchBuilderEditorPanel] = useState<"button" | "modal">("button");
  const [searchBuilderPreviewTone, setSearchBuilderPreviewTone] = useState<"dark" | "light">("dark");
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
  const sseLastEventIdRef = useRef(0);
  const MAX_SSE_RETRY_WAIT_MS = 20000;
  const [activeRuns, setActiveRuns] = useState<
    Array<{
      id: string;
      createdAt: number;
      updatedAt?: number;
      status?: string;
      meta?: {
        job?: string;
        state?: string;
        mode?: string;
        debug?: boolean;
        tenantId?: string;
        locId?: string;
        kind?: string;
        cmd?: string;
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
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [runHistoryRunId, setRunHistoryRunId] = useState("");
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [runHistoryLive, setRunHistoryLive] = useState(false);
  const [runHistoryErr, setRunHistoryErr] = useState("");
  const [allowParallelRuns, setAllowParallelRuns] = useState(false);
  const [runHistoryEvents, setRunHistoryEvents] = useState<
    Array<{ id: number; createdAt: string; eventType: string; message: string }>
  >([]);
  const runHistoryLastEventIdRef = useRef(0);
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
  const [domainBotLogs, setDomainBotLogs] = useState<string[]>([]);
  const [domainBotScreenshotDataUrl, setDomainBotScreenshotDataUrl] = useState("");
  const [domainBotRunOpen, setDomainBotRunOpen] = useState(false);
  const [domainBotStopRequested, setDomainBotStopRequested] = useState(false);
  const domainBotStopRequestedRef = useRef(false);
  const [domainBotRunItems, setDomainBotRunItems] = useState<DomainBotRunItem[]>([]);
  const [domainBotRunStartedAt, setDomainBotRunStartedAt] = useState("");
  const [domainBotRunDone, setDomainBotRunDone] = useState(false);
  const [domainBotFailuresOpen, setDomainBotFailuresOpen] = useState(false);
  const [domainBotFailuresLoading, setDomainBotFailuresLoading] = useState(false);
  const [domainBotFailures, setDomainBotFailures] = useState<DomainBotFailureItem[]>([]);
  const [domainBotFailuresMsg, setDomainBotFailuresMsg] = useState("");
  const [domainBotAccountTimeoutMin, setDomainBotAccountTimeoutMin] = useState(
    DOMAIN_BOT_TIMEOUT_MIN_DEFAULT,
  );
  const [quickBotModal, setQuickBotModal] = useState<"" | "google" | "bing" | "pending" | "settings">("");

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
  const [, setRunFlowStatus] = useState<RunFlowStatus>({
    createDb: "pending",
    createJson: "pending",
    runDelta: "pending",
  });

  // ✅ Map modal
  const [mapOpen, setMapOpen] = useState(false);

  type MapMetric = "ready" | "domains";
  type MapScope = "us" | "puerto_rico";
  const [mapMetric, setMapMetric] = useState<MapMetric>("ready");
  const [mapScope, setMapScope] = useState<MapScope>("us");
  const [mapSelected, setMapSelected] = useState<string>("");
  const [prDetail, setPrDetail] = useState<StateDetailResponse | null>(null);
  const [prDetailLoading, setPrDetailLoading] = useState(false);
  const [prDetailErr, setPrDetailErr] = useState("");
  const [prCitySearch, setPrCitySearch] = useState("");
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const runnerRef = useRef<HTMLDivElement | null>(null);
  const searchBuilderRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const activationRef = useRef<HTMLElement | null>(null);
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

  async function fetchStateDetail(stateName: string) {
    const endpoint = routeTenantId
      ? `/api/sheet/state?name=${encodeURIComponent(stateName)}&tenantId=${encodeURIComponent(routeTenantId)}`
      : `/api/sheet/state?name=${encodeURIComponent(stateName)}`;
    const res = await fetch(endpoint, { cache: "no-store" });
    const data = (await safeJson(res)) as StateDetailResponse | any;
    if (!res.ok || data?.error) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data as StateDetailResponse;
  }

  async function loadPuertoRicoDetail(opts?: { force?: boolean }) {
    if (prDetail && !opts?.force) return;
    setPrDetailLoading(true);
    setPrDetailErr("");
    try {
      const data = await fetchStateDetail("Puerto Rico");
      setPrDetail(data);
    } catch (e: any) {
      setPrDetailErr(e?.message || "Failed to load Puerto Rico detail");
    } finally {
      setPrDetailLoading(false);
    }
  }

  function pickMapState(rawName: string) {
    const stateName = s(rawName);
    if (!stateName) return;
    if (isPuertoRicoState(stateName)) {
      setMapScope("puerto_rico");
      void loadPuertoRicoDetail();
      return;
    }
    setMapScope("us");
    setMapSelected(stateName);
  }

  async function openPuertoRicoMunicipioDetail(municipio?: string) {
    await openDetail("Puerto Rico");
    setDetailTab("cities");
    const q = s(municipio);
    if (q) setDetailSearch(q);
  }

  function pushLog(line: string) {
    const msg = `[${tsLocal()}] ${String(line ?? "")}`;
    setLogs((p) =>
      p.length > 4000 ? p.slice(-3500).concat(msg) : p.concat(msg),
    );
  }

  function resetRunFlowStatus() {
    setRunFlowStatus({
      createDb: "pending",
      createJson: "pending",
      runDelta: "pending",
    });
  }

  function updateRunFlowFromLine(rawLine: string) {
    const line = s(rawLine).toLowerCase();
    if (!line) return;
    setRunFlowStatus((prev) => {
      const next: RunFlowStatus = { ...prev };

      if (line.includes("prebuild: create-db (build-sheet-rows): start")) {
        if (next.createDb !== "done") next.createDb = "running";
        if (next.createJson === "running") next.createJson = "pending";
        if (next.runDelta === "running") next.runDelta = "pending";
      }
      if (line.includes("prebuild: create-db (build-sheet-rows): done")) {
        next.createDb = "done";
      }
      if (line.includes("prebuild: generating state output json (build-counties)")) {
        if (next.createDb !== "done") next.createDb = "done";
        if (next.createJson !== "done") next.createJson = "running";
      }
      if (line.includes("prebuild: build-counties done.")) {
        next.createDb = "done";
        next.createJson = "done";
      }
      if (
        line.includes("main: started child pid=") ||
        line.includes("phase:init ->") ||
        line.includes("🚀 run start") ||
        line.includes("🏁 run state:")
      ) {
        next.createDb = "done";
        if (next.createJson !== "done") next.createJson = "done";
        if (next.runDelta !== "done") next.runDelta = "running";
      }

      if (line.includes("create-db (build-sheet-rows) failed")) {
        next.createDb = "error";
      }
      if (line.includes("prebuild build-counties failed") || line.includes("build-counties failed with exit code")) {
        next.createJson = "error";
      }
      if (
        line.includes("fatal:") ||
        line.includes("process exited with code") ||
        line.includes("child-close: exit=")
      ) {
        if (next.runDelta === "running" || (next.createDb === "done" && next.createJson === "done")) {
          next.runDelta = "error";
        }
      }
      return next;
    });
  }

  function shouldIgnoreRuntimeNoise(raw: string) {
    const line = s(raw);
    if (!line) return true;
    return (
      line.startsWith("runner-heartbeat:") ||
      line.startsWith("__RUN_PID__")
    );
  }

  function rememberSseEventCursor(ev: MessageEvent) {
    const raw = s((ev as any)?.lastEventId);
    const n = Number(raw);
    if (Number.isFinite(n) && n > sseLastEventIdRef.current) {
      sseLastEventIdRef.current = n;
    }
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

  useEffect(() => {
    if (!statesOut.length) {
      setStateFileSelectedSlug("");
      return;
    }
    setStateFileSelectedSlug((prev) => {
      const p = s(prev).toLowerCase();
      if (p && statesOut.includes(p)) return p;
      return s(statesOut[0]).toLowerCase();
    });
  }, [statesOut]);

  useEffect(() => {
    if (!routeTenantId || detailsTab !== "state_files") return;
    if (!stateFileSelectedSlug) return;
    void loadStateFileForEditor(stateFileSelectedSlug);
  }, [routeTenantId, detailsTab, stateFileSelectedSlug]);

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

  function accountDisplayName() {
    return s(authMe?.fullName) || s(authMe?.email) || "Account";
  }

  function currentRoleLabel() {
    const roles = Array.isArray(authMe?.globalRoles) ? authMe.globalRoles : [];
    if (!roles.length) return "member";
    return s(roles[0]) || "member";
  }

  function openAgencyAccountPanel(panel: "profile" | "security") {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    const tenantQuery = routeTenantId ? `&tenantId=${encodeURIComponent(routeTenantId)}` : "";
    window.location.href = `/?account=${panel}&returnTo=${returnTo}${tenantQuery}`;
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function loadAuthMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await safeJson(res)) as { ok?: boolean; user?: AuthMeUser; error?: string } | null;
      if (!res.ok || !data?.ok || !data.user) return;
      setAuthMe(data.user);
    } catch {
      // keep project page functional even if profile endpoint is transiently unavailable
    }
  }

  useEffect(() => {
    loadOverview();
  }, [routeTenantId]);

  useEffect(() => {
    void loadAuthMe();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const locale = s(authMe?.preferredLocale) || s(tenantLocale) || "en-US";
    document.documentElement.lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  }, [authMe?.preferredLocale, tenantLocale]);

  useEffect(() => {
    let cancelled = false;
    async function loadNotificationCount() {
      if (!routeTenantId) {
        if (!cancelled) setNotificationCount(0);
        return;
      }
      try {
        const qs = new URLSearchParams({
          organizationId: routeTenantId,
          status: "proposed",
          limit: "200",
        });
        const res = await fetch(`/api/agents/proposals?${qs.toString()}`, { cache: "no-store" });
        const json = (await safeJson(res)) as { ok?: boolean; proposals?: Array<unknown> } | null;
        if (!res.ok || !json?.ok) throw new Error(`HTTP ${res.status}`);
        if (!cancelled) setNotificationCount(Array.isArray(json.proposals) ? json.proposals.length : 0);
      } catch {
        if (!cancelled) setNotificationCount(0);
      }
    }
    void loadNotificationCount();
    return () => {
      cancelled = true;
    };
  }, [routeTenantId]);

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

  useEffect(() => {
    if (!routeTenantId) {
      setDomainBotFailures([]);
      return;
    }
    void loadDomainBotFailures(detailTab);
  }, [routeTenantId, detailTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `ct_domain_bot_timeout_min:${routeTenantId || "global"}`;
    try {
      const raw = window.localStorage.getItem(key);
      const n = Number(raw);
      if (Number.isFinite(n)) {
        const clamped = Math.max(
          DOMAIN_BOT_TIMEOUT_MIN_MIN,
          Math.min(DOMAIN_BOT_TIMEOUT_MIN_MAX, Math.round(n)),
        );
        setDomainBotAccountTimeoutMin(clamped);
      } else {
        setDomainBotAccountTimeoutMin(DOMAIN_BOT_TIMEOUT_MIN_DEFAULT);
      }
    } catch {
      setDomainBotAccountTimeoutMin(DOMAIN_BOT_TIMEOUT_MIN_DEFAULT);
    }
  }, [routeTenantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `ct_domain_bot_timeout_min:${routeTenantId || "global"}`;
    const clamped = Math.max(
      DOMAIN_BOT_TIMEOUT_MIN_MIN,
      Math.min(DOMAIN_BOT_TIMEOUT_MIN_MAX, Math.round(Number(domainBotAccountTimeoutMin) || DOMAIN_BOT_TIMEOUT_MIN_DEFAULT)),
    );
    try {
      window.localStorage.setItem(key, String(clamped));
    } catch {}
  }, [routeTenantId, domainBotAccountTimeoutMin]);

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

  async function loadTenantProductsServices() {
    if (!routeTenantId) {
      setTenantProductsServices([]);
      return;
    }
    setTenantProductsServicesLoading(true);
    try {
      const qs = new URLSearchParams({
        provider: "marketing",
        scope: "module",
        module: "products_services",
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
      const mapped = rows
        .map((r: any) => {
          const raw = s(r?.keyValue);
          let parsed: Record<string, unknown> = {};
          try {
            parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            parsed = {};
          }
          const serviceId = slugToken(s(parsed.id) || s(r?.keyName));
          const name = s(parsed.name || r?.description || r?.keyName);
          const landingPath = normalizeRelativePath(s(parsed.landingPath || parsed.landingUrl || parsed.url));
          if (!serviceId || !name || !landingPath) return null;
          return {
            id: s(r?.id),
            serviceId,
            name,
            description: s(parsed.description),
            landingPath,
            formPath: normalizeRelativePath(s(parsed.formPath || parsed.formUrl)),
            bookingPath: normalizeRelativePath(s(parsed.bookingPath || parsed.bookingUrl)),
            cta: s(parsed.cta || parsed.ctaPrimary),
            ctaSecondary: s(parsed.ctaSecondary),
            isActive: r?.isActive !== false,
          } as TenantProductServiceRow;
        })
        .filter((x: TenantProductServiceRow | null): x is TenantProductServiceRow => Boolean(x));
      setTenantProductsServices(mapped);
      setTenantProductsServicesPage(1);
    } catch (e: any) {
      setTenantProductsServices([]);
      setTenantDetailErr(e?.message || "Failed to load products/services.");
    } finally {
      setTenantProductsServicesLoading(false);
    }
  }

  function updateTenantProductsServiceAt(index: number, patch: Partial<TenantProductServiceRow>) {
    setTenantProductsServices((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addTenantProductsServiceRow() {
    setTenantProductsServices((prev) => [
      ...prev,
      {
        serviceId: "",
        name: "",
        description: "",
        landingPath: "",
        formPath: "",
        bookingPath: "",
        cta: "",
        ctaSecondary: "",
        isActive: true,
      },
    ]);
    setTenantProductsServicesPage(9999);
  }

  function removeTenantProductsServiceRow(index: number) {
    setTenantProductsServices((prev) =>
      prev.map((row, i) => (i === index ? { ...row, isActive: false } : row)),
    );
  }

  async function saveTenantProductsServices() {
    if (!routeTenantId) return;
    setTenantProductsServicesMsg("");
    setTenantProductsServicesSaving(true);
    setTenantDetailErr("");
    try {
      const rows = tenantProductsServices
        .map((row) => {
          const serviceId = slugToken(row.serviceId || row.name);
          const name = s(row.name);
          const landingPath = normalizeRelativePath(row.landingPath);
          if (!serviceId || !name || !landingPath) return null;
          return {
            provider: "marketing",
            scope: "module",
            module: "products_services",
            keyName: serviceId,
            keyValue: JSON.stringify({
              id: serviceId,
              name,
              description: s(row.description),
              landingPath,
              formPath: normalizeRelativePath(row.formPath),
              bookingPath: normalizeRelativePath(row.bookingPath),
              cta: s(row.cta),
              ctaSecondary: s(row.ctaSecondary),
            }),
            valueType: "json",
            isActive: row.isActive !== false,
            description: name,
          };
        })
        .filter(Boolean);

      if (!rows.length) {
        throw new Error("Add at least one valid service with name and landing path.");
      }

      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await loadTenantProductsServices();
      setTenantProductsServicesMsg(`Saved ${Number((data as any)?.upserted || 0)} products/services.`);
    } catch (e: any) {
      setTenantProductsServicesMsg("");
      setTenantDetailErr(e?.message || "Failed to save products/services.");
    } finally {
      setTenantProductsServicesSaving(false);
    }
  }

  async function runSeoCanvaModel() {
    if (!routeTenantId) return;
    setSeoCanvaMsg("");
    setSeoCanvaErr("");
    setSeoCanvaLoading(true);
    try {
      const qs = new URLSearchParams({
        integrationKey: OAUTH_INTEGRATION_KEY,
        industryProfile: seoCanvaIndustryProfile,
      });
      if (s(seoCanvaBusinessCategory)) {
        qs.set("businessCategory", s(seoCanvaBusinessCategory));
      }
      if (s(tenantRootDomain)) {
        qs.set("rootDomain", s(tenantRootDomain));
      }
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/seo-canva?${qs.toString()}`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const payload = {
        generatedAt: s((data as any)?.generatedAt),
        rootDomain: s((data as any)?.rootDomain),
        industryProfile: s((data as any)?.industryProfile) as SeoCanvaPayload["industryProfile"],
        businessCategory: s((data as any)?.businessCategory),
        services: Array.isArray((data as any)?.services) ? ((data as any).services as SeoCanvaServiceResult[]) : [],
        boardSummary: Array.isArray((data as any)?.boardSummary) ? ((data as any).boardSummary as SeoCanvaPayload["boardSummary"]) : [],
        urlStrategyRows: Array.isArray((data as any)?.urlStrategyRows) ? ((data as any).urlStrategyRows as SeoCanvaUrlStrategyRow[]) : [],
        formatMix: Array.isArray((data as any)?.formatMix) ? ((data as any).formatMix as SeoCanvaPayload["formatMix"]) : [],
        planner: ((data as any)?.planner || {
          ok: false,
          source: "unknown",
          totalIdeas: 0,
          mappedIdeas: 0,
          services: 0,
          errors: [],
        }) as SeoCanvaPayload["planner"],
      } satisfies SeoCanvaPayload;
      setSeoCanvaData(payload);
      setSeoCanvaExpandedServiceId(payload.services[0]?.serviceId || "");
      setSeoCanvaMsg(
        `Processed ${payload.planner.services || payload.services.length} services · ${payload.planner.totalIdeas || 0} keyword ideas.`,
      );
    } catch (e: any) {
      setSeoCanvaData(null);
      setSeoCanvaErr(e?.message || "Failed to run SEO Canva Model.");
    } finally {
      setSeoCanvaLoading(false);
    }
  }

  async function queueSeoCanvaAgentProposal() {
    if (!routeTenantId || !seoCanvaData) return;
    setSeoCanvaQueueing(true);
    setSeoCanvaErr("");
    try {
      const routingRes = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/integrations/openclaw`,
        { cache: "no-store" },
      );
      const routingJson = await safeJson(routingRes);
      const seoAgentId =
        s((routingJson as any)?.agents?.seo_canva?.agentId) || "soul_seo_canvas_strategist";

      const topRows = (seoCanvaData.urlStrategyRows || [])
        .slice(0, 20)
        .map((row) => ({
          url: row.url,
          format: row.format,
          traffic: row.traffic,
          value: row.value,
          keywords: row.keywords,
          topKeyword: row.topKeyword,
        }));

      const res = await fetch("/api/agents/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: routeTenantId,
          actionType: "publish_content",
          agentId: seoAgentId,
          dashboardId: "seo_canva",
          priority: "P2",
          riskLevel: "low",
          expectedImpact: "high",
          summary: `SEO Canva multi-industry strategy (${s(seoCanvaData.industryProfile) || "generic"})`,
          payload: {
            tenant_id: routeTenantId,
            source: "seo_canva_model",
            root_domain: seoCanvaData.rootDomain || s(tenantRootDomain),
            industry_profile: seoCanvaData.industryProfile || seoCanvaIndustryProfile,
            business_category: seoCanvaData.businessCategory || s(seoCanvaBusinessCategory),
            planner_summary: seoCanvaData.planner,
            format_mix: seoCanvaData.formatMix || [],
            top_urls: topRows,
            generated_at: seoCanvaData.generatedAt,
          },
        }),
      });
      const json = await safeJson(res);
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
      setSeoCanvaMsg("SEO strategy sent to Agent Notification Hub for approval.");
    } catch (e: any) {
      setSeoCanvaErr(e?.message || "Failed to queue SEO agent proposal.");
    } finally {
      setSeoCanvaQueueing(false);
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
            s(it.provider).toLowerCase() === "google_places" ||
            s(it.provider).toLowerCase() === "google_cloud") &&
          s(it.integration_key || it.integrationKey || "default").toLowerCase() === "default",
      ) ||
      rows.find(
        (it) =>
          s(it.provider).toLowerCase() === "google_maps" ||
          s(it.provider).toLowerCase() === "google_places" ||
          s(it.provider).toLowerCase() === "google_cloud",
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
        provider: "google_cloud",
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
    void loadTenantProductsServices();
  }, [routeTenantId]);

  useEffect(() => {
    if (!routeTenantId) return;
    if (detailsTab !== "seo_canva") return;
    if (seoCanvaLoading || seoCanvaData || seoCanvaErr) return;
    void runSeoCanvaModel();
  }, [routeTenantId, detailsTab, seoCanvaLoading, seoCanvaData, seoCanvaErr]);

  useEffect(() => {
    void loadTenantProspectingWebhookSettings();
  }, [routeTenantId]);

  useEffect(() => {
    const tabFromRoute = PROJECT_SLUG_TO_TAB[routeTabSlug] || null;
    if (!tabFromRoute) return;
    if (activeProjectTab !== tabFromRoute) setActiveProjectTab(tabFromRoute);
  }, [routeTabSlug, activeProjectTab]);

  useEffect(() => {
    const tab = s(searchParams?.get("detailsTab")).toLowerCase();
    if (
      tab === "business" ||
      tab === "ghl" ||
      tab === "integrations" ||
      tab === "custom_values" ||
      tab === "products_services" ||
      tab === "seo_canva" ||
      tab === "state_files"
    ) {
      setDetailsTab(tab as ProjectDetailsTab);
      if (tab && activeProjectTab !== "details") setActiveProjectTab("details");
    }
  }, [searchParams, activeProjectTab]);

  function newSearchBuilderDraft() {
    const companyName = s(tenantName) || "My Company";
    const folderBase = kebabToken(tenantSlug) || kebabToken(companyName) || "company";
    return {
      name: `${companyName} Search`,
      companyName,
      buttonText: "Book An Appointment",
      modalTitle: `${companyName} Locations`,
      host: SEARCH_EMBEDDED_HOST,
      folder: `${folderBase}-search`,
      pageSlug: "mobile-iv-therapy-locations",
      query: "embed=1",
      buttonColor: "#044c5c",
      headerColor: "#a4d8e4",
      searchTitle: "Choose your location",
      searchSubtitle: "Search by State, County/Parish, or City. Then click Book Now.",
      searchPlaceholder: "Choose your City, State, or Country",
      defaultBookingPath: "/",
      buttonPosition: "center" as const,
      fontKey: "lato",
      buttonRadius: 999,
      buttonPaddingY: 12,
      buttonPaddingX: 22,
      buttonFontSize: 15,
      buttonFontWeight: 800,
      buttonShadow: 18,
      modalRadius: 16,
      modalWidth: 800,
      modalHeight: 680,
      modalBackdropOpacity: 55,
      modalHeaderHeight: 56,
      inputRadius: 10,
      previewTone: "dark" as const,
    };
  }

  function applySearchBuilderProject(project: SearchBuilderProject | null) {
    if (!project) return;
    setSearchBuilderActiveSearchId(s(project.id));
    setSearchBuilderName(s(project.name) || "Untitled Search");
    setSearchBuilderCompanyName(s(project.companyName));
    setSearchBuilderButtonText(s(project.buttonText) || "Book An Appointment");
    setSearchBuilderModalTitle(s(project.modalTitle) || "Locations");
    setSearchBuilderHost(SEARCH_EMBEDDED_HOST);
    setSearchBuilderFolder(s(project.folder) || "company-search");
    setSearchBuilderPageSlug(s(project.pageSlug) || "mobile-iv-therapy-locations");
    setSearchBuilderQuery(s(project.query) || "embed=1");
    setSearchBuilderButtonColor(s(project.buttonColor) || "#044c5c");
    setSearchBuilderHeaderColor(s(project.headerColor) || "#a4d8e4");
    setSearchBuilderSearchTitle(s(project.searchTitle) || "Choose your location");
    setSearchBuilderSearchSubtitle(
      s(project.searchSubtitle) || "Search by State, County/Parish, or City. Then click Book Now.",
    );
    setSearchBuilderSearchPlaceholder(
      s(project.searchPlaceholder) || "Choose your City, State, or Country",
    );
    setSearchBuilderDefaultBookingPath(s(project.defaultBookingPath) || "/");
    setSearchBuilderFontKey(
      SEARCH_BUILDER_FONT_OPTIONS.some((f) => f.key === s(project.fontKey))
        ? s(project.fontKey)
        : "lato",
    );
    setSearchBuilderButtonRadius(Number(project.buttonRadius || 999));
    setSearchBuilderButtonPaddingY(Number(project.buttonPaddingY || 12));
    setSearchBuilderButtonPaddingX(Number(project.buttonPaddingX || 22));
    setSearchBuilderButtonFontSize(Number(project.buttonFontSize || 15));
    setSearchBuilderButtonFontWeight(Number(project.buttonFontWeight || 800));
    setSearchBuilderButtonShadow(Number(project.buttonShadow || 18));
    setSearchBuilderModalRadius(Number(project.modalRadius || 16));
    setSearchBuilderModalWidth(Number(project.modalWidth || 800));
    setSearchBuilderModalHeight(Number(project.modalHeight || 680));
    setSearchBuilderModalBackdropOpacity(Number(project.modalBackdropOpacity || 55));
    setSearchBuilderModalHeaderHeight(Number(project.modalHeaderHeight || 56));
    setSearchBuilderInputRadius(Number(project.inputRadius || 10));
    setSearchBuilderPreviewTone(s(project.previewTone) === "light" ? "light" : "dark");
    setSearchBuilderButtonPosition(
      s(project.buttonPosition) === "left" || s(project.buttonPosition) === "right"
        ? (s(project.buttonPosition) as "left" | "right")
        : "center",
    );
  }

  function collectSearchBuilderPayload(searchId: string) {
    const fallback = newSearchBuilderDraft();
    return {
      searchId,
      id: searchId,
      name: s(searchBuilderName) || `${s(searchBuilderCompanyName) || fallback.companyName} Search`,
      companyName: s(searchBuilderCompanyName) || fallback.companyName,
      buttonText: s(searchBuilderButtonText) || fallback.buttonText,
      modalTitle: s(searchBuilderModalTitle) || fallback.modalTitle,
      host: SEARCH_EMBEDDED_HOST,
      folder: s(searchBuilderFolder) || fallback.folder,
      pageSlug: s(searchBuilderPageSlug) || fallback.pageSlug,
      query: s(searchBuilderQuery) || fallback.query,
      buttonColor: s(searchBuilderButtonColor) || fallback.buttonColor,
      headerColor: s(searchBuilderHeaderColor) || fallback.headerColor,
      searchTitle: s(searchBuilderSearchTitle) || fallback.searchTitle,
      searchSubtitle: s(searchBuilderSearchSubtitle) || fallback.searchSubtitle,
      searchPlaceholder: s(searchBuilderSearchPlaceholder) || fallback.searchPlaceholder,
      defaultBookingPath: normalizeRelativePath(s(searchBuilderDefaultBookingPath) || fallback.defaultBookingPath || "/"),
      buttonPosition: searchBuilderButtonPosition,
      fontKey: s(searchBuilderFontKey) || fallback.fontKey,
      buttonRadius: Number(searchBuilderButtonRadius) || fallback.buttonRadius,
      buttonPaddingY: Number(searchBuilderButtonPaddingY) || fallback.buttonPaddingY,
      buttonPaddingX: Number(searchBuilderButtonPaddingX) || fallback.buttonPaddingX,
      buttonFontSize: Number(searchBuilderButtonFontSize) || fallback.buttonFontSize,
      buttonFontWeight: Number(searchBuilderButtonFontWeight) || fallback.buttonFontWeight,
      buttonShadow: Number(searchBuilderButtonShadow) || fallback.buttonShadow,
      modalRadius: Number(searchBuilderModalRadius) || fallback.modalRadius,
      modalWidth: Number(searchBuilderModalWidth) || fallback.modalWidth,
      modalHeight: Number(searchBuilderModalHeight) || fallback.modalHeight,
      modalBackdropOpacity: Number(searchBuilderModalBackdropOpacity) || fallback.modalBackdropOpacity,
      modalHeaderHeight: Number(searchBuilderModalHeaderHeight) || fallback.modalHeaderHeight,
      inputRadius: Number(searchBuilderInputRadius) || fallback.inputRadius,
      previewTone: searchBuilderPreviewTone,
    };
  }

  async function loadSearchBuilderProjects(opts?: { selectSearchId?: string; openEditor?: boolean }) {
    if (!routeTenantId) return;
    setSearchBuilderProjectsLoading(true);
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/searches`, {
        cache: "no-store",
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(data?.searches) ? (data.searches as SearchBuilderProject[]) : [];
      setSearchBuilderProjects(rows);
      const preferred = s(opts?.selectSearchId || searchBuilderActiveSearchId);
      const picked =
        rows.find((r) => s(r.id) === preferred) ||
        rows[0] ||
        null;
      if (picked) {
        applySearchBuilderProject(picked);
        setSearchBuilderEditorOpen(opts?.openEditor === true || searchBuilderEditorOpen);
      } else {
        setSearchBuilderActiveSearchId("");
        setSearchBuilderName("");
        setSearchBuilderEditorOpen(false);
        setSearchBuilderLastPublish(null);
      }
      setSearchBuilderErr("");
    } catch (e: unknown) {
      setSearchBuilderErr(e instanceof Error ? e.message : "Failed to load searches.");
      setSearchBuilderProjects([]);
      setSearchBuilderLastPublish(null);
    } finally {
      setSearchBuilderProjectsLoading(false);
    }
  }

  useEffect(() => {
    if (!routeTenantId) return;
    void loadSearchBuilderProjects();
  }, [routeTenantId]);

  useEffect(() => {
    if (!routeTenantId || !searchBuilderActiveSearchId) {
      setSearchBuilderLastPublish(null);
      return;
    }
    void loadLastPublishedSearchBuilderFiles(searchBuilderActiveSearchId);
  }, [routeTenantId, searchBuilderActiveSearchId]);

  async function createNewSearchBuilder() {
    if (!routeTenantId) return;
    setSearchBuilderCreating(true);
    setSearchBuilderErr("");
    setSearchBuilderMsg("");
    try {
      const payload = newSearchBuilderDraft();
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/searches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !data?.search?.id) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      const newId = s(data.search.id);
      setSearchBuilderMsg("Search created.");
      setSearchBuilderEditorPanel("button");
      setSearchBuilderEditorOpen(true);
      await loadSearchBuilderProjects({ selectSearchId: newId, openEditor: true });
    } catch (e: unknown) {
      setSearchBuilderErr(e instanceof Error ? e.message : "Failed to create search.");
    } finally {
      setSearchBuilderCreating(false);
    }
  }

  async function deleteSearchBuilderProject(searchId: string) {
    if (!routeTenantId) return;
    const id = s(searchId);
    if (!id) return;
    setSearchBuilderDeletingId(id);
    setSearchBuilderErr("");
    setSearchBuilderMsg("");
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/searches?searchId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      setSearchBuilderMsg("Search deleted.");
      if (searchBuilderActiveSearchId === id) {
        setSearchBuilderEditorOpen(false);
        setSearchBuilderActiveSearchId("");
      }
      await loadSearchBuilderProjects();
    } catch (e: unknown) {
      setSearchBuilderErr(e instanceof Error ? e.message : "Failed to delete search.");
    } finally {
      setSearchBuilderDeletingId("");
    }
  }

  function openSearchBuilderEditor(searchId: string) {
    const picked = searchBuilderProjects.find((p) => s(p.id) === s(searchId)) || null;
    if (!picked) return;
    applySearchBuilderProject(picked);
    setSearchBuilderEditorPanel("button");
    setSearchBuilderEditorOpen(true);
    setSearchBuilderMsg("");
    setSearchBuilderErr("");
  }

  async function saveSearchBuilderSettings(opts?: { silent?: boolean }) {
    if (!routeTenantId) return false;
    const searchId = s(searchBuilderActiveSearchId);
    if (!searchId) {
      setSearchBuilderErr("Select a search first.");
      return false;
    }
    const silent = opts?.silent === true;
    setSearchBuilderSaving(true);
    if (!silent) {
      setSearchBuilderErr("");
      setSearchBuilderMsg("");
    }
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/searches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectSearchBuilderPayload(searchId)),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      await loadSearchBuilderProjects({ selectSearchId: searchId, openEditor: true });
      if (!silent) setSearchBuilderMsg("Search saved in DB.");
      return true;
    } catch (e: unknown) {
      setSearchBuilderErr(e instanceof Error ? e.message : "Failed to save search.");
      return false;
    } finally {
      setSearchBuilderSaving(false);
    }
  }

  async function publishSearchBuilderFiles() {
    if (!routeTenantId) return;
    const searchId = s(searchBuilderActiveSearchId);
    if (!searchId) {
      setSearchBuilderErr("Select a search first.");
      return;
    }
    const saved = await saveSearchBuilderSettings({ silent: true });
    if (!saved) return;
    setSearchBuilderPublishing(true);
    setSearchBuilderErr("");
    try {
      const indexRes = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, state: "all" }),
      });
      const indexData = await safeJson(indexRes);
      if (!indexRes.ok || !indexData?.ok) {
        throw new Error(s(indexData?.error) || `Search index failed (HTTP ${indexRes.status})`);
      }
      const indexCount = Number(indexData?.index?.itemsCount || indexData?.index?.count || 0);
      if (indexCount <= 0) {
        const statesCount = Number(indexData?.index?.count || 0);
        const statesWithPayload = Number(indexData?.index?.statesWithPayload || 0);
        throw new Error(
          `Search index is empty (items=0). states=${statesCount}, statesWithPayload=${statesWithPayload}. ` +
            `Seed/sync organization_state_files payload for this tenant, then publish again.`,
        );
      }

      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      const manifest = (data?.manifest || null) as SearchBuilderManifest | null;
      const total = Number(data?.generated || manifest?.count || 0);
      setSearchBuilderMsg(`Search index + publish completed (${indexCount} states, ${total} files).`);
      if (manifest) {
        setSearchBuilderLastPublish({
          searchId,
          searchName: s(manifest.searchName),
          folder: s(manifest.folder),
          host: s(manifest.host) || SEARCH_EMBEDDED_HOST,
          generatedAt: s(manifest.generatedAt) || new Date().toISOString(),
          count: total,
          files: Array.isArray(manifest.files) ? manifest.files : [],
        });
      }
    } catch (e: unknown) {
      setSearchBuilderErr(e instanceof Error ? e.message : "Failed to publish search files.");
    } finally {
      setSearchBuilderPublishing(false);
    }
  }

  async function loadLastPublishedSearchBuilderFiles(searchIdInput?: string) {
    if (!routeTenantId) return;
    const searchId = s(searchIdInput || searchBuilderActiveSearchId);
    if (!searchId) {
      setSearchBuilderLastPublish(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/search-builder/publish?searchId=${encodeURIComponent(searchId)}`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      const manifest = (data?.manifest || null) as SearchBuilderManifest | null;
      if (!manifest) {
        setSearchBuilderLastPublish(null);
        return;
      }
      setSearchBuilderLastPublish({
        searchId,
        searchName: s(manifest.searchName),
        folder: s(manifest.folder),
        host: s(manifest.host) || SEARCH_EMBEDDED_HOST,
        generatedAt: s(manifest.generatedAt),
        count: Number(manifest.count || 0),
        files: Array.isArray(manifest.files) ? manifest.files : [],
      });
    } catch {
      setSearchBuilderLastPublish(null);
    }
  }

  async function copyPublishedFolderPath() {
    const folder = s(searchBuilderLastPublish?.folder);
    if (!folder) return;
    try {
      const tenant = s(routeTenantId);
      const publishedPrefix = tenant ? `/embedded/${tenant}/${folder}` : `/embedded/${folder}`;
      await navigator.clipboard.writeText(publishedPrefix);
      setSearchBuilderCopiedFolderPath(true);
      setTimeout(() => setSearchBuilderCopiedFolderPath(false), 1300);
    } catch {}
  }

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

  async function loadStateFileForEditor(targetSlug?: string) {
    if (!routeTenantId) return;
    const slug = s(targetSlug || stateFileSelectedSlug).toLowerCase();
    if (!slug) return;
    setStateFileLoading(true);
    setStateFileErr("");
    setStateFileMsg("");
    try {
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/state-files?state=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const data = (await safeJson(res)) as { ok?: boolean; row?: TenantStateFileRow; error?: string } | null;
      if (!res.ok || !data?.ok || !data?.row) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const row = data.row;
      setStateFileSelectedSlug(s(row.state_slug));
      setStateFileStateName(s(row.state_name));
      setStateFilePayloadText(JSON.stringify((row.payload || {}) as Record<string, unknown>, null, 2));
      setStateFileMetaUpdatedAt(s(row.updated_at));
      setStateFileMetaSource(s(row.source));
      setStateFileMsg(`Loaded ${s(row.state_slug)}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load state file.";
      setStateFileErr(msg);
    } finally {
      setStateFileLoading(false);
    }
  }

  async function saveStateFileFromEditor() {
    if (!routeTenantId) return;
    const slug = s(stateFileSelectedSlug).toLowerCase();
    if (!slug) {
      setStateFileErr("Select a state first.");
      return;
    }
    setStateFileSaving(true);
    setStateFileErr("");
    setStateFileMsg("");
    try {
      const parsed = JSON.parse(stateFilePayloadText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Payload must be a JSON object.");
      }
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/state-files?state=${encodeURIComponent(slug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stateName: s(stateFileStateName) || undefined,
            payload: parsed,
          }),
        },
      );
      const data = (await safeJson(res)) as { ok?: boolean; row?: TenantStateFileRow; error?: string } | null;
      if (!res.ok || !data?.ok || !data?.row) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setStateFileStateName(s(data.row.state_name));
      setStateFilePayloadText(JSON.stringify((data.row.payload || {}) as Record<string, unknown>, null, 2));
      setStateFileMetaUpdatedAt(s(data.row.updated_at));
      setStateFileMetaSource(s(data.row.source));
      setStateFileMsg(`Saved ${slug}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save state file.";
      setStateFileErr(msg);
    } finally {
      setStateFileSaving(false);
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

  function projectTabHref(tab: ProjectTab) {
    if (!routeTenantId) return "#";
    const slug = PROJECT_TAB_TO_SLUG[tab] || "home";
    return `/projects/${encodeURIComponent(routeTenantId)}/${slug}`;
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

  const activationKpis = useMemo(() => {
    const statesInSheet = sheet?.states?.length || 0;
    const countiesTotal = totals.countiesTotal || 0;
    const countiesReady = totals.countiesReady || 0;
    const countiesDomainsActive = totals.countiesDomainsActive || 0;
    const citiesTotal = totals.citiesTotal || 0;
    const citiesReady = totals.citiesReady || 0;
    const citiesDomainsActive = totals.citiesDomainsActive || 0;

    const countySubaccountPct = countiesTotal ? countiesReady / countiesTotal : 0;
    const countyDomainPct = countiesTotal ? countiesDomainsActive / countiesTotal : 0;
    const citySubaccountPct = citiesTotal ? citiesReady / citiesTotal : 0;
    const cityDomainPct = citiesTotal ? citiesDomainsActive / citiesTotal : 0;

    const globalDone = countiesReady + citiesReady + countiesDomainsActive + citiesDomainsActive;
    const globalTotal = (countiesTotal + citiesTotal) * 2;
    const globalPct = globalTotal ? globalDone / globalTotal : 0;

    return {
      statesInSheet,
      countiesTotal,
      countiesReady,
      countiesDomainsActive,
      citiesTotal,
      citiesReady,
      citiesDomainsActive,
      countySubaccountPct,
      countyDomainPct,
      citySubaccountPct,
      cityDomainPct,
      globalPct,
    };
  }, [sheet, totals]);

  const isStateJob = useMemo(() => {
    return job === "build-state-sitemaps";
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

  const activationLeaders = useMemo(() => {
    const rows = filteredSheetStates
      .map((r) => {
        const m = stateMetrics[r.state];
        const readyPct = m?.readyPct || 0;
        const domainsPct = m?.domainsPct || 0;
        const blended = (readyPct + domainsPct) / 2;
        return {
          state: r.state,
          readyPct,
          domainsPct,
          blended,
        };
      })
      .sort((a, b) => b.blended - a.blended);
    return rows.slice(0, 8);
  }, [filteredSheetStates, stateMetrics]);

  const activationBlockers = useMemo(() => {
    const rows = filteredSheetStates
      .map((r) => {
        const m = stateMetrics[r.state];
        const readyPct = m?.readyPct || 0;
        const domainsPct = m?.domainsPct || 0;
        const gap = Math.max(0, readyPct - domainsPct);
        const blended = (readyPct + domainsPct) / 2;
        return {
          state: r.state,
          readyPct,
          domainsPct,
          gap,
          blended,
        };
      })
      .sort((a, b) => {
        if (b.gap !== a.gap) return b.gap - a.gap;
        return a.blended - b.blended;
      });
    return rows.slice(0, 8);
  }, [filteredSheetStates, stateMetrics]);

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

  const pendingDomainBotRowsByKind = useMemo(() => {
    const failedByKind = {
      counties: new Set(
        domainBotFailures
          .filter((x) => x.status === "open" && x.kind === "counties")
          .map((x) => s(x.locId)),
      ),
      cities: new Set(
        domainBotFailures
          .filter((x) => x.status === "open" && x.kind === "cities")
          .map((x) => s(x.locId)),
      ),
    };
    const compute = (kind: "counties" | "cities") => {
      if (!detail) return [] as any[];
      const rows = kind === "counties" ? detail.counties.rows || [] : detail.cities.rows || [];
      const q0 = detailSearch.trim().toLowerCase();
      const filtered = rows
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
          return locId.includes(q0) || county.includes(q0) || city.includes(q0);
        });
      return filtered.filter((r) => {
        const eligible = !!r.__eligible;
        const domainCreated = isTrue(r["Domain Created"]);
        const locId = s(r["Location Id"]);
        const domainToPaste =
          kind === "cities"
            ? s(r["City Domain"]) || s(r["city domain"])
            : s(r["Domain"]) || s(r["County Domain"]);
        const isFailed = failedByKind[kind].has(locId);
        return eligible && !domainCreated && !!locId && !!domainToPaste && !isFailed;
      });
    };
    return {
      counties: compute("counties"),
      cities: compute("cities"),
    };
  }, [detail, countyFilter, detailSearch, domainBotFailures]);

  const pendingDomainBotRowsInTab = useMemo(() => {
    return pendingDomainBotRowsByKind[detailTab];
  }, [pendingDomainBotRowsByKind, detailTab]);

  const failedLocIdsByKind = useMemo(() => {
    return {
      counties: new Set(
        domainBotFailures
          .filter((x) => x.status === "open" && x.kind === "counties")
          .map((x) => s(x.locId)),
      ),
      cities: new Set(
        domainBotFailures
          .filter((x) => x.status === "open" && x.kind === "cities")
          .map((x) => s(x.locId)),
      ),
    };
  }, [domainBotFailures]);

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

  const domainBotRunCounts = useMemo(() => {
    let pending = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    let stopped = 0;
    for (const it of domainBotRunItems) {
      if (it.status === "pending") pending += 1;
      else if (it.status === "running") running += 1;
      else if (it.status === "done") done += 1;
      else if (it.status === "failed") failed += 1;
      else if (it.status === "stopped") stopped += 1;
    }
    const total = domainBotRunItems.length;
    const completed = done + failed + stopped;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { pending, running, done, failed, stopped, total, completed, pct };
  }, [domainBotRunItems]);

  const domainBotRunEtaSec = useMemo(() => {
    if (!domainBotBusy) return 0;
    const total = domainBotRunCounts.total;
    const completed = domainBotRunCounts.completed;
    if (!domainBotRunStartedAt || !total || completed <= 0) return null;
    const startedMs = new Date(domainBotRunStartedAt).getTime();
    if (!Number.isFinite(startedMs) || startedMs <= 0) return null;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startedMs) / 1000));
    const avgPerItem = elapsedSec / completed;
    const remaining = Math.max(0, total - completed);
    return Math.round(avgPerItem * remaining);
  }, [domainBotBusy, domainBotRunCounts, domainBotRunStartedAt]);

  const domainBotAccountTimeoutMs = useMemo(() => {
    const min = Math.max(
      DOMAIN_BOT_TIMEOUT_MIN_MIN,
      Math.min(
        DOMAIN_BOT_TIMEOUT_MIN_MAX,
        Math.round(Number(domainBotAccountTimeoutMin) || DOMAIN_BOT_TIMEOUT_MIN_DEFAULT),
      ),
    );
    return min * 60 * 1000;
  }, [domainBotAccountTimeoutMin]);

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
      if (actKind === "counties" || actKind === "cities") {
        void resolveDomainBotFailure(locId, actKind);
        void loadDomainBotFailures(actKind);
      }

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

  async function loadActiveRuns(): Promise<boolean> {
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "250");
      if (routeTenantId) qs.set("tenantId", routeTenantId);
      const res = await fetch(`/api/run?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok || !Array.isArray(data?.runs)) return false;
      const filtered = data.runs
        .map((r: any) => ({
          id: String(r?.id || ""),
          createdAt: Number(r?.createdAt || 0),
          updatedAt: Number(r?.updatedAt || 0),
          status: s(r?.status || ""),
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
        .filter((r: any) => (routeTenantId ? s(r?.meta?.tenantId) === s(routeTenantId) : true))
        .slice(0, 250);
      setActiveRuns(filtered);
      setRunId((curr) => {
        const current = s(curr);
        if (!current) return curr;
        const exists = filtered.some((r: any) => s(r?.id) === current);
        return exists ? curr : "";
      });
      return filtered.some(
        (r: any) => !r.finished && !r.stopped && r.exitCode === null,
      );
    } catch {
      // ignore background polling errors
      return false;
    }
  }

  async function loadRunHistoryEvents(idRaw: string, opts?: { initial?: boolean }) {
    const id = s(idRaw);
    if (!id) return;
    const initial = !!opts?.initial;
    if (initial) {
      setRunHistoryLoading(true);
      setRunHistoryErr("");
      setRunHistoryEvents([]);
      runHistoryLastEventIdRef.current = 0;
    }
    try {
      const qs = new URLSearchParams();
      qs.set("limit", initial ? "1200" : "600");
      if (!initial && runHistoryLastEventIdRef.current > 0) {
        qs.set("afterId", String(runHistoryLastEventIdRef.current));
      }
      if (routeTenantId) {
        qs.set("tenantId", routeTenantId);
      }
      const res = await fetch(`/api/run/${encodeURIComponent(id)}/events?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(s(data?.error) || `HTTP ${res.status}`);
      }
      const nextEvents = (Array.isArray(data?.events) ? data.events : [])
        .map((it: any) => ({
          id: Number(it?.id || 0),
          createdAt: s(it?.createdAt),
          eventType: s(it?.eventType) || "line",
          message: s(it?.message),
        }))
        .filter((it: any) => !shouldIgnoreRuntimeNoise(it?.message));
      if (initial) {
        setRunHistoryEvents(nextEvents);
        runHistoryLastEventIdRef.current = Number(nextEvents[nextEvents.length - 1]?.id || 0);
      } else if (nextEvents.length > 0) {
        setRunHistoryEvents((prev) => {
          const seen = new Set(prev.map((ev) => Number(ev.id || 0)));
          const merged = [...prev];
          for (const ev of nextEvents) {
            const idNum = Number(ev.id || 0);
            if (seen.has(idNum)) continue;
            merged.push(ev);
          }
          if (merged.length > 5000) {
            return merged.slice(merged.length - 5000);
          }
          return merged;
        });
        runHistoryLastEventIdRef.current = Math.max(
          runHistoryLastEventIdRef.current,
          Number(nextEvents[nextEvents.length - 1]?.id || 0),
        );
      }
      setRunHistoryErr("");
    } catch (e: any) {
      if (initial) {
        setRunHistoryErr(e?.message || "Failed to load run history");
      }
    } finally {
      if (initial) setRunHistoryLoading(false);
    }
  }

  async function openRunHistory(runIdToOpen: string) {
    const id = s(runIdToOpen);
    if (!id) return;
    setRunHistoryOpen(true);
    setRunHistoryRunId(id);
    await loadRunHistoryEvents(id, { initial: true });
  }

  async function openRunBotFromRunCard(stateRaw: string) {
    const stateName = formatStateLabel(stateRaw);
    const stateKey = s(stateRaw).toLowerCase();
    if (!stateName || stateKey === "all" || stateKey === "one") return;
    await openDetail(stateName);
    setQuickBotModal("pending");
  }

  useEffect(() => {
    if (!runHistoryOpen || !runHistoryRunId) {
      setRunHistoryLive(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const targetRunId = s(runHistoryRunId);
      if (!targetRunId) return;
      await loadRunHistoryEvents(targetRunId);
      if (cancelled) return;
      const r = activeRuns.find((it) => s(it.id) === targetRunId);
      const isLive = !!r && !r.finished && !r.stopped && (r.exitCode === null || r.exitCode === undefined);
      setRunHistoryLive(isLive);
      const delayMs = document.hidden ? 7000 : isLive ? 1800 : 5000;
      timer = setTimeout(() => {
        void tick();
      }, delayMs);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runHistoryOpen, runHistoryRunId, activeRuns, routeTenantId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      const hasActive = await loadActiveRuns();
      if (cancelled) return;
      const delayMs = document.hidden ? 90000 : hasActive ? 8000 : 30000;
      schedule(delayMs);
    };

    const onVisibility = () => {
      if (cancelled) return;
      schedule(0);
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [routeTenantId]);

  // ✅ Unified runner (supports optional locId/kind)
  async function run(opts?: {
    job?: string;
    state?: string;
    mode?: "live" | "dry";
    debug?: boolean;
    locId?: string;
    kind?: string;
    allowConcurrent?: boolean;
    rerun?: boolean;
  }) {
    const jobKey = s(opts?.job || job);
    const runMode = (s(opts?.mode || mode).toLowerCase() === "dry" ? "dry" : "live") as "live" | "dry";
    const runDebug = typeof opts?.debug === "boolean" ? opts.debug : debug;
    const locId = s(opts?.locId || (isOneLocJob ? runLocId : ""));
    const kind = s(opts?.kind || (isOneLocJob ? runKind : ""));
    const allowConcurrent =
      typeof opts?.allowConcurrent === "boolean" ? opts.allowConcurrent : allowParallelRuns;
    const fallbackState = isOneLocJob ? s(openState) || "one" : stateOut;
    const metaState = s(opts?.state || fallbackState) || fallbackState;

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
    if (duplicate && !allowConcurrent) {
      pushLog(
        `⚠ Duplicate blocked: run already active (${duplicate.id}) for same job/state scope. Attaching...`,
      );
      await attachToActiveRun(duplicate.id);
      return;
    }

    // Guardrail: do not re-run same state when another run for that state is running or stopped.
    if (!isOneLocJob) {
      const targetState = s(metaState).toLowerCase();
      const rerunRequested = !!opts?.rerun;
      const stateBlockedBy = activeRuns.find((r) => {
        const m = r.meta || {};
        if (s(m.tenantId) !== s(routeTenantId)) return false;
        if (s(m.state).toLowerCase() !== targetState) return false;
        const isStopped = r.stopped || s(r.status).toLowerCase() === "stopped";
        const isRunning = !r.finished && !isStopped;
        if (rerunRequested) return isRunning;
        return isStopped || isRunning;
      });

      if (stateBlockedBy) {
        const blockedStopped =
          !!stateBlockedBy.stopped || s(stateBlockedBy.status).toLowerCase() === "stopped";
        pushLog(
          `⛔ State blocked: "${formatStateLabel(metaState)}" already has run ${stateBlockedBy.id} in ${
            blockedStopped ? "stopped" : "running"
          } state.`,
        );
        if (!blockedStopped) {
          await attachToActiveRun(stateBlockedBy.id);
        }
        return;
      }
    }

    if (jobKey === "update-custom-values-one" && !locId) {
      pushLog("❌ Missing locId for update-custom-values-one");
      return;
    }

    setLogs([]);
    resetRunFlowStatus();
    runStartedAtRef.current = Date.now();
    sseRetryCountRef.current = 0;
    sseLastEventIdRef.current = 0;
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
        `▶ Starting job="${jobKey}" state="${metaState}" mode="${runMode}" debug="${runDebug ? "on" : "off"}"${
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
          mode: runMode,
          debug: runDebug,
          locId: locId || "",
          kind: kind || "",
          tenantId: routeTenantId || "",
          allowConcurrent,
          rerun: !!opts?.rerun,
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
          const existingRunId = String(payload.runId);
          setRunId(existingRunId);
          pushLog(`ℹ Duplicate blocked: attaching to existing active run ${existingRunId}`);
          await attachToActiveRun(existingRunId);
          return;
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

        const qs = new URLSearchParams();
        if (sseLastEventIdRef.current > 0) {
          qs.set("afterEventId", String(sseLastEventIdRef.current));
        }
        const streamUrl = qs.size
          ? `/api/stream/${targetRunId}?${qs.toString()}`
          : `/api/stream/${targetRunId}`;
        const es = new EventSource(streamUrl);
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
          rememberSseEventCursor(ev);
          const raw = String(ev.data ?? "");
          if (!raw || raw === "__HB__" || raw === "__END__") return;
          if (shouldIgnoreRuntimeNoise(raw)) return;
          if (
            raw.startsWith("__PROGRESS__ ") ||
            raw.startsWith("__PROGRESS_INIT__ ") ||
            raw.startsWith("__PROGRESS_END__ ")
          ) {
            return;
          }
          updateRunFlowFromLine(raw);
          pushLog(raw);
        };

        const onProgress = (ev: MessageEvent) => {
          rememberSseEventCursor(ev);
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

          const transientEnd =
            data?.reason === "not_found" ||
            data?.status === "running" ||
            data?.source === "db_error";
          if (
            transientEnd &&
            isRunningRef.current &&
            currentRunIdRef.current === targetRunId
          ) {
            const nextAttempt = sseRetryCountRef.current + 1;
            sseRetryCountRef.current = nextAttempt;
            const waitMs = Math.min(
              MAX_SSE_RETRY_WAIT_MS,
              1000 * Math.pow(1.35, nextAttempt - 1),
            );
            pushLog(
              `⚠ SSE end transitorio (${s(data?.reason || data?.status || "unknown")}). Reintentando en ${(waitMs / 1000).toFixed(1)}s (attempt ${nextAttempt})...`,
            );
            setProgress((p) => ({
              ...p,
              message: "SSE reconnecting…",
              status: "running",
            }));
            if (sseRetryTimerRef.current) {
              clearTimeout(sseRetryTimerRef.current);
              sseRetryTimerRef.current = null;
            }
            sseRetryTimerRef.current = setTimeout(() => {
              connectStream(targetRunId, true);
            }, waitMs);
            return;
          }

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
          setRunFlowStatus((prev) => {
            if (data?.ok === false) {
              if (prev.runDelta === "running") return { ...prev, runDelta: "error" };
              if (prev.createJson === "running") return { ...prev, createJson: "error" };
              if (prev.createDb === "running") return { ...prev, createDb: "error" };
              return { ...prev, runDelta: "error" };
            }
            return { createDb: "done", createJson: "done", runDelta: "done" };
          });
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
          sseRetryCountRef.current = nextAttempt;
          const waitMs = Math.min(MAX_SSE_RETRY_WAIT_MS, 1000 * Math.pow(1.35, nextAttempt - 1));
          pushLog(
            `⚠ SSE disconnected. Reconnecting in ${(waitMs / 1000).toFixed(1)}s (attempt ${nextAttempt}, persistent)...`,
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
      setRunFlowStatus((prev) => {
        if (prev.createDb === "running") return { ...prev, createDb: "error" };
        if (prev.createJson === "running") return { ...prev, createJson: "error" };
        return { ...prev, runDelta: "error" };
      });
      setProgress((p) => ({
        ...p,
        message: `Error: ${e?.message || e}`,
        status: "error",
      }));
    }
  }

  async function stop() {
    if (!runId) return;
    const stoppingId = s(runId);

    setProgress((p) => ({ ...p, message: "Stopping…", status: "stopping" }));
    setIsRunning(false);
    runStartedAtRef.current = null;

    try {
      esRef.current?.close();
    } catch {}
    esRef.current = null;
    if (sseRetryTimerRef.current) {
      clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }

    const nowMs = Date.now();
    setActiveRuns((prev) =>
      prev.map((r) =>
        s(r.id) === stoppingId
          ? {
              ...r,
              status: "stopped",
              stopped: true,
              finished: true,
              updatedAt: nowMs,
            }
          : r,
      ),
    );

    try {
      await fetch(`/api/stop/${stoppingId}`, { method: "POST" });
      pushLog("🛑 Stop requested");
      await loadActiveRuns();
    } catch {
      pushLog("❌ Stop failed (network)");
      setProgress((p) => ({
        ...p,
        message: "Stop failed (network)",
        status: "error",
      }));
    }
  }

  async function deleteRunFromCard(runIdToDelete: string) {
    const id = s(runIdToDelete);
    if (!id) return;
    const confirmDelete = window.confirm(
      `Delete run ${id} from history?\nThis removes logs/events for this run.`,
    );
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/run/${encodeURIComponent(id)}?forceStop=1`, {
        method: "DELETE",
      });
      const json = (await safeJson(res)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(s(json?.error) || `HTTP ${res.status}`);
      }
      pushLog(`🗑️ Deleted run ${id}`);
      if (s(runId) === id) setRunId("");
      await loadActiveRuns();
    } catch (e: any) {
      pushLog(`❌ Delete failed for ${id}: ${e?.message || e}`);
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
    sseLastEventIdRef.current = 0;

    setRunId(id);
    setIsRunning(true);
    resetRunFlowStatus();
    if (!runStartedAtRef.current) runStartedAtRef.current = Date.now();
    pushLog(`🔎 Attaching to active run ${id}...`);
    // Reuse existing run() stream logic by opening /api/stream directly here.
    const qs = new URLSearchParams();
    if (sseLastEventIdRef.current > 0) {
      qs.set("afterEventId", String(sseLastEventIdRef.current));
    }
    const streamUrl = qs.size
      ? `/api/stream/${id}?${qs.toString()}`
      : `/api/stream/${id}`;
    const es = new EventSource(streamUrl);
    esRef.current = es;
    es.addEventListener("hello", (ev: MessageEvent) => {
      pushLog(`🟢 SSE connected: ${ev.data}`);
      setProgress((p) => ({ ...p, status: "running", message: "Running…" }));
    });
    es.addEventListener("line", (ev: MessageEvent) => {
      rememberSseEventCursor(ev);
      const raw = String(ev.data ?? "");
      if (!raw || raw === "__HB__" || raw === "__END__") return;
      if (shouldIgnoreRuntimeNoise(raw)) return;
      updateRunFlowFromLine(raw);
      pushLog(raw);
    });
    es.addEventListener("end", (ev: MessageEvent) => {
      let data: any = ev.data;
      try {
        data = JSON.parse(String(ev.data ?? ""));
      } catch {}

      const transientEnd =
        data?.reason === "not_found" ||
        data?.status === "running" ||
        data?.source === "db_error";
      if (transientEnd && isRunningRef.current && currentRunIdRef.current === id) {
        const nextAttempt = sseRetryCountRef.current + 1;
        sseRetryCountRef.current = nextAttempt;
        const waitMs = Math.min(MAX_SSE_RETRY_WAIT_MS, 1000 * Math.pow(1.35, nextAttempt - 1));
        pushLog(
          `⚠ SSE end transitorio (${s(data?.reason || data?.status || "unknown")}). Reintentando en ${(waitMs / 1000).toFixed(1)}s (attempt ${nextAttempt})...`,
        );
        setProgress((p) => ({ ...p, message: "SSE reconnecting…", status: "running" }));
        if (sseRetryTimerRef.current) {
          clearTimeout(sseRetryTimerRef.current);
          sseRetryTimerRef.current = null;
        }
        sseRetryTimerRef.current = setTimeout(() => {
          void attachToActiveRun(id);
        }, waitMs);
        return;
      }

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
      setRunFlowStatus((prev) => {
        if (data?.ok === false) {
          if (prev.runDelta === "running") return { ...prev, runDelta: "error" };
          if (prev.createJson === "running") return { ...prev, createJson: "error" };
          if (prev.createDb === "running") return { ...prev, createDb: "error" };
          return { ...prev, runDelta: "error" };
        }
        return { createDb: "done", createJson: "done", runDelta: "done" };
      });
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
      sseRetryCountRef.current = nextAttempt;
      const waitMs = Math.min(MAX_SSE_RETRY_WAIT_MS, 1000 * Math.pow(1.35, nextAttempt - 1));
      setProgress((p) => ({ ...p, message: "SSE reconnecting…", status: "running" }));
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
      const data = await fetchStateDetail(stateName);
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

  function getDetailRowByLocId(kind: "counties" | "cities", locId: string) {
    if (!detail) return null;
    const rows = kind === "cities" ? detail.cities.rows || [] : detail.counties.rows || [];
    const target = s(locId);
    if (!target) return null;
    return rows.find((r: any) => s(r["Location Id"]) === target) || null;
  }

  async function verifyDomainCreatedInSheet(
    stateName: string,
    kind: "counties" | "cities",
    locId: string,
  ): Promise<boolean | null> {
    const st = s(stateName);
    const id = s(locId);
    if (!st || !id) return null;
    try {
      const endpoint = routeTenantId
        ? `/api/sheet/state?name=${encodeURIComponent(st)}&tenantId=${encodeURIComponent(routeTenantId)}`
        : `/api/sheet/state?name=${encodeURIComponent(st)}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = (await safeJson(res)) as StateDetailResponse | any;
      if (!res.ok || data?.error) return null;
      const rows = kind === "cities" ? data?.cities?.rows || [] : data?.counties?.rows || [];
      const row = rows.find((r: any) => s(r["Location Id"]) === id);
      if (!row) return null;
      return isTrue(row["Domain Created"]);
    } catch {
      return null;
    }
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
            ? "No failed rows to retry."
            : "No active rows with a valid domain in this tab.",
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

  function pushDomainBotLog(line: unknown) {
    const msg = s(line);
    if (!msg) return;
    setDomainBotLogs((prev) => {
      const next = prev.concat(msg);
      return next.slice(Math.max(0, next.length - 120));
    });
  }

  function requestStopDomainBot() {
    if (!domainBotBusy) return;
    domainBotStopRequestedRef.current = true;
    setDomainBotStopRequested(true);
    pushDomainBotLog("Stop requested. Finishing current account, then stopping queue.");
  }

  function inferFailedStep(errorMessage: string, logs: string[]) {
    const err = s(errorMessage);
    const m0 = err.match(/(STEP_[A-Z0-9_]+)/);
    if (m0?.[1]) return m0[1];
    const m1 = err.match(/(step-\d+:[^:]+:failed)/i);
    if (m1?.[1]) return m1[1];
    const m2 = err.match(/Timeout:\s*([^|]+)/i);
    if (m2?.[1]) return s(m2[1]);

    const lastAction = [...(logs || [])]
      .reverse()
      .find((line) =>
        /(?:click|fill|open|pick|submit|radio|settings|verify|dropdown|modal|save|back)\s*(?:->|strict|exact|flow)/i.test(
          s(line),
        ),
      );
    return s(lastAction);
  }

  async function loadDomainBotFailures(kind?: "counties" | "cities") {
    if (!routeTenantId) return;
    setDomainBotFailuresLoading(true);
    setDomainBotFailuresMsg("");
    try {
      const qs = new URLSearchParams({ status: "open", limit: "150" });
      if (kind) qs.set("kind", kind);
      const res = await fetch(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/domain-bot-failures?${qs.toString()}`,
        { cache: "no-store" },
      );
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const rows = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      setDomainBotFailures(
        rows.map((r: any) => ({
          id: Number(r.id) || 0,
          kind: s(r.kind) === "cities" ? "cities" : "counties",
          locId: s(r.locId),
          rowName: s(r.rowName),
          domainUrl: s(r.domainUrl),
          activationUrl: s(r.activationUrl),
          failedStep: s(r.failedStep),
          errorMessage: s(r.errorMessage),
          logs: Array.isArray(r.logs) ? r.logs.map((x: unknown) => s(x)).filter(Boolean) : [],
          failCount: Number(r.failCount) || 1,
          status: s(r.status) === "resolved" ? "resolved" : s(r.status) === "ignored" ? "ignored" : "open",
          lastSeenAt: s(r.lastSeenAt),
          updatedAt: s(r.updatedAt),
        })),
      );
    } catch (e: any) {
      setDomainBotFailuresMsg(e?.message || "Failed to load failed runs");
    } finally {
      setDomainBotFailuresLoading(false);
    }
  }

  async function updateDomainBotFailureStatus(id: number, action: "resolve" | "ignore" | "reopen") {
    if (!routeTenantId || !id) return;
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/domain-bot-failures`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      await loadDomainBotFailures(detailTab);
    } catch (e: any) {
      setDomainBotFailuresMsg(e?.message || "Failed to update failed run");
    }
  }

  async function upsertDomainBotFailure(input: {
    locId: string;
    kind: "counties" | "cities";
    rowName: string;
    domainUrl: string;
    activationUrl: string;
    failedStep: string;
    errorMessage: string;
    logs: string[];
  }) {
    if (!routeTenantId) return;
    try {
      await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/domain-bot-failures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "failed",
          locId: s(input.locId),
          kind: input.kind,
          rowName: s(input.rowName),
          domainUrl: s(input.domainUrl),
          activationUrl: s(input.activationUrl),
          failedStep: s(input.failedStep),
          errorMessage: s(input.errorMessage),
          logs: Array.isArray(input.logs) ? input.logs : [],
          runSource: "local_extension",
        }),
      });
    } catch {
      // non-blocking: never break the bot flow because of failure persistence
    }
  }

  async function resolveDomainBotFailure(locId: string, kind: "counties" | "cities") {
    if (!routeTenantId) return;
    try {
      await fetch(`/api/tenants/${encodeURIComponent(routeTenantId)}/domain-bot-failures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "resolved",
          locId: s(locId),
          kind,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  async function loadDomainBotHeaders(
    locId: string,
    fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ) {
    const id = s(locId);
    if (!id || !routeTenantId) return { head: "", footer: "", favicon: "" };
    const qp = new URLSearchParams({ locId: id, tenantId: routeTenantId });
    const execFetch = fetcher || fetch;
    const res = await execFetch(`/api/sheet/headers?${qp.toString()}`, { cache: "no-store" });
    const data = await safeJson(res);
    if (!res.ok || (data as any)?.error) {
      throw new Error((data as any)?.error || `Headers HTTP ${res.status}`);
    }
    return {
      head: s((data as any)?.head),
      footer: s((data as any)?.footer),
      favicon: s((data as any)?.favicon),
    };
  }

  async function runDomainBotViaExtensionBridge(input: {
    activationUrl: string;
    domainToPaste: string;
    robotsTxt: string;
    headCode: string;
    bodyCode: string;
    faviconUrl: string;
    pageTypeNeedle?: string;
    timeoutMs?: number;
  }) {
    if (typeof window === "undefined") {
      throw new Error("Browser extension bridge is only available in browser context.");
    }
    const waitBridgeReady = async () =>
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", onReady);
          reject(
            new Error(
              "Extension bridge not detected on this page. Reload extension and refresh this tab.",
            ),
          );
        }, 4000);

        function onReady(event: MessageEvent) {
          if (event.source !== window) return;
          const data = event.data || {};
          if (data.type !== "DELTA_LOCAL_BOT_BRIDGE_READY") return;
          window.clearTimeout(timeout);
          window.removeEventListener("message", onReady);
          resolve();
        }

        window.addEventListener("message", onReady);
        window.postMessage({ type: "DELTA_LOCAL_BOT_BRIDGE_PING" }, "*");
      });

    await waitBridgeReady();

    const requestId = `ct_local_bot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return await new Promise<{
      ok: boolean;
      error?: string;
      logs?: string[];
      href?: string;
    }>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(
          new Error(
            "Timeout waiting extension response. Verify extension is installed/reloaded and this page matches extension bridge.",
          ),
        );
      }, Math.max(10_000, Number(input.timeoutMs) || 25 * 60 * 1000));

      function cleanup() {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      }

      function onMessage(event: MessageEvent) {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.type !== "DELTA_LOCAL_BOT_RESULT") return;
        if (s(data.requestId) !== requestId) return;
        cleanup();
        if (data.ok) {
          resolve({
            ok: true,
            logs: Array.isArray(data.logs) ? data.logs.map((x: unknown) => s(x)).filter(Boolean) : [],
          });
          return;
        }
        const err = new Error(s(data.error) || "Local extension bot failed.") as Error & {
          botLogs?: string[];
          href?: string;
        };
        err.botLogs = Array.isArray(data.logs)
          ? data.logs.map((x: unknown) => s(x)).filter(Boolean)
          : [];
        err.href = s(data.href);
        reject(err);
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          type: "DELTA_LOCAL_BOT_RUN",
          requestId,
          payload: {
            activationUrl: s(input.activationUrl),
            domainToPaste: s(input.domainToPaste),
            robotsTxt: s(input.robotsTxt),
            headCode: s(input.headCode),
            bodyCode: s(input.bodyCode),
            faviconUrl: s(input.faviconUrl),
            pageTypeNeedle: s(input.pageTypeNeedle) || "Home Page",
          },
        },
        "*",
      );
    });
  }

  function buildDomainBotSteps() {
    return [
      {
        action: "wait_for_url_contains",
        value: "/settings/domain",
        timeoutMs: 120000,
      },
      { action: "wait_for_timeout", ms: 3000 },
      {
        action: "evaluate",
        script: `
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function visible(el){
  if(!el) return false;
  const st=window.getComputedStyle(el);
  if(!st) return true;
  if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity||'1')===0) return false;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0;
}
const started=Date.now();
const timeoutMs=120000;
while(Date.now()-started<timeoutMs){
  const connect=document.querySelector('#connect-domain-button');
  const connectFallback=document.querySelector('#connect-domain-button-text, [data-testid="connect-domain-button"], [id*="connect-domain"], button[id*="connect-domain"]');
  const manage=document.querySelector('#manage-domain');
  const divider=document.querySelector('[data-testid="connect-domain-divider"]');
  if(visible(connect)||visible(connectFallback)||visible(manage)||visible(divider)) return 'ready';
  await sleep(350);
}
return 'not-ready-soft';
`,
      },
      {
        action: "evaluate",
        script: `
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function visible(el){
  if(!el) return false;
  const st=window.getComputedStyle(el);
  if(!st) return true;
  if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity||'1')===0) return false;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0;
}
const started=Date.now();
const timeoutMs=180000;
while(Date.now()-started<timeoutMs){
  const connect=document.querySelector('#connect-domain-button, #connect-domain-button-text, [data-testid="connect-domain-button"], [id*="connect-domain"], button[id*="connect-domain"]');
  const manage=document.querySelector('#manage-domain, [data-testid="manage-domain"], [id*="manage-domain"], button[id*="manage-domain"]');
  if(visible(connect)){
    window.__ct_connect_flow=true;
    connect.click();
    return 'connect-flow';
  }
  if(visible(manage)){
    window.__ct_connect_flow=false;
    return 'skip-to-manage';
  }
  await sleep(350);
}
window.__ct_connect_flow=false;
return 'skip-to-manage-timeout';
`,
      },
      {
        action: "evaluate",
        script: `
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
if(!window.__ct_connect_flow) return 'skip-connect-flow';
function visible(el){
  if(!el) return false;
  const st=window.getComputedStyle(el);
  if(!st) return true;
  if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity||'1')===0) return false;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0;
}
const waitPick=async(selectors,timeoutMs=45000)=>{
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    for(const sel of selectors){
      const el=document.querySelector(sel);
      if(visible(el)) return el;
    }
    await sleep(250);
  }
  throw new Error('Missing selectors: '+selectors.join(' | '));
};
const click=async(selectors)=>{
  const el=await waitPick(selectors);
  el.click();
  return el;
};
const fill=async(selectors,val)=>{
  const el=await waitPick(selectors);
  el.focus();
  el.value=String(val||'');
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  el.blur();
};
await sleep(220);
await click(['#connect-button-SITES','[id*="connect-button-SITES"]']);
await sleep(220);
await fill(['.n-input__input-el','input[type="text"]','input[type="url"]'],'{{domain_to_paste}}');
await sleep(180);
await click(['#add-records','[id*="add-records"]']);
await sleep(250);
await click(['#submit-manually','[id*="submit-manually"]']);
await sleep(220);
await click(['#addedRecord','[id*="addedRecord"]']);
await sleep(180);
document.querySelector('input[type="radio"][value="website"]')?.click();
return 'connect-flow-done';
`,
      },
      {
        action: "evaluate",
        script: `
if(!window.__ct_connect_flow) return 'skip-connect-dropdowns';
const norm=(s)=>(s||'').replace(/\\s+/g,' ').trim().toLowerCase();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function findFormItemByLabelContains(labelNeedle){
  const labels=[...document.querySelectorAll('.n-form-item-label, .n-form-item-label__text')];
  const labelEl=labels.find(el=>norm(el.textContent).includes(norm(labelNeedle)));
  if(!labelEl) throw new Error('Label not found: '+labelNeedle);
  return labelEl.closest('.n-form-item')||labelEl.parentElement?.parentElement?.parentElement;
}
function getVisibleMenu(){
  return [...document.querySelectorAll('.n-base-select-menu')].find(el=>el.offsetParent!==null)||null;
}
async function pickFromVirtualMenu(optionNeedle){
  const menu=getVisibleMenu();
  if(!menu) throw new Error('No visible dropdown menu');
  const scroller=menu.querySelector('.v-vl, .v-vl-container, .n-base-select-menu__content')||menu;
  const seen=new Map();
  for(let i=0;i<140;i+=1){
    const options=[...menu.querySelectorAll('.n-base-select-option,[role="option"]')];
    for(const el of options){
      const text=(el.textContent||'').replace(/\\s+/g,' ').trim();
      const title=(el.getAttribute('title')||'').trim();
      const key=title+'||'+text;
      if(text||title) seen.set(key,el);
    }
    const hit=[...seen.entries()].find(([k])=>norm(k).includes(norm(optionNeedle)));
    if(hit){ hit[1].click(); return 'picked:'+hit[0]; }
    const prev=scroller.scrollTop;
    scroller.scrollTop=prev+Math.max(140,scroller.clientHeight*0.9);
    await sleep(120);
    if(scroller.scrollTop===prev) break;
  }
  throw new Error('Option not found: '+optionNeedle);
}
async function openAndPick(labelNeedle, optionNeedle){
  const formItem=findFormItemByLabelContains(labelNeedle);
  const trigger=formItem?.querySelector('.n-base-selection-label,[class*="selection-label"],[tabindex="0"]');
  if(!trigger) throw new Error('Dropdown trigger not found for '+labelNeedle);
  trigger.click();
  await sleep(180);
  return pickFromVirtualMenu(optionNeedle);
}
await openAndPick('Link domain with website','County');
await sleep(350);
try{
  await openAndPick('Select default step/page for Domain','Home Page');
}catch(_e){
  await openAndPick('Select product type','Home Page');
}
return 'ok';
`,
      },
      {
        action: "evaluate",
        script: `
if(!window.__ct_connect_flow) return 'skip-submit';
document.querySelector('#submit')?.click();
return 'submitted';
`,
      },
      { action: "wait_for_selector", selector: "#manage-domain", timeoutMs: 240000 },
      { action: "click", selector: "#manage-domain", timeoutMs: 15000 },
      {
        action: "click",
        selector: "#domain-hub-connected-product-table-drop-action-dropdown-trigger",
        timeoutMs: 15000,
      },
      {
        action: "evaluate",
        script: "[...document.querySelectorAll('.n-dropdown-option-body__label')].find(el=>el.textContent?.trim()==='XML Sitemap')?.click(); return 'ok';",
      },
      { action: "click", selector: ".n-collapse-item__header-main", timeoutMs: 15000 },
      {
        action: "evaluate",
        script: `
const rows=[...document.querySelectorAll('div.flex.my-2.funnel-page')];
const targets=rows.filter(row=>((row.querySelector('div.ml-2')?.textContent||'').trim().includes('**')));
let clicked=0;
targets.forEach(row=>{
  const cb=row.querySelector('div.n-checkbox[role="checkbox"]');
  const checked=cb?.getAttribute('aria-checked')==='true';
  if(cb&&!checked){ cb.click(); clicked+=1; }
});
return {totalRows:rows.length,matched:targets.length,clicked};
`,
      },
      { action: "click", selector: "#modal-footer-btn-positive-action", timeoutMs: 15000 },
      { action: "click", selector: "#modal-footer-btn-positive-action", timeoutMs: 15000 },
      { action: "click", selector: "#modal-footer-btn-positive-action", timeoutMs: 15000 },
      {
        action: "click",
        selector: "#domain-hub-connected-product-table-drop-action-dropdown-trigger",
        timeoutMs: 15000,
      },
      {
        action: "evaluate",
        script: "[...document.querySelectorAll('.n-dropdown-option-body__label')].find(el=>el.textContent?.trim()==='Edit')?.click(); return 'ok';",
      },
      { action: "fill", selector: "textarea.n-input__textarea-el", value: "{{robots_txt}}", timeoutMs: 15000 },
      { action: "click", selector: "#modal-footer-btn-positive-action", timeoutMs: 15000 },
      { action: "click", selector: "#backButtonv2", timeoutMs: 15000 },
      { action: "click", selector: "#sb_sites", timeoutMs: 15000 },
      { action: "click", selector: "#sb_sites", timeoutMs: 15000 },
      { action: "click", selector: "#table1-drop-action-dropdown-trigger", timeoutMs: 15000 },
      {
        action: "evaluate",
        script: "[...document.querySelectorAll('span')].find(el=>el.textContent?.trim()==='County')?.click(); return 'ok';",
      },
      { action: "click", selector: "#table1-drop-action-dropdown-trigger", timeoutMs: 15000 },
      { action: "click", selector: ".n-dropdown-option-body__label", timeoutMs: 15000 },
      {
        action: "evaluate",
        script: "[...document.querySelectorAll('.hl-text-sm-medium')].find(el=>el.textContent?.trim()==='Settings')?.click(); return 'ok';",
      },
      {
        action: "fill",
        selector: "#faviconUrl input, .faviconUrl input, .faviconUrl .n-input__input-el",
        value: "{{favicon_url}}",
        timeoutMs: 15000,
      },
      { action: "fill", selector: "textarea.n-input__textarea-el", value: "{{head_code}}", timeoutMs: 15000 },
      {
        action: "fill",
        selector: "#head-tracking-code textarea.n-input__textarea-el, #head-tracking-code .n-input__textarea-el",
        value: "{{head_code}}",
        timeoutMs: 15000,
      },
      {
        action: "fill",
        selector: "#body-tracking-code textarea.n-input__textarea-el, #body-tracking-code .n-input__textarea-el",
        value: "{{body_code}}",
        timeoutMs: 15000,
      },
      {
        action: "click",
        selector: ".n-button.n-button--primary-type.n-button--medium-type.mt-3",
        timeoutMs: 15000,
      },
      { action: "wait_for_timeout", ms: 1200 },
      { action: "close_page" },
    ];
  }

  async function runDomainBotForLocId(
    locId: string,
    openActivationUrl?: string,
    row?: any,
    kindOverride?: "counties" | "cities",
    accountTimeoutMs?: number,
  ): Promise<{ status: "done" | "failed" | "stopped"; error?: string }> {
    const id = s(locId);
    const rowKind = kindOverride || detailTab;
    const rowName = getTabRowName(rowKind, row) || "Row";
    const rowDomainUrl = getTabRowDomainUrl(rowKind, row);
    if (!id) {
      setTabSitemapStatus({
        kind: rowKind,
        ok: false,
        message: "Missing Location Id for Domain Bot.",
      });
      return { status: "failed", error: "Missing Location Id for Domain Bot." };
    }
    if (!routeTenantId) {
      setTabSitemapStatus({
        kind: rowKind,
        ok: false,
        message: "Missing tenant context for Domain Bot.",
      });
      return { status: "failed", error: "Missing tenant context for Domain Bot." };
    }
    const domainToPaste =
      rowKind === "cities"
        ? s(row?.["City Domain"]) || s(row?.["city domain"])
        : s(row?.["Domain"]) || s(row?.["County Domain"]);
    const sitemapUrl = s(row?.["Sitemap"]);
    const activationUrlEffective = s(openActivationUrl) || domainBotUrlFromLocId(id);
    const ACCOUNT_TIMEOUT_MS = Math.max(60_000, Number(accountTimeoutMs) || domainBotAccountTimeoutMs);
    const accountStartedAt = Date.now();
    const msLeft = () => ACCOUNT_TIMEOUT_MS - (Date.now() - accountStartedAt);
    const ensureAccountTime = (stage: string) => {
      const left = msLeft();
      if (left <= 0) {
        throw new Error(`Account timeout (${Math.round(ACCOUNT_TIMEOUT_MS / 60000)}m) at ${stage}.`);
      }
      return left;
    };
    const fetchWithAccountTimeout = async (
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      stage: string,
      maxTimeoutMs = 120000,
    ) => {
      const left = ensureAccountTime(stage);
      const timeoutMs = Math.max(5000, Math.min(maxTimeoutMs, left));
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...(init || {}), signal: controller.signal });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw new Error(`Timeout at ${stage} (${Math.ceil(timeoutMs / 1000)}s).`);
        }
        throw e;
      } finally {
        window.clearTimeout(timer);
      }
    };

    setDomainBotRunOpen(true);
    setDomainBotBusy(true);
    setDomainBotLogs([]);
    setDomainBotScreenshotDataUrl("");
    let localRunLogs: string[] = [];
    pushDomainBotLog(`Start locId=${id}`);
    pushDomainBotLog(`Activation URL: ${activationUrlEffective || "(missing)"}`);
    setTabSitemapStatus({
      kind: rowKind,
      ok: true,
      message: `Starting Domain Bot for ${id} (custom values + DNS)...`,
    });
    try {
      ensureAccountTime("custom values start");
      const cvRes = await fetchWithAccountTimeout(
        `/api/tenants/${encodeURIComponent(routeTenantId)}/custom-values/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locId: id, kind: rowKind }),
        },
        "custom values",
        120000,
      );
      const cvData = await safeJson(cvRes);
      if (!cvRes.ok || !cvData?.ok) {
        throw new Error(s((cvData as any)?.error) || `Custom values HTTP ${cvRes.status}`);
      }
      pushDomainBotLog("Custom values applied.");

      const domainUrlForDns = s(toUrlMaybe(domainToPaste));
      if (domainUrlForDns) {
        pushDomainBotLog(`DNS upsert start: ${domainUrlForDns}`);
        ensureAccountTime("dns upsert start");
        const dnsRes = await fetchWithAccountTimeout(
          "/api/tools/cloudflare-dns-cname",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              tenantId: routeTenantId,
              domainUrl: domainUrlForDns,
              action: "upsert",
            }),
          },
          "dns upsert",
          120000,
        );
        const dnsData = await safeJson(dnsRes);
        if (!dnsRes.ok || !(dnsData as any)?.ok) {
          throw new Error((dnsData as any)?.error || `Cloudflare create failed (HTTP ${dnsRes.status})`);
        }
        pushDomainBotLog("DNS upsert done.");
      }

      ensureAccountTime("headers load start");
      const headers = await loadDomainBotHeaders(id, (u, i) =>
        fetchWithAccountTimeout(u, i, "headers load", 90000),
      );
      const robotsTxtValue = buildRobotsTxt(sitemapUrl);
      const steps = buildDomainBotSteps();
      pushDomainBotLog(`Local extension run start with ${steps.length} mapped steps.`);
      ensureAccountTime("local extension run start");
      const local = await runDomainBotViaExtensionBridge({
        activationUrl: activationUrlEffective,
        domainToPaste,
        robotsTxt: robotsTxtValue,
        faviconUrl: headers.favicon,
        headCode: headers.head,
        bodyCode: headers.footer,
        pageTypeNeedle: "Home Page",
        timeoutMs: Math.max(15000, msLeft()),
      });
      localRunLogs = Array.isArray(local.logs) ? local.logs.map((x) => s(x)).filter(Boolean) : [];
      localRunLogs.forEach((line) => pushDomainBotLog(line));
      if (!local.ok) {
        throw new Error(local.error || "Local extension run failed.");
      }
      pushDomainBotLog("Local extension run done.");

      ensureAccountTime("mark created start");
      const markRes = await fetchWithAccountTimeout(
        "/api/sheet/domain-created",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            tenantId: routeTenantId || "",
            locId: id,
            value: true,
            kind: rowKind,
          }),
        },
        "mark created",
        90000,
      );
      const markData = await safeJson(markRes);
      if (!markRes.ok || (markData as any)?.error) {
        throw new Error((markData as any)?.error || `Complete HTTP ${markRes.status}`);
      }
      pushDomainBotLog("Domain marked as created.");

      if (domainUrlForDns) {
        pushDomainBotLog("DNS delete start.");
        ensureAccountTime("dns delete start");
        const dnsDeleteRes = await fetchWithAccountTimeout(
          "/api/tools/cloudflare-dns-cname",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              tenantId: routeTenantId,
              domainUrl: domainUrlForDns,
              action: "delete",
            }),
          },
          "dns delete",
          120000,
        );
        const dnsDeleteData = await safeJson(dnsDeleteRes);
        if (!dnsDeleteRes.ok || !(dnsDeleteData as any)?.ok) {
          throw new Error(
            (dnsDeleteData as any)?.error || `Cloudflare delete failed (HTTP ${dnsDeleteRes.status})`,
          );
        }
        pushDomainBotLog("DNS delete done.");
      }

      const verifyCreated =
        openState && (rowKind === "counties" || rowKind === "cities")
          ? await verifyDomainCreatedInSheet(openState, rowKind, id)
          : null;
      if (verifyCreated === false) {
        throw new Error("Post-complete verification failed: Domain Created is still false.");
      }
      if (verifyCreated === true) {
        pushDomainBotLog("Post-complete verification OK (Domain Created=true).");
      } else {
        pushDomainBotLog("Post-complete verification skipped (state row not readable).");
      }

      setTabSitemapStatus({
        kind: rowKind,
        ok: true,
        message: `Domain Bot OK (${id}) [local-extension] + complete.`,
      });
      void resolveDomainBotFailure(id, rowKind);
      void loadDomainBotFailures(detailTab);
      await loadOverview();
      if (openState) await openDetail(openState);
      return { status: "done" };
    } catch (e: any) {
      const msg = e?.message || "request failed";
      const errorLogs = Array.isArray(e?.botLogs) ? e.botLogs.map((x: unknown) => s(x)).filter(Boolean) : localRunLogs;
      const failedStep = inferFailedStep(msg, errorLogs);
      if (/stopped by user|activation tab was closed by user|manual close|tab was closed/i.test(msg)) {
        pushDomainBotLog("STOPPED by user.");
        setTabSitemapStatus({
          kind: rowKind,
          ok: false,
          message: `Domain Bot stopped (${id}).`,
        });
      } else {
        pushDomainBotLog(`ERROR: ${msg}`);
        setTabSitemapStatus({
          kind: rowKind,
          ok: false,
          message: `Domain Bot failed (${id}): ${msg}`,
        });
        void upsertDomainBotFailure({
          locId: id,
          kind: rowKind,
          rowName,
          domainUrl: rowDomainUrl || s(toUrlMaybe(domainToPaste)),
          activationUrl: activationUrlEffective,
          failedStep,
          errorMessage: msg,
          logs: errorLogs,
        });
        void loadDomainBotFailures(detailTab);
      }
      return {
        status: /stopped by user|activation tab was closed by user|manual close|tab was closed/i.test(msg)
          ? "stopped"
          : "failed",
        error: msg,
      };
    } finally {
      setDomainBotBusy(false);
    }
  }

  async function runDomainBotSingle(
    locId: string,
    openActivationUrl?: string,
    row?: any,
  ) {
    domainBotStopRequestedRef.current = false;
    setDomainBotStopRequested(false);
    setDomainBotRunOpen(true);
    setDomainBotRunStartedAt(new Date().toISOString());
    setDomainBotRunDone(false);
    const rowName = getTabRowName(detailTab, row) || "Row";
    const domainUrl = getTabRowDomainUrl(detailTab, row);
    const key = `${detailTab}:${locId}:${rowName}:${domainUrl}`;
    setDomainBotRunItems([
      {
        key,
        locId: s(locId),
        rowName,
        domainUrl,
        status: "running",
      },
    ]);
    const out = await runDomainBotForLocId(
      locId,
      openActivationUrl,
      row,
      detailTab,
      domainBotAccountTimeoutMs,
    );
    setDomainBotRunItems((prev) =>
      prev.map((it) =>
        it.key === key
          ? {
              ...it,
              status: out.status,
              error: out.status === "failed" ? out.error || "Run failed." : "",
            }
          : it,
      ),
    );
    setDomainBotRunDone(true);
  }

  async function runDomainBotPendingForKind(kind: "counties" | "cities") {
    const queue = (pendingDomainBotRowsByKind[kind] || [])
      .map((row) => ({
        row,
        locId: s(row["Location Id"]),
        activationUrl: s(row["Domain URL Activation"]),
      }))
      .filter((x) => !!x.locId);

    if (!queue.length) {
      setTabSitemapStatus({
        kind,
        ok: false,
        message: `No eligible pending ${kind} rows in the current filter.`,
      });
      return;
    }

    domainBotStopRequestedRef.current = false;
    setDomainBotStopRequested(false);
    setDomainBotRunOpen(true);
    setDomainBotRunStartedAt(new Date().toISOString());
    setDomainBotRunDone(false);
    const runAccountTimeoutMs = domainBotAccountTimeoutMs;
    const preparedItems: DomainBotRunItem[] = queue.map((item) => {
      const rowName = getTabRowName(kind, item.row) || "Row";
      const domainUrl = getTabRowDomainUrl(kind, item.row);
      return {
        key: `${kind}:${item.locId}:${rowName}:${domainUrl}`,
        locId: item.locId,
        rowName,
        domainUrl,
        status: "pending",
      };
    });
    setDomainBotRunItems(preparedItems);

    for (let i = 0; i < queue.length; i += 1) {
      if (domainBotStopRequestedRef.current) break;
      const item = queue[i];
      pushDomainBotLog(
        `Account timeout reset for ${item.locId} (new ${Math.round(runAccountTimeoutMs / 60000)}m budget).`,
      );
      setDomainBotRunItems((prev) =>
        prev.map((it) =>
          it.locId === item.locId ? { ...it, status: "running", error: "" } : it,
        ),
      );
      setTabSitemapStatus({
        kind,
        ok: true,
        message: `Domain Bot ${kind} pending ${i + 1}/${queue.length} (${item.locId})...`,
      });
      // Sequential run, one account at a time.
      const out = await runDomainBotForLocId(
        item.locId,
        item.activationUrl,
        item.row,
        kind,
        runAccountTimeoutMs,
      );
      setDomainBotRunItems((prev) =>
        prev.map((it) =>
          it.locId === item.locId
            ? {
                ...it,
                status: out.status,
                error: out.status === "failed" ? out.error || "Run failed." : "",
              }
            : it,
        ),
      );
      if (domainBotStopRequestedRef.current) {
        if (out.status === "done") {
          pushDomainBotLog(
            `STOP_FLOW_OK: ${item.locId} finalized (all steps + complete), queue stop now.`,
          );
        }
        pushDomainBotLog(`Stop checkpoint reached after ${item.locId}. Queue stopped.`);
        break;
      }
      if (out.status === "stopped") break;
    }

    if (domainBotStopRequestedRef.current) {
      setTabSitemapStatus({
        kind,
        ok: false,
        message: `Domain Bot ${kind} stopped after finishing current account.`,
      });
      setDomainBotRunItems((prev) =>
        prev.map((it) => (it.status === "pending" ? { ...it, status: "stopped" } : it)),
      );
    }
    setDomainBotRunDone(true);
  }

  async function runDomainBotPendingInCurrentTab() {
    return await runDomainBotPendingForKind(detailTab);
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
        message: "No previous run available to retry.",
      });
      return;
    }
    const failedSet = new Set(last.items.filter((it) => !it.ok).map((it) => it.key));
    if (failedSet.size === 0) {
      setTabSitemapStatus({
        kind,
        ok: true,
        message: "No pending failures.",
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

  const searchBuilderIframeSrc = useMemo(() => {
    if (!routeTenantId) return "";
    const host = hostOnly(SEARCH_EMBEDDED_HOST) || SEARCH_EMBEDDED_HOST;
    const baseFolder = kebabToken(searchBuilderFolder) || "company-search";
    const searchId = kebabToken(searchBuilderActiveSearchId) || "search";
    const folder = `${searchId}-${baseFolder}`.slice(0, 120);
    const page = kebabToken(searchBuilderPageSlug) || "locations";
    const query = s(searchBuilderQuery).replace(/^\?+/, "");
    const base = `https://${host}/embedded/${routeTenantId}/${folder}/${page}.html`;
    return query ? `${base}?${query}` : base;
  }, [routeTenantId, searchBuilderHost, searchBuilderActiveSearchId, searchBuilderFolder, searchBuilderPageSlug, searchBuilderQuery]);

  const searchBuilderServiceArtifacts = useMemo(() => {
    const host = hostOnly(SEARCH_EMBEDDED_HOST) || SEARCH_EMBEDDED_HOST;
    const baseFolder = kebabToken(searchBuilderFolder) || "company-search";
    const searchId = kebabToken(searchBuilderActiveSearchId) || "search";
    const folder = `${searchId}-${baseFolder}`.slice(0, 120);
    const query = s(searchBuilderQuery).replace(/^\?+/, "");
    const withQuery = (url: string) => {
      if (!query) return url;
      return `${url}${url.includes("?") ? "&" : "?"}${query}`;
    };
    const manifestFiles =
      searchBuilderLastPublish && s(searchBuilderLastPublish.searchId) === s(searchBuilderActiveSearchId)
        ? searchBuilderLastPublish.files || []
        : [];
    const byServiceId = new Map(
      manifestFiles
        .map((f) => [s(f.serviceId), s(f.url)] as const)
        .filter((x) => !!x[0] && !!x[1]),
    );
    const byFileName = new Map(
      manifestFiles
        .map((f) => [s(f.fileName), s(f.url)] as const)
        .filter((x) => !!x[0] && !!x[1]),
    );
    const statesIndexUrl =
      routeTenantId && searchBuilderActiveSearchId
        ? `https://${host}/embedded/index/${routeTenantId}/${searchBuilderActiveSearchId}.json`
        : "";
    const activeServices = tenantProductsServices.filter((svc) => svc.isActive !== false);

    if (!activeServices.length) {
      const singleSlug = kebabToken(searchBuilderPageSlug) || "locations";
      const singlePath = normalizeRelativePath(searchBuilderDefaultBookingPath || "/") || "/";
      const iframeSrcBase = routeTenantId
        ? `https://${host}/embedded/${routeTenantId}/${folder}/${singleSlug}.html`
        : "";
      const publishedUrl = byServiceId.get("manual") || byFileName.get(`${singleSlug}.html`) || "";
      return [{
        id: "manual",
        name: "Manual Search",
        serviceId: "manual",
        bookingPath: singlePath,
        fileSlug: singleSlug,
        fileName: `${singleSlug}.html`,
        iframeSrc: publishedUrl ? withQuery(publishedUrl) : "",
        statesIndexUrl,
      }];
    }

    return activeServices.map((svc, idx) => {
      const serviceId = s(svc.serviceId) || `service-${idx + 1}`;
      const fileSlug = fileSlugFromService(serviceId || s(svc.name));
      const fileName = `${fileSlug}.html`;
      const bookingPath = normalizeRelativePath(searchBuilderDefaultBookingPath || "/");
      const iframeSrcBase = routeTenantId
        ? `https://${host}/embedded/${routeTenantId}/${folder}/${fileSlug}.html`
        : "";
      const publishedUrl = byServiceId.get(serviceId) || byFileName.get(fileName) || "";
      return {
        id: serviceId,
        name: s(svc.name) || serviceId,
        serviceId,
        bookingPath,
        fileSlug,
        fileName,
        iframeSrc: publishedUrl ? withQuery(publishedUrl) : "",
        statesIndexUrl,
      };
    });
  }, [routeTenantId, searchBuilderActiveSearchId, searchBuilderDefaultBookingPath, searchBuilderFolder, searchBuilderHost, searchBuilderLastPublish, searchBuilderPageSlug, searchBuilderQuery, tenantProductsServices]);

  useEffect(() => {
    if (!searchBuilderServiceArtifacts.length) {
      setSearchBuilderSelectedArtifactId("");
      return;
    }
    setSearchBuilderSelectedArtifactId((prev) => {
      if (prev && searchBuilderServiceArtifacts.some((it) => it.id === prev)) return prev;
      return searchBuilderServiceArtifacts[0].id;
    });
  }, [searchBuilderServiceArtifacts]);

  const selectedSearchBuilderArtifact = useMemo(() => {
    if (!searchBuilderServiceArtifacts.length) return null;
    return searchBuilderServiceArtifacts.find((it) => it.id === searchBuilderSelectedArtifactId) || searchBuilderServiceArtifacts[0];
  }, [searchBuilderSelectedArtifactId, searchBuilderServiceArtifacts]);

  const activeSearchBuilderProject = useMemo(
    () => searchBuilderProjects.find((p) => s(p.id) === s(searchBuilderActiveSearchId)) || null,
    [searchBuilderProjects, searchBuilderActiveSearchId],
  );
  const selectedSearchBuilderFont = useMemo(
    () => SEARCH_BUILDER_FONT_OPTIONS.find((f) => f.key === s(searchBuilderFontKey)) || SEARCH_BUILDER_FONT_OPTIONS[0],
    [searchBuilderFontKey],
  );

  function buildEmbedCodeForArtifact(artifact: {
    name: string;
    iframeSrc: string;
  }) {
    const companyLabel = s(searchBuilderCompanyName) || "Company";
    const buttonText = s(searchBuilderButtonText) || "Book Now";
    const modalTitle = s(searchBuilderModalTitle) || `${companyLabel} Locations`;
    const btnColor = s(searchBuilderButtonColor) || "#044c5c";
    const headerColor = s(searchBuilderHeaderColor) || "#a4d8e4";
    const fontImport = s(selectedSearchBuilderFont.importUrl);
    const fontFamily = s(selectedSearchBuilderFont.family) || "Lato";
    const btnRadius = Math.max(0, Number(searchBuilderButtonRadius) || 999);
    const btnPadY = Math.max(6, Number(searchBuilderButtonPaddingY) || 12);
    const btnPadX = Math.max(8, Number(searchBuilderButtonPaddingX) || 22);
    const btnFontSize = Math.max(10, Number(searchBuilderButtonFontSize) || 15);
    const btnFontWeight = Math.max(300, Number(searchBuilderButtonFontWeight) || 800);
    const btnShadow = Math.max(0, Number(searchBuilderButtonShadow) || 18);
    const modalRadius = Math.max(0, Number(searchBuilderModalRadius) || 16);
    const modalWidth = Math.max(360, Number(searchBuilderModalWidth) || 800);
    const modalHeight = Math.max(360, Number(searchBuilderModalHeight) || 680);
    const backdropOpacity = Math.max(0, Math.min(95, Number(searchBuilderModalBackdropOpacity) || 55));
    const headerHeight = Math.max(40, Number(searchBuilderModalHeaderHeight) || 56);
    const align =
      searchBuilderButtonPosition === "left"
        ? "left"
        : searchBuilderButtonPosition === "right"
          ? "right"
          : "center";
    const iframeSrc = escapeHtmlAttr(artifact.iframeSrc);
    return `<!-- ${companyLabel} ${artifact.name} Embed -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${escapeHtmlAttr(fontImport)}" rel="stylesheet">
<style>
.ct-book-wrap { font-family: ${escapeHtmlAttr(fontFamily)}, system-ui, -apple-system, Segoe UI, Roboto, Arial; text-align: ${align}; }
.ct-book-btn { display: inline-flex; align-items: center; justify-content: center; padding: ${btnPadY}px ${btnPadX}px; border-radius: ${btnRadius}px; border: 0; cursor: pointer; font-weight: ${btnFontWeight}; font-size: ${btnFontSize}px; background: ${btnColor}; color: #fff; box-shadow: 0 ${Math.round(btnShadow * 0.8)}px ${Math.round(btnShadow * 2)}px rgba(0,0,0,.22); text-decoration: none; transition: transform .08s ease, filter .12s ease; }
.ct-book-btn:hover { filter: brightness(1.06); }
.ct-book-btn:active { transform: translateY(1px); }
.ct-modal-toggle { position: absolute !important; opacity: 0 !important; pointer-events: none !important; width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; }
.ct-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,${(backdropOpacity / 100).toFixed(2)}); z-index: 999999; display: none; }
.ct-modal { position: fixed; inset: 0; z-index: 1000000; display: none; align-items: center; justify-content: center; padding: 18px; }
.ct-modal-toggle:checked ~ .ct-modal-backdrop, .ct-modal-toggle:checked ~ .ct-modal { display: flex; }
.ct-modal-card { width: min(${modalWidth}px, 96vw); height: min(${modalHeight}px, 86vh); background: #fff; border-radius: ${modalRadius}px; overflow: hidden; box-shadow: 0 26px 70px rgba(0,0,0,.35); display: flex; flex-direction: column; }
.ct-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; height: ${headerHeight}px; border-bottom: 1px solid rgba(0,0,0,.08); background: ${headerColor}; }
.ct-modal-title { font-size: 18px; font-weight: 800; color: #0b1b2a; }
.ct-modal-close { width: 40px; height: 40px; border-radius: 999px; border: 1px solid rgba(0,0,0,.12); cursor: pointer; background: #fff; font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.ct-modal-body { flex: 1; background: #fff; }
.ct-iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
@media (max-width: 640px){ .ct-modal-card{ width: 98vw; height: 90vh; border-radius: ${Math.max(10, Math.min(modalRadius, 18))}px; } }
</style>

<div class="ct-book-wrap">
  <input id="ctModalToggle" class="ct-modal-toggle" type="checkbox" />
  <label for="ctModalToggle" class="ct-book-btn">${escapeHtmlAttr(buttonText)}</label>
  <label for="ctModalToggle" class="ct-modal-backdrop"></label>
  <div class="ct-modal" role="dialog" aria-modal="true">
    <div class="ct-modal-card">
      <div class="ct-modal-header">
        <div class="ct-modal-title">${escapeHtmlAttr(modalTitle)}</div>
        <label for="ctModalToggle" class="ct-modal-close">✕</label>
      </div>
      <div class="ct-modal-body">
        <iframe class="ct-iframe" src="${iframeSrc}" title="${escapeHtmlAttr(modalTitle)}"></iframe>
      </div>
    </div>
  </div>
</div>`;
  }

  function buildSearchFileCodeForArtifact(artifact: {
    statesIndexUrl: string;
    bookingPath: string;
  }) {
    const safeTitle = escapeHtmlAttr(searchBuilderSearchTitle || "Choose your location");
    const safeSubtitle = escapeHtmlAttr(searchBuilderSearchSubtitle || "Search by State, County/Parish, or City. Then click Book Now.");
    const safePlaceholder = escapeHtmlAttr(searchBuilderSearchPlaceholder || "Choose your City, State, or Country");
    const safeStatesIndex = escapeHtmlAttr(artifact.statesIndexUrl);
    const safeBookPath = escapeHtmlAttr(artifact.bookingPath || "/");
    const safePrimary = escapeHtmlAttr(searchBuilderButtonColor || "#044c5c");
    const safeFontFamily = escapeHtmlAttr(selectedSearchBuilderFont.family || "Lato");
    const safeFontImport = escapeHtmlAttr(selectedSearchBuilderFont.importUrl || "");
    const inputRadius = Math.max(0, Number(searchBuilderInputRadius) || 10);
    const modalRadius = Math.max(0, Number(searchBuilderModalRadius) || 14);
    const buttonRadius = Math.max(0, Number(searchBuilderButtonRadius) || 12);
    const buttonPadY = Math.max(6, Number(searchBuilderButtonPaddingY) || 12);
    const buttonPadX = Math.max(8, Number(searchBuilderButtonPaddingX) || 14);
    const buttonFontWeight = Math.max(300, Number(searchBuilderButtonFontWeight) || 700);
    const buttonFontSize = Math.max(10, Number(searchBuilderButtonFontSize) || 14);
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${safeFontImport}" rel="stylesheet">
    <style>
      :root { --bg:#ffffff; --text:#0f172a; --muted:#64748b; --border:#e2e8f0; --primary:${safePrimary}; }
      body { margin:0; font-family: ${safeFontFamily}, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:transparent; color:var(--text); }
      .wrap { padding:28px; background:var(--bg); }
      h1 { margin:0 0 16px 0; font-size:34px; line-height:1.1; }
      .sub { margin:0 0 18px 0; color:var(--muted); font-size:14px; }
      .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .input { flex:1 1 420px; min-width:280px; border:2px solid #2563eb33; border-radius:${inputRadius}px; padding:14px 16px; font-size:18px; outline:none; }
      .panel { margin-top:16px; border:1px solid var(--border); border-radius:${modalRadius}px; overflow:hidden; }
      .list { max-height:360px; overflow:auto; background:#fff; }
      .item { padding:12px 14px; border-top:1px solid var(--border); cursor:pointer; }
      .item:hover { background:#f8fafc; }
      .item:first-child { border-top:0; }
      .title { font-weight:650; }
      .footer { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-top:1px solid var(--border); background:#fff; gap:12px; flex-wrap:wrap; }
      .btn { appearance:none; border:0; border-radius:${buttonRadius}px; padding:${buttonPadY}px ${buttonPadX}px; font-weight:${buttonFontWeight}; font-size:${buttonFontSize}px; cursor:pointer; }
      .btn.primary { background:var(--primary); color:#fff; }
      .btn.ghost { background:#f1f5f9; color:#0f172a; }
      .selected { color:var(--muted); font-size:13px; }
      .error { margin-top:10px; color:#b91c1c; font-size:13px; display:none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${safeTitle}</h1>
      <p class="sub">${safeSubtitle}</p>
      <div class="row">
        <input id="q" class="input" placeholder="${safePlaceholder}" autocomplete="off" />
      </div>
      <div class="panel">
        <div id="list" class="list"></div>
        <div class="footer">
          <div class="selected" id="selected">No selection yet.</div>
          <div class="row">
            <button class="btn ghost" id="clearBtn" type="button">Clear</button>
            <button class="btn primary" id="bookBtn" type="button" disabled>Book Now</button>
          </div>
        </div>
      </div>
      <div id="err" class="error"></div>
    </div>
    <script>
      const STATES_INDEX_URL = "${safeStatesIndex}";
      const BOOK_PATH_DEFAULT = "${safeBookPath}";
      const urlParams = new URLSearchParams(location.search);
      const redirectMode = (urlParams.get("redirectMode") || "county").toLowerCase();
      const bookPath = urlParams.get("bookPath") || BOOK_PATH_DEFAULT;
      let statesIndex = null, flat = [], selected = null;
      const $q = document.getElementById("q"), $list = document.getElementById("list"), $book = document.getElementById("bookBtn"), $sel = document.getElementById("selected"), $err = document.getElementById("err");
      function showError(msg){ $err.style.display = "block"; $err.textContent = msg; }
      function normalizeText(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }
      function joinUrl(domain,p){ if(!domain) return ""; const d = domain.endsWith("/")?domain.slice(0,-1):domain; const path = p.startsWith("/")?p:"/"+p; return d + path; }
      async function fetchJson(url){ const r = await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("Fetch failed " + r.status + ": " + url); return r.json(); }
      async function loadIndex(){ const data = await fetchJson(STATES_INDEX_URL); const items = Array.isArray(data?.items) ? data.items : []; return { items }; }
      function buildTarget(item){ const countyDomain = item?.countyDomain || ""; const cityDomain = item?.cityDomain || ""; const baseDomain = countyDomain || cityDomain; return joinUrl(baseDomain, bookPath); }
      function mapIndexItem(item){ const label = String(item?.label || "").trim(); const search = String(item?.search || "").trim(); const targetUrl = buildTarget(item); if(!label || !search) return null; return { label, search, targetUrl }; }
      function renderList(items){ $list.innerHTML = ""; if(!items.length){ const div = document.createElement("div"); div.className="item"; div.innerHTML = '<div class="title">No results</div>'; $list.appendChild(div); return; } for(const it of items.slice(0,60)){ const row=document.createElement("div"); row.className="item"; row.innerHTML='<div class="title">'+it.label+'</div>'; row.addEventListener("click",()=>{ selected=it; $sel.textContent='Selected: '+it.label; $book.disabled=false; }); $list.appendChild(row);} }
      function filter(q){ const nq = normalizeText(q.trim()); if(!nq) return []; return flat.filter((x)=>x.search.includes(nq)); }
      function doRedirect(url){ try{ window.top.location.href = url; } catch { window.location.href = url; } }
      async function bootstrap(){ try { statesIndex = await loadIndex(); flat = (statesIndex.items || []).map(mapIndexItem).filter(Boolean); if(!flat.length) showError("Search index loaded but has 0 items. Republish this search."); } catch(e){ showError((e && e.message) || "Failed to load locations."); } }
      $q.addEventListener("input",(e)=> renderList(filter((e.target && e.target.value) || "")));
      document.getElementById("clearBtn").addEventListener("click",()=>{ $q.value=""; selected=null; $book.disabled=true; $sel.textContent="No selection yet."; renderList([]); $q.focus(); });
      $book.addEventListener("click",()=>{ if(!selected || !selected.targetUrl) return; doRedirect(selected.targetUrl); });
      bootstrap();
    </script>
  </body>
</html>`;
  }

  async function copyArtifactEmbedCode(artifactId: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSearchBuilderCopiedArtifactId(artifactId);
      setTimeout(() => setSearchBuilderCopiedArtifactId(""), 1300);
    } catch {}
  }

  async function copyArtifactFileCode(artifactId: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSearchBuilderCopiedFileArtifactId(artifactId);
      setTimeout(() => setSearchBuilderCopiedFileArtifactId(""), 1300);
    } catch {}
  }

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
        ? (s(r.status).toLowerCase() === "stopped" || r.stopped)
          ? "stopped"
          : r.exitCode === 0
          ? "done"
          : "error"
        : r.stopped
          ? "stopped"
          : "running";
      const createdAtMs = Number(r.createdAt || 0);
      const endedAtMs =
        status === "running"
          ? Date.now()
          : Number(r.updatedAt || r.createdAt || Date.now());
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
          Math.max(0, Math.floor((endedAtMs - createdAtMs) / 1000)),
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

  const runHistorySimple = useMemo(() => {
    const summary = {
      state: "",
      createdAccounts: 0,
      updatedRows: 0,
      skippedTrue: 0,
      resumedItems: 0,
      errors: 0,
      phaseCreateDbDone: false,
      phaseCreateJsonDone: false,
      phaseRunDeltaStarted: false,
      finishedOk: false,
      finishedWithError: false,
    };

    const timeline: Array<{
      id: number;
      createdAt: string;
      text: string;
      tone: "info" | "ok" | "warn" | "error";
    }> = [];

    const pushStep = (
      ev: { id: number; createdAt: string },
      text: string,
      tone: "info" | "ok" | "warn" | "error" = "info",
    ) => {
      timeline.push({ id: ev.id, createdAt: ev.createdAt, text, tone });
    };

    for (const ev of runHistoryEvents) {
      const raw = s(ev.message);
      if (!raw) continue;
      if (shouldIgnoreRuntimeNoise(raw)) continue;

      const line = raw.toLowerCase();
      if (line.startsWith("__progress")) continue;

      if (line.includes("prebuild: create-db (build-sheet-rows): start")) {
        pushStep(ev, "Empezó el paso 1: crear base inicial (Counties + Cities).");
        continue;
      }
      if (line.includes("prebuild: create-db (build-sheet-rows): done")) {
        summary.phaseCreateDbDone = true;
        pushStep(ev, "Terminó el paso 1: base inicial lista.", "ok");
        continue;
      }
      if (line.includes("prebuild: generating state output json (build-counties)")) {
        pushStep(ev, "Empezó el paso 2: preparar JSON del estado.");
        continue;
      }
      if (line.includes("prebuild: build-counties done")) {
        summary.phaseCreateJsonDone = true;
        pushStep(ev, "Terminó el paso 2: JSON del estado creado.", "ok");
        continue;
      }
      if (line.includes("🏁 run state:")) {
        summary.phaseRunDeltaStarted = true;
        const m = raw.match(/RUN STATE:\s*([^\|]+)/i);
        const stateRaw = s(m?.[1]);
        if (stateRaw) summary.state = formatStateLabel(stateRaw);
        pushStep(ev, `Empezó el paso 3: ejecutar Delta en ${summary.state || "el estado seleccionado"}.`, "ok");
        continue;
      }
      if (line.includes("🏙️  cities for")) {
        const m = raw.match(/Cities for\s+\[[^\]]+\]\s+(.+?):\s*(\d+)/i);
        const county = s(m?.[1]);
        const total = Number(m?.[2] || 0);
        if (county && Number.isFinite(total) && total > 0) {
          pushStep(ev, `Ahora revisa ciudades de ${county} (${total} ciudades).`);
        } else {
          pushStep(ev, "Ahora está revisando ciudades de un county.");
        }
        continue;
      }
      if (line.includes("🧾 sheet updated")) {
        summary.updatedRows += 1;
        continue;
      }
      if (line.includes("🚀 creating county ->") || line.includes("🚀 creating city ->")) {
        summary.createdAccounts += 1;
        continue;
      }
      if (line.includes("⏭️ skip status true")) {
        summary.skippedTrue += 1;
        continue;
      }
      if (
        line.includes("resume-db-done") ||
        line.includes("resume-db-busy") ||
        line.includes("resume-skip")
      ) {
        summary.resumedItems += 1;
        continue;
      }
      if (line.includes("✅ state done")) {
        pushStep(ev, "Terminó el estado actual correctamente.", "ok");
        continue;
      }
      if (line.includes("🎉 done |")) {
        summary.finishedOk = true;
        const c = raw.match(/counties=(\d+)/i);
        const ci = raw.match(/cities=(\d+)/i);
        const totalCreated = Number(c?.[1] || 0) + Number(ci?.[1] || 0);
        if (Number.isFinite(totalCreated) && totalCreated > 0) {
          summary.createdAccounts = Math.max(summary.createdAccounts, totalCreated);
        }
        pushStep(ev, "Run completado con éxito.", "ok");
        continue;
      }
      if (line.includes("🏁 end") && line.includes("\"ok\":false")) {
        summary.finishedWithError = true;
        summary.errors += 1;
        pushStep(ev, "El run terminó con error.", "error");
        continue;
      }

      if (
        line.includes("❌") ||
        line.includes(" failed") ||
        line.includes("fatal:") ||
        line.includes("error")
      ) {
        summary.errors += 1;
        if (
          line.includes("/api/run failed") ||
          line.includes("worker delegate failed") ||
          line.includes("script not found")
        ) {
          pushStep(ev, "Falló el inicio del run por un error de conexión o configuración.", "error");
        } else {
          pushStep(ev, "Se detectó un error durante la ejecución.", "error");
        }
        continue;
      }
    }

    if (timeline.length === 0 && runHistoryEvents.length > 0) {
      const first = runHistoryEvents[0];
      const last = runHistoryEvents[runHistoryEvents.length - 1];
      timeline.push({
        id: Number(first?.id || 1),
        createdAt: s(first?.createdAt),
        text: "El run inició, pero aún no hay eventos resumibles en lenguaje simple.",
        tone: "info",
      });
      if (Number(last?.id || 0) !== Number(first?.id || 0)) {
        timeline.push({
          id: Number(last?.id || 2),
          createdAt: s(last?.createdAt),
          text: "Sigue avanzando. Puedes refrescar para ver más hitos.",
          tone: "info",
        });
      }
    }

    return { summary, timeline };
  }, [runHistoryEvents]);

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

  const tenantProductsServicesPageSize = 10;
  const tenantProductsServicesFiltered = useMemo(() => {
    const q = s(tenantProductsServicesSearch).toLowerCase();
    const indexed = tenantProductsServices.map((row, originalIndex) => ({ row, originalIndex }));
    if (!q) return indexed;
    return indexed.filter(({ row }) =>
      [row.serviceId, row.name, row.description, row.landingPath, row.formPath, row.bookingPath, row.cta]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [tenantProductsServices, tenantProductsServicesSearch]);
  const tenantProductsServicesPages = Math.max(
    1,
    Math.ceil(tenantProductsServicesFiltered.length / tenantProductsServicesPageSize),
  );
  const tenantProductsServicesPageSafe = Math.min(
    tenantProductsServicesPages,
    Math.max(1, tenantProductsServicesPage),
  );
  const tenantProductsServicesPagedRows = useMemo(() => {
    const start = (tenantProductsServicesPageSafe - 1) * tenantProductsServicesPageSize;
    return tenantProductsServicesFiltered.slice(start, start + tenantProductsServicesPageSize);
  }, [tenantProductsServicesFiltered, tenantProductsServicesPageSafe]);

  const stateFilePayloadObject = useMemo(() => {
    const raw = s(stateFilePayloadText);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [stateFilePayloadText]);

  const stateFileSearchRows = useMemo(() => {
    const rows = extractStateGeoRows(stateFilePayloadObject);
    const stQ = s(stateFileSearchState).toLowerCase();
    const coQ = s(stateFileSearchCounty).toLowerCase();
    const ciQ = s(stateFileSearchCity).toLowerCase();
    return rows.filter((row) => {
      const stateOk = !stQ || s(row.state).toLowerCase().includes(stQ);
      const countyOk = !coQ || s(row.county).toLowerCase().includes(coQ);
      const cityOk = !ciQ || s(row.city).toLowerCase().includes(ciQ);
      return stateOk && countyOk && cityOk;
    });
  }, [
    stateFilePayloadObject,
    stateFileSearchState,
    stateFileSearchCounty,
    stateFileSearchCity,
  ]);

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
    <main className="agencyShell dashboardPremium">
      <header className="agencyGlobalTopbar">
        <div className="agencyGlobalBrand">
          {tenantLogoUrl ? (
            <img
              className="logo tenantLogo"
              src={tenantLogoUrl}
              alt={tenantSummary?.name ? `${tenantSummary.name} logo` : "Tenant logo"}
            />
          ) : (
            <div className="agencyBrandLogo agencyBrandLogoDelta" />
          )}
          <div>
            <h1>
              {tenantSummary?.name || "Project"} — Delta Control Tower
            </h1>
            <p>
              {tenantSummary?.slug
                ? `@${tenantSummary.slug}`
                : routeTenantId
                  ? `tenant ${routeTenantId}`
                  : "tenant pending"}
            </p>
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
                  <span className="agencyProfileNotifBadge" aria-label={`${notificationCount} notifications`}>
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                ) : null}
                {s(authMe?.avatarUrl) ? (
                  <img className="agencyProfileAvatarImg" src={s(authMe?.avatarUrl)} alt={accountDisplayName()} />
                ) : (
                  initialsFromLabel(accountDisplayName())
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
                <button type="button" className="agencyAccountMenuItem" onClick={() => { setAccountMenuOpen(false); openAgencyAccountPanel("profile"); }}>
                  Profile
                </button>
                <button type="button" className="agencyAccountMenuItem" onClick={() => { setAccountMenuOpen(false); openAgencyAccountPanel("security"); }}>
                  Security
                </button>
                <button type="button" className="agencyAccountMenuItem agencyAccountMenuItemNotif" onClick={() => { setAccountMenuOpen(false); window.location.href = notificationHubHref; }}>
                  <span>Notifications</span>
                  <span className="agencyAccountMenuCount">{notificationCount}</span>
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
          <Link className="agencyNavItem agencyNavBackItem" href="/">
            ← Back to Agency
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "activation" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("activation")}
            onClick={() => setActiveProjectTab("activation")}
          >
            Home
          </Link>
          <Link
            className="agencyNavItem"
            href={
              routeTenantId
                ? `/dashboard?tenantId=${encodeURIComponent(routeTenantId)}&integrationKey=owner`
                : "/dashboard"
            }
          >
            Dashboard
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "runner" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("runner")}
            onClick={() => setActiveProjectTab("runner")}
          >
            Run Center
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "search_builder" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("search_builder")}
            onClick={() => setActiveProjectTab("search_builder")}
          >
            Search Builder
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "sheet" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("sheet")}
            onClick={() => setActiveProjectTab("sheet")}
          >
            Sheet Explorer
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "details" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("details")}
            onClick={() => setActiveProjectTab("details")}
          >
            Project Details
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "webhooks" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("webhooks")}
            onClick={() => setActiveProjectTab("webhooks")}
          >
            Webhook
          </Link>
          <Link
            className={`agencyNavItem ${activeProjectTab === "logs" ? "agencyNavItemActive" : ""}`}
            href={projectTabHref("logs")}
            onClick={() => setActiveProjectTab("logs")}
          >
            Logs
          </Link>
          </nav>
        </aside>

        <section className="agencyMain">

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
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "products_services" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("products_services")}
            >
              Products & Services
            </button>
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "seo_canva" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("seo_canva")}
            >
              SEO Canva Model
            </button>
            <button
              type="button"
              className={`detailsTabBtn ${detailsTab === "state_files" ? "detailsTabBtnOn" : ""}`}
              onClick={() => setDetailsTab("state_files")}
            >
              State Files
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
                      placeholder="https://telahagocrecer.com"
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
                      placeholder="https://telahagocrecer.com/{key}.txt"
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

          {detailsTab === "state_files" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">State Files Editor</div>
                <div className="detailsPaneSub">
                  Edit tenant state JSON directly from production DB, then save.
                </div>
              </div>

              <div className="detailsCustomTop">
                <div className="row" style={{ marginBottom: 10 }}>
                  <div className="field">
                    <label>State</label>
                    <select
                      className="select"
                      value={stateFileSelectedSlug}
                      onChange={(e) => setStateFileSelectedSlug(s(e.target.value).toLowerCase())}
                    >
                      {!statesOut.length ? <option value="">No states found</option> : null}
                      {statesOut.map((st) => (
                        <option key={st} value={st}>
                          {formatStateLabel(st)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>State Name</label>
                    <input
                      className="input"
                      value={stateFileStateName}
                      onChange={(e) => setStateFileStateName(e.target.value)}
                      placeholder="Florida"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  {stateFileMsg ? <span className="badge">{stateFileMsg}</span> : null}
                  {stateFileMetaUpdatedAt ? (
                    <span className="badge">
                      Updated: {new Date(stateFileMetaUpdatedAt).toLocaleString()}
                    </span>
                  ) : null}
                  {stateFileMetaSource ? <span className="badge">Source: {stateFileMetaSource}</span> : null}
                </div>

                {stateFileErr ? (
                  <div className="mini" style={{ color: "var(--danger)", marginBottom: 10 }}>
                    ❌ {stateFileErr}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <button
                    type="button"
                    className="smallBtn"
                    disabled={!routeTenantId || !stateFileSelectedSlug || stateFileLoading}
                    onClick={() => void loadStateFileForEditor(stateFileSelectedSlug)}
                  >
                    {stateFileLoading ? "Loading..." : "Load State JSON"}
                  </button>
                  <button
                    type="button"
                    className="smallBtn"
                    disabled={!routeTenantId || !stateFileSelectedSlug || stateFileSaving}
                    onClick={() => void saveStateFileFromEditor()}
                    title="Saves the full JSON payload to DB."
                  >
                    {stateFileSaving ? "Saving..." : "Save JSON"}
                  </button>
                </div>

                <textarea
                  className="input agencyTextarea"
                  rows={20}
                  value={stateFilePayloadText}
                  onChange={(e) => setStateFilePayloadText(e.target.value)}
                  placeholder='{"stateName":"Florida","counties":[]}'
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    width: "100%",
                  }}
                />
              </div>

              <div className="detailsCustomTop" style={{ marginTop: 12 }}>
                <div className="detailsPaneHeader" style={{ marginBottom: 8 }}>
                  <div className="detailsPaneTitle">Search by State / County / City</div>
                  <div className="detailsPaneSub">
                    Filter entries from current JSON and get the exact JSON path.
                  </div>
                </div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <div className="field">
                    <label>State</label>
                    <input
                      className="input"
                      value={stateFileSearchState}
                      onChange={(e) => setStateFileSearchState(e.target.value)}
                      placeholder="Florida"
                    />
                  </div>
                  <div className="field">
                    <label>County</label>
                    <input
                      className="input"
                      value={stateFileSearchCounty}
                      onChange={(e) => setStateFileSearchCounty(e.target.value)}
                      placeholder="Brevard"
                    />
                  </div>
                  <div className="field">
                    <label>City</label>
                    <input
                      className="input"
                      value={stateFileSearchCity}
                      onChange={(e) => setStateFileSearchCity(e.target.value)}
                      placeholder="Cocoa"
                    />
                  </div>
                </div>
                <div className="mini" style={{ marginBottom: 8 }}>
                  {stateFileSearchRows.length} matches
                </div>

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="th">State</th>
                        <th className="th">County</th>
                        <th className="th">City</th>
                        <th className="th">JSON Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!stateFileSearchRows.length ? (
                        <tr>
                          <td className="td" colSpan={4}>
                            <span className="mini">
                              No matches in current JSON. Load a state and adjust filters.
                            </span>
                          </td>
                        </tr>
                      ) : (
                        stateFileSearchRows.slice(0, 300).map((row, idx) => (
                          <tr key={`${row.cityPath}:${idx}`} className="tr">
                            <td className="td">{row.state || "—"}</td>
                            <td className="td">{row.county || "—"}</td>
                            <td className="td">{row.city || "—"}</td>
                            <td className="td">
                              <code>{row.cityPath}</code>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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

          {detailsTab === "products_services" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">Products & Services Catalog</div>
                <div className="detailsPaneSub">
                  Tenant-scoped services used by Campaign Factory and YouTube Ads CTA/links.
                </div>
              </div>

              <div className="detailsCustomTop">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ maxWidth: 360 }}
                    value={tenantProductsServicesSearch}
                    onChange={(e) => {
                      setTenantProductsServicesSearch(e.target.value);
                      setTenantProductsServicesPage(1);
                    }}
                    placeholder="Search services..."
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {tenantProductsServicesMsg ? <span className="badge">{tenantProductsServicesMsg}</span> : null}
                    <button type="button" className="smallBtn" onClick={() => addTenantProductsServiceRow()}>
                      Add Row
                    </button>
                    <button
                      type="button"
                      className="smallBtn"
                      disabled={!routeTenantId || tenantProductsServicesSaving || tenantProductsServicesLoading}
                      onClick={() => void saveTenantProductsServices()}
                    >
                      {tenantProductsServicesSaving ? "Saving..." : "Save Products & Services"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="tableWrap detailsCustomTableWrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Active</th>
                      <th className="th">Service ID</th>
                      <th className="th">Name</th>
                      <th className="th">Landing</th>
                      <th className="th">Form</th>
                      <th className="th">Booking</th>
                      <th className="th">CTA</th>
                      <th className="th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantProductsServicesLoading ? (
                      <tr>
                        <td className="td" colSpan={8}>
                          <span className="mini">Loading products/services...</span>
                        </td>
                      </tr>
                    ) : tenantProductsServicesFiltered.length === 0 ? (
                      <tr>
                        <td className="td" colSpan={8}>
                          <span className="mini">No services yet. Add a row and save.</span>
                        </td>
                      </tr>
                    ) : (
                      tenantProductsServicesPagedRows.map(({ row, originalIndex }) => (
                        <tr key={`${row.id || row.serviceId || "service"}:${originalIndex}`} className="tr">
                          <td className="td" style={{ width: 80 }}>
                            <input
                              type="checkbox"
                              checked={row.isActive !== false}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { isActive: e.target.checked })}
                            />
                          </td>
                          <td className="td" style={{ minWidth: 170 }}>
                            <input
                              className="input"
                              value={row.serviceId}
                              onChange={(e) =>
                                updateTenantProductsServiceAt(originalIndex, { serviceId: slugToken(e.target.value) })
                              }
                              placeholder="hydration"
                            />
                          </td>
                          <td className="td" style={{ minWidth: 220 }}>
                            <input
                              className="input"
                              value={row.name}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { name: e.target.value })}
                              placeholder="Mobile IV Therapy Hydration"
                            />
                          </td>
                          <td className="td" style={{ minWidth: 240 }}>
                            <input
                              className="input"
                              value={row.landingPath}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { landingPath: e.target.value })}
                              placeholder="/hydration-mobile-iv-therapy"
                            />
                          </td>
                          <td className="td" style={{ minWidth: 220 }}>
                            <input
                              className="input"
                              value={row.formPath}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { formPath: e.target.value })}
                              placeholder="/form-path"
                            />
                          </td>
                          <td className="td" style={{ minWidth: 220 }}>
                            <input
                              className="input"
                              value={row.bookingPath}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { bookingPath: e.target.value })}
                              placeholder="/booking-path"
                            />
                          </td>
                          <td className="td" style={{ minWidth: 180 }}>
                            <input
                              className="input"
                              value={row.cta}
                              onChange={(e) => updateTenantProductsServiceAt(originalIndex, { cta: e.target.value })}
                              placeholder="Book your IV visit"
                            />
                          </td>
                          <td className="td" style={{ width: 110 }}>
                            <button
                              type="button"
                              className="smallBtn"
                              onClick={() => removeTenantProductsServiceRow(originalIndex)}
                            >
                              Disable
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {tenantProductsServicesFiltered.length > tenantProductsServicesPageSize ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    <div className="mini">
                      Showing{" "}
                      {Math.min(
                        tenantProductsServicesFiltered.length,
                        (tenantProductsServicesPageSafe - 1) * tenantProductsServicesPageSize + 1,
                      )}{" "}
                      to{" "}
                      {Math.min(
                        tenantProductsServicesFiltered.length,
                        tenantProductsServicesPageSafe * tenantProductsServicesPageSize,
                      )}{" "}
                      of {tenantProductsServicesFiltered.length}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="smallBtn"
                        disabled={tenantProductsServicesPageSafe <= 1}
                        onClick={() => setTenantProductsServicesPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </button>
                      <span className="badge">
                        Page {tenantProductsServicesPageSafe} / {tenantProductsServicesPages}
                      </span>
                      <button
                        type="button"
                        className="smallBtn"
                        disabled={tenantProductsServicesPageSafe >= tenantProductsServicesPages}
                        onClick={() =>
                          setTenantProductsServicesPage((p) => Math.min(tenantProductsServicesPages, p + 1))
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

          {detailsTab === "seo_canva" ? (
            <div className="detailsPane">
              <div className="detailsPaneHeader">
                <div className="detailsPaneTitle">SEO Canva Model</div>
                <div className="detailsPaneSub">
                  Uses active Products & Services as keyword seeds and runs Google Ads Keyword Planner.
                </div>
              </div>

              <div className="detailsCustomTop">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div className="mini">
                    Awareness board flow: Unaware → Problem Aware → Solution Aware → Product Aware → Most Aware.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {seoCanvaMsg ? <span className="badge">{seoCanvaMsg}</span> : null}
                    {seoCanvaData?.generatedAt ? (
                      <span className="badge">Updated: {new Date(seoCanvaData.generatedAt).toLocaleString()}</span>
                    ) : null}
                    <button
                      type="button"
                      className="smallBtn"
                      disabled={!routeTenantId || seoCanvaLoading}
                      onClick={() => void runSeoCanvaModel()}
                    >
                      {seoCanvaLoading ? "Running..." : "Run from Products & Services"}
                    </button>
                  </div>
                </div>
                {seoCanvaErr ? (
                  <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>
                    ❌ {seoCanvaErr}
                  </div>
                ) : null}
                <div className="row" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>Industry Profile</label>
                    <select
                      className="select"
                      value={seoCanvaIndustryProfile}
                      onChange={(e) =>
                        setSeoCanvaIndustryProfile(
                          s(e.target.value) as
                            | "healthcare"
                            | "legal"
                            | "home_services"
                            | "saas"
                            | "ecommerce"
                            | "generic",
                        )
                      }
                    >
                      <option value="healthcare">Healthcare</option>
                      <option value="legal">Legal</option>
                      <option value="home_services">Home Services</option>
                      <option value="saas">SaaS</option>
                      <option value="ecommerce">Ecommerce</option>
                      <option value="generic">Generic</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Business Category (optional)</label>
                    <input
                      className="input"
                      value={seoCanvaBusinessCategory}
                      onChange={(e) => setSeoCanvaBusinessCategory(e.target.value)}
                      placeholder="ex: Mobile IV Therapy, Immigration Law, HVAC Repair"
                    />
                  </div>
                </div>
              </div>

              {seoCanvaData ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <span className="badge">Planner: {seoCanvaData.planner.ok ? "connected" : "partial"}</span>
                    <span className="badge">Source: {s(seoCanvaData.planner.source) || "n/a"}</span>
                    <span className="badge">Ideas: {Number(seoCanvaData.planner.totalIdeas || 0)}</span>
                    <span className="badge">Mapped: {Number(seoCanvaData.planner.mappedIdeas || 0)}</span>
                    <span className="badge">Services: {Number(seoCanvaData.planner.services || 0)}</span>
                    <span className="badge">Industry: {s(seoCanvaData.industryProfile) || seoCanvaIndustryProfile}</span>
                    {s(seoCanvaData.businessCategory) ? (
                      <span className="badge">Category: {seoCanvaData.businessCategory}</span>
                    ) : null}
                  </div>

                  <div className="tableWrap" style={{ marginTop: 12 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">Awareness Stage</th>
                          <th className="th">Keywords</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(seoCanvaData.boardSummary || []).map((row) => (
                          <tr key={row.stage} className="tr">
                            <td className="td">{row.stageLabel}</td>
                            <td className="td">{Number(row.count || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="detailsPaneHeader" style={{ marginTop: 14 }}>
                    <div className="detailsPaneTitle">Top URL Strategy (All Services)</div>
                    <div className="detailsPaneSub">
                      Dynamic format mix by tenant industry and search intent.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {(seoCanvaData.formatMix || []).map((row) => (
                      <span key={`mix:${row.format}`} className="badge">
                        {row.format}: {Number(row.count || 0)}
                      </span>
                    ))}
                    <button
                      type="button"
                      className="smallBtn"
                      disabled={seoCanvaQueueing}
                      onClick={() => void queueSeoCanvaAgentProposal()}
                    >
                      {seoCanvaQueueing ? "Sending..." : "Send to SEO Agent (OpenClaw)"}
                    </button>
                  </div>
                  <div className="tableWrap" style={{ marginTop: 8 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="th">URL</th>
                          <th className="th">Format</th>
                          <th className="th">Traffic</th>
                          <th className="th">Value</th>
                          <th className="th">Keywords</th>
                          <th className="th">Top keyword</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const rows = seoCanvaData.services
                            .flatMap((svc) =>
                              (svc.urlStrategyRows || []).map((row) => ({
                                ...row,
                                serviceId: svc.serviceId,
                              })),
                            )
                            .sort((a, b) => b.traffic - a.traffic || b.value - a.value)
                            .slice(0, 40);
                          if (rows.length === 0) {
                            return (
                              <tr>
                                <td className="td" colSpan={6}>
                                  <span className="mini">No URL strategy rows generated yet.</span>
                                </td>
                              </tr>
                            );
                          }
                          return rows.map((row) => (
                            <tr key={`all:${row.serviceId}:${row.url}`} className="tr">
                              <td className="td">
                                <a href={row.url} target="_blank" rel="noreferrer">
                                  {row.url}
                                </a>
                              </td>
                              <td className="td">{row.format}</td>
                              <td className="td">{Number(row.traffic || 0).toLocaleString()}</td>
                              <td className="td">${Number(row.value || 0).toLocaleString()}</td>
                              <td className="td">{Number(row.keywords || 0).toLocaleString()}</td>
                              <td className="td">{row.topKeyword}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  <div className="detailsCustomTop" style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <label className="mini" style={{ minWidth: 84 }}>Service</label>
                      <select
                        className="select"
                        style={{ minWidth: 320 }}
                        value={seoCanvaExpandedServiceId}
                        onChange={(e) => setSeoCanvaExpandedServiceId(s(e.target.value))}
                      >
                        {(seoCanvaData.services || []).map((svc) => (
                          <option key={svc.serviceId} value={svc.serviceId}>
                            {svc.name} ({svc.serviceId})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const selected =
                      (seoCanvaData.services || []).find((svc) => svc.serviceId === seoCanvaExpandedServiceId) ||
                      seoCanvaData.services[0] ||
                      null;
                    if (!selected) {
                      return <div className="mini" style={{ marginTop: 10 }}>No services available. Add rows in Products & Services first.</div>;
                    }
                    return (
                      <>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <span className="badge">Service: {selected.name}</span>
                          <span className="badge">Landing: {selected.landingPath}</span>
                          <span className="badge">Seeds: {selected.seeds.length}</span>
                          <span className="badge">Ideas: {selected.ideas.length}</span>
                          {selected.error ? <span className="badge">Error: {selected.error}</span> : null}
                        </div>
                        <div className="tableWrap" style={{ marginTop: 10 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th className="th">Keyword</th>
                                <th className="th">Stage</th>
                                <th className="th">Avg Monthly</th>
                                <th className="th">Competition</th>
                                <th className="th">Bid (Low-High)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selected.ideas.length === 0 ? (
                                <tr>
                                  <td className="td" colSpan={5}>
                                    <span className="mini">No keyword ideas returned for this service.</span>
                                  </td>
                                </tr>
                              ) : (
                                selected.ideas.slice(0, 50).map((idea) => (
                                  <tr key={`${selected.serviceId}:${idea.keyword}`} className="tr">
                                    <td className="td">{idea.keyword}</td>
                                    <td className="td">{idea.stageLabel}</td>
                                    <td className="td">{Number(idea.avgMonthlySearches || 0)}</td>
                                    <td className="td">
                                      {idea.competition} ({Number(idea.competitionIndex || 0)})
                                    </td>
                                    <td className="td">
                                      ${Number(idea.lowTopBid || 0).toFixed(2)} - ${Number(idea.highTopBid || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="detailsPaneHeader" style={{ marginTop: 14 }}>
                          <div className="detailsPaneTitle">Service URL Strategy</div>
                          <div className="detailsPaneSub">
                            Dynamic URL formats generated from this service keyword set.
                          </div>
                        </div>
                        <div className="tableWrap" style={{ marginTop: 8 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th className="th">URL</th>
                                <th className="th">Format</th>
                                <th className="th">Traffic</th>
                                <th className="th">Value</th>
                                <th className="th">Keywords</th>
                                <th className="th">Top keyword</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selected.urlStrategyRows || []).length === 0 ? (
                                <tr>
                                  <td className="td" colSpan={6}>
                                    <span className="mini">No URL strategy rows generated yet for this service.</span>
                                  </td>
                                </tr>
                              ) : (
                                (selected.urlStrategyRows || []).map((row) => (
                                  <tr key={`${selected.serviceId}:${row.url}`} className="tr">
                                    <td className="td">
                                      <a href={row.url} target="_blank" rel="noreferrer">
                                        {row.url}
                                      </a>
                                    </td>
                                    <td className="td">{row.format}</td>
                                    <td className="td">{Number(row.traffic || 0).toLocaleString()}</td>
                                    <td className="td">${Number(row.value || 0).toLocaleString()}</td>
                                    <td className="td">{Number(row.keywords || 0).toLocaleString()}</td>
                                    <td className="td">{row.topKeyword}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="mini" style={{ marginTop: 12 }}>
                  Run the model to generate Keyword Planner ideas from your active Products & Services.
                </div>
              )}
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
              Execute the provisioning pipeline with live progress, ETA, and full run control.
            </div>
          </div>
          <div className="cardHeaderActions">
            <div className="badge">{runId ? `Attached · ${runId}` : "No active attachment"}</div>
            <button className="smallBtn" onClick={loadActiveRuns}>
              Refresh runs
            </button>
          </div>
        </div>

        <div className="cardBody">
          <p className="runFlowNote">
            Pipeline enforced for <b>Run Delta System</b>: it now executes Create DB first, then Create Subaccount Json, and only then starts live creation.
          </p>
          <div className="runControlPanel">
          <div className="row runControlGrid">
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
              <div className="runFieldHint">Use Run Delta System for full provisioning flow.</div>
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
              <div className="runFieldHint">ALL processes the full state; you can limit to a specific state.</div>
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
              <div className="runFieldHint">Dry validates the flow without writes; Live creates/updates records.</div>
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
              <div className="runFieldHint">Keep ON only for troubleshooting; OFF reduces log noise.</div>
            </div>
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

          <div className="actions runPrimaryActions">
            <div className="runPrimaryMain">
              <label className="mini" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={allowParallelRuns}
                  onChange={(e) => setAllowParallelRuns(e.target.checked)}
                />
                Allow parallel runs
              </label>
              <div className="mini runExecutionMeta" style={{ alignSelf: "center" }}>
                Job: <b>{selectedJob?.label}</b>{" "}
                {isOneLocJob ? (
                  <>• locId: <b>{runLocId || "—"}</b></>
                ) : (
                  <>• State: <b>{stateOut === "all" ? "ALL" : formatStateLabel(stateOut)}</b></>
                )}{" "}
                • Mode: <b>{mode}</b>
              </div>
            </div>
            <div className="runPrimaryButtons">
              <button className="btn btnPrimary" onClick={() => run()} title="Run">
                Start Run
              </button>
              <button
                className="btn btnDanger"
                onClick={stop}
                disabled={!runId}
                title={!runId ? "No active runId" : "Stop"}
              >
                Stop Attached
              </button>
            </div>
          </div>

          <div className="runCenterSummary">
            <span className="badge runCenterBadge">Total: {runSummary.total}</span>
            <span className="badge runCenterBadge">Running: {runSummary.running}</span>
            <span className="badge runCenterBadge">Done: {runSummary.done}</span>
            <span className="badge runCenterBadge">Stopped: {runSummary.stopped}</span>
            <span className="badge runCenterBadge">Error: {runSummary.error}</span>
            <span className="badge runCenterBadge">History: persisted</span>
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
                  {(() => {
                    const msg = s(r.message).toLowerCase();
                    const lastLine = s(r.lastLine).toLowerCase();
                    const signal = `${msg} ${lastLine}`;
                    let createDbStatus: "pending" | "running" | "done" | "error" = "pending";
                    let createJsonStatus: "pending" | "running" | "done" | "error" = "pending";
                    let runDeltaStatus: "pending" | "running" | "done" | "error" = "pending";

                    const inCreateDb =
                      signal.includes("prebuild: create-db (build-sheet-rows): start") ||
                      signal.includes("[create-db]");
                    const createDbDone = signal.includes("prebuild: create-db (build-sheet-rows): done");
                    const inCreateJson =
                      signal.includes("prebuild: generating state output json (build-counties)") ||
                      signal.includes("[prebuild]");
                    const createJsonDone = signal.includes("prebuild: build-counties done");
                    const inRunDelta =
                      signal.includes("__run_pid__") ||
                      signal.includes("main: started child pid=") ||
                      signal.includes("phase:init ->") ||
                      signal.includes("🏁 run state:") ||
                      signal.includes("runner-heartbeat:") ||
                      signal.includes("🧩 county") ||
                      signal.includes("🏙️");

                    if (r.status === "done") {
                      createDbStatus = "done";
                      createJsonStatus = "done";
                      runDeltaStatus = "done";
                    } else if (r.status === "error" || r.status === "stopped") {
                      if (inCreateDb && !createDbDone) {
                        createDbStatus = "error";
                      } else if ((inCreateJson || createDbDone) && !createJsonDone && !inRunDelta) {
                        createDbStatus = "done";
                        createJsonStatus = "error";
                      } else {
                        createDbStatus = "done";
                        createJsonStatus = "done";
                        runDeltaStatus = "error";
                      }
                    } else if (inCreateDb && !createDbDone) {
                      createDbStatus = "running";
                    } else if ((inCreateJson || createDbDone) && !createJsonDone && !inRunDelta) {
                      createDbStatus = "done";
                      createJsonStatus = "running";
                    } else if (inRunDelta || createJsonDone) {
                      createDbStatus = "done";
                      createJsonStatus = "done";
                      runDeltaStatus = "running";
                    } else {
                      createDbStatus = "running";
                    }

                    const stepClasses = (status: "pending" | "running" | "done" | "error") =>
                      status === "done"
                        ? "runFlowStepDone"
                        : status === "running"
                          ? "runFlowStepLoading runFlowStepActive"
                          : status === "error"
                            ? "runFlowStepError"
                            : "runFlowStepPending";

                    return (
                      <>
                  <div className="runCardHead">
                    <div className="runCardTitle">
                      <b>{formatStateLabel(r.stateLabel) || "ALL"}</b>
                      <span className="mini runCardSubline runCardRunId">runId: {r.id}</span>
                    </div>
                    <span className="badge runCardPct">{r.pct}%</span>
                  </div>

                  <div className="runCardMeta mini">
                    <span className={`runMetaPill runMetaStatus runMetaStatus${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`}>
                      Status: <b>{r.status}</b>
                    </span>
                    <span className="runMetaPill">Done: <b>{r.doneLabel}</b></span>
                    <span className="runMetaPill">Elapsed: <b>{r.elapsed}</b></span>
                    <span className="runMetaPill">ETA: <b>{r.eta}</b></span>
                    <span className="runMetaPill">Updated: <b>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</b></span>
                  </div>

                  <div className="runCardFlowTrack" aria-hidden>
                    <div className="runFlowStepWrap">
                      <span className={`runFlowStep ${stepClasses(createDbStatus)}`}>
                        <span className="runFlowStepFill" aria-hidden style={{ width: `${createDbStatus === "running" ? 68 : createDbStatus === "done" ? 100 : createDbStatus === "error" ? 100 : 0}%` }} />
                        <span className="runFlowStepLabel">1. Build Sheet DB</span>
                      </span>
                      <span className="runFlowArrow">→</span>
                    </div>
                    <div className="runFlowStepWrap">
                      <span className={`runFlowStep ${stepClasses(createJsonStatus)}`}>
                        <span className="runFlowStepFill" aria-hidden style={{ width: `${createJsonStatus === "running" ? 68 : createJsonStatus === "done" ? 100 : createJsonStatus === "error" ? 100 : 0}%` }} />
                        <span className="runFlowStepLabel">2. Build State JSON</span>
                      </span>
                      <span className="runFlowArrow">→</span>
                    </div>
                    <div className="runFlowStepWrap">
                      <span className={`runFlowStep ${stepClasses(runDeltaStatus)}`}>
                        <span className="runFlowStepFill" aria-hidden style={{ width: `${runDeltaStatus === "running" ? Math.max(9, Math.min(100, r.pct)) : runDeltaStatus === "done" ? 100 : runDeltaStatus === "error" ? 100 : 0}%` }} />
                        <span className="runFlowStepLabel">3. Create + Sync Accounts</span>
                      </span>
                    </div>
                    {r.status === "done" && s(r.stateLabel).toLowerCase() !== "all" && s(r.stateLabel).toLowerCase() !== "one" ? (
                      <>
                        <span className="runFlowArrow">→</span>
                        <button
                          type="button"
                          className="runFlowStep runFlowStepDone runFlowStepAction"
                          onClick={() => void openRunBotFromRunCard(s(r.meta?.state) || r.stateLabel)}
                          title="Open Run Pending bot actions for this state"
                        >
                          <span className="runFlowStepLabel">4. Run Bot</span>
                        </button>
                      </>
                    ) : null}
                  </div>

                  <div className="runCardActions">
                    <button
                      type="button"
                      className="smallBtn runCardActionBtn"
                      disabled={r.status !== "done"}
                      title={r.status === "done" ? "Run again (reprocess Status=false rows)" : "Rerun only available when run is done"}
                      onClick={() => {
                        const rerunJob = s(r.meta?.job);
                        if (!rerunJob) {
                          pushLog(`❌ Rerun unavailable for ${r.id}: missing original job in run metadata.`);
                          return;
                        }
                        void run({
                          job: rerunJob,
                          state: s(r.meta?.state) || r.stateLabel,
                          mode: s(r.meta?.mode).toLowerCase() === "dry" ? "dry" : "live",
                          debug: !!r.meta?.debug,
                          locId: s(r.meta?.locId),
                          kind: s(r.meta?.kind),
                          allowConcurrent: false,
                          rerun: true,
                        });
                      }}
                    >
                      Rerun
                    </button>
                    <button
                      type="button"
                      className="smallBtn runCardActionBtn"
                      onClick={() => void openRunHistory(r.id)}
                    >
                      View History
                    </button>
                    <button
                      type="button"
                      className="smallBtn runCardActionBtn runCardActionBtnStop"
                      disabled={r.finished}
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/stop/${r.id}`, { method: "POST" });
                          const json = (await safeJson(res)) as { ok?: boolean; error?: string; forced?: boolean } | null;
                          if (!res.ok || !json?.ok) {
                            throw new Error(s(json?.error) || `HTTP ${res.status}`);
                          }
                          pushLog(`🛑 Stop requested for ${r.id}${json?.forced ? " (forced-db)" : ""}`);
                          await loadActiveRuns();
                        } catch (e: any) {
                          pushLog(`❌ Stop failed for ${r.id}: ${e?.message || e}`);
                        }
                      }}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      className="smallBtn runCardActionBtn runCardActionBtnDelete"
                      onClick={() => void deleteRunFromCard(r.id)}
                      title="Delete run and persisted events"
                    >
                      Delete
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeProjectTab === "search_builder" ? (
      <section className={`card ${searchBuilderEditorOpen ? "searchBuilderFullscreen" : ""}`} style={{ marginTop: 14 }} ref={searchBuilderRef}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">
              {searchBuilderEditorOpen && activeSearchBuilderProject
                ? `Search Builder Editor · ${s(activeSearchBuilderProject.name) || "Search"}`
                : "Search Builder"}
            </h2>
            <div className="cardSubtitle">
              {searchBuilderEditorOpen
                ? "Editor completo del search. Ajusta estilos y publica desde esta vista."
                : "Crea y administra searches por proyecto. Cada search guarda su config, index y publicación en DB."}
            </div>
          </div>
          <div className="cardHeaderActions">
            {searchBuilderMsg ? <span className="badge">{searchBuilderMsg}</span> : null}
            {searchBuilderErr ? <span className="badge" style={{ color: "var(--danger)" }}>{searchBuilderErr}</span> : null}
            {searchBuilderEditorOpen ? (
              <>
                <button type="button" className="smallBtn" onClick={() => setSearchBuilderEditorOpen(false)}>
                  Back
                </button>
                <button type="button" className="smallBtn" disabled={searchBuilderSaving || searchBuilderPublishing} onClick={() => void saveSearchBuilderSettings()}>
                  {searchBuilderSaving ? "Saving..." : "Save"}
                </button>
                <button type="button" className="smallBtn" disabled={searchBuilderSaving || searchBuilderPublishing} onClick={() => void publishSearchBuilderFiles()}>
                  {searchBuilderPublishing ? "Publishing..." : "Publish"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="smallBtn" disabled={searchBuilderProjectsLoading} onClick={() => void loadSearchBuilderProjects()}>
                  {searchBuilderProjectsLoading ? "Loading..." : "Refresh"}
                </button>
                <button type="button" className="smallBtn" disabled={searchBuilderCreating} onClick={() => void createNewSearchBuilder()}>
                  {searchBuilderCreating ? "Creating..." : "+ Add New Search"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="cardBody">
          {!searchBuilderEditorOpen && searchBuilderProjects.length === 0 ? (
            <div className="mini">No searches yet. Use <b>+ Add New Search</b> to create the first one.</div>
          ) : !searchBuilderEditorOpen ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {searchBuilderProjects.map((project) => {
                const isActive = s(project.id) === s(searchBuilderActiveSearchId) && searchBuilderEditorOpen;
                return (
                  <article
                    key={project.id}
                    style={{
                      border: isActive ? "1px solid rgba(255,255,255,.45)" : "1px solid rgba(255,255,255,.14)",
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "linear-gradient(165deg, rgba(15,23,42,.96), rgba(2,6,23,.92))",
                    }}
                  >
                    <div style={{ height: 86, background: `linear-gradient(115deg, ${s(project.headerColor) || "#a4d8e4"}, ${s(project.buttonColor) || "#044c5c"})`, padding: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#031623" }}>{s(project.name) || "Untitled Search"}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(2,22,34,.86)" }}>{s(project.modalTitle) || "Locations"}</div>
                    </div>
                    <div style={{ padding: 12 }}>
                      <div className="mini">{s(project.folder) || "company-search"}</div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="smallBtn" onClick={() => openSearchBuilderEditor(project.id)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="smallBtn"
                          disabled={searchBuilderDeletingId === s(project.id)}
                          onClick={() => void deleteSearchBuilderProject(project.id)}
                        >
                          {searchBuilderDeletingId === s(project.id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          {searchBuilderEditorOpen && activeSearchBuilderProject ? (
            <div className="searchBuilderEditorPage">
              <div className="searchBuilderEditorPageBody">
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href={selectedSearchBuilderFont.importUrl} rel="stylesheet" />

                <div className="sbStudio">
                  <aside className="sbStudioNav">
                    <div className="sbStudioNavTitle">Editor</div>
                    <button
                      type="button"
                      className={`sbStudioNavBtn ${searchBuilderEditorPanel === "button" ? "isActive" : ""}`}
                      onClick={() => setSearchBuilderEditorPanel("button")}
                    >
                      1. Button
                    </button>
                    <button
                      type="button"
                      className={`sbStudioNavBtn ${searchBuilderEditorPanel === "modal" ? "isActive" : ""}`}
                      onClick={() => setSearchBuilderEditorPanel("modal")}
                    >
                      2. Modal
                    </button>
                  </aside>

                  <section className="sbStudioPreview">
                    <div className="sbStudioPreviewTop">
                      <div className="mini">
                        Live Preview ({searchBuilderEditorPanel === "button" ? "Button" : "Modal"})
                      </div>
                      <div className="sbStudioToneGroup">
                        <button
                          type="button"
                          className={`sbStudioToneBtn ${searchBuilderPreviewTone === "dark" ? "isActive" : ""}`}
                          onClick={() => setSearchBuilderPreviewTone("dark")}
                        >
                          Dark
                        </button>
                        <button
                          type="button"
                          className={`sbStudioToneBtn ${searchBuilderPreviewTone === "light" ? "isActive" : ""}`}
                          onClick={() => setSearchBuilderPreviewTone("light")}
                        >
                          Light
                        </button>
                      </div>
                    </div>
                    <div
                      className={`sbStudioPreviewSurface ${searchBuilderPreviewTone === "light" ? "isLight" : "isDark"}`}
                      style={{
                        fontFamily: `${selectedSearchBuilderFont.family}, system-ui, -apple-system, Segoe UI, Roboto, Arial`,
                      }}
                    >
                      {searchBuilderEditorPanel === "button" ? (
                      <div
                        className="sbStudioButtonLane sbStudioButtonOnly"
                        style={{
                          justifyContent:
                            searchBuilderButtonPosition === "left"
                              ? "flex-start"
                              : searchBuilderButtonPosition === "right"
                                ? "flex-end"
                                : "center",
                        }}
                      >
                        <span
                          className="sbStudioBookBtn"
                          style={{
                            padding: `${searchBuilderButtonPaddingY}px ${searchBuilderButtonPaddingX}px`,
                            borderRadius: searchBuilderButtonRadius,
                            fontWeight: searchBuilderButtonFontWeight,
                            fontSize: searchBuilderButtonFontSize,
                            background: s(searchBuilderButtonColor) || "#044c5c",
                            boxShadow: `0 ${Math.round(searchBuilderButtonShadow * 0.8)}px ${Math.round(searchBuilderButtonShadow * 2)}px rgba(0,0,0,.22)`,
                          }}
                        >
                          {s(searchBuilderButtonText) || "Book Now"}
                        </span>
                      </div>
                      ) : (
                      <div
                        className="sbStudioModalPreview"
                        style={{
                          borderRadius: searchBuilderModalRadius,
                        }}
                      >
                        <div
                          className="sbStudioModalHeader"
                          style={{
                            height: searchBuilderModalHeaderHeight,
                            background: s(searchBuilderHeaderColor) || "#a4d8e4",
                          }}
                        >
                          <strong style={{ color: "#0b1b2a" }}>{s(searchBuilderModalTitle) || "Locations"}</strong>
                          <span className="sbStudioModalClose">x</span>
                        </div>
                        <div className="sbStudioModalBody">
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{s(searchBuilderSearchTitle) || "Choose your location"}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                            {s(searchBuilderSearchSubtitle) || "Search by State, County/Parish, or City. Then click Book Now."}
                          </div>
                          <input
                            readOnly
                            value={s(searchBuilderSearchPlaceholder) || "Choose your City, State, or Country"}
                            style={{
                              width: "100%",
                              border: "1px solid #e2e8f0",
                              borderRadius: searchBuilderInputRadius,
                              padding: "10px 12px",
                              fontSize: 13,
                            }}
                          />
                          <div className="mini" style={{ marginTop: 10 }}>
                            Width {searchBuilderModalWidth}px • Height {searchBuilderModalHeight}px • Backdrop {searchBuilderModalBackdropOpacity}%
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  </section>

                  <aside className="sbStudioSettings">
                    <div className="sbStudioSettingsTitle">
                      {searchBuilderEditorPanel === "button" ? "Button Controls" : "Modal Controls"}
                    </div>
                    <div className="field">
                      <label>Search Name</label>
                      <input className="input" value={searchBuilderName} onChange={(e) => setSearchBuilderName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Company Name</label>
                      <input className="input" value={searchBuilderCompanyName} onChange={(e) => setSearchBuilderCompanyName(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Google Font</label>
                      <select className="select" value={searchBuilderFontKey} onChange={(e) => setSearchBuilderFontKey(e.target.value)}>
                        {SEARCH_BUILDER_FONT_OPTIONS.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Book Now Path</label>
                      <input
                        className="input"
                        value={searchBuilderDefaultBookingPath}
                        onChange={(e) => setSearchBuilderDefaultBookingPath(e.target.value)}
                        placeholder="/book-now"
                      />
                    </div>
                    <div className="field">
                      <label>Service/Search file</label>
                      <select className="select" value={searchBuilderSelectedArtifactId} onChange={(e) => setSearchBuilderSelectedArtifactId(e.target.value)}>
                        {searchBuilderServiceArtifacts.map((artifact) => (
                          <option key={artifact.id} value={artifact.id}>{artifact.name} ({artifact.fileName})</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Generated iframe URL</label>
                      <input className="input" value={selectedSearchBuilderArtifact?.iframeSrc || searchBuilderIframeSrc} readOnly />
                    </div>

                    {searchBuilderEditorPanel === "button" ? (
                      <>
                        <div className="field">
                          <label>Button Text</label>
                          <input className="input" value={searchBuilderButtonText} onChange={(e) => setSearchBuilderButtonText(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Button Position</label>
                          <select className="select" value={searchBuilderButtonPosition} onChange={(e) => setSearchBuilderButtonPosition((e.target.value as "left" | "center" | "right"))}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Button Color</label>
                          <input className="input" value={searchBuilderButtonColor} onChange={(e) => setSearchBuilderButtonColor(e.target.value)} placeholder="#044c5c" />
                        </div>
                        <div className="field">
                          <label>Button Radius</label>
                          <input className="input" type="number" min={0} max={999} value={searchBuilderButtonRadius} onChange={(e) => setSearchBuilderButtonRadius(Number(e.target.value) || 0)} />
                        </div>
                        <div className="field">
                          <label>Button Padding Y</label>
                          <input className="input" type="number" min={6} max={32} value={searchBuilderButtonPaddingY} onChange={(e) => setSearchBuilderButtonPaddingY(Number(e.target.value) || 12)} />
                        </div>
                        <div className="field">
                          <label>Button Padding X</label>
                          <input className="input" type="number" min={8} max={60} value={searchBuilderButtonPaddingX} onChange={(e) => setSearchBuilderButtonPaddingX(Number(e.target.value) || 22)} />
                        </div>
                        <div className="field">
                          <label>Button Font Size</label>
                          <input className="input" type="number" min={10} max={30} value={searchBuilderButtonFontSize} onChange={(e) => setSearchBuilderButtonFontSize(Number(e.target.value) || 15)} />
                        </div>
                        <div className="field">
                          <label>Button Font Weight</label>
                          <input className="input" type="number" min={300} max={900} step={100} value={searchBuilderButtonFontWeight} onChange={(e) => setSearchBuilderButtonFontWeight(Number(e.target.value) || 800)} />
                        </div>
                        <div className="field">
                          <label>Button Shadow</label>
                          <input className="input" type="number" min={0} max={80} value={searchBuilderButtonShadow} onChange={(e) => setSearchBuilderButtonShadow(Number(e.target.value) || 0)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="field">
                          <label>Modal Title</label>
                          <input className="input" value={searchBuilderModalTitle} onChange={(e) => setSearchBuilderModalTitle(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Header Color</label>
                          <input className="input" value={searchBuilderHeaderColor} onChange={(e) => setSearchBuilderHeaderColor(e.target.value)} placeholder="#a4d8e4" />
                        </div>
                        <div className="field">
                          <label>Search Title</label>
                          <input className="input" value={searchBuilderSearchTitle} onChange={(e) => setSearchBuilderSearchTitle(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Search Subtitle</label>
                          <input className="input" value={searchBuilderSearchSubtitle} onChange={(e) => setSearchBuilderSearchSubtitle(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Search Placeholder</label>
                          <input className="input" value={searchBuilderSearchPlaceholder} onChange={(e) => setSearchBuilderSearchPlaceholder(e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Input Radius</label>
                          <input className="input" type="number" min={0} max={30} value={searchBuilderInputRadius} onChange={(e) => setSearchBuilderInputRadius(Number(e.target.value) || 10)} />
                        </div>
                        <div className="field">
                          <label>Modal Radius</label>
                          <input className="input" type="number" min={0} max={40} value={searchBuilderModalRadius} onChange={(e) => setSearchBuilderModalRadius(Number(e.target.value) || 16)} />
                        </div>
                        <div className="field">
                          <label>Modal Width</label>
                          <input className="input" type="number" min={360} max={1400} value={searchBuilderModalWidth} onChange={(e) => setSearchBuilderModalWidth(Number(e.target.value) || 800)} />
                        </div>
                        <div className="field">
                          <label>Modal Height</label>
                          <input className="input" type="number" min={360} max={1100} value={searchBuilderModalHeight} onChange={(e) => setSearchBuilderModalHeight(Number(e.target.value) || 680)} />
                        </div>
                        <div className="field">
                          <label>Backdrop Opacity (%)</label>
                          <input className="input" type="number" min={0} max={95} value={searchBuilderModalBackdropOpacity} onChange={(e) => setSearchBuilderModalBackdropOpacity(Number(e.target.value) || 55)} />
                        </div>
                        <div className="field">
                          <label>Header Height</label>
                          <input className="input" type="number" min={40} max={120} value={searchBuilderModalHeaderHeight} onChange={(e) => setSearchBuilderModalHeaderHeight(Number(e.target.value) || 56)} />
                        </div>
                      </>
                    )}
                    <div className="field">
                      <label>Folder</label>
                      <input className="input" value={searchBuilderFolder} onChange={(e) => setSearchBuilderFolder(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Page Slug</label>
                      <input className="input" value={searchBuilderPageSlug} onChange={(e) => setSearchBuilderPageSlug(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Query Params</label>
                      <input className="input" value={searchBuilderQuery} onChange={(e) => setSearchBuilderQuery(e.target.value)} placeholder="embed=1" />
                    </div>
                    <div className="field">
                      <label>States index URL</label>
                      <input className="input" value={selectedSearchBuilderArtifact?.statesIndexUrl || ""} readOnly />
                    </div>
                  </aside>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button type="button" className="smallBtn" disabled={!selectedSearchBuilderArtifact} onClick={() => setSearchBuilderShowEmbedPreview((v) => !v)}>
                    {searchBuilderShowEmbedPreview ? "Hide embed code" : "Preview embed code"}
                  </button>
                  {searchBuilderShowEmbedPreview && selectedSearchBuilderArtifact ? (
                    <textarea
                      className="input agencyTextarea"
                      rows={12}
                      value={buildEmbedCodeForArtifact(selectedSearchBuilderArtifact)}
                      readOnly
                      style={{ marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", width: "100%" }}
                    />
                  ) : null}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="mini" style={{ marginBottom: 6 }}>Search iframe preview</div>
                  {s(selectedSearchBuilderArtifact?.iframeSrc) ? (
                    <iframe
                      title="Search Builder Preview"
                      src={selectedSearchBuilderArtifact?.iframeSrc || searchBuilderIframeSrc}
                      style={{ width: "100%", height: 420, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, background: "#fff" }}
                    />
                  ) : (
                    <div
                      className="mini"
                      style={{
                        border: "1px dashed rgba(255,255,255,.24)",
                        borderRadius: 12,
                        padding: "18px 16px",
                        background: "rgba(15,23,42,.45)",
                      }}
                    >
                      No published file yet for this search file. Click <b>Publish</b> first.
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="mini" style={{ marginBottom: 8 }}>
                    Last publication
                  </div>
                  {!searchBuilderLastPublish ? (
                    <div className="mini">No publication for this search yet.</div>
                  ) : (
                    <div>
                      <div className="mini" style={{ marginBottom: 6 }}>
                        Published path: <code>/embedded/{routeTenantId}/{searchBuilderLastPublish.folder}</code> | Files: {searchBuilderLastPublish.count} | Generated:{" "}
                        {searchBuilderLastPublish.generatedAt ? new Date(searchBuilderLastPublish.generatedAt).toLocaleString() : "—"}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <button type="button" className="smallBtn" onClick={() => void copyPublishedFolderPath()}>
                          {searchBuilderCopiedFolderPath ? "Folder copied" : "Copy folder path"}
                        </button>
                      </div>
                      <div className="tableWrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th className="th">Service</th>
                              <th className="th">File</th>
                              <th className="th">URL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchBuilderLastPublish.files.map((file) => {
                              const href = s(file.url) || `https://${searchBuilderLastPublish.host}/embedded/${routeTenantId}/${searchBuilderLastPublish.folder}/${file.fileName}?embed=1`;
                              return (
                                <tr key={`${file.serviceId}:${file.fileName}`} className="tr">
                                  <td className="td">{file.name || file.serviceId}</td>
                                  <td className="td"><code>{file.fileName}</code></td>
                                  <td className="td">
                                    <a href={href} target="_blank" rel="noreferrer">{href}</a>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {/* Sheet Explorer */}
      {activeProjectTab === "sheet" ? (
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

      {/* Activation */}
      {activeProjectTab === "activation" ? (
        <section className="card" style={{ marginTop: 14 }} ref={activationRef}>
          <div className="cardHeader">
            <div>
              <h2 className="cardTitle">Overview Command Center</h2>
              <div className="cardSubtitle">
                Primary rollout overview: subaccount/domain progress and activation map.
              </div>
            </div>
            <div className="cardHeaderActions">
              <div className="badge">States in sheet: {fmtInt(activationKpis.statesInSheet)}</div>
              <div className="badge">Global completion: {Math.round(activationKpis.globalPct * 100)}%</div>
              <button className="smallBtn" type="button" onClick={openMap}>
                Open Full Map
              </button>
            </div>
          </div>

          <div className="cardBody">
            <div className="activationKpiGrid">
              <article className="activationKpiCard">
                <div className="activationKpiTop">
                  <span className="activationKpiLabel">County Subaccounts Created</span>
                  <span className="activationKpiPct">{Math.round(activationKpis.countySubaccountPct * 100)}%</span>
                </div>
                <div className="activationKpiValue">
                  {fmtInt(activationKpis.countiesReady)}
                  <span> / {fmtInt(activationKpis.countiesTotal)}</span>
                </div>
                <div className="activationKpiTrack">
                  <div className="activationKpiFill" style={{ width: `${Math.round(activationKpis.countySubaccountPct * 100)}%` }} />
                </div>
              </article>

              <article className="activationKpiCard">
                <div className="activationKpiTop">
                  <span className="activationKpiLabel">County Domains Active</span>
                  <span className="activationKpiPct">{Math.round(activationKpis.countyDomainPct * 100)}%</span>
                </div>
                <div className="activationKpiValue">
                  {fmtInt(activationKpis.countiesDomainsActive)}
                  <span> / {fmtInt(activationKpis.countiesTotal)}</span>
                </div>
                <div className="activationKpiTrack">
                  <div className="activationKpiFill" style={{ width: `${Math.round(activationKpis.countyDomainPct * 100)}%` }} />
                </div>
              </article>

              <article className="activationKpiCard">
                <div className="activationKpiTop">
                  <span className="activationKpiLabel">City Subaccounts Created</span>
                  <span className="activationKpiPct">{Math.round(activationKpis.citySubaccountPct * 100)}%</span>
                </div>
                <div className="activationKpiValue">
                  {fmtInt(activationKpis.citiesReady)}
                  <span> / {fmtInt(activationKpis.citiesTotal)}</span>
                </div>
                <div className="activationKpiTrack">
                  <div className="activationKpiFill" style={{ width: `${Math.round(activationKpis.citySubaccountPct * 100)}%` }} />
                </div>
              </article>

              <article className="activationKpiCard">
                <div className="activationKpiTop">
                  <span className="activationKpiLabel">City Domains Active</span>
                  <span className="activationKpiPct">{Math.round(activationKpis.cityDomainPct * 100)}%</span>
                </div>
                <div className="activationKpiValue">
                  {fmtInt(activationKpis.citiesDomainsActive)}
                  <span> / {fmtInt(activationKpis.citiesTotal)}</span>
                </div>
                <div className="activationKpiTrack">
                  <div className="activationKpiFill" style={{ width: `${Math.round(activationKpis.cityDomainPct * 100)}%` }} />
                </div>
              </article>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="cardHeader">
                <div>
                  <h3 className="cardTitle" style={{ fontSize: 16 }}>Activation Map</h3>
                  <div className="cardSubtitle">
                    Click en un estado para ver detalle de progreso.
                  </div>
                </div>
                <div className="cardHeaderActions">
                  <div className="segmented" style={{ marginRight: 8 }}>
                    <button
                      className={`segBtn ${mapScope === "us" ? "segBtnOn" : ""}`}
                      onClick={() => setMapScope("us")}
                      type="button"
                    >
                      United States
                    </button>
                    <button
                      className={`segBtn ${mapScope === "puerto_rico" ? "segBtnOn" : ""}`}
                      onClick={() => {
                        setMapScope("puerto_rico");
                        void loadPuertoRicoDetail();
                      }}
                      type="button"
                    >
                      Puerto Rico
                    </button>
                  </div>
                  <button
                    className={`tabBtn ${mapMetric === "ready" ? "tabBtnActive" : ""}`}
                    onClick={() => setMapMetric("ready")}
                    type="button"
                  >
                    Subaccount Created
                  </button>
                  <button
                    className={`tabBtn ${mapMetric === "domains" ? "tabBtnActive" : ""}`}
                    onClick={() => setMapMetric("domains")}
                    type="button"
                  >
                    Domain Created
                  </button>
                </div>
              </div>
              <div className="cardBody">
                {mapScope === "us" ? (
                  <>
                    <UsaChoroplethProgressMap
                      rows={sheet?.states || []}
                      metric={mapMetric}
                      selectedState={mapSelected}
                      onPick={(name) => pickMapState(String(name || "").trim())}
                    />

                    {selectedStateMetrics ? (
                      <div className="mini" style={{ marginTop: 10 }}>
                        <b>{mapSelected}</b> · Subaccounts: {Math.round(selectedStateMetrics.readyPct * 100)}% · Domains: {Math.round(selectedStateMetrics.domainsPct * 100)}%
                      </div>
                    ) : (
                      <div className="mini" style={{ marginTop: 10 }}>Select a state on the map to inspect metrics.</div>
                    )}
                  </>
                ) : (
                  <>
                    {prDetailErr ? (
                      <div className="mini" style={{ marginTop: 10, color: "var(--danger)" }}>
                        ❌ {prDetailErr}
                    </div>
                    ) : prDetailLoading && !prDetail ? (
                      <div className="mini" style={{ marginTop: 10 }}>Loading Puerto Rico data...</div>
                    ) : (
                      <>
                        <PuertoRicoMunicipioProgressMap
                          rows={prDetail?.cities?.rows || []}
                          metric={mapMetric}
                          onPickMunicipio={(municipio) => setPrCitySearch(municipio)}
                        />
                      </>
                    )}
                  </>
                  )}
                  {/* <div className="prPanel"> */}
                    {/* <div className="prPanelHeader">
                      <div>
                        <div className="badge">PUERTO RICO</div>
                        <div className="prTitle">City Activation Detail</div>
                        <div className="mini" style={{ marginTop: 6 }}>
                          Data by city with location id and domain status.
                        </div>
                      </div>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => void loadPuertoRicoDetail({ force: true })}
                        disabled={prDetailLoading}
                      >
                        {prDetailLoading ? "Refreshing..." : "Refresh"}
                      </button>
                    </div> */}

                    {/* {prMetrics ? (
                      <div className="prGrid">
                        <div className="prCard">
                          <div className="prLabel">Subaccounts Created</div>
                          <div className="prValue">{Math.round(prMetrics.readyPct * 100)}%</div>
                          <div className="mini">
                            Counties {prMetrics.countiesReady}/{prMetrics.countiesTotal} • Cities {prMetrics.citiesReady}/{prMetrics.citiesTotal}
                          </div>
                          <div className="prBar">
                            <div className="prBarFill" style={{ width: `${Math.round(prMetrics.readyPct * 100)}%` }} />
                          </div>
                        </div>
                        <div className="prCard">
                          <div className="prLabel">Domains Created</div>
                          <div className="prValue">{Math.round(prMetrics.domainsPct * 100)}%</div>
                          <div className="mini">
                            County domains {prMetrics.countiesDomains} • City domains {prMetrics.citiesDomains}
                          </div>
                          <div className="prBar">
                            <div className="prBarFill" style={{ width: `${Math.round(prMetrics.domainsPct * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : null} */}

                    {/* <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div className="mini" style={{ display: "flex", alignItems: "center" }}>
                        {prCitySearch
                          ? `Pueblo seleccionado: ${prCitySearch}`
                          : "Mapa por pueblo. Click en un pueblo para usarlo como filtro."}
                      </div>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => void openPuertoRicoMunicipioDetail(prCitySearch)}
                      >
                        Open Full State Drawer
                      </button>
                    </div> */}
                  {/* </div> */}
                {/* )} */}
              </div>
            </div>

            <div className="activationSummaryGrid">
              <section className="activationSummaryCard">
                <div className="activationSummaryHeader">
                  <h4>Top Ready States</h4>
                  <span className="mini">Balanced by subaccounts + domains</span>
                </div>
                <div className="activationRows">
                  {activationLeaders.map((row) => (
                    <button
                      type="button"
                      key={`leader_${row.state}`}
                      className="activationRowBtn"
                      onClick={() => {
                        if (isPuertoRicoState(row.state)) {
                          setMapScope("puerto_rico");
                          void loadPuertoRicoDetail();
                          return;
                        }
                        void openDetail(row.state);
                      }}
                    >
                      <span className="activationRowState">{row.state}</span>
                      <span className="activationRowStats">
                        Sub {Math.round(row.readyPct * 100)}% · Dom {Math.round(row.domainsPct * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="activationSummaryCard">
                <div className="activationSummaryHeader">
                  <h4>Priority Blockers</h4>
                  <span className="mini">Largest gap between subaccount and domain</span>
                </div>
                <div className="activationRows">
                  {activationBlockers.map((row) => (
                    <button
                      type="button"
                      key={`blocker_${row.state}`}
                      className="activationRowBtn"
                      onClick={() => {
                        if (isPuertoRicoState(row.state)) {
                          setMapScope("puerto_rico");
                          void loadPuertoRicoDetail();
                          return;
                        }
                        void openDetail(row.state);
                      }}
                    >
                      <span className="activationRowState">{row.state}</span>
                      <span className="activationRowStats">
                        Gap {Math.round(row.gap * 100)} pts · Dom {Math.round(row.domainsPct * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </section>
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
        </section>
      </div>

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
                <div
                  className="tabs quickActionsBar"
                  style={{ marginTop: 10 }}
                >
                  <button
                    className="smallBtn quickActionBtn quickActionBtnBing"
                    onClick={() => setQuickBotModal("bing")}
                    title="Bing Index options"
                    style={{ ["--qa-delay" as any]: "0ms" }}
                  >
                    Bing Index
                  </button>
                  <button
                    className="smallBtn quickActionBtn quickActionBtnGoogle"
                    onClick={() => setQuickBotModal("google")}
                    title="Google Index options"
                    style={{ ["--qa-delay" as any]: "40ms" }}
                  >
                    Google Index
                  </button>
                  <button
                    className="smallBtn quickActionBtn quickActionBtnPending"
                    onClick={() => setQuickBotModal("pending")}
                    title="Run pending Domain Bot"
                    style={{ ["--qa-delay" as any]: "80ms" }}
                  >
                    Run Pending Counties
                  </button>
                  <button
                    className="smallBtn quickActionBtn quickActionBtnSettings"
                    onClick={() => setQuickBotModal("settings")}
                    title="Bot settings"
                    style={{ ["--qa-delay" as any]: "120ms" }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2h0a1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1v0a1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" stroke="currentColor" strokeWidth="1.4"/>
                    </svg>
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
                            const rowFailed = failedLocIdsByKind[detailTab].has(locId);
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
                              : rowFailed
                                ? "rowDomainPending"
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
                                  ) : rowFailed ? (
                                    <span className="pillOff">Failed</span>
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
                                        onClick={() => void runDomainBotSingle(locId, activationUrl, r)}
                                        disabled={!eligible || domainCreated || domainBotBusy}
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

      {runHistoryOpen && (
        <>
          <div className="modalBackdrop" onClick={() => setRunHistoryOpen(false)} />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(1240px, calc(100vw - 24px))",
              height: "auto",
              maxHeight: "min(860px, calc(100vh - 24px))",
            }}
          >
            <div className="modalHeader">
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="badge">RUN HISTORY</div>
                  <div className="badge" style={{ borderColor: runHistoryLive ? "#22c55e" : "rgba(255,255,255,.2)" }}>
                    {runHistoryLive ? "LIVE" : "IDLE"}
                  </div>
                </div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  {runHistoryRunId || "Run"}
                </h3>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="smallBtn"
                  onClick={() => void loadRunHistoryEvents(runHistoryRunId, { initial: true })}
                  type="button"
                  disabled={!runHistoryRunId || runHistoryLoading}
                >
                  Refresh
                </button>
                <button className="smallBtn" onClick={() => setRunHistoryOpen(false)} type="button">
                  Close
                </button>
              </div>
            </div>
            <div className="modalBody" style={{ padding: 14, overflowY: "auto" }}>
              {runHistoryLoading ? <div className="mini">Loading history...</div> : null}
              {runHistoryErr ? (
                <div className="mini" style={{ color: "#ff808f" }}>
                  {runHistoryErr}
                </div>
              ) : null}
              {!runHistoryLoading && !runHistoryErr && runHistoryEvents.length === 0 ? (
                <div className="mini">No persisted events for this run.</div>
              ) : null}
              {!runHistoryLoading && !runHistoryErr && runHistoryEvents.length > 0 ? (
                <>
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="cardBody" style={{ padding: 12 }}>
                      <div className="mini" style={{ marginBottom: 10, fontSize: 13 }}>
                        Historial explicado: qué hizo el sistema en palabras simples.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge">Estado: {runHistorySimple.summary.state || "No detectado aún"}</span>
                        <span className="badge">Cuentas creadas: {fmtInt(runHistorySimple.summary.createdAccounts)}</span>
                        <span className="badge">Filas actualizadas: {fmtInt(runHistorySimple.summary.updatedRows)}</span>
                        <span className="badge">Omitidas (ya en TRUE): {fmtInt(runHistorySimple.summary.skippedTrue)}</span>
                        <span className="badge">Reanudadas: {fmtInt(runHistorySimple.summary.resumedItems)}</span>
                        <span
                          className="badge"
                          style={{
                            borderColor:
                              runHistorySimple.summary.errors > 0 || runHistorySimple.summary.finishedWithError
                                ? "rgba(248,113,113,.55)"
                                : "rgba(34,197,94,.45)",
                          }}
                        >
                          {runHistorySimple.summary.errors > 0 || runHistorySimple.summary.finishedWithError
                            ? `Errores: ${fmtInt(runHistorySimple.summary.errors)}`
                            : runHistorySimple.summary.finishedOk
                              ? "Resultado: completado"
                              : "Resultado: en progreso"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="runHistoryList">
                    {runHistorySimple.timeline.map((ev) => (
                      <div key={`${ev.id}-${ev.createdAt}`} className="runHistoryItem">
                        <div className="runHistoryMeta">
                          <span className="mini">{new Date(ev.createdAt).toLocaleString()}</span>
                          <span
                            className="badge"
                            style={{
                              borderColor:
                                ev.tone === "ok"
                                  ? "rgba(34,197,94,.45)"
                                  : ev.tone === "warn"
                                    ? "rgba(251,191,36,.55)"
                                    : ev.tone === "error"
                                      ? "rgba(248,113,113,.55)"
                                      : "rgba(148,163,184,.45)",
                            }}
                          >
                            {ev.tone === "ok" ? "OK" : ev.tone === "warn" ? "Atención" : ev.tone === "error" ? "Error" : "Info"}
                          </span>
                        </div>
                        <div className="runHistoryHumanText">{ev.text}</div>
                      </div>
                    ))}
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary className="mini" style={{ cursor: "pointer" }}>
                      Ver log técnico completo
                    </summary>
                    <div className="runHistoryList" style={{ marginTop: 10 }}>
                      {runHistoryEvents.map((ev) => (
                        <div key={`${ev.id}-${ev.createdAt}`} className="runHistoryItem">
                          <div className="runHistoryMeta">
                            <span className="badge">#{ev.id}</span>
                            <span className="mini">{new Date(ev.createdAt).toLocaleString()}</span>
                            <span className="badge">{ev.eventType}</span>
                          </div>
                          <pre className="runHistoryMessage">{ev.message}</pre>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              ) : null}
            </div>
          </div>
        </>
      )}

      {quickBotModal !== "" && (
        <>
          <div className="modalBackdrop" onClick={() => setQuickBotModal("")} />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(560px, calc(100vw - 24px))",
              height: "auto",
              maxHeight: "min(680px, calc(100vh - 24px))",
            }}
          >
            <div className="modalHeader">
              <div>
                <div className="badge">QUICK ACTIONS</div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  {quickBotModal === "google" && "Google Index"}
                  {quickBotModal === "bing" && "Bing Index"}
                  {quickBotModal === "pending" && "Run Pending"}
                  {quickBotModal === "settings" && "Bot Settings"}
                </h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  {openState || "State"} • {detailTab === "counties" ? "Counties" : "Cities"}
                </div>
              </div>
              <button className="smallBtn" onClick={() => setQuickBotModal("")} type="button">
                Close
              </button>
            </div>

            <div className="modalBody" style={{ padding: 14, overflowY: "auto" }}>
              {quickBotModal === "google" && (
                <div className="card">
                  <div className="cardBody" style={{ padding: 12 }}>
                    <div className="mini" style={{ marginBottom: 10 }}>
                      URL Inspection + Sitemap submit flows.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void submitTabAction("counties", "inspect");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("counties", "inspect")
                          ? "Inspect Counties..."
                          : "Inspect Counties"}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void submitTabAction("cities", "inspect");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("cities", "inspect")
                          ? "Inspect Cities..."
                          : "Inspect Cities"}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void submitTabAction("counties", "discovery");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("counties", "discovery")
                          ? "Sitemap Counties..."
                          : "Sitemap Counties"}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void submitTabAction("cities", "discovery");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("cities", "discovery")
                          ? "Sitemap Cities..."
                          : "Sitemap Cities"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {quickBotModal === "bing" && (
                <div className="card">
                  <div className="cardBody" style={{ padding: 12 }}>
                    <div className="mini" style={{ marginBottom: 10 }}>
                      Bing IndexNow actions and failed retry.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          setTabSitemapRunAction("bing_indexnow");
                          void submitTabAction("counties", "bing_indexnow");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("counties", "bing_indexnow")
                          ? "Bing Counties..."
                          : "Bing Counties"}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          setTabSitemapRunAction("bing_indexnow");
                          void submitTabAction("cities", "bing_indexnow");
                          setQuickBotModal("");
                        }}
                        disabled={tabSitemapSubmitting !== ""}
                      >
                        {tabSitemapSubmitting === tabRunKey("cities", "bing_indexnow")
                          ? "Bing Cities..."
                          : "Bing Cities"}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          setTabSitemapRunAction("bing_indexnow");
                          void retryFailedTabSitemaps(detailTab, "bing_indexnow");
                          setQuickBotModal("");
                        }}
                        disabled={
                          tabSitemapSubmitting !== "" ||
                          !tabSitemapReports[tabRunKey(detailTab, "bing_indexnow")] ||
                          (tabSitemapReports[tabRunKey(detailTab, "bing_indexnow")]?.failed || 0) === 0
                        }
                      >
                        Retry Failed ({tabSitemapReports[tabRunKey(detailTab, "bing_indexnow")]?.failed || 0})
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
                      >
                        {tabSitemapShowDetails[currentTabRunKey] ? "Hide Details" : "View Details"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {quickBotModal === "pending" && (
                <div className="card">
                  <div className="cardBody" style={{ padding: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span className="badge">Pending Counties {pendingDomainBotRowsByKind.counties.length}</span>
                      <span className="badge">Pending Cities {pendingDomainBotRowsByKind.cities.length}</span>
                      <span className="badge">Timeout/account {Math.round(domainBotAccountTimeoutMs / 60000)}m</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void runDomainBotPendingForKind("counties");
                          setQuickBotModal("");
                        }}
                        disabled={domainBotBusy || pendingDomainBotRowsByKind.counties.length === 0}
                      >
                        {domainBotBusy
                          ? "Running..."
                          : `Run Pending Counties (${pendingDomainBotRowsByKind.counties.length})`}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void runDomainBotPendingForKind("cities");
                          setQuickBotModal("");
                        }}
                        disabled={domainBotBusy || pendingDomainBotRowsByKind.cities.length === 0}
                      >
                        {domainBotBusy
                          ? "Running..."
                          : `Run Pending Cities (${pendingDomainBotRowsByKind.cities.length})`}
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          void runDomainBotPendingInCurrentTab();
                          setQuickBotModal("");
                        }}
                        disabled={domainBotBusy || pendingDomainBotRowsInTab.length === 0}
                      >
                        Run Current Tab ({pendingDomainBotRowsInTab.length})
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          setDomainBotRunOpen(true);
                          setQuickBotModal("");
                        }}
                        disabled={!domainBotRunItems.length && !domainBotBusy}
                      >
                        View Bot Run
                      </button>
                      <button
                        className="smallBtn"
                        onClick={() => {
                          setDomainBotFailuresOpen(true);
                          void loadDomainBotFailures(detailTab);
                          setQuickBotModal("");
                        }}
                        disabled={domainBotFailuresLoading}
                      >
                        {domainBotFailuresLoading
                          ? "Loading Failed..."
                          : `Failed Runs (${domainBotFailures.length})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {quickBotModal === "settings" && (
                <div className="card">
                  <div className="cardBody" style={{ padding: 12 }}>
                    <div
                      className="field"
                      style={{
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <label className="mini" style={{ margin: 0, minWidth: 128 }}>
                        Bot timeout (min)
                      </label>
                      <input
                        className="input"
                        type="number"
                        min={DOMAIN_BOT_TIMEOUT_MIN_MIN}
                        max={DOMAIN_BOT_TIMEOUT_MIN_MAX}
                        step={1}
                        disabled={domainBotBusy}
                        value={domainBotAccountTimeoutMin}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          const clamped = Math.max(
                            DOMAIN_BOT_TIMEOUT_MIN_MIN,
                            Math.min(DOMAIN_BOT_TIMEOUT_MIN_MAX, Math.round(n)),
                          );
                          setDomainBotAccountTimeoutMin(clamped);
                        }}
                        style={{ width: 100, minWidth: 100, padding: "6px 10px" }}
                      />
                    </div>
                    <div className="mini" style={{ marginTop: 10, marginBottom: 8 }}>
                      Quick selector
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[15, 25, 35, 45].map((m) => (
                        <button
                          key={m}
                          className="smallBtn"
                          disabled={domainBotBusy}
                          onClick={() => setDomainBotAccountTimeoutMin(m)}
                          style={{
                            borderRadius: 999,
                            minWidth: 64,
                            border:
                              domainBotAccountTimeoutMin === m
                                ? "1px solid rgba(74,222,128,.9)"
                                : undefined,
                            color:
                              domainBotAccountTimeoutMin === m ? "var(--ok)" : undefined,
                          }}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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

      {domainBotRunOpen && (
        <>
          <div
            className="modalBackdrop"
            onClick={() => {
              if (!domainBotBusy) setDomainBotRunOpen(false);
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
                <div className="badge">DOMAIN BOT RUN</div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  {openState || "State"} • {detailTab === "counties" ? "Counties" : "Cities"}
                </h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  Started:{" "}
                  {domainBotRunStartedAt
                    ? new Date(domainBotRunStartedAt).toLocaleString()
                    : "—"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge">{domainBotRunCounts.pct}%</span>
                <span className="badge">
                  Timeout/account {Math.round(domainBotAccountTimeoutMs / 60000)}m
                </span>
                <span className="badge">
                  Done {domainBotRunCounts.done}/{domainBotRunCounts.total}
                </span>
                <span className="badge" style={{ color: "var(--danger)" }}>
                  Failed {domainBotRunCounts.failed}
                </span>
                {domainBotStopRequested ? (
                  <span className="badge" style={{ color: "var(--warning)" }}>Stop requested</span>
                ) : null}
                <button
                  className="smallBtn"
                  onClick={() => {
                    setDomainBotFailuresOpen(true);
                    void loadDomainBotFailures(detailTab);
                  }}
                  disabled={domainBotBusy}
                  title="Open failed runs"
                >
                  Failed Runs ({domainBotFailures.length})
                </button>
                <button
                  className="smallBtn"
                  onClick={requestStopDomainBot}
                  disabled={!domainBotBusy || domainBotStopRequested}
                  title="Stop current bot run safely"
                >
                  {domainBotStopRequested ? "Finishing current..." : "Stop"}
                </button>
                <button
                  className="smallBtn"
                  onClick={() => setDomainBotRunOpen(false)}
                  disabled={domainBotBusy}
                >
                  {domainBotBusy ? "Running..." : "Close"}
                </button>
              </div>
            </div>

            <div className="modalBody" style={{ padding: 14 }}>
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="cardBody" style={{ padding: 10 }}>
                  <div className="mini" style={{ marginBottom: 8 }}>
                    {domainBotRunDone
                      ? "Run completed."
                      : domainBotBusy
                        ? domainBotStopRequested
                          ? "Finishing current account..."
                          : "Processing..."
                        : "Idle"}
                    {" "}• ETA {fmtRelativeSeconds(domainBotRunEtaSec)}
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
                        width: `${domainBotRunCounts.pct}%`,
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
                    <span className="badge">Pending {domainBotRunCounts.pending}</span>
                    <span className="badge">Running {domainBotRunCounts.running}</span>
                    <span className="badge" style={{ color: "var(--ok)" }}>
                      Done {domainBotRunCounts.done}
                    </span>
                    <span className="badge" style={{ color: "var(--danger)" }}>
                      Failed {domainBotRunCounts.failed}
                    </span>
                    {domainBotRunCounts.stopped > 0 ? (
                      <span className="badge" style={{ color: "var(--warning)" }}>
                        Stopped {domainBotRunCounts.stopped}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="tableWrap tableScrollX" style={{ maxHeight: 300 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Status</th>
                      <th className="th">{detailTab === "counties" ? "County" : "City"}</th>
                      <th className="th">Domain</th>
                      <th className="th">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainBotRunItems.map((it) => (
                      <tr key={it.key} className="tr">
                        <td className="td">
                          {it.status === "done" && <span className="pillOk">Done</span>}
                          {it.status === "failed" && <span className="pillOff">Failed</span>}
                          {it.status === "running" && <span className="pillWarn">Running</span>}
                          {it.status === "pending" && <span className="badge">Pending</span>}
                          {it.status === "stopped" && (
                            <span className="badge" style={{ color: "var(--warning)" }}>Stopped</span>
                          )}
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

              {domainBotScreenshotDataUrl ? (
                <div className="card">
                  <div className="cardBody" style={{ padding: 10 }}>
                    <div className="mini" style={{ marginBottom: 6 }}>
                      Worker failure screenshot
                    </div>
                    <img
                      src={domainBotScreenshotDataUrl}
                      alt="Domain Bot failure screenshot"
                      style={{
                        maxWidth: "100%",
                        borderRadius: 8,
                        border: "1px solid var(--line)",
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {domainBotFailuresOpen && (
        <>
          <div
            className="modalBackdrop"
            onClick={() => {
              if (!domainBotBusy) setDomainBotFailuresOpen(false);
            }}
          />
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(1100px, calc(100vw - 24px))",
              height: "min(620px, calc(100vh - 24px))",
            }}
          >
            <div className="modalHeader">
              <div>
                <div className="badge">DOMAIN BOT FAILURES</div>
                <h3 className="modalTitle" style={{ marginTop: 8 }}>
                  Open Failed Runs • {detailTab === "counties" ? "Counties" : "Cities"}
                </h3>
                <div className="mini" style={{ marginTop: 6 }}>
                  Saved failures with step/error. Open account or retry one-by-one.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="smallBtn"
                  onClick={() => void loadDomainBotFailures(detailTab)}
                  disabled={domainBotFailuresLoading}
                >
                  {domainBotFailuresLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  className="smallBtn"
                  onClick={() => setDomainBotFailuresOpen(false)}
                  disabled={domainBotBusy}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="modalBody" style={{ padding: 14 }}>
              {domainBotFailuresMsg ? (
                <div className="mini" style={{ color: "var(--danger)", marginBottom: 10 }}>
                  {domainBotFailuresMsg}
                </div>
              ) : null}
              <div className="tableWrap tableScrollX" style={{ maxHeight: 460 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Status</th>
                      <th className="th">Kind</th>
                      <th className="th">Name</th>
                      <th className="th">Domain</th>
                      <th className="th">Failed Step</th>
                      <th className="th">Error</th>
                      <th className="th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainBotFailures.map((it) => (
                      <tr key={it.id} className="tr">
                        <td className="td">
                          <span className="pillOff">Open</span>
                          <div className="mini" style={{ marginTop: 4 }}>
                            x{Math.max(1, Number(it.failCount) || 1)}
                          </div>
                        </td>
                        <td className="td">
                          <span className="mini">{it.kind}</span>
                        </td>
                        <td className="td">{it.rowName || it.locId || "—"}</td>
                        <td className="td">
                          <span className="mini">{it.domainUrl || "—"}</span>
                        </td>
                        <td className="td">
                          <span className="mini">{it.failedStep || "—"}</span>
                        </td>
                        <td className="td">
                          <span className="mini">{it.errorMessage || "—"}</span>
                        </td>
                        <td className="td">
                          <div className="rowActions">
                            <button
                              className="smallBtn"
                              onClick={() => {
                                const u = s(it.activationUrl);
                                if (u) window.open(u, "_blank", "noopener,noreferrer");
                              }}
                              disabled={!s(it.activationUrl)}
                              title="Open GHL account activation/settings page"
                            >
                              Open GHL Account
                            </button>
                            <button
                              className="smallBtn"
                              onClick={async () => {
                                const row = getDetailRowByLocId(it.kind, it.locId);
                                if (!row) {
                                  setDomainBotFailuresMsg(
                                    `Row not found in loaded sheet for ${it.locId}. Open the state first.`,
                                  );
                                  return;
                                }
                                await runDomainBotForLocId(
                                  it.locId,
                                  it.activationUrl,
                                  row,
                                  it.kind,
                                  domainBotAccountTimeoutMs,
                                );
                                await loadDomainBotFailures(detailTab);
                              }}
                              disabled={domainBotBusy}
                            >
                              Retry
                            </button>
                            <button
                              className="smallBtn"
                              onClick={() => void updateDomainBotFailureStatus(it.id, "resolve")}
                              disabled={domainBotBusy}
                            >
                              Resolve
                            </button>
                            <button
                              className="smallBtn"
                              onClick={() => void updateDomainBotFailureStatus(it.id, "ignore")}
                              disabled={domainBotBusy}
                            >
                              Ignore
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {domainBotFailures.length === 0 ? (
                      <tr className="tr">
                        <td className="td" colSpan={7}>
                          <span className="mini">
                            {domainBotFailuresLoading ? "Loading..." : "No open failed runs."}
                          </span>
                        </td>
                      </tr>
                    ) : null}
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
                    Click to copy (paste into the GHL{" "}
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
                      Tip: if paste fails, click again to recopy from clipboard.
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
                            Paste the domain in the{" "}
                            <span className="kbd">Domain</span>.
                          </li>
                          <li>
                            Click <span className="kbd">Continue</span>.
                          </li>
                          <li>
                            Click{" "}
                            <span className="kbd">Add record manually</span>.
                          </li>
                          <li>
                            Click <span className="kbd">Verify records</span> and wait for propagation.
                          </li>
                          <li>
                            Click <span className="kbd">Website</span>.
                          </li>
                          <li>
                            In{" "}
                            <span className="kbd">
                              Link domain with website
                            </span>{" "}
                            select <span className="kbd">County</span>.
                          </li>
                          <li>
                            In{" "}
                            <span className="kbd">
                              Select default step/page for Domain
                            </span>{" "}
                            select <span className="kbd">** Home Page</span>
                            .
                          </li>
                          <li>
                            Click{" "}
                            <span className="kbd">Proceed to finish</span>.
                          </li>
                          <li>Validate that the site responds correctly.</li>
                        </ol>
                      </div>
                    )}

                    {/* SITEMAP */}
                    {actChecklistTab === "sitemap" && (
                      <div style={{ padding: 12 }}>
                        <div className="sectionTitle">Sitemap</div>
                        <div className="sectionHint" style={{ marginTop: 6 }}>
                          Generate the sitemap in GHL.
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
                                title="Verify that the sitemap is live and matches this domain."
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
                                {verified ? "Verified" : "Not found or does not match"}
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
                            Click <span className="kbd">Manage</span>.
                          </li>
                          <li>
                            Click <span className="kbd">⋮</span>.
                          </li>
                          <li>
                            Click{" "}
                            <span className="kbd">&lt;&gt; XML Sitemap</span>.
                          </li>
                          <li>
                            Open County and check only pages that start with{" "}
                            <span className="kbd">**</span>.
                          </li>
                          <li>
                            Click <span className="kbd">Proceed</span>.
                          </li>
                          <li>
                            Click{" "}
                            <span className="kbd">Generate & Save</span>.
                          </li>
                          <li>
                            Click{" "}
                            <span className="kbd">Generate & Save</span>.
                          </li>
                          <li>
                            Click <span className="kbd">Okay</span>.
                          </li>
                          <li>
                            Validate sitemap using the{" "}
                            <span className="kbd">Open</span> button in this panel.
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
                              Generate the `robots.txt` file.
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
                            Click <span className="kbd">⋮</span>.
                          </li>
                          <li>
                            Click <span className="kbd">Edit</span>.
                          </li>
                          <li>
                            In <span className="kbd">Robots.txt code</span>, paste the code.
                          </li>
                          <li>
                            Click <span className="kbd">Save</span>.
                          </li>
                          <li>
                            Validate in the browser that{" "}
                            <span className="kbd">/robots.txt</span> returns
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
                  Quick state view to prioritize production and active domains.
                </div>
              </div>

              <div className="mapModalActions">
                <div className="mapMetricTabs">
                  <div className="segmented">
                    <button
                      className={`segBtn ${mapScope === "us" ? "segBtnOn" : ""}`}
                      onClick={() => setMapScope("us")}
                      type="button"
                    >
                      United States
                    </button>
                    <button
                      className={`segBtn ${mapScope === "puerto_rico" ? "segBtnOn" : ""}`}
                      onClick={() => {
                        setMapScope("puerto_rico");
                        void loadPuertoRicoDetail();
                      }}
                      type="button"
                    >
                      Puerto Rico
                    </button>
                  </div>
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
                    {mapScope === "us" ? (
                      <UsaChoroplethProgressMap
                        rows={sheet?.states || []}
                        metric={mapMetric}
                        selectedState={mapSelected}
                        onPick={(name) => pickMapState(String(name || "").trim())}
                      />
                    ) : (
                      <div className="prPanel" style={{ marginTop: 0 }}>
                        <div className="prPanelHeader">
                          <div>
                            <div className="badge">PUERTO RICO</div>
                            <div className="prTitle">City activation by row</div>
                            <div className="mini" style={{ marginTop: 6 }}>
                              Close this modal to open the Puerto Rico map by pueblo.
                            </div>
                          </div>
                          <button
                            className="smallBtn"
                            type="button"
                            onClick={() => {
                              closeMap();
                              setMapScope("puerto_rico");
                              void loadPuertoRicoDetail();
                            }}
                          >
                            Open Puerto Rico Tab
                          </button>
                        </div>
                        {prMetrics ? (
                          <div className="prGrid">
                            <div className="prCard">
                              <div className="prLabel">Subaccounts Created</div>
                              <div className="prValue">{Math.round(prMetrics.readyPct * 100)}%</div>
                              <div className="mini">
                                Counties {prMetrics.countiesReady}/{prMetrics.countiesTotal} • Cities {prMetrics.citiesReady}/{prMetrics.citiesTotal}
                              </div>
                            </div>
                            <div className="prCard">
                              <div className="prLabel">Domains Created</div>
                              <div className="prValue">{Math.round(prMetrics.domainsPct * 100)}%</div>
                              <div className="mini">
                                County domains {prMetrics.countiesDomains} • City domains {prMetrics.citiesDomains}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mini" style={{ marginTop: 12 }}>Puerto Rico data not available.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right */}
                <aside className="mapSide">
                  <div className="mapSideCard">
                    <div className="mini" style={{ opacity: 0.8 }}>
                      Selection
                    </div>

                    {mapScope === "us" && !selectedStateMetrics ? (
                      <div style={{ marginTop: 12 }} className="mini">
                        Click a state
                      </div>
                    ) : mapScope === "us" ? (
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
                              void openDetail(mapSelected);
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
                    ) : (
                      <div style={{ marginTop: 12 }} className="mini">
                        Puerto Rico is selected. Close this modal to inspect the map by pueblo in the Puerto Rico tab.
                      </div>
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
    </main>
  );
}
