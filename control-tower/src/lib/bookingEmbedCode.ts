type BookingEmbedCodeInput = {
  bookingUrl: string;
  serviceName: string;
  slug: string;
};

export function buildBookingEmbedCode({ bookingUrl, serviceName, slug }: BookingEmbedCodeInput) {
  const hostId = `mdn-calendar-${slug}`;

  return `<div id="${hostId}" style="width:min(100%,1120px);margin:0 auto;background:#ebf2f9;border-radius:24px;overflow:hidden"></div>
<script>
(() => {
  const host = document.getElementById(${JSON.stringify(hostId)});
  if (!host || host.dataset.mdnMounted === "1") return;
  host.dataset.mdnMounted = "1";
  const bookingUrl = new URL(${JSON.stringify(bookingUrl)});
  bookingUrl.searchParams.set("embed", "1");
  new URLSearchParams(window.location.search).forEach((value, key) => bookingUrl.searchParams.set(key, value));
  const readCookie = (name) => document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || "";
  const randomId = () => globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2);
  const sharedCookie = (name, value, maxAge) => {
    const domain = location.hostname === "mydripnurse.com" || location.hostname.endsWith(".mydripnurse.com") ? "; Domain=.mydripnurse.com" : "";
    document.cookie = name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAge + "; SameSite=Lax; Secure" + domain;
    try { localStorage.setItem(name, value); } catch {}
  };
  const identifier = (name, maxAge) => {
    let stored = "";
    try { stored = localStorage.getItem(name) || ""; } catch {}
    const value = decodeURIComponent(readCookie(name)) || stored || randomId();
    sharedCookie(name, value, maxAge);
    return value;
  };
  const cleanParentUrl = new URL(window.location.href);
  const marketingKeys = new Set(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid","ref","source","partner","partnerId","directoryPartnerId"]);
  [...cleanParentUrl.searchParams.keys()].forEach((key) => { if (!marketingKeys.has(key)) cleanParentUrl.searchParams.delete(key); });
  cleanParentUrl.hash = "";
  bookingUrl.searchParams.set("mdn_parent_url", cleanParentUrl.toString());
  if (document.referrer) bookingUrl.searchParams.set("mdn_parent_referrer", document.referrer);
  bookingUrl.searchParams.set("mdn_vid", identifier("mdn_vid", 31536000));
  bookingUrl.searchParams.set("mdn_sid", identifier("mdn_sid", 1800));
  bookingUrl.searchParams.set("returnTo", window.location.href);
  const iframe = document.createElement("iframe");
  iframe.src = bookingUrl.toString();
  iframe.title = ${JSON.stringify(`${serviceName} booking calendar`)};
  iframe.loading = "lazy";
  iframe.allow = "payment";
  iframe.scrolling = "no";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = "display:block;width:100%;height:560px;border:0;border-radius:24px;background:#ebf2f9;overflow:hidden;transition:height .2s ease";
  host.appendChild(iframe);
  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.data?.type === "mdn-booking-auth-return" && String(event.data.url || "") === window.location.href) {
      window.location.assign(window.location.href);
      return;
    }
    if (event.data?.type === "mdn-booking-resize") {
      const measuredHeight = Number(event.data.height) || 0;
      const height = Math.max(480, Math.min(12000, measuredHeight));
      iframe.style.height = Math.ceil(height) + "px";
    }
  });
})();
</script>`;
}
