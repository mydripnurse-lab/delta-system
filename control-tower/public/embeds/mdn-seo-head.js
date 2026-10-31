(function (window, document) {
  "use strict";
  var BRAND = "My Drip Nurse";
  var ORGANIZATION_ID = "https://mydripnurse.com/#organization";
  var WEBSITE_ID = "https://mydripnurse.com/#website";
  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function upsertMeta(selector, attributes) {
    var node = document.head.querySelector(selector);
    if (!node) { node = document.createElement("meta"); document.head.appendChild(node); }
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    return node;
  }
  function canonicalUrl(path) {
    var url = new URL(path || location.pathname, location.origin);
    url.search = ""; url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  }
  function setCanonical(url) {
    var nodes = Array.prototype.slice.call(document.head.querySelectorAll('link[rel="canonical"]'));
    var node = nodes.shift();
    if (!node) { node = document.createElement("link"); node.rel = "canonical"; document.head.appendChild(node); }
    node.href = url; node.setAttribute("data-mdn-seo", "canonical");
    nodes.forEach(function (duplicate) { duplicate.remove(); });
  }
  function setJsonLd(config, canonical) {
    var node = document.getElementById("mdn-page-schema");
    if (!node) { node = document.createElement("script"); node.id = "mdn-page-schema"; node.type = "application/ld+json"; document.head.appendChild(node); }
    var organization = { "@type": "Organization", "@id": ORGANIZATION_ID, name: BRAND, url: "https://mydripnurse.com/" };
    var website = { "@type": "WebSite", "@id": WEBSITE_ID, name: BRAND, url: "https://mydripnurse.com/", publisher: { "@id": ORGANIZATION_ID } };
    var webpage = { "@type": "WebPage", "@id": canonical + "#webpage", url: canonical, name: config.title, description: config.description, isPartOf: { "@id": WEBSITE_ID }, about: { "@id": ORGANIZATION_ID } };
    var graph = [organization, website, webpage];
    if (config.pageType === "service") {
      var service = { "@type": "Service", "@id": canonical + "#service", name: config.serviceName + " Mobile IV Therapy", serviceType: "Mobile IV Therapy", description: config.description, url: canonical, provider: { "@id": ORGANIZATION_ID }, areaServed: clean(config.location) || "United States and Puerto Rico" };
      webpage.mainEntity = { "@id": service["@id"] }; graph.push(service);
    }
    node.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
  }
  function apply(input) {
    var config = input || {};
    var preview = location.hostname === "care.mydripnurse.com" && /^\/embeds\//.test(location.pathname);
    if (preview) return;
    config.title = clean(config.title); config.description = clean(config.description);
    if (!config.title || !config.description) return;
    var canonical = canonicalUrl(config.canonicalPath);
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: BRAND });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    if (clean(config.image)) { upsertMeta('meta[property="og:image"]', { property: "og:image", content: clean(config.image) }); upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: clean(config.image) }); }
    setCanonical(canonical); setJsonLd(config, canonical);
  }
  // Older GHL snapshots contain absolute national links. Keep only their
  // marketing header navigation on the current site; portal/assets stay central.
  function localizeHeaderLinks(root) {
    var current = window.location;
    if (!/^https?:$/.test(current.protocol)) return;
    if (/^(care|partners|admin|onboarding|policy)\.mydripnurse\.com$/i.test(current.hostname)) return;
    if (/(^|\.)(leadconnectorhq\.com|msgsndr\.com|vercel\.app)$/i.test(current.hostname) || current.hostname === "app.devasks.com") return;
    var links = root.querySelectorAll('[data-mdn-ghl-header] a[href]');
    for (var i = 0; i < links.length; i += 1) {
      var raw = links[i].getAttribute("href") || "";
      if (!/^(https?:)?\/\//i.test(raw)) continue;
      try {
        var destination = new URL(raw, current.href);
        if (!/^(www\.)?mydripnurse\.com$/i.test(destination.hostname) || !/^https?:$/.test(destination.protocol)) continue;
        links[i].setAttribute("href", current.origin + destination.pathname + destination.search + destination.hash);
      } catch (_error) { /* Leave invalid or non-web links unchanged. */ }
    }
  }
  localizeHeaderLinks(document);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { localizeHeaderLinks(document); }, { once: true });
  window.addEventListener("pageshow", function () { localizeHeaderLinks(document); });
  // GHL may mount or restore a header after initial rendering. Capture before
  // native navigation, including keyboard clicks; no polling or network calls.
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (target && target.closest && target.closest('[data-mdn-ghl-header] a[href]')) localizeHeaderLinks(document);
  }, true);
  window.MDNSeoHead = { apply: apply };
})(window, document);
