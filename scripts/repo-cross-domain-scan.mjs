import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, join, extname } from "node:path";

const root = "control-tower/src/";

const rules = [
  { domain: "admin", match: (path) => path.startsWith(`${root}app/dashboard`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/dashboard`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/projects`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/tenants`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/sheet`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/run`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/stop`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/stream`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/login`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/partner-admin`) },
  { domain: "admin", match: (path) => path.startsWith(`${root}app/api/partner-admin`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/partner-admin`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/partnerAdmin`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/admin`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/SessionKeepAlive.ts`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/SessionKeepAlive.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/DashboardTopbar.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/AgencyMeetingsPanel.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/DashboardNotificationsPill.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/DashboardModuleShell.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/AdsInsightsPanel.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/AdsMetricsGridCharts.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/AdsTrendChart.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/GaInsightsPanel.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/GSCTrendChart.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/PremiumTrendChart.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}components/HourlyHeatmap.tsx`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/ads`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/agent`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/dashboard`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/appointmentBookingAnalytics`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/googleAds`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/gsc`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/prospectingStore`) },
  { domain: "admin", match: (path) => path.includes(`${root}lib/jobMap`) },

  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-portal`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-site`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-seo`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-login`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-activate`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-welcome`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-forgot-password`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/partner-reset-password`) },
  { domain: "partner", match: (path) => path.startsWith(`${root}app/api/partner-portal`) },
  { domain: "partner", match: (path) => path.includes(`${root}components/partner`) },
  { domain: "partner", match: (path) => path.includes(`${root}components/partnerAdmin`) },
  { domain: "partner", match: (path) => path.includes(`${root}lib/partner`) },

  { domain: "care", match: (path) => path.startsWith(`${root}app/client-portal`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/booking`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-auth`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/api/client-account`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/api/client-auth`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-forgot-password`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-login`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-register`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-reset-password`) },
  { domain: "care", match: (path) => path.startsWith(`${root}app/client-verify-email`) },
  { domain: "care", match: (path) => path.includes(`${root}components/client`) },
  { domain: "care", match: (path) => path.includes(`${root}components/booking`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/client`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/appointmentBooking`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/appointment`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/booking`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/serviceBookingAvailability`) },
  { domain: "care", match: (path) => path.includes(`${root}lib/dateRangePresets`) },

  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/public`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/ai`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/auth`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/health`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/states`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/webhooks`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/tools`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/agents`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/agency`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/cron`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/debug`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/api/tenant`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/activate`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/oauth`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/embedded`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/locations`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/meet`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/partners-directory`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/shared`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/portal`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/auth`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/appointment-deposit-policy`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/llms.txt`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/manifest.webmanifest`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/privacy-policy`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/portal`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/AiAgentChatPanel.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/AgentNotificationHub.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/TenantOpenclawConfigCard.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/UsaChoroplethProgressMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/UsaChoroplethGaMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/UsaTileProgressMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/PuertoRicoChoroplethProgressMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/PuertoRicoMunicipioSearchMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/PuertoRicoMunicipioProgressMap.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/globals.css`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/layout.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/page.tsx`) },
  { domain: "shared", match: (path) => path.includes(`${root}app/page.module.css`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/account`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ai`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/campaignContextSettings.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/canonicalGeography.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/contacts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/authz.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/audit.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/cache`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/cronHeartbeat.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/customerAppointmentNotifications.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/deployment-surface.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/genderIdentity.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghl/`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghlCustomValuesRules.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghlHttp.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghlRoutingEnvelope.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghlState.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/ghlTokens.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/gsc`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/googlePartnerProspecting.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/myDripNurseService`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/mapboxAddressVerification.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/openai.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/password.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/phoneInput.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/public`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/run`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/sheets`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/session.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/staff`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/state`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/tenant`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/stripe`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/use`) },
  { domain: "shared", match: (path) => path.includes(`${root}proxy.ts`) },
  { domain: "shared", match: (path) => path.includes(`${root}lib/db.ts`) },
];

