(()=>{"use strict";const root=document.querySelector("[data-mdn-home-snapshot]");if(!root)return;const unresolved=v=>!v||v.includes("{{");const cleanBase=v=>String(v||"").trim().replace(/\/$/,"");const local=location.hostname==="127.0.0.1"||location.hostname==="localhost"||location.protocol==="file:";const configuredBase=cleanBase(root.dataset.websiteUrl);const websiteBase=unresolved(configuredBase)?(local?"https://mydripnurse.com":location.origin):configuredBase;const configuredPhone=String(root.dataset.phone||"").trim();const phone=unresolved(configuredPhone)?"1 (833) 381-0071":configuredPhone;root.querySelectorAll("[data-mdn-path]").forEach(a=>a.href=websiteBase+(a.dataset.mdnPath||""));root.querySelectorAll("[data-mdn-phone]").forEach(a=>a.href="tel:"+phone.replace(/[^+\d]/g,""));root.querySelectorAll("[data-mdn-phone-label]").forEach(n=>n.textContent=phone);

const title=s=>String(s||"").replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()).trim();const host=location.hostname.replace(/^www\./,"").toLowerCase();const rootHosts=new Set(["mydripnurse.com","localhost","127.0.0.1"]);const stateNames={"alabama":"Alabama","alaska":"Alaska","arizona":"Arizona","arkansas":"Arkansas","california":"California","colorado":"Colorado","connecticut":"Connecticut","delaware":"Delaware","florida":"Florida","georgia":"Georgia","hawaii":"Hawaii","idaho":"Idaho","illinois":"Illinois","indiana":"Indiana","iowa":"Iowa","kansas":"Kansas","kentucky":"Kentucky","louisiana":"Louisiana","maine":"Maine","maryland":"Maryland","massachusetts":"Massachusetts","michigan":"Michigan","minnesota":"Minnesota","mississippi":"Mississippi","missouri":"Missouri","montana":"Montana","nebraska":"Nebraska","nevada":"Nevada","new-hampshire":"New Hampshire","new-jersey":"New Jersey","new-mexico":"New Mexico","new-york":"New York","north-carolina":"North Carolina","north-dakota":"North Dakota","ohio":"Ohio","oklahoma":"Oklahoma","oregon":"Oregon","pennsylvania":"Pennsylvania","rhode-island":"Rhode Island","south-carolina":"South Carolina","south-dakota":"South Dakota","tennessee":"Tennessee","texas":"Texas","utah":"Utah","vermont":"Vermont","virginia":"Virginia","washington":"Washington","west-virginia":"West Virginia","wisconsin":"Wisconsin","wyoming":"Wyoming","district-of-columbia":"District of Columbia","puerto-rico":"Puerto Rico"};const stateSlugs=new Set(Object.keys(stateNames));
const normalizeUrl=v=>{try{return new URL(v,location.origin)}catch{return null}};const flatten=(value,out=[])=>{if(Array.isArray(value)){value.forEach(v=>flatten(v,out));return out}if(value&&typeof value==="object"){out.push(value);Object.values(value).forEach(v=>{if(v&&typeof v==="object")flatten(v,out)})}return out};const first=(o,keys)=>{for(const k of keys)if(typeof o?.[k]==="string"&&o[k].trim())return o[k].trim();return""};const inferFromHost=()=>{if(rootHosts.has(host)||host.endsWith(".vercel.app"))return{type:"nationwide",name:"United States and Puerto Rico"};const slug=host.split(".")[0];if(stateSlugs.has(slug))return{type:"state",name:stateNames[slug]||title(slug)};return{type:"city",name:title(slug)}};
const matchCoverageLocation=data=>{const items=Array.isArray(data?.items)?data.items:[];const domainHost=value=>{try{const raw=String(value||"").trim();return new URL(/^https?:/i.test(raw)?raw:"https://"+raw).hostname.replace(/^www\./,"").toLowerCase()}catch{return""}};const exact=(keys)=>items.find(item=>keys.some(key=>domainHost(item?.[key])===host));const city=exact(["cityUrl","cityDomain"]);if(city)return{type:"city",name:first(city,["city","cityName"]),state:first(city,["state","stateName"]),county:first(city,["county","countyName"]),object:city};const county=exact(["countyUrl","countyDomain"]);if(county)return{type:"county",name:first(county,["county","countyName"]),state:first(county,["state","stateName"]),county:first(county,["county","countyName"]),object:county};const state=exact(["stateUrl","stateDomain"]);if(state)return{type:"state",name:first(state,["state","stateName"]),state:first(state,["state","stateName"]),object:state};return null};
const matchIndex=data=>{const currentHost=host;const currentPath=location.pathname.replace(/\/$/,"")||"/";let best=null,bestScore=0;for(const o of flatten(data)){const raw=first(o,["canonicalUrl","canonicalURL","url","href","websiteUrl","domain","candidateUrl"]);const u=normalizeUrl(raw);if(!u)continue;let score=0;const itemHost=u.hostname.replace(/^www\./,"").toLowerCase();const itemPath=u.pathname.replace(/\/$/,"")||"/";if(itemHost===currentHost)score+=8;if(itemPath===currentPath)score+=3;if(itemHost===currentHost&&itemPath==="/")score+=2;if(score<=bestScore)continue;const type=first(o,["type","locationType","level"]).toLowerCase()||"city";let name=first(o,["displayName","locationName","name","cityName","countyName","stateName","label","title"]);const state=first(o,["stateName","state"]);const county=first(o,["countyName","county","parishName","parish"]);if(type.includes("county")&&!/county$/i.test(name))name+=" County";if(type.includes("parish")&&!/parish$/i.test(name))name+=" Parish";best={type,name:name||title(itemHost.split(".")[0]),state,county,object:o};bestScore=score}return best};
const applyLocation=loc=>{const type=loc.type||"city";const nationwide=type.includes("nation")||rootHosts.has(host);let display=loc.name||"your area";if(type.includes("county")&&!/\s(county|parish)$/i.test(display))display+=String(loc.state||"").toLowerCase()==="louisiana"?" Parish":" County";if(loc.state&&!display.toLowerCase().includes(loc.state.toLowerCase())&&!type.includes("state"))display+=`, ${loc.state}`;const headline=root.querySelector("[data-mdn-home-headline]");const locationCopy=root.querySelector("[data-mdn-home-location-copy]");const coverageCopy=root.querySelector("[data-mdn-home-coverage-copy]");if(headline)headline.textContent=nationwide?"Across the United States & Puerto Rico":`in ${display}`;if(locationCopy)locationCopy.textContent=nationwide?"across the United States and Puerto Rico":`in ${display}`;if(coverageCopy)coverageCopy.textContent=nationwide?"Explore My Drip Nurse service areas across the United States and Puerto Rico. Appointment availability varies by address.":`Explore mobile wellness options serving ${display} and related active areas. Appointment availability varies by address.`;const faq=root.querySelector("[data-mdn-local-faq-engine]");if(faq)faq.dataset.locationLabel=nationwide?"United States and Puerto Rico":display;if(window.MDNSeoHead){const place=nationwide?"the United States and Puerto Rico":display;window.MDNSeoHead.apply({pageType:"home",location:place,title:nationwide?"Mobile IV Therapy at Home | My Drip Nurse":`Mobile IV Therapy in ${display} | My Drip Nurse`,description:nationwide?"Explore mobile IV therapy, NAD+ and vitamin injection services delivered to eligible homes, hotels and offices across the United States and Puerto Rico.":`Explore mobile IV therapy, NAD+ and vitamin injection services delivered to eligible homes, hotels and offices in ${display}. Check local availability.`,canonicalPath:location.pathname,image:"https://care.mydripnurse.com/embeds/home-snapshot/assets/hero-1248.avif"})}document.documentElement.dataset.mdnLocationType=type;root.dataset.mdnLocationReady="true";root.removeAttribute("aria-busy")};
const configuredDisplay=String(root.dataset.locationDisplay||"").trim();const configuredLevel=String(root.dataset.locationLevel||"").trim().toLowerCase();const hasConfiguredLocation=configuredDisplay&&!unresolved(configuredDisplay);const fallback=inferFromHost();const hasImmediateLocation=hasConfiguredLocation||rootHosts.has(host);if(hasConfiguredLocation)applyLocation({type:configuredLevel||"label",name:configuredDisplay,label:configuredDisplay});else if(rootHosts.has(host))applyLocation(fallback);const indexUrl=root.dataset.indexUrl;if(!hasImmediateLocation)root.setAttribute("aria-busy","true");if(indexUrl)fetch(indexUrl,{mode:"cors",credentials:"omit"}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{const found=matchCoverageLocation(data)||matchIndex(data);if(!hasImmediateLocation)applyLocation(found||fallback);const items=flatten(data).filter(o=>{const raw=first(o,["canonicalUrl","canonicalURL","url","href","websiteUrl","domain","candidateUrl"]);const u=normalizeUrl(raw);return u&&u.hostname&&first(o,["name","displayName","locationName","cityName","countyName","stateName","label","title"])}).slice(0,80);const nav=root.querySelector("[data-mdn-home-locations]");if(nav&&items.length){const seen=new Set(),links=[];for(const o of items){const raw=first(o,["canonicalUrl","canonicalURL","url","href","websiteUrl","domain","candidateUrl"]);const u=normalizeUrl(raw);let name=first(o,["displayName","locationName","name","cityName","countyName","stateName","label","title"]);if(!u||!name||seen.has(u.href))continue;seen.add(u.href);links.push({name,url:u.href});if(links.length===6)break}if(links.length>=3)nav.innerHTML=links.map(x=>`<a href="${x.url}">${x.name}</a>`).join("")}}).catch(()=>{if(!hasImmediateLocation)applyLocation(fallback)});else if(!hasImmediateLocation)applyLocation(fallback);
const reveal=()=>{root.querySelector(".mdn-home__hero-copy")?.classList.add("is-visible");const nodes=[...root.querySelectorAll(".mdn-home-reveal:not(.mdn-home__hero-copy)")];if(!("IntersectionObserver"in window)){nodes.forEach(n=>n.classList.add("is-visible"));return}const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("is-visible");io.unobserve(e.target)}}),{threshold:.12,rootMargin:"0px 0px -5%"});nodes.forEach(n=>io.observe(n))};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",reveal,{once:true});else reveal()})();

