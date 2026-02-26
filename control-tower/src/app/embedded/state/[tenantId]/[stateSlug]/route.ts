import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = {
  params: Promise<{
    tenantId: string;
    stateSlug: string;
  }>;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeStateSlug(input: string) {
  return s(input)
    .toLowerCase()
    .replace(/\.json$/i, "")
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 120);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { tenantId, stateSlug } = await ctx.params;
  const t = s(tenantId);
  const slug = normalizeStateSlug(stateSlug);

  if (!t || !slug) {
    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const pool = getDbPool();
    const q = await pool.query<{ payload: Record<string, unknown> | null }>(
      `
        select payload
        from app.organization_state_files
        where organization_id = $1::uuid
          and state_slug = $2
        limit 1
      `,
      [t, slug],
    );

    const payload = q.rows[0]?.payload || null;
    if (!payload || typeof payload !== "object") {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
