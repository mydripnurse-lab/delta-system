import { unstable_cache } from "next/cache";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = {
  params: Promise<{
    tenantId: string;
    folder: string;
    fileName: string;
  }>;
};

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "search_builder_files";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function validFolder(input: string) {
  return /^[a-z0-9-]{1,120}$/i.test(input);
}

function validTenantId(input: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
}

function validFileName(input: string) {
  return /^[a-z0-9-]{1,140}\.html$/i.test(input);
}

const getCachedEmbedHtml = unstable_cache(
  async (tenantId: string, keyName: string) => {
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
          and is_active = true
        limit 1
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, keyName],
    );
    return s(q.rows[0]?.key_value);
  },
  ["public-embed-html"],
  { revalidate: 3600 },
);

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId, folder, fileName } = await ctx.params;
  const t = s(tenantId);
  const f = s(folder);
  const n = s(fileName);

  if (!t || !f || !n || !validTenantId(t) || !validFolder(f) || !validFileName(n)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const keyName = `${f}/${n}`;
    const html = await getCachedEmbedHtml(t, keyName);
    if (!html) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
