async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
    return r.json();
}

function normalizeText(s) {
    // IMPORTANTE: quita tildes/diéresis pero conserva letras base (ñ -> n, ü -> u, á -> a)
    return (s || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function sendToParent(payload) {
    // Enviar selección al parent (GHL page)
    window.parent.postMessage({ source: "MDN_LOCATIONS_WIDGET", ...payload }, "*");
}

let index = null;
let stateMeta = []; // [{name, slug, jsonUrl}]
let stateCache = new Map(); // slug -> full state JSON

const qEl = document.getElementById("q");
const resultsEl = document.getElementById("results");
const stateSelect = document.getElementById("stateSelect");
const modeSelect = document.getElementById("modeSelect");
const closeBtn = document.getElementById("closeBtn");

modeSelect.value = window.__MDN_CFG__.redirectMode;

closeBtn.addEventListener("click", () => {
    sendToParent({ type: "CLOSE_MODAL" });
});

function renderResults(items) {
    if (!items.length) {
        resultsEl.style.display = "none";
        resultsEl.innerHTML = "";
        return;
    }
    resultsEl.style.display = "block";
    resultsEl.innerHTML = items.map((it) => {
        return `
      <div class="item">
        <div>
          <div><strong>${it.title}</strong></div>
          <div class="meta">${it.subtitle}</div>
        </div>
        <div>
          <button data-action="book" data-url="${it.bookUrl}">Book</button>
        </div>
      </div>
    `;
    }).join("");

    resultsEl.querySelectorAll("button[data-action='book']").forEach(btn => {
        btn.addEventListener("click", () => {
            const url = btn.getAttribute("data-url");
            sendToParent({ type: "BOOK", url });
        });
    });
}

function buildBookUrl({ redirectMode, countyDomain, cityDomain }) {
    const base = (redirectMode === "city" ? cityDomain : countyDomain);
    if (!base) return null;
    const path = window.__MDN_CFG__.bookPath || "/book-service";
    return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
}

async function loadState(slug, jsonUrl) {
    if (stateCache.has(slug)) return stateCache.get(slug);
    const data = await fetchJson(jsonUrl);
    stateCache.set(slug, data);
    return data;
}

function scoreMatch(q, ...parts) {
    const nq = normalizeText(q);
    const text = normalizeText(parts.join(" "));
    if (!nq) return 0;
    if (text === nq) return 100;
    if (text.startsWith(nq)) return 80;
    if (text.includes(nq)) return 60;
    return 0;
}

async function search(q) {
    q = (q || "").trim();
    if (!q || q.length < 2) {
        renderResults([]);
        return;
    }

    const selectedSlug = stateSelect.value;
    const redirectMode = modeSelect.value;

    let candidates = [];

    const statesToSearch = selectedSlug
        ? stateMeta.filter(s => s.slug === selectedSlug)
        : stateMeta;

    // Limitar: si no hay estado seleccionado, solo busca en index primero (rápido).
    // Luego si quieres, puedes hacer lazy-load de estados según necesidad.
    for (const st of statesToSearch) {
        const stateData = await loadState(st.slug, st.jsonUrl);

        // Estructura esperada: stateData.divisions || stateData.counties || stateData.items etc.
        // En tus estadosFiles típicamente es un array de counties/parishes/cities.
        const divisions = stateData?.divisions || stateData?.counties || stateData?.items || stateData;

        if (!Array.isArray(divisions)) continue;

        for (const div of divisions) {
            const countyName = div.countyName || div.parishName || div.cityName || "";
            const countyDomain = div.countyDomain || div.parishDomain || div.cityDomain || "";
            const cities = Array.isArray(div.cities) ? div.cities : [];

            // match por county/parish
            const countyScore = scoreMatch(q, countyName, st.name);
            if (countyScore) {
                const bookUrl = buildBookUrl({
                    redirectMode,
                    countyDomain,
                    cityDomain: null,
                });
                if (bookUrl) {
                    candidates.push({
                        score: countyScore,
                        title: `${countyName}, ${st.name}`,
                        subtitle: `County/Division`,
                        bookUrl,
                    });
                }
            }

            // match por city dentro del county
            for (const c of cities) {
                const cityScore = scoreMatch(q, c.cityName, st.name, countyName);
                if (!cityScore) continue;

                const bookUrl = buildBookUrl({
                    redirectMode,
                    countyDomain,
                    cityDomain: c.cityDomain,
                });
                if (!bookUrl) continue;

                candidates.push({
                    score: cityScore,
                    title: `${c.cityName}, ${st.name}`,
                    subtitle: `County: ${countyName}`,
                    bookUrl,
                });
            }
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    renderResults(candidates.slice(0, 25));
}

async function init() {
    index = await fetchJson(window.__MDN_CFG__.statesIndexUrl);

    // states-index.json recomendado:
    // [{ "name":"Alabama", "slug":"alabama", "jsonUrl":"https://sitemaps.../resources/statesFiles/alabama.json" }, ...]
    stateMeta = Array.isArray(index) ? index : (index?.states || []);
    for (const st of stateMeta) {
        const opt = document.createElement("option");
        opt.value = st.slug;
        opt.textContent = st.name;
        stateSelect.appendChild(opt);
    }

    qEl.addEventListener("input", () => search(qEl.value));
    stateSelect.addEventListener("change", () => search(qEl.value));
    modeSelect.addEventListener("change", () => search(qEl.value));

    // auto focus
    setTimeout(() => qEl.focus(), 200);
}

init().catch(err => {
    console.error(err);
    resultsEl.style.display = "block";
    resultsEl.innerHTML = `<div class="item"><div><strong>Error</strong><div class="meta">${String(err.message || err)}</div></div></div>`;
});