(()=>{"use strict";const root=document.querySelector("[data-mdn-home-snapshot]");const section=root?.querySelector("[data-mdn-home-catalog]");if(!root||!section)return;const track=section.querySelector("[data-mdn-catalog-track]");const prev=section.querySelector("[data-mdn-catalog-prev]");const next=section.querySelector("[data-mdn-catalog-next]");const unresolved=v=>!v||String(v).includes("{{");const configured=String(root.dataset.websiteUrl||"").replace(/\/$/,"");const base=unresolved(configured)?((location.hostname==="localhost"||location.hostname==="127.0.0.1")?"https://mydripnurse.com":location.origin):configured;const serviceApi=["https://care","mydripnurse","com/api/public/service-media"].join(".");const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const list=v=>Array.isArray(v)?v.filter(Boolean):String(v||"").split(/[|,]/).map(x=>x.trim()).filter(Boolean);const money=v=>{if(v===null||v===undefined||v==="")return"";if(typeof v==="string"&&v.includes("$"))return v;const n=Number(String(v).replace(/[^\d.]/g,""));return Number.isFinite(n)&&n>0?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n):""};const pathOf=s=>s.pagePath||s.landingPath||s.path||s.urlPath||s.slug&&`/${s.slug}`||"/mobile-iv-therapy";const normalize=s=>({id:s.id||s.serviceId||s.slug,name:s.name||s.serviceName||s.title,image:s.imageUrl||s.image||s.mediaUrl||s.thumbnailUrl,price:money(s.price??s.displayPrice??s.amount),ingredients:list(s.ingredients||s.ingredientList||s.formulation),description:s.description||s.shortDescription||s.seoDescription||"Explore service details, appointment information and eligibility requirements.",path:pathOf(s),category:String(s.serviceCategory||s.category||s.type||"")});const isIv=s=>{const hay=`${s.name} ${s.category} ${s.path}`.toLowerCase();if(/semaglutide|tirzepatide|vitamin injection|b-12 injection|vitamin d3|amino blend|lipo-mino|nad\+|nad plus/.test(hay))return false;return /iv|hydration|cocktail|brain storm|recovery|immunity|hangover|glow|alleviate|get lean/.test(hay)};const render=services=>{if(!services.length){track.innerHTML='<div class="mdn-home__catalog-loading">IV treatments are being updated. Please explore the complete treatment menu.</div>';return}track.innerHTML=services.map(s=>`<article class="mdn-home__catalog-card"><div class="mdn-home__catalog-media"><img src="${esc(s.image)}" width="720" height="720" loading="lazy" decoding="async" alt="${esc(s.name)} mobile IV therapy" title="${esc(s.name)} by My Drip Nurse"></div><div class="mdn-home__catalog-body"><h3>${esc(s.name)}</h3>${s.ingredients.length?`<p class="mdn-home__catalog-ingredients">${s.ingredients.map(esc).join(" | ")}</p>`:""}<p class="mdn-home__catalog-description">${esc(s.description)}</p><div class="mdn-home__catalog-footer">${s.price?`<div class="mdn-home__catalog-price"><strong>${esc(s.price)}</strong><small>Per visit</small></div>`:"<span></span>"}<a href="${esc(base+s.path)}" aria-label="Explore ${esc(s.name)}">Explore <span aria-hidden="true">&#8594;</span></a></div></div></article>`).join("")};const move=dir=>track.scrollBy({left:dir*Math.max(280,track.clientWidth*.78),behavior:"smooth"});prev?.addEventListener("click",()=>move(-1));next?.addEventListener("click",()=>move(1));(window.__mdnServiceMediaPromise||(window.__mdnServiceMediaPromise=fetch(serviceApi,{credentials:"omit",cache:"force-cache"}).then(r=>r.ok?r.json():Promise.reject(new Error("catalog"))))).then(payload=>{const raw=Array.isArray(payload)?payload:payload.services||payload.items||payload.data||[];const services=raw.map(normalize).filter(s=>s.name&&s.image&&isIv(s));render(services)}).catch(()=>render([]))})();

