import fs from "node:fs/promises";
import path from "node:path";
import { getDbPool } from "@/lib/db";

export type TenantProductService = {
  id: string;
  name: string;
  description?: string;
  landingPath: string;
  formPath?: string;
  bookingPath?: string;
  cta?: string;
  ctaSecondary?: string;
};

type LandingMapFile = {
  services?: Array<Record<string, unknown>>;
};

type CustomValueRow = {
  key_name: string | null;
  key_value: string | null;
  description: string | null;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slug(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function normalizePath(raw: string) {
  const v = s(raw);
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `/${v.replace(/^\/+/, "")}`;
}

function normalizeService(input: Record<string, unknown> | null): TenantProductService | null {
  if (!input) return null;
  const id = slug(s(input.id) || s(input.serviceId) || s(input.key) || s(input.slug) || s(input.name));
  const name = s(input.name) || s(input.title) || s(input.serviceName);
  const landingPath = normalizePath(s(input.landingPath) || s(input.landing_url) || s(input.landingUrl) || s(input.url));
  if (!id || !name || !landingPath) return null;
  const formPath = normalizePath(s(input.formPath) || s(input.form_url) || s(input.formUrl));
  const bookingPath = normalizePath(s(input.bookingPath) || s(input.booking_url) || s(input.bookingUrl));
  return {
    id,
    name,
    description: s(input.description),
    landingPath,
    formPath: formPath || undefined,
    bookingPath: bookingPath || undefined,
    cta: s(input.cta) || s(input.ctaPrimary) || undefined,
    ctaSecondary: s(input.ctaSecondary) || undefined,
  };
}

async function readJsonIfExists<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function pickFirstExisting(paths: string[]) {
  for (const p of paths) {
    if (p) return p;
  }
  return "";
}

async function loadFromFileFallback() {
  const mapFile = pickFirstExisting([
    process.env.CAMPAIGN_LANDING_MAP_FILE || "",
    path.resolve(process.cwd(), "../resources/config/campaign-landing-map.json"),
    path.resolve(process.cwd(), "resources/config/campaign-landing-map.json"),
  ]);

  const raw = (await readJsonIfExists<LandingMapFile>(mapFile)) || { services: [] };
  const services = Array.isArray(raw.services)
    ? raw.services
        .map((x) => normalizeService((x || null) as Record<string, unknown> | null))
        .filter((x): x is TenantProductService => Boolean(x))
    : [];

  return {
    source: "file",
    file: mapFile,
    services,
  };
}

export async function loadTenantProductsServices(tenantId?: string) {
  const id = s(tenantId);
  if (!id) return loadFromFileFallback();

  try {
    const pool = getDbPool();
    const q = await pool.query<CustomValueRow>(
      `
        select key_name, key_value, description
        from app.organization_custom_values
        where organization_id = $1::uuid
          and scope = 'module'
          and module = 'products_services'
          and is_active = true
        order by key_name asc
      `,
      [id],
    );

    const services = q.rows
      .map((row) => {
        const parsed = (() => {
          try {
            return JSON.parse(s(row.key_value || "{}")) as Record<string, unknown>;
          } catch {
            return {} as Record<string, unknown>;
          }
        })();
        const candidate = normalizeService({
          ...parsed,
          id: s(parsed.id) || s(row.key_name),
          description: s(parsed.description) || s(row.description),
        });
        return candidate;
      })
      .filter((x): x is TenantProductService => Boolean(x));

    if (services.length > 0) {
      return {
        source: "db",
        services,
      };
    }
  } catch {
    // Fallback to file map to keep campaign factory operable.
  }

  return loadFromFileFallback();
}
