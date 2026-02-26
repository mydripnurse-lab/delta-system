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

function validFileName(input: string) {
  return /^[a-z0-9-]{1,140}\.html$/i.test(input);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId, folder, fileName } = await ctx.params;
  const t = s(tenantId);
  const f = s(folder);
  const n = s(fileName);

  if (!t || !f || !n || !validFolder(f) || !validFileName(n)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const pool = getDbPool();
    const keyName = `${f}/${n}`;
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
      [t, PROVIDER, SCOPE, MODULE, keyName],
    );
    const html = s(q.rows[0]?.key_value);
    if (!html) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