/* Mobile CTA labels and visible FAQ-to-schema synchronization. */
(()=>{"use strict";const root=document.querySelector("[data-mdn-home-snapshot]");if(!root)return;const actions=root.querySelector(".mdn-home__hero .mdn-home__actions");const booking=actions?.querySelector('a[href*="select-your-mobile-iv-therapy"]');const phone=actions?.querySelector('a[href^="tel:"]');if(booking)booking.innerHTML='<span>Book mobile care</span><span aria-hidden="true">&#8594;</span>';if(phone){phone.textContent="Call";phone.setAttribute("aria-label","Call My Drip Nurse")}const faqRoot=root.querySelector("[data-mdn-local-faq-engine]");if(!faqRoot)return;const esc=v=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]||c));
const fallback=()=>{const place=faqRoot.dataset.locationLabel||"the United States and Puerto Rico";return[
["What is mobile IV therapy?","Mobile IV therapy is an on-location wellness service in which IV fluids and selected nutrients are administered by a qualified medical professional after eligibility is reviewed."],
["What mobile IV treatments are available?","Available options may include hydration, wellness, recovery, beauty, immunity and other nutrient-focused IV services. Ingredients and availability vary by treatment and location."],
["Where can I request mobile IV therapy?",`My Drip Nurse serves eligible homes, hotels, offices and event locations across ${place}. Service availability varies by address.`],
["How do I choose an IV therapy service?","Compare each treatment's listed ingredients and service details, then select the option that best matches your wellness interests. A medical professional determines clinical eligibility before administration."],
["How long does a mobile IV appointment take?","Many mobile IV visits are completed within approximately 45 to 60 minutes, although timing can vary by treatment, individual needs and appointment setting."]
]};
const renderFallback=()=>{const rows=fallback();faqRoot.innerHTML=`<div class="mdn-home__faq-shell"><header class="mdn-home__faq-head"><p class="mdn-home__eyebrow">Helpful answers</p><h2>Frequently Asked Questions</h2></header><div class="mdn-home__faq-list">${rows.map(([q,a])=>`<details class="mdn-home__faq-item"><summary>${esc(q)}</summary><div class="mdn-home__faq-answer"><p>${esc(a)}</p></div></details>`).join("")}</div></div>`};
const pairs=()=>[...faqRoot.querySelectorAll("details")].map(d=>{const q=d.querySelector("summary")?.textContent.trim();const answer=[...d.children].filter(x=>x.tagName!=="SUMMARY").map(x=>x.textContent.trim()).join(" ").trim();return q&&answer?[q,answer]:null}).filter(Boolean);
const sync=()=>{const rows=pairs();if(!rows.length)return;let node=document.getElementById("mdn-home-faq-schema");if(!node){node=document.createElement("script");node.type="application/ld+json";node.id="mdn-home-faq-schema";document.head.appendChild(node)}node.textContent=JSON.stringify({"@context":"https://schema.org","@type":"FAQPage",mainEntity:rows.map(([q,a])=>({"@type":"Question",name:q,acceptedAnswer:{"@type":"Answer",text:a}}))})};
setTimeout(()=>{if(!faqRoot.querySelector("details"))renderFallback();sync();const observer=new MutationObserver(()=>sync());observer.observe(faqRoot,{childList:true,subtree:true,characterData:true})},1200)})();

