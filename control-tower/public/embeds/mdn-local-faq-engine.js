(function (window, document) {
  "use strict";

  var VERSION = "1.0.0";
  var STYLE_ID = "mdn-local-faq-styles";
  var SCHEMA_ID = "mdn-local-faq-schema";

  var SERVICES = [
    {
      id: "hydration",
      name: "Hydration",
      category: "Mobile IV Therapy Services",
      path: "/hydration-mobile-iv-therapy",
      bookingPath: "/hydrate-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, a mineral blend, and B-Complex",
      description: "A mobile IV hydration service that combines IV fluids with Vitamin C, a mineral blend, and B-Complex in a convenient on-location appointment. A licensed medical professional reviews eligibility, ingredient suitability, and local availability before administration."
    },
    {
      id: "brain-storm",
      name: "Brain Storm",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-brain-storm",
      bookingPath: "/brain-storm-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, an amino blend, and a mineral blend",
      description: "A mobile IV therapy option featuring Vitamin C, B-Complex, an amino blend, and a mineral blend for clients seeking a convenient wellness-focused appointment. A licensed medical professional reviews eligibility and the selected formulation before administration."
    },
    {
      id: "alleviate",
      name: "Alleviate",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-alleviate",
      bookingPath: "/alleviate-mobile-iv-therapy-survey-book-appointment",
      ingredients: "calcium, magnesium, B-Complex, and Vitamin B-12",
      description: "A mobile IV therapy service formulated with calcium, magnesium, B-Complex, and Vitamin B-12. This on-location wellness appointment includes clinical screening, with eligibility, ingredient suitability, and availability confirmed before administration."
    },
    {
      id: "recovery-performance",
      name: "Recovery & Performance",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-recovery-and-performance",
      bookingPath: "/recovery-performance-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, an amino blend, and a mineral blend",
      description: "A mobile IV therapy option combining Vitamin C, B-Complex, an amino blend, and a mineral blend for clients incorporating hydration and nutrient support into their recovery or performance routine. It is not a substitute for injury evaluation or medical care, and eligibility is reviewed before administration."
    },
    {
      id: "myers-cocktail",
      name: "Myers' Cocktail",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-myers-cocktail",
      bookingPath: "/myers-cocktail-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, Vitamin B-12, and a mineral blend",
      description: "A mobile Myers' Cocktail IV therapy service containing Vitamin C, B-Complex, Vitamin B-12, and a mineral blend. The mobile appointment is provided at eligible locations after a licensed medical professional reviews medical history, suitability, and availability."
    },
    {
      id: "myers-cocktail-glutathione-push",
      name: "Myers' Cocktail + Glutathione Push",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-myers-cocktail-and-glutathione-push",
      bookingPath: "/myers-cockatil-and-glutathione-push-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, Vitamin B-12, a mineral blend, and a glutathione push",
      description: "A mobile Myers' Cocktail IV therapy service that combines Vitamin C, B-Complex, Vitamin B-12, a mineral blend, and a glutathione push. A licensed medical professional evaluates eligibility and ingredient suitability before treatment at an approved location."
    },
    {
      id: "get-lean-weight-loss",
      name: "Get Lean / Weight Loss",
      category: "Mobile IV Therapy Services",
      path: "/get-lean-weight-loss-mobile-iv-therapy",
      bookingPath: "/get-lean-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, an amino blend, and a mineral blend",
      description: "A mobile IV wellness service featuring Vitamin C, B-Complex, an amino blend, and a mineral blend. This service is intended to complement, not replace, clinician-guided nutrition, physical activity, or weight-management care, and eligibility is confirmed before administration."
    },
    {
      id: "hangover-jet-lag",
      name: "Hangover / Jet Lag",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-hangover-jet-lag",
      bookingPath: "/hangover-mobile-iv-therapy-survey-book-appointment",
      ingredients: "ondansetron, a mineral blend, and B-Complex",
      description: "A mobile IV hydration option featuring a mineral blend, B-Complex, and ondansetron when clinically appropriate. Medication suitability, eligibility, and local availability require review by a licensed medical professional; this service does not guarantee relief from hangover or travel-related symptoms."
    },
    {
      id: "the-glow-beauty-iv-drip",
      name: "The Glow / Beauty IV Drip",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-the-glow-beauty-iv-drip",
      bookingPath: "/the-glow-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, B-Complex, and biotin",
      description: "A mobile beauty-focused IV wellness service formulated with Vitamin C, B-Complex, and biotin. The service is delivered at eligible locations after clinical screening and does not diagnose skin, hair, or nail conditions or guarantee cosmetic outcomes."
    },
    {
      id: "immunity-defense-cold-flu",
      name: "Immunity Defense / Cold & Flu",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-immunity-defense-cold-flu",
      bookingPath: "/immunity-defense-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, zinc, and B-Complex",
      description: "A mobile IV wellness service featuring Vitamin C, zinc, and B-Complex. Despite its service name, it is not intended to diagnose, prevent, cure, or treat a cold, influenza, or other illness; eligibility and ingredient suitability are reviewed before administration."
    },
    {
      id: "immunity-defense-cold-flu-glutathione",
      name: "Immunity Defense / Cold & Flu + Glutathione",
      category: "Mobile IV Therapy Services",
      path: "/mobile-iv-therapy-immunity-defense-cold-flu-and-glutathione",
      bookingPath: "/immunity-defense-and-glutathione-push-mobile-iv-therapy-survey-book-appointment",
      ingredients: "Vitamin C, zinc, B-Complex, and a glutathione push",
      description: "A mobile IV wellness service combining Vitamin C, zinc, B-Complex, and a glutathione push. It is not a treatment or cure for colds, influenza, or other illnesses, and a licensed medical professional must confirm eligibility, suitability, and availability."
    },
    {
      id: "nad-plus",
      name: "NAD+",
      category: "Mobile IV Therapy Services",
      path: "/nad-plus-mobile-iv-therapy",
      bookingPath: "/nad-mobile-iv-therapy-survey-book-appointment",
      ingredients: "500 mg of NAD+ and 500 mL of IV fluids",
      description: "A mobile NAD+ IV therapy service featuring 500 mg of NAD+ with 500 mL of IV fluids. The appointment includes clinical screening and does not promise anti-aging, cognitive, energy, or disease-related outcomes; eligibility and local availability are confirmed before administration."
    },
    {
      id: "nad-plus-boost",
      name: "NAD+ Boost",
      category: "Mobile IV Therapy Services",
      path: "/nad-plus-boost-mobile-iv-therapy",
      bookingPath: "/nad-boost-mobile-iv-therapy-survey-book-appointment",
      ingredients: "500 mg of NAD+, 1,000 mL of IV fluids, magnesium, Vitamin C, Vitamin B-12, B-Complex, and a glutathione push",
      description: "A mobile NAD+ IV therapy service combining 500 mg of NAD+, 1,000 mL of IV fluids, magnesium, Vitamin C, Vitamin B-12, B-Complex, and a glutathione push. A licensed medical professional reviews eligibility and ingredient suitability, and no wellness or performance outcome is guaranteed."
    }
  ];

  function str(value) {
    return String(value == null ? "" : value).trim();
  }

  function norm(value) {
    return str(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function slug(value) {
    return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function normalizePath(value) {
    var raw = str(value);
    if (!raw) return "/";
    try { raw = new URL(raw, window.location.origin).pathname; } catch (_error) {}
    raw = "/" + raw.replace(/^\/+|\/+$/g, "");
    return raw === "/" ? raw : raw.toLowerCase();
  }

  function unresolved(value) {
    return /\{\{[^}]+\}\}/.test(str(value));
  }

  function hostFrom(value) {
    var raw = str(value);
    if (!raw) return "";
    try { return new URL(/^https?:/i.test(raw) ? raw : "https://" + raw).hostname.replace(/^www\./i, "").toLowerCase(); }
    catch (_error) { return raw.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "").toLowerCase(); }
  }

  function headingText() {
    return Array.prototype.map.call(document.querySelectorAll("h1, h2"), function (node) {
      return str(node.textContent);
    }).join(" ");
  }

  function serviceTokens(service) {
    var stop = { mobile: true, therapy: true, services: true, service: true, drip: true, and: true, the: true };
    return slug(service.id + " " + service.name).split("-").filter(function (token) {
      return token.length > 2 && !stop[token];
    });
  }

  function resolveService() {
    var path = normalizePath(window.location.pathname);
    var exact = SERVICES.find(function (service) { return normalizePath(service.path) === path; });
    if (exact) return { service: exact, source: "path", confidence: 1 };

    var evidence = norm(path + " " + document.title + " " + headingText());
    var ranked = SERVICES.map(function (service) {
      var tokens = serviceTokens(service);
      var matches = tokens.filter(function (token) { return evidence.indexOf(token) > -1; }).length;
      return { service: service, matches: matches, total: tokens.length || 1 };
    }).sort(function (a, b) {
      var ar = a.matches / a.total;
      var br = b.matches / b.total;
      return br === ar ? b.matches - a.matches : br - ar;
    });
    var best = ranked[0];
    var confidence = best ? best.matches / best.total : 0;
    return best && best.matches >= 1 && confidence >= 0.6
      ? { service: best.service, source: "page-headings", confidence: confidence }
      : null;
  }

  function aliases(value, type) {
    var base = slug(value).replace(/-(city|county|parish)(-[a-z]{2})?$/, "").replace(/-[a-z]{2}$/, "");
    return [slug(value), base, base + "-" + type].filter(Boolean);
  }

  function detectLocation(index, fallbackLabel) {
    var items = index && Array.isArray(index.items) ? index.items : [];
    var host = window.location.hostname.replace(/^www\./i, "").toLowerCase();
    var subdomain = host.split(".").length > 2 ? host.split(".")[0] : "";
    var city = items.find(function (item) { return hostFrom(item.cityUrl || item.cityDomain) === host; });
    var county = items.find(function (item) { return hostFrom(item.countyUrl || item.countyDomain) === host; });
    var state = items.find(function (item) { return hostFrom(item.stateUrl) === host; });

    if (!city && subdomain) {
      city = items.find(function (item) { return aliases(item.city, "city").indexOf(subdomain) > -1; });
    }
    if (!county && subdomain) {
      county = items.find(function (item) {
        return aliases(item.county, norm(item.state) === "louisiana" ? "parish" : "county").indexOf(subdomain) > -1;
      });
    }
    if (!state && subdomain) {
      state = items.find(function (item) { return slug(item.state) === subdomain; });
    }

    var match = city || county || state;
    if (match) {
      return {
        type: city ? "city" : county ? "county" : "state",
        city: city ? str(city.city) : "",
        county: str((city || county || {}).county),
        state: str(match.state),
        source: hostFrom((city || {}).cityUrl || (city || {}).cityDomain) === host || hostFrom((county || {}).countyUrl || (county || {}).countyDomain) === host ? "hostname" : "subdomain"
      };
    }

    if (host === "mydripnurse.com" || host === "www.mydripnurse.com") {
      return { type: "nationwide", city: "", county: "", state: "", label: "the United States and Puerto Rico", source: "nationwide-root-domain" };
    }

    var fallback = unresolved(fallbackLabel) ? "" : str(fallbackLabel);
    if (fallback) {
      return { type: "label", city: "", county: "", state: "", label: fallback, source: "ghl-custom-value" };
    }

    return { type: "generic", city: "", county: "", state: "", label: "your area", source: "safe-generic-fallback" };
  }

  function placeLabel(location) {
    if (!location) return "your area";
    if (location.label) return location.label;
    if (location.city) return location.city + (location.state ? ", " + location.state : "");
    if (location.county) return location.county + (location.state ? ", " + location.state : "");
    return location.state || "your area";
  }

  function coverageLabel(location) {
    if (!location) return "your area";
    if (location.county) return location.county + (location.state ? ", " + location.state : "");
    return placeLabel(location);
  }

  function listPhrase(values) {
    if (!values.length) return "an eligible address";
    if (values.length === 1) return "an eligible " + values[0];
    return values.slice(0, -1).join(", ") + ", or " + values[values.length - 1];
  }

  function specialFaq(service) {
    if (service.id.indexOf("immunity-defense") === 0) {
      return {
        question: "Does " + service.name + " treat a cold or influenza?",
        answer: "No. This wellness service is not intended to diagnose, prevent, cure, or treat a cold, influenza, or another illness. A licensed medical professional reviews eligibility and advises whether the selected service is appropriate."
      };
    }
    if (service.id === "get-lean-weight-loss") {
      return {
        question: "Is Get Lean a replacement for medical weight-management care?",
        answer: "No. Get Lean is a mobile IV wellness service and does not replace clinician-guided nutrition, physical activity, medication, or medical weight-management care. Eligibility is reviewed before administration."
      };
    }
    if (service.id.indexOf("nad-plus") === 0) {
      return {
        question: "Does " + service.name + " guarantee anti-aging, energy, or cognitive results?",
        answer: "No. Individual experiences vary, and this service does not guarantee anti-aging, energy, cognitive, wellness, or disease-related outcomes. A licensed medical professional must confirm eligibility before administration."
      };
    }
    if (service.id === "the-glow-beauty-iv-drip") {
      return {
        question: "Does The Glow guarantee cosmetic results?",
        answer: "No. The Glow is a beauty-focused IV wellness service and does not diagnose skin, hair, or nail conditions or guarantee cosmetic outcomes. Eligibility and ingredient suitability are reviewed before administration."
      };
    }
    return null;
  }

  function buildFaqs(service, location, config) {
    var place = placeLabel(location);
    var coverage = coverageLabel(location);
    var contexts = config.contexts;
    var faqs = [
      {
        question: "What is " + service.name + " mobile IV therapy?",
        answer: service.description
      },
      {
        question: "What ingredients are included in " + service.name + "?",
        answer: "The listed formulation includes " + service.ingredients + ". Final ingredient selection, medication suitability when applicable, and eligibility are confirmed by a licensed medical professional before administration."
      },
      {
        question: "Can I request " + service.name + " in " + place + "?",
        answer: "Appointments may be requested for " + listPhrase(contexts) + " in " + place + ". Exact address coverage, scheduling availability, and eligibility are confirmed during the booking process."
      },
      {
        question: "How is service coverage confirmed for " + coverage + "?",
        answer: "Enter the complete appointment address when submitting the booking request. My Drip Nurse confirms whether the address is within the current service area before the appointment is finalized."
      },
      {
        question: "How do I book a " + service.name + " appointment?",
        answer: "Use the booking page to submit the requested service, preferred date, contact information, and appointment address. The care team then confirms coverage, scheduling availability, and any required clinical screening."
      },
      {
        question: "How is eligibility for mobile IV therapy determined?",
        answer: "Eligibility is based on the information collected during booking and the clinical review completed by an appropriate licensed medical professional. A requested service may be adjusted or declined when it is not considered suitable."
      }
    ];
    var special = specialFaq(service);
    if (special) faqs.push(special);
    return faqs.slice(0, 7);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".mdn-local-faq{--mdn-faq-ink:#172131;--mdn-faq-muted:#52636b;--mdn-faq-line:#cbdde8;--mdn-faq-soft:#ebf2f9;--mdn-faq-focus:#087f91;width:100%;max-width:1160px;margin:0 auto;padding:44px 16px 52px;box-sizing:border-box;color:var(--mdn-faq-ink);font-family:\"Lato\",sans-serif;isolation:isolate}",
      ".mdn-local-faq *{box-sizing:border-box}",
      ".mdn-local-faq__title{margin:0 0 28px;color:#044c5c;font:italic 700 26px/1.2 \"Nunito\",sans-serif;letter-spacing:-.02em;text-align:center}",
      ".mdn-local-faq__list{display:grid;gap:10px}",
      ".mdn-local-faq__item{overflow:hidden;border:1.5px solid var(--mdn-faq-line);border-radius:12px;background:linear-gradient(135deg,rgba(235,242,249,.72),rgba(255,255,255,.96));box-shadow:0 1px 0 rgba(18,74,84,.02)}",
      ".mdn-local-faq__button{width:100%;min-height:64px;display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:center;gap:14px;margin:0;padding:16px 18px;border:0;color:var(--mdn-faq-ink);background:transparent;font:700 14px/1.4 \"Nunito\",sans-serif;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}",
      ".mdn-local-faq__button:hover{background:rgba(235,242,249,.78)}",
      ".mdn-local-faq__button:focus-visible{outline:3px solid rgba(8,127,145,.22);outline-offset:-3px}",
      ".mdn-local-faq__icon{width:18px;height:18px;justify-self:end;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2.25;transition:transform .2s ease}",
      ".mdn-local-faq__button[aria-expanded=true] .mdn-local-faq__icon{transform:rotate(180deg)}",
      ".mdn-local-faq__panel{border-top:1px solid rgba(4,76,92,.12);background:rgba(235,242,249,.58)}",
      ".mdn-local-faq__panel[hidden]{display:none}",
      ".mdn-local-faq__answer{margin:0;padding:17px 18px 20px;color:var(--mdn-faq-muted);font:400 12px/1.65 \"Lato\",sans-serif}",
      "@media(min-width:720px){.mdn-local-faq{padding:64px 24px 72px}.mdn-local-faq__title{margin-bottom:42px;font-size:32px}.mdn-local-faq__list{gap:12px}.mdn-local-faq__button{min-height:74px;padding:18px 22px;font-size:16px}.mdn-local-faq__answer{padding:20px 22px 23px;font-size:15px}}",
      "@media(prefers-reduced-motion:reduce){.mdn-local-faq__icon{transition:none}}"
    ].join("");
    document.head.appendChild(style);
  }

  function createIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "mdn-local-faq__icon");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m4 7 6 6 6-6");
    svg.appendChild(path);
    return svg;
  }

  function render(root, faqs, config) {
    root.textContent = "";
    root.className = (root.className ? root.className + " " : "") + "mdn-local-faq";
    root.setAttribute("data-mdn-mounted", VERSION);

    var title = document.createElement("h2");
    title.className = "mdn-local-faq__title";
    title.textContent = config.title;
    root.appendChild(title);

    var list = document.createElement("div");
    list.className = "mdn-local-faq__list";
    faqs.forEach(function (faq, index) {
      var item = document.createElement("div");
      item.className = "mdn-local-faq__item";
      var button = document.createElement("button");
      var panel = document.createElement("div");
      var answer = document.createElement("p");
      var buttonId = "mdn-faq-button-" + index;
      var panelId = "mdn-faq-panel-" + index;

      button.className = "mdn-local-faq__button";
      button.type = "button";
      button.id = buttonId;
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", panelId);
      var label = document.createElement("span");
      label.textContent = faq.question;
      button.appendChild(label);
      button.appendChild(createIcon());

      panel.className = "mdn-local-faq__panel";
      panel.id = panelId;
      panel.hidden = true;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-labelledby", buttonId);
      answer.className = "mdn-local-faq__answer";
      answer.textContent = faq.answer;
      panel.appendChild(answer);

      button.addEventListener("click", function () {
        var willOpen = button.getAttribute("aria-expanded") !== "true";
        Array.prototype.forEach.call(list.querySelectorAll(".mdn-local-faq__button"), function (otherButton) {
          otherButton.setAttribute("aria-expanded", "false");
          var otherPanel = document.getElementById(otherButton.getAttribute("aria-controls"));
          if (otherPanel) otherPanel.hidden = true;
        });
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
        panel.hidden = !willOpen;
        if (willOpen) {
          window.dispatchEvent(new CustomEvent("mdn:faq-open", { detail: { question: faq.question, index: index } }));
        }
      });

      item.appendChild(button);
      item.appendChild(panel);
      list.appendChild(item);
    });
    root.appendChild(list);
  }

  function injectSchema(faqs) {
    var existing = document.getElementById(SCHEMA_ID);
    if (existing) existing.remove();
    if (!faqs.length) return;
    var script = document.createElement("script");
    script.id = SCHEMA_ID;
    script.type = "application/ld+json";
    script.setAttribute("data-mdn-local-faq-schema", VERSION);
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(function (faq) {
        return {
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer }
        };
      })
    });
    document.head.appendChild(script);
  }

  function configFromRoot(root) {
    var contexts = str(root.getAttribute("data-appointment-contexts") || "home,hotel,office,vacation rental")
      .split(",").map(str).filter(Boolean).slice(0, 5);
    return {
      indexUrl: str(root.getAttribute("data-index-url")),
      fallbackLocation: str(root.getAttribute("data-location-label")),
      title: str(root.getAttribute("data-title")) || "Frequently Asked Questions",
      contexts: contexts,
      schema: root.getAttribute("data-schema") !== "false",
      debug: root.getAttribute("data-debug") === "true" || /(?:\?|&)mdnFaqDebug=1(?:&|$)/.test(window.location.search)
    };
  }

  function fetchIndex(url) {
    if (!url) return Promise.resolve(null);
    return fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" })
      .then(function (response) { if (!response.ok) throw new Error("Location index unavailable"); return response.json(); })
      .catch(function () { return null; });
  }

  function mount(root) {
    if (!root || root.getAttribute("data-mdn-mounted") === VERSION) return Promise.resolve(null);
    var config = configFromRoot(root);
    var serviceResult = resolveService();
    if (!serviceResult) {
      root.setAttribute("data-mdn-status", "service-not-resolved");
      return Promise.resolve(null);
    }
    injectStyles();
    return fetchIndex(config.indexUrl).then(function (index) {
      var location = detectLocation(index, config.fallbackLocation);
      if (!location) {
        root.setAttribute("data-mdn-status", "location-not-resolved");
        return null;
      }
      var faqs = buildFaqs(serviceResult.service, location, config);
      render(root, faqs, config);
      if (config.schema) injectSchema(faqs);
      root.setAttribute("data-mdn-status", "ready");
      var result = {
        version: VERSION,
        service: serviceResult.service,
        serviceSource: serviceResult.source,
        serviceConfidence: serviceResult.confidence,
        location: location,
        faqCount: faqs.length,
        faqs: faqs
      };
      window.MDNLocalFAQLastResult = result;
      if (config.debug && window.console) window.console.info("[MDN Local FAQ Engine]", result);
      return result;
    });
  }

  function mountAll() {
    return Promise.all(Array.prototype.map.call(document.querySelectorAll("[data-mdn-local-faq-engine]"), mount));
  }

  window.MDNLocalFAQEngine = { version: VERSION, services: SERVICES.slice(), mount: mount, mountAll: mountAll };

  function boot() {
    mountAll();
    if (!("MutationObserver" in window) || !document.body) return;
    var observer = new MutationObserver(function () { mountAll(); });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () { observer.disconnect(); }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}(window, document));
