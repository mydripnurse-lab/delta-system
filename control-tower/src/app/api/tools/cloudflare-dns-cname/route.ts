import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toOriginUrlMaybe(v: string) {
  const raw = s(v);
  if (!raw) return "";
  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

function apexFromHost(host: string) {
  const h = s(host).toLowerCase().replace(/\.+$/, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

type TenantCfConfig = {
  rootDomain: string;
  cnameTarget: string;
  apiToken: string;
};

async function loadTenantCfConfig(tenantId: string): Promise<TenantCfConfig> {
  const pool = getDbPool();
  const q = await pool.query<{
    root_domain: string | null;
    cloudflare_cname_target: string | null;
    cloudflare_api_token: string | null;
  }>(
    `
      select
        root_domain,
        cloudflare_cname_target,
        cloudflare_api_token
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [tenantId],
  );
  const row = q.rows[0];
  if (!row) throw new Error("Tenant settings not found.");
  const cnameTarget = s(row.cloudflare_cname_target);
  const apiToken = s(row.cloudflare_api_token);
  if (!cnameTarget) throw new Error("Missing Cloudflare CNAME target in tenant settings.");
  if (!apiToken) throw new Error("Missing Cloudflare API token in tenant settings.");
  return {
    rootDomain: s(row.root_domain),
    cnameTarget,
    apiToken,
  };
}

async function cfRequest(
  token: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as any;
  const ok = !!(res.ok && body?.success);
  return { res, body, ok };
}

async function resolveZoneId(token: string, zoneName: string) {
  const qp = new URLSearchParams({
    name: zoneName,
    status: "active",
    match: "all",
    per_page: "5",
    page: "1",
  });
  const out = await cfRequest(token, `/zones?${qp.toString()}`, { method: "GET" });
  if (!out.ok) {
    throw new Error(`Cloudflare zones lookup failed (${out.res.status}).`);
  }
  const zone = Array.isArray(out.body?.result) ? out.body.result[0] : null;
  const zoneId = s(zone?.id);
  if (!zoneId) throw new Error(`Cloudflare zone not found for ${zoneName}.`);
  return zoneId;
}

async function listCnameRecords(token: string, zoneId: string, fqdn: string) {
  const qp = new URLSearchParams({
    type: "CNAME",
    name: fqdn,
    per_page: "100",
    page: "1",
  });
  const out = await cfRequest(token, `/zones/${zoneId}/dns_records?${qp.toString()}`, { method: "GET" });
  if (!out.ok) {
    throw new Error(`Cloudflare DNS lookup failed (${out.res.status}).`);
  }
  return (Array.isArray(out.body?.result) ? out.body.result : []) as Array<{
    id?: string;
    type?: string;
    name?: string;
    content?: string;
    proxied?: boolean;
  }>;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body.tenantId);
    const action = s(body.action || "upsert").toLowerCase();
    const domainUrl = toOriginUrlMaybe(s(body.domainUrl));
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    if (!domainUrl) {
      return NextResponse.json({ ok: false, error: "Missing/invalid domainUrl" }, { status: 400 });
    }

    const host = new URL(domainUrl).host.toLowerCase();
    const cfg = await loadTenantCfConfig(tenantId);
    const zoneName = s(cfg.rootDomain).toLowerCase() || apexFromHost(host);
    const zoneId = await resolveZoneId(cfg.apiToken, zoneName);
    const existing = await listCnameRecords(cfg.apiToken, zoneId, host);
    const target = s(cfg.cnameTarget).toLowerCase();
    const hasTargetMatch = existing.some((rec) => s(rec.content).toLowerCase() === target);

    if (action === "check") {
      return NextResponse.json({
        ok: true,
        action: "check",
        tenantId,
        zoneName,
        host,
        target: cfg.cnameTarget,
        exists: existing.length > 0,
        matchesTarget: hasTargetMatch,
        ready: hasTargetMatch,
      });
    }

    if (action === "delete") {
      let deleted = 0;
      for (const rec of existing) {
        const id = s(rec.id);
        if (!id) continue;
        const out = await cfRequest(cfg.apiToken, `/zones/${zoneId}/dns_records/${id}`, {
          method: "DELETE",
        });
        if (!out.ok) {
          throw new Error(`Cloudflare delete failed (${out.res.status}).`);
        }
        deleted += 1;
      }
      return NextResponse.json({
        ok: true,
        action: "delete",
        tenantId,
        zoneName,
        host,
        deleted,
        existed: existing.length > 0,
      });
    }

    const first = existing[0];
    const currentContent = s(first?.content).toLowerCase();

    if (first && currentContent === target) {
      return NextResponse.json({
        ok: true,
        action: "existing",
        tenantId,
        zoneName,
        host,
        target: cfg.cnameTarget,
      });
    }

    const payload = {
      type: "CNAME",
      name: host,
      content: cfg.cnameTarget,
      proxied: false,
      ttl: 1,
    };

    if (first?.id) {
      const out = await cfRequest(cfg.apiToken, `/zones/${zoneId}/dns_records/${s(first.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!out.ok) throw new Error(`Cloudflare update failed (${out.res.status}).`);
      return NextResponse.json({
        ok: true,
        action: "updated",
        tenantId,
        zoneName,
        host,
        target: cfg.cnameTarget,
      });
    }

    const out = await cfRequest(cfg.apiToken, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!out.ok) throw new Error(`Cloudflare create failed (${out.res.status}).`);
    return NextResponse.json({
      ok: true,
      action: "created",
      tenantId,
      zoneName,
      host,
      target: cfg.cnameTarget,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Cloudflare DNS request failed.";
    return NextResponse.json({ ok: false, error: s(message) }, { status: 500 });
  }
}