/* Ignore technical /all URL segments in visible regional copy. */
(()=>{"use strict";const hero=document.querySelector("[data-mdn-home-snapshot] .mdn-home__hero");if(!hero)return;let busy=false;const clean=()=>{if(busy)return;busy=true;const walker=document.createTreeWalker(hero,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){const next=node.nodeValue.replace(/,\s*all\b/gi,"");if(next!==node.nodeValue)node.nodeValue=next}busy=false};clean();new MutationObserver(clean).observe(hero,{childList:true,subtree:true,characterData:true})})();

/* URL-aware visible location sanitizer: /all is routing metadata, never a place name. */
(()=>{"use strict";const root=document.querySelector("[data-mdn-home-snapshot]");if(!root)return;let running=false;const sanitize=()=>{if(running)return;running=true;const nodes=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))nodes.push(node);for(let i=0;i<nodes.length;i++){const current=nodes[i];current.nodeValue=current.nodeValue.replace(/,\s*all\b/gi,"").replace(/\ball\s+(?=(?:area|location)\b)/gi,"");if(/^\s*all(?:[.!?])?\s*$/i.test(current.nodeValue)){let previous=i-1;while(previous>=0&&!nodes[previous].nodeValue.trim())previous--;if(previous>=0&&/,\s*$/.test(nodes[previous].nodeValue)){nodes[previous].nodeValue=nodes[previous].nodeValue.replace(/,\s*$/,"");current.nodeValue=""}}}root.querySelectorAll("[data-location-label]").forEach(el=>{el.dataset.locationLabel=(el.dataset.locationLabel||"").replace(/,\s*all\b/gi,"")});running=false};sanitize();let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(sanitize,0)}).observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["data-location-label"]})})();


