import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SEARCH_SCOPE = "module";
const SEARCHES_MODULE = "search_builder_searches";
const SEARCH_PUBLISH_MODULE = "search_builder_searches_publish";
const SEARCH_INDEXES_MODULE = "search_builder_indexes";
const SEARCH_FILES_MODULE = "search_builder_files";
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
    .replace(/\"/g, "&quot;");
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input).toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
  return fallback;
}

function normalizeSearchBuilderConfig(input: Record<string, unknown> | null | undefined) {
  return {
    id: s(input?.id),
    name: s(input?.name) || "Untitled Search",
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
  searchId: string;
  searchName: string;
  folder: string;
  host: string;
  statesIndexUrl: string;
  generatedAt: string;
  count: number;
  files: Array<{
    serviceId: string;
    name: string;
    fileName: string;
    relativePath: string;
    dbKey: string;
    url: string;
  }>;
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
      let statesIndex = null, flat = [], selected = null;
      const $q = document.getElementById("q"), $list = document.getElementById("list"), $book = document.getElementById("bookBtn"), $sel = document.getElementById("selected"), $err = document.getElementById("err");
      function showError(msg){ $err.style.display = "block"; $err.textContent = msg; }
      function normalizeText(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }
      function joinUrl(domain,p){ if(!domain) return ""; const d = domain.endsWith("/")?domain.slice(0,-1):domain; const path = p.startsWith("/")?p:"/"+p; return d + path; }
      async function fetchJson(url){ const r = await fetch(url,{cache:"no-store"}); if(!r.ok) throw new Error("Fetch failed " + r.status + ": " + url); return r.json(); }
      async function loadIndex(){ const data = await fetchJson(STATES_INDEX_URL); const items = Array.isArray(data?.items) ? data.items : []; return { items }; }
      function buildTarget(item){ const countyDomain = item?.countyDomain || ""; const cityDomain = item?.cityDomain || ""; const baseDomain = redirectMode === "city" ? (cityDomain || countyDomain) : (countyDomain || cityDomain); return joinUrl(baseDomain, bookPath); }
      function mapIndexItem(item){ const label = String(item?.label || "").trim(); const search = String(item?.search || "").trim(); const targetUrl = buildTarget(item); if(!label || !search || !targetUrl) return null; return { label, search, targetUrl }; }
      function renderList(items){ $list.innerHTML = ""; if(!items.length){ const div = document.createElement("div"); div.className="item"; div.innerHTML = '<div class="title">No results</div>'; $list.appendChild(div); return; } for(const it of items.slice(0,60)){ const row=document.createElement("div"); row.className="item"; row.innerHTML='<div class="title">'+it.label+'</div>'; row.addEventListener("click",()=>{ selected=it; $sel.textContent='Selected: '+it.label; $book.disabled=false; }); $list.appendChild(row);} }
      function filter(q){ const nq = normalizeText(q.trim()); if(!nq) return []; return flat.filter((x)=>x.search.includes(nq)); }
      function doRedirect(url){ try{ window.top.location.href = url; } catch { window.location.href = url; } }
      async function bootstrap(){ try { statesIndex = await loadIndex(); flat = (statesIndex.items || []).map(mapIndexItem).filter(Boolean); if(!flat.length) showError("Search index loaded but has 0 items. Republish this search."); } catch(e){ showError((e && e.message) || "Failed to load locations."); } }
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

async function readPublishedManifestFromDb(tenantId: string, searchId: string): Promise<PublishManifest | null> {
  const pool = getDbPool();
  const q = await pool.query<{ key_value: string | null }>(
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
    [tenantId, PROVIDER, SEARCH_SCOPE, SEARCH_PUBLISH_MODULE, searchId],
  );
  const raw = s(q.rows[0]?.key_value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublishManifest;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePublishedManifestToDb(tenantId: string, searchId: string, manifest: PublishManifest) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_custom_values (
        organization_id, provider, scope, module, key_name,
        key_value, value_type, is_secret, is_active, description
      ) values (
        $1::uuid, $2, $3, $4, $5,
        $6, 'json', false, true, 'Search Builder publish manifest'
      )
      on conflict (organization_id, provider, scope, module, key_name)
      do update set
        key_value = excluded.key_value,
        value_type = excluded.value_type,
        is_secret = excluded.is_secret,
        is_active = excluded.is_active,
        description = excluded.description,
        updated_at = now()
    `,
    [tenantId, PROVIDER, SEARCH_SCOPE, SEARCH_PUBLISH_MODULE, searchId, JSON.stringify(manifest)],
  );
}

async function upsertSearchFileToDb(args: {
  tenantId: string;
  keyName: string;
  html: string;
  description: string;
}) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_custom_values (
        organization_id, provider, scope, module, key_name,
        key_value, value_type, is_secret, is_active, description
      ) values (
        $1::uuid, $2, $3, $4, $5,
        $6, 'text', false, true, $7
      )
      on conflict (organization_id, provider, scope, module, key_name)
      do update set
        key_value = excluded.key_value,
        value_type = excluded.value_type,
        is_secret = excluded.is_secret,
        is_active = excluded.is_active,
        description = excluded.description,
        updated_at = now()
    `,
    [args.tenantId, PROVIDER, SEARCH_SCOPE, SEARCH_FILES_MODULE, args.keyName, args.html, args.description],
  );
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
    const searchId = kebabToken(new URL(req.url).searchParams.get("searchId") || "");
    if (!searchId) {
      return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });
    }
    const manifest = await readPublishedManifestFromDb(tenantId, searchId);
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const searchId = kebabToken(s(body.searchId));
    if (!searchId) {
      return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });
    }

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
          and is_active = true
        limit 1
      `,
      [tenantId, PROVIDER, SEARCH_SCOPE, SEARCHES_MODULE, searchId],
    );
    if (!cfgQ.rows[0]) {
      return NextResponse.json(
        { ok: false, error: "No Search config found. Save this search first." },
        { status: 400 },
      );
    }

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(s(cfgQ.rows[0].key_value) || "{}") as Record<string, unknown>;
    } catch {
      parsedConfig = {};
    }
    const config = normalizeSearchBuilderConfig({ ...parsedConfig, id: searchId });

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

    const rawFolder = kebabToken(config.folder) || "company-search";
    const folder = `${searchId}-${rawFolder}`.slice(0, 120);
    const host = s(config.host) || SEARCH_EMBEDDED_HOST;
    const statesIndexUrl = `https://${host}/embedded/index/${tenantId}/${searchId}.json`;

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

    const written: PublishManifest["files"] = [];
    for (const artifact of artifacts) {
      const fileName = `${artifact.fileSlug}.html`;
      const html = buildSearchFileHtml({
        statesIndexUrl,
        bookingPath: artifact.bookingPath,
        title: config.searchTitle,
        subtitle: config.searchSubtitle,
        placeholder: config.searchPlaceholder,
        primaryColor: config.buttonColor,
      });
      const dbKey = `${folder}/${fileName}`;
      await upsertSearchFileToDb({
        tenantId,
        keyName: dbKey,
        html,
        description: `Search Builder file (${artifact.name})`,
      });
      const url = `https://${host}/embedded/${tenantId}/${folder}/${fileName}`;

      written.push({
        serviceId: artifact.id,
        name: artifact.name,
        fileName,
        relativePath: `public/ui/${folder}/${fileName}`,
        dbKey,
        url,
      });
    }

    const manifest: PublishManifest = {
      tenantId,
      searchId,
      searchName: config.name,
      folder,
      host,
      statesIndexUrl,
      generatedAt: new Date().toISOString(),
      count: written.length,
      files: written,
    };

    await writePublishedManifestToDb(tenantId, searchId, manifest);

    // keep lightweight pointer of latest index generation for this search
    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Search Builder index pointer'
        )
        on conflict (organization_id, provider, scope, module, key_name)
        do update set
          key_value = excluded.key_value,
          value_type = excluded.value_type,
          is_secret = excluded.is_secret,
          is_active = excluded.is_active,
          description = excluded.description,
          updated_at = now()
      `,
      [
        tenantId,
        PROVIDER,
        SEARCH_SCOPE,
        SEARCH_INDEXES_MODULE,
        searchId,
        JSON.stringify({
          searchId,
          generatedAt: new Date().toISOString(),
          url: statesIndexUrl,
        }),
      ],
    );

    return NextResponse.json({
      ok: true,
      searchId,
      folder,
      generated: written.length,
      files: written,
      manifest,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to publish search files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