const domainResolver = (path) => {
  const rule = rules.find((r) => r.match(path));
  return rule?.domain || "unknown";
};

const tracked = execSync("git ls-files control-tower/src", { encoding: "utf8" })
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const fileSet = new Set(tracked);
const includeSamples = new Set(process.argv.slice(2)).has("--samples");
const cwd = process.cwd();

function normalizeTrackedPath(pathLike) {
  return pathLike.startsWith(`${cwd}/`) ? pathLike.slice(cwd.length + 1) : pathLike;
}

function resolveImport(currentFile, importPath) {
  if (!importPath.startsWith(".") && !importPath.startsWith("@/")) return null;

  let absolute = "";
  if (importPath.startsWith("@/")) {
    absolute = resolve("control-tower/src", importPath.replace(/^@\/?/, ""));
  } else {
    absolute = resolve(dirname(currentFile), importPath);
  }

  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];
  const candidates = [];
  for (const ext of exts) {
    candidates.push(`${absolute}${ext}`);
    candidates.push(resolve(absolute, `index${ext}`));
    candidates.push(resolve(absolute, `index.tsx`));
  }

  for (const candidate of candidates) {
    const normalized = normalizeTrackedPath(candidate);
    if (fileSet.has(normalized)) return normalized;
    if (fileSet.has(candidate)) return candidate;
    if (existsSync(candidate)) return normalized;
  }
  return null;
}

const importRegex = /\b(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?["']([^"']+)["']/g;
const requireRegex = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

const edges = new Map();
const stats = { crossCount: 0, totalTracked: 0, unresolved: 0 };
const crossTargetStats = new Map();

for (const file of tracked) {
  const ext = extname(file);
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) continue;

  const sourceDomain = domainResolver(file);
  if (sourceDomain === "unknown") continue;

  let content = "";
  try {
    content = execSync(`cat ${JSON.stringify(file)}`, { encoding: "utf8" });
  } catch {
    continue;
  }

  const matches = [];
  for (const match of content.matchAll(importRegex)) {
    matches.push(match[1]);
  }
  for (const match of content.matchAll(requireRegex)) {
    matches.push(match[1]);
  }

  for (const importPath of matches) {
    const target = resolveImport(file, importPath);
    if (!target) continue;
    if (!fileSet.has(target)) continue;

    const targetDomain = domainResolver(target);
    if (targetDomain === "unknown") {
      stats.unresolved += 1;
      continue;
    }

    if (sourceDomain !== targetDomain) {
      const key = `${sourceDomain}:${targetDomain}`;
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
        if (includeSamples && existing.samples.length < 8) {
          existing.samples.push(`${file} -> ${target}`);
        }
      } else {
        edges.set(key, {
          count: 1,
          samples: includeSamples ? [`${file} -> ${target}`] : [],
        });
      }
      stats.crossCount += 1;

      crossTargetStats.set(target, (crossTargetStats.get(target) || 0) + 1);
    }

    stats.totalTracked += 1;
  }
}

const rows = [...edges.entries()].sort((a, b) => b[1].count - a[1].count);

console.log("=== Repo cross-domain import scan (tracked control-tower/src files) ===");
console.log(`cross deps: ${stats.crossCount}`);
console.log(`resolved imports checked: ${stats.totalTracked}`);
console.log(`skipped/unknown targets: ${stats.unresolved}\n`);

for (const [edge, item] of rows.slice(0, 100)) {
  console.log(` - ${edge}: ${item.count}`);
  if (includeSamples && item.samples.length > 0) {
    for (const sample of item.samples) {
      console.log(`    * ${sample}`);
    }
  }
}

if (includeSamples) {
  const targetRows = [...crossTargetStats.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\nTop cross-domain shared targets:");
  for (const [file, count] of targetRows.slice(0, 80)) {
    console.log(` - ${count.toString().padStart(4)} ${file}`);
  }
}

if (rows.length === 0) {
  console.log("No cross-domain imports detected with current classification.");
}
