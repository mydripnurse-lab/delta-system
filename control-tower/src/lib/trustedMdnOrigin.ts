const RESERVED_APP_HOSTS = new Set([
  "admin.mydripnurse.com",
  "care.mydripnurse.com",
  "onboarding.mydripnurse.com",
  "partner.mydripnurse.com",
  "partners.mydripnurse.com",
  "policy.mydripnurse.com",
  "sitemaps.mydripnurse.com",
]);

export function trustedMdnHome(value: string | null | undefined) {
  if (!value || value.length > 2048) return "";
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (hostname !== "mydripnurse.com" && !hostname.endsWith(".mydripnurse.com")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function isMdnMarketingHome(value: string) {
  try {
    return !RESERVED_APP_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}
