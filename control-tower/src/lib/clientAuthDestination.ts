const RESERVED_APP_HOSTS = new Set([
  "admin.mydripnurse.com",
  "care.mydripnurse.com",
  "onboarding.mydripnurse.com",
  "partner.mydripnurse.com",
  "partners.mydripnurse.com",
  "policy.mydripnurse.com",
  "search-embedded.telahagocrecer.com",
  "sitemaps.mydripnurse.com",
]);

/**
 * Returns the only external destinations a client authentication flow may use.
 * Keep this helper browser-safe so the form and server enforce one contract.
 */
export function safeClientReturnUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (hostname === "partners.mydripnurse.com" && (pathname === "" || pathname === "/" || /^\/[a-z0-9-]+\/services\/[a-z0-9-]+\/book$/i.test(pathname))) {
      return `https://partners.mydripnurse.com${pathname || "/"}`;
    }
    if (hostname === "care.mydripnurse.com" && /^\/booking\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(pathname)) {
      return `https://care.mydripnurse.com${pathname}`;
    }
    const marketingHost = hostname === "mydripnurse.com"
      || hostname === "www.mydripnurse.com"
      || (hostname.endsWith(".mydripnurse.com") && !RESERVED_APP_HOSTS.has(hostname));
    return marketingHost ? parsed.toString() : "";
  } catch {
    return "";
  }
}
