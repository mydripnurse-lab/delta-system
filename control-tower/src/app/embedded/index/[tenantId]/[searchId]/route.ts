import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = {
  params: Promise<{
    tenantId: string;
    searchId: string;
  }>;
};

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "search_builder_indexes";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeToken(input: string) {
  return s(input).replace(/\.json$/i, "");
}

function validToken(input: string) {
  return /^[a-z0-9-]{1,120}$/i.test(input);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId, searchId } = await ctx.params;
  const t = s(tenantId);
  const k = normalizeToken(searchId);

  if (!t || !k || !validToken(k)) {
    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      },
    });
  }

  try {
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
      [t, PROVIDER, SCOPE, MODULE, k],
    );

    const raw = s(q.rows[0]?.key_value);
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }

    return new Response(raw, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
    },
  });
}
