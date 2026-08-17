import { execSync } from "node:child_process";

const root = "control-tower/src/";
const args = new Set(process.argv.slice(2));
const showJson = args.has("--json");

const rules = [
  // Admin / core dashboard
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

  // Partner
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

  // Care
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

  // Shared / boundary
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
  { domain: "shared", match: (path) => path.startsWith(`${root}app/appointment-deposit-policy`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/llms.txt`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/manifest.webmanifest`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/privacy-policy`) },
  { domain: "shared", match: (path) => path.startsWith(`${root}app/portal`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/shared`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/auth`) },
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
  { domain: "shared", match: (path) => path.includes(`${root}components/portal`) },
  { domain: "shared", match: (path) => path.includes(`${root}components/Auth`) },
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

const domainMap = {
  admin: [],
  partner: [],
  care: [],
  shared: [],
  unknown: [],
};

const files = execSync("git ls-files control-tower/src", {
  encoding: "utf8",
})
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

for (const file of files) {
  const assigned = rules.find((rule) => rule.match(file))?.domain;
  if (assigned) {
    domainMap[assigned].push(file);
  } else {
    domainMap.unknown.push(file);
  }
}

for (const key of Object.keys(domainMap)) {
  domainMap[key] = [...new Set(domainMap[key].sort())];
}

const known = domainMap.admin.length + domainMap.partner.length + domainMap.care.length + domainMap.shared.length;
const total = files.length || 1;
const knownPercent = ((known / total) * 100).toFixed(1);

if (showJson) {
  console.log(JSON.stringify({ coverage: `${known}/${total} (${knownPercent}%)`, ...domainMap }, null, 2));
  process.exit(0);
}

console.log("=== Repo domain map (tracked control-tower/src files) ===");
console.log(`coverage: ${known}/${total} (${knownPercent}%)\n`);

for (const domain of ["admin", "partner", "care", "shared"]) {
  const entries = domainMap[domain];
  console.log(`${domain.toUpperCase()} (${entries.length})`);
  for (const file of entries.slice(0, 60)) {
    console.log(` - ${file}`);
  }
  if (entries.length > 60) {
    console.log(`   ... +${entries.length - 60} more`);
  }
  console.log("");
}

if (domainMap.unknown.length > 0) {
  console.log(`UNKNOWN (${domainMap.unknown.length})`);
  const unknownByPrefix = {};
  for (const file of domainMap.unknown) {
    const parts = file.split("/");
    const domainPrefix = parts.slice(0, 5).join("/");
    unknownByPrefix[domainPrefix] = (unknownByPrefix[domainPrefix] || 0) + 1;
  }
  const sorted = Object.entries(unknownByPrefix).sort((a, b) => b[1] - a[1]);
  console.log("Top UNKNOWN prefixes:");
  for (const [prefix, count] of sorted.slice(0, 40)) {
    console.log(` - ${count.toString().padStart(4)} ${prefix}`);
  }
  console.log("\nUNKNOWN sample:");
  for (const file of domainMap.unknown.slice(0, 60)) {
    console.log(` - ${file}`);
  }
  if (domainMap.unknown.length > 60) {
    console.log(`   ... +${domainMap.unknown.length - 60} more`);
  }
  console.log("");
}

console.log("Recommendations:");
console.log("- Treat UNKNOWN as boundary files; validate before moving.");
console.log("- Re-run after each split milestone.");