/* Regional internal-link coverage engine, aligned with service landing pages. */
(() => {
  "use strict";

  const root = document.querySelector("[data-mdn-home-snapshot]");
  const grid = root?.querySelector("[data-mdn-home-locations]");
  if (!root || !grid) return;

  const title = root.querySelector("[data-mdn-home-coverage-title]");
  const copy = root.querySelector("[data-mdn-home-coverage-copy]");
  const clean = (value) => String(value ?? "").trim();
  const normalized = (value) => clean(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = (value) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const same = (a, b) => normalized(a) === normalized(b);
  const urlHost = (value) => {
    try {
      return new URL(/^https?:/i.test(clean(value)) ? clean(value) : "https://" + clean(value)).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  };
  const publicUrl = (value) => /^https?:/i.test(clean(value)) ? clean(value) : "https://" + clean(value);
  const countyLabel = (county, state) => {
    if (/\s(county|parish)$/i.test(clean(county))) return clean(county);
    return clean(county) + (normalized(state) === "louisiana" ? " Parish" : " County");
  };
  const aliases = (value) => {
    const base = slug(value).replace(/-(city|county|parish)(-[a-z]{2})?$/, "").replace(/-[a-z]{2}$/, "");
    return [slug(value), base, base + "-city", base + "-county", base + "-parish"];
  };
  const detect = (items) => {
    const currentHost = location.hostname.replace(/^www\./, "").toLowerCase();
    const subdomain = currentHost.split(".").length > 2 ? currentHost.split(".")[0] : "";
    const city = items.find((item) => urlHost(item.cityUrl || item.cityDomain) === currentHost)
      || items.find((item) => aliases(item.city).includes(subdomain) && /-city/.test(subdomain));
    const county = items.find((item) => urlHost(item.countyUrl || item.countyDomain) === currentHost)
      || items.find((item) => aliases(item.county).includes(subdomain) && /(county|parish)/.test(subdomain));
    const state = items.find((item) => urlHost(item.stateUrl) === currentHost)
      || items.find((item) => slug(item.state) === subdomain);

    if (city) return { type: "city", city: clean(city.city), county: clean(city.county), state: clean(city.state) };
    if (county) return { type: "county", county: clean(county.county), state: clean(county.state) };
    if (state) return { type: "state", state: clean(state.state) };
    return { type: "nationwide" };
  };
  const unique = (rows) => {
    const seen = new Set();
    return rows.filter((row) => {
      const key = normalized(row.name);
      if (!key || !row.url || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  };
  const targets = (items, context) => {
    let rows;
    if (context.type === "city") {
      rows = items.filter((item) => same(item.state, context.state) && same(item.county, context.county) && !same(item.city, context.city))
        .map((item) => ({ name: clean(item.city), url: clean(item.cityUrl || item.cityDomain) }));
    } else if (context.type === "county") {
      rows = items.filter((item) => same(item.state, context.state) && same(item.county, context.county))
        .map((item) => ({ name: clean(item.city), url: clean(item.cityUrl || item.cityDomain) }));
    } else if (context.type === "state") {
      rows = items.filter((item) => same(item.state, context.state))
        .map((item) => ({ name: countyLabel(item.county, item.state), url: clean(item.countyUrl || item.countyDomain) }));
    } else {
      rows = items.map((item) => ({ name: clean(item.state), url: clean(item.stateUrl) }));
    }
    return unique(rows);
  };
  const heading = (context) => {
    if (context.type === "city") return "Cities near " + context.city;
    if (context.type === "county") return "Cities we serve in " + countyLabel(context.county, context.state) + ", " + context.state;
    if (context.type === "state") return "Counties we serve across " + context.state;
    return "Mobile wellness near you";
  };
  const render = (rows, context) => {
    if (title) title.textContent = heading(context);
    if (copy) copy.textContent = context.type === "nationwide"
      ? "Explore published My Drip Nurse service areas across the United States and Puerto Rico."
      : "Explore published My Drip Nurse location pages and mobile wellness services near you.";
    grid.textContent = "";
    grid.classList.add("mdn-home__location-grid--carousel");
    const links = [];
    rows.forEach((row) => {
      const link = document.createElement("a");
      link.href = publicUrl(row.url);
      link.title = "Explore My Drip Nurse mobile wellness services in " + row.name;
      link.textContent = row.name + " \u2192";
      links.push(link);
    });
    if (!rows.length) {
      const fallback = document.createElement("span");
      fallback.textContent = "Explore available mobile wellness service areas";
      grid.appendChild(fallback);
      return;
    }

    root.querySelector("[data-mdn-coverage-controls]")?.remove();
    root.querySelector("[data-mdn-coverage-search]")?.remove();
    const pageSize = window.matchMedia("(max-width: 699px)").matches ? 6
      : window.matchMedia("(max-width: 979px)").matches ? 8
      : 12;
    const noun = context.type === "state" ? "counties" : context.type === "nationwide" ? "states" : "cities";
    const viewport = document.createElement("div");
    const track = document.createElement("div");
    const pagination = document.createElement("div");
    const previous = document.createElement("button");
    const next = document.createElement("button");
    const pageStatus = document.createElement("span");
    let status = null;
    let activePage = 0;
    let pageCount = 1;
    viewport.className = "mdn-home__coverage-viewport";
    track.className = "mdn-home__coverage-track";
    pagination.className = "mdn-home__coverage-pagination";
    previous.type = next.type = "button";
    previous.className = next.className = "mdn-home__coverage-arrow";
    previous.textContent = "\u2190";
    next.textContent = "\u2192";
    previous.setAttribute("aria-label", `Previous ${noun}`);
    next.setAttribute("aria-label", `Next ${noun}`);
    pageStatus.className = "mdn-home__coverage-page-status";
    pageStatus.setAttribute("aria-live", "polite");
    pagination.append(previous, pageStatus, next);
    viewport.appendChild(track);
    const updatePagination = () => {
      previous.disabled = activePage === 0;
      next.disabled = activePage >= pageCount - 1;
      pageStatus.textContent = `Page ${activePage + 1} of ${pageCount}`;
      pagination.hidden = pageCount <= 1;
    };
    const goTo = (page, smooth = true) => {
      activePage = Math.max(0, Math.min(page, pageCount - 1));
      viewport.scrollTo({ left: activePage * viewport.clientWidth, behavior: smooth ? "smooth" : "auto" });
      updatePagination();
    };
    const buildPages = (query = "") => {
      const term = normalized(query);
      const matches = links.filter((link) => !term || normalized(link.textContent).includes(term));
      track.textContent = "";
      for (let index = 0; index < matches.length; index += pageSize) {
        const page = document.createElement("div");
        page.className = "mdn-home__coverage-page";
        matches.slice(index, index + pageSize).forEach((link) => page.appendChild(link));
        track.appendChild(page);
      }
      const unmatched = links.filter((link) => !matches.includes(link));
      if (unmatched.length) {
        const stash = document.createElement("div");
        stash.hidden = true;
        unmatched.forEach((link) => stash.appendChild(link));
        track.appendChild(stash);
      }
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "mdn-home__coverage-empty";
        empty.textContent = `No matching ${noun} found.`;
        track.prepend(empty);
      }
      pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
      if (status) status.textContent = term ? `${matches.length} ${noun} found` : `${links.length} ${noun}`;
      goTo(0, false);
    };
    if (links.length > 18) {
      const search = document.createElement("div");
      const input = document.createElement("input");
      status = document.createElement("span");
      search.className = "mdn-home__coverage-search";
      search.dataset.mdnCoverageSearch = "";
      input.type = "search";
      input.autocomplete = "off";
      input.placeholder = `Search ${noun}`;
      input.setAttribute("aria-label", `Search available ${noun}`);
      status.className = "mdn-home__coverage-status";
      status.setAttribute("aria-live", "polite");
      input.addEventListener("input", () => buildPages(input.value));
      search.append(input, status);
      grid.appendChild(search);
    }
    grid.append(viewport, pagination);
    previous.addEventListener("click", () => goTo(activePage - 1));
    next.addEventListener("click", () => goTo(activePage + 1));
    let scrollFrame = 0;
    viewport.addEventListener("scroll", () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        activePage = Math.round(viewport.scrollLeft / Math.max(1, viewport.clientWidth));
        updatePagination();
      });
    }, { passive: true });
    buildPages();
  };

  fetch(grid.dataset.indexUrl, { mode: "cors", credentials: "omit", cache: "force-cache" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("coverage")))
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      const context = detect(items);
      render(targets(items, context), context);
      root.setAttribute("data-coverage-location-type", context.type);
    })
    .catch(() => render([], { type: "nationwide" }));
})();
