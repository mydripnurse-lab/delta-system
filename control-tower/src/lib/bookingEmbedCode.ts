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
