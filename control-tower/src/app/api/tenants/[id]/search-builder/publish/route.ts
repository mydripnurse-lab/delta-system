import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SEARCH_SCOPE = "module";
const SEARCH_MODULE = "search_builder";
const SEARCH_KEY_NAME = "config_v1";
const SERVICES_MODULE = "products_services";
const SEARCH_EMBEDDED_HOST = "search-embedded.telahagocrecer.com";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function kebabToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizePath(input: unknown) {
  const raw = s(input);
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function fileSlugFromService(input: string) {
  const base = kebabToken(input).replace(/-locations$/, "");
  return base ? `${base}-locations` : "locations";
}

function htmlEscape(input: unknown) {
  return s(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input).toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
  return fallback;
}

function normalizeSearchBuilderConfig(input: Record<string, unknown> | null | undefined) {
  return {
    companyName: s(input?.companyName),
    buttonText: s(input?.buttonText) || "Book An Appointment",
    modalTitle: s(input?.modalTitle) || "Locations",
    host: SEARCH_EMBEDDED_HOST,
    folder: s(input?.folder) || "company-search",
    pageSlug: s(input?.pageSlug) || "mobile-iv-therapy-locations",
    query: s(input?.query) || "embed=1",
    buttonColor: normalizeColor(input?.buttonColor, "#044c5c"),
    headerColor: normalizeColor(input?.headerColor, "#a4d8e4"),
    searchTitle: s(input?.searchTitle) || "Choose your location",
    searchSubtitle:
      s(input?.searchSubtitle) || "Search by State, County/Parish, or City. Then click Book Now.",
    searchPlaceholder: s(input?.searchPlaceholder) || "Choose your City, State, or Country",
    defaultBookingPath: normalizePath(input?.defaultBookingPath || "/"),
  };
}

type ServiceRow = {
  key_name: string | null;
  key_value: string | null;
  is_active: boolean;
};

type ParsedService = {
  serviceId: string;
  name: string;
  bookingPath: string;
};

type PublishManifest = {
  tenantId: string;
  folder: string;
  host: string;
  statesIndexUrl: string;
  generatedAt: string;
  count: number;
  files: Array<{ serviceId: string; name: string; fileName: string; relativePath: string }>;
};

function parseServiceRow(row: ServiceRow): ParsedService | null {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const serviceId = s(parsed.serviceId) || s(parsed.id) || s(row.key_name);
  const name = s(parsed.name) || serviceId;
  if (!serviceId) return null;
  const bookingPath = normalizePath(parsed.bookingPath || parsed.booking_url || "/");
  return { serviceId, name, bookingPath };
}

function buildSearchFileHtml(args: {
  statesIndexUrl: string;
  bookingPath: string;
  title: string;
  subtitle: string;
  placeholder: string;
  primaryColor: string;
}) {
  const safeTitle = htmlEscape(args.title);
  const safeSubtitle = htmlEscape(args.subtitle);
  const safePlaceholder = htmlEscape(args.placeholder);
  const safeStatesIndex = htmlEscape(args.statesIndexUrl);
  const safeBookPath = htmlEscape(args.bookingPath);
  const safePrimary = htmlEscape(args.primaryColor);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { --bg:#ffffff; --text:#0f172a; --muted:#64748b; --border:#e2e8f0; --primary:${safePrimary}; }
      body { margin:0; font-family: Lato, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:transparent; color:var(--text); }
      .wrap { padding:28px; background:var(--bg); }
      h1 { margin:0 0 16px 0; font-size:34px; line-height:1.1; }
      .sub { margin:0 0 18px 0; color:var(--muted); font-size:14px; }
      .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .input { flex:1 1 420px; min-width:280px; border:2px solid #2563eb33; border-radius:14px; padding:14px 16px; font-size:18px; outline:none; }
      .panel { margin-top:16px; border:1px solid var(--border); border-radius:14px; overflow:hidden; }
      .list { max-height:360px; overflow:auto; background:#fff; }
      .item { padding:12px 14px; border-top:1px solid var(--border); cursor:pointer; }
      .item:hover { background:#f8fafc; }
      .item:first-child { border-top:0; }
      .title { font-weight:650; }
      .footer { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-top:1px solid var(--border); background:#fff; gap:12px; flex-wrap:wrap; }
      .btn { appearance:none; border:0; border-radius:12px; padding:12px 14px; font-weight:700; cursor:pointer; }
      .btn.primary { background:var(--primary); color:#fff; }
      .btn.ghost { background:#f1f5f9; color:#0f172a; }
      .selected { color:var(--muted); font-size:13px; }
      .error { margin-top:10px; color:#b91c1c; font-size:13px; display:none; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>${safeTitle}</h1>
      <p class="sub">${safeSubtitle}</p>
      <div class="row">
        <input id="q" class="input" placeholder="${safePlaceholder}" autocomplete="off" />
      </div>
      <div class="panel">
        <div id="list" class="list"></div>
        <div class="footer">
          <div class="selected" id="selected">No selection yet.</div>
          <div class="row">
            <button class="btn ghost" id="clearBtn" type="button">Clear</button>
            <button class="btn primary" id="bookBtn" type="button" disabled>Book Now</button>
          </div>
        </div>
      </div>
      <div id="err" class="error"></div>
    </div>
    <script>
      const STATES_INDEX_URL = "${safeStatesIndex}";
      const BOOK_PATH_DEFAULT = "${safeBookPath}";
      const urlParams = new URLSearchParams(location.search);
      const redirectMode = (urlParams.get("redirectMode") || "county").toLowerCase();
      const bookPath = urlParams.get("bookPath") || BOOK_PATH_DEFAULT;
      let statesIndex = null, stateCache = new Map(), flat = [], selected = null;
      const $q = document.getElementById("q"), $list = document.getElementById("list"), $book = document.getElementById("bookBtn"), $sel = document.getElementById("selected"), $err = document.getElementById("err");
      function showError(msg){ $err.style.display = "block"; $err.textContent = msg; }
      function normalizeText(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }
      function joinUrl(domain,p){ if(!domain) return ""; const d = domain.endsWith("/")?domain.slice(0,-1):domain; const path = p.startsWith("/")?p:"/"+p; return d + path; }
      async function fetchJson(url){ const r = await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("Fetch failed " + r.status + ": " + url); return r.json(); }
      async function loadIndex(){ const data = await fetchJson(STATES_INDEX_URL); const arr = Array.isArray(data)?data:(data.states||[]); return { states: arr }; }
      async function loadStateBySlug(slug){ if(stateCache.has(slug)) return stateCache.get(slug); const meta = (statesIndex?.states||[]).find((x)=> (x.stateSlug||x.slug)===slug); const tenantMatch = STATES_INDEX_URL.match(/\\/public\\/json\\/tenants\\/([^/]+)\\/states-index\\.json/i); const fallbackBase = tenantMatch ? STATES_INDEX_URL.replace(tenantMatch[0], "/resources/tenants/" + tenantMatch[1] + "/statesFiles/") : STATES_INDEX_URL.replace("/public/json/states-index.json", "/resources/statesFiles/"); const stateFileUrl = meta?.stateFileUrl || meta?.url || (fallbackBase + slug + ".json"); const st = await fetchJson(stateFileUrl); stateCache.set(slug, st); return st; }
      function flattenState(stateJson){ const items = stateJson.items || stateJson.counties || []; const stateName = stateJson.stateName || stateJson.name || ""; const out = []; for(const c of items){ const countyName = c.countyName || c.parishName || ""; const countyDomain = c.countyDomain || c.parishDomain || ""; const cities = c.cities || []; for(const city of cities){ const cityName = city.cityName || ""; const cityDomain = city.cityDomain || ""; if(!cityName || !cityDomain) continue; const baseDomain = redirectMode === "city" ? cityDomain : countyDomain || cityDomain; const suffix = countyName ? " (" + countyName + ")" : ""; out.push({ label: cityName + ", " + stateName + suffix, search: normalizeText(cityName + " " + countyName + " " + stateName), targetUrl: joinUrl(baseDomain, bookPath) }); } } return out; }
      function renderList(items){ $list.innerHTML = ""; if(!items.length){ const div = document.createElement("div"); div.className="item"; div.innerHTML = '<div class="title">No results</div>'; $list.appendChild(div); return; } for(const it of items.slice(0,60)){ const row=document.createElement("div"); row.className="item"; row.innerHTML='<div class="title">'+it.label+'</div>'; row.addEventListener("click",()=>{ selected=it; $sel.textContent='Selected: '+it.label; $book.disabled=false; }); $list.appendChild(row);} }
      function filter(q){ const nq = normalizeText(q.trim()); if(!nq) return []; return flat.filter((x)=>x.search.includes(nq)); }
      function doRedirect(url){ try{ window.top.location.href = url; } catch { window.location.href = url; } }
      async function bootstrap(){ try { statesIndex = await loadIndex(); for(const st of (statesIndex.states||[])){ const slug = st.stateSlug || st.slug; if(!slug) continue; try { const full = await loadStateBySlug(slug); flat.push(...flattenState(full)); } catch {} } } catch(e){ showError((e && e.message) || "Failed to load locations."); } }
      $q.addEventListener("input",(e)=> renderList(filter((e.target && e.target.value) || "")));
      document.getElementById("clearBtn").addEventListener("click",()=>{ $q.value=""; selected=null; $book.disabled=true; $sel.textContent="No selection yet."; renderList([]); $q.focus(); });
      $book.addEventListener("click",()=>{ if(!selected || !selected.targetUrl) return; doRedirect(selected.targetUrl); });
      bootstrap();
    </script>
  </body>
</html>`;
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

async function resolveUiRootDir() {
  const candidates = [
    path.resolve(process.cwd(), "../public/ui"),
    path.resolve(process.cwd(), "public/ui"),
  ];
  for (const candidate of candidates) {
    try {
      const st = await fs.stat(candidate);
      if (st.isDirectory()) return candidate;
    } catch {
      // continue
    }
  }
  await fs.mkdir(candidates[0], { recursive: true });
  return candidates[0];
}

async function readManifestForFolder(folder: string): Promise<PublishManifest | null> {
  const uiRoot = await resolveUiRootDir();
  const manifestPath = path.join(uiRoot, folder, "_search-builder-manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as PublishManifest;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const pool = getDbPool();
    const cfgQ = await pool.query<{ key_value: string | null }>(
      `
        select key_value
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
        limit 1
      `,
      [tenantId, PROVIDER, SEARCH_SCOPE, SEARCH_MODULE, SEARCH_KEY_NAME],
    );
    if (!cfgQ.rows[0]) {
      return NextResponse.json({ ok: true, exists: false, manifest: null });
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(s(cfgQ.rows[0].key_value) || "{}") as Record<string, unknown>;
    } catch {
      parsedConfig = {};
    }
    const config = normalizeSearchBuilderConfig(parsedConfig);
    const folder = kebabToken(config.folder) || "company-search";
    const manifest = await readManifestForFolder(folder);
    return NextResponse.json({ ok: true, exists: !!manifest, manifest });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read published files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const pool = getDbPool();
    const cfgQ = await pool.query<{ key_value: string | null }>(
      `
        select key_value
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
        limit 1
      `,
      [tenantId, PROVIDER, SEARCH_SCOPE, SEARCH_MODULE, SEARCH_KEY_NAME],
    );
    if (!cfgQ.rows[0]) {
      return NextResponse.json(
        { ok: false, error: "No Search Builder settings found. Save settings first." },
        { status: 400 },
      );
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(s(cfgQ.rows[0].key_value) || "{}") as Record<string, unknown>;
    } catch {
      parsedConfig = {};
    }
    const config = normalizeSearchBuilderConfig(parsedConfig);

    const svcQ = await pool.query<ServiceRow>(
      `
        select key_name, key_value, is_active
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = 'ghl'
          and scope = 'module'
          and module = $2
          and is_active = true
        order by key_name asc
      `,
      [tenantId, SERVICES_MODULE],
    );

    const parsedServices = svcQ.rows
      .map((row) => parseServiceRow(row))
      .filter((x): x is ParsedService => Boolean(x));

    const folder = kebabToken(config.folder) || "company-search";
    const host = s(config.host) || SEARCH_EMBEDDED_HOST;
    const statesIndexUrl = `https://${host}/public/json/tenants/${tenantId}/states-index.json`;

    const artifacts =
      parsedServices.length > 0
        ? parsedServices.map((svc) => ({
            id: svc.serviceId,
            name: svc.name,
            fileSlug: fileSlugFromService(svc.serviceId || svc.name),
            bookingPath: normalizePath(svc.bookingPath || config.defaultBookingPath),
          }))
        : [
            {
              id: "manual",
              name: "Manual Search",
              fileSlug: fileSlugFromService(config.pageSlug),
              bookingPath: normalizePath(config.defaultBookingPath || "/"),
            },
          ];

    const uiRoot = await resolveUiRootDir();
    const outDir = path.join(uiRoot, folder);
    await fs.mkdir(outDir, { recursive: true });

    const written: Array<{ serviceId: string; name: string; fileName: string; relativePath: string }> = [];
    for (const artifact of artifacts) {
      const fileName = `${artifact.fileSlug}.html`;
      const fullPath = path.join(outDir, fileName);
      const html = buildSearchFileHtml({
        statesIndexUrl,
        bookingPath: artifact.bookingPath,
        title: config.searchTitle,
        subtitle: config.searchSubtitle,
        placeholder: config.searchPlaceholder,
        primaryColor: config.buttonColor,
      });
      await fs.writeFile(fullPath, html, "utf8");
      written.push({
        serviceId: artifact.id,
        name: artifact.name,
        fileName,
        relativePath: `public/ui/${folder}/${fileName}`,
      });
    }

    const manifest = {
      tenantId,
      folder,
      host,
      statesIndexUrl,
      generatedAt: new Date().toISOString(),
      count: written.length,
      files: written,
    };
    await fs.writeFile(path.join(outDir, "_search-builder-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    return NextResponse.json({
      ok: true,
      folder,
      outputDir: outDir,
      generated: written.length,
      files: written,
      manifestPath: `public/ui/${folder}/_search-builder-manifest.json`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to publish search files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
