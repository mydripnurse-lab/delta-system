import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function computePresetRange(presetRaw: string) {
  const preset = s(presetRaw).toLowerCase();
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "28d") start.setDate(start.getDate() - 28);
  else if (preset === "3m") start.setMonth(start.getMonth() - 3);
  else if (preset === "6m") start.setMonth(start.getMonth() - 6);
  else if (preset === "1y") {
    const y = now.getFullYear() - 1;
    return {
      start: new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0)).toISOString(),
      end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)).toISOString(),
    };
  } else {
    start.setDate(start.getDate() - 28);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function searchRangeFromPreset(presetRaw: string) {
  const preset = s(presetRaw).toLowerCase();
  if (preset === "7d") return "last_7_days";
  if (preset === "28d") return "last_28_days";
  if (preset === "3m") return "last_quarter";
  if (preset === "6m") return "last_6_months";
  if (preset === "1y") return "last_year";
  return "last_28_days";
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function pickNum(obj: Record<string, unknown> | null, paths: string[]): number | null {
  if (!obj) return null;
  for (const p of paths) {
    const n = toNum(pickPath(obj, p));
    if (n !== null) return n;
  }
  return null;
}

function pickBool(obj: Record<string, unknown> | null, paths: string[]): boolean | null {
  if (!obj) return null;
  for (const p of paths) {
    const v = pickPath(obj, p);
    if (typeof v === "boolean") return v;
    const raw = s(v).toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
  }
  return null;
}

function percentChange(now: number, prev: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(prev)) return null;
  if (prev === 0) {
    if (now === 0) return 0;
    return null;
  }
  return ((now - prev) / Math.abs(prev)) * 100;
}

async function loadPreviousKpis(
  pool: ReturnType<typeof getDbPool>,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const q = await pool.query<{ payload: Record<string, unknown> | null }>(
    `
      select payload
      from app.organization_snapshots
      where organization_id = $1
        and module = 'projects_kpis'
        and snapshot_key = 'latest'
      limit 1
    `,
    [tenantId],
  );
  const payload = q.rows[0]?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload;
}

async function loadLatestOverviewPayload(
  pool: ReturnType<typeof getDbPool>,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  const q = await pool.query<{ payload: Record<string, unknown> | null }>(
    `
      select payload
      from app.organization_snapshots
      where organization_id = $1
        and module in ('overview', 'dashboard_overview', 'dashboard')
      order by captured_at desc
      limit 1
    `,
    [tenantId],
  );
  const payload = q.rows[0]?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload;
}

async function listTenantIds(pool: ReturnType<typeof getDbPool>) {
  const q = await pool.query<{ id: string }>(
    `
      select id
      from app.organizations
      where status = 'active'
      order by created_at desc
    `,
  );
  return q.rows.map((r) => s(r.id)).filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tenantId?: string;
      force?: boolean;
      preset?: string;
      start?: string;
      end?: string;
      compare?: number | boolean | string;
    };
    const requestedTenantId = s(body.tenantId);
    const force = !!body.force;
    const preset = s(body.preset) || "28d";
    const compare = body.compare === 0 || s(body.compare).toLowerCase() === "0" || s(body.compare).toLowerCase() === "false" ? 0 : 1;

    const pool = getDbPool();
    const tenantIds = requestedTenantId ? [requestedTenantId] : await listTenantIds(pool);
    if (!tenantIds.length) {
      return NextResponse.json({ ok: true, total: 0, synced: 0, rows: [] });
    }

    const u = new URL(req.url);
    const origin = `${u.protocol}//${u.host}`;
    const presetRange = computePresetRange(preset);
    const startIso = s(body.start) || s(presetRange.start);
    const endIso = s(body.end) || s(presetRange.end);

    const rows: Array<{ tenantId: string; ok: boolean; status: number; error?: string }> = [];

    for (const tenantId of tenantIds) {
      try {
        const p = new URLSearchParams();
        p.set("tenantId", tenantId);
        p.set("integrationKey", "owner");
        p.set("searchIntegrationKey", "default");
        p.set("start", startIso);
        p.set("end", endIso);
        p.set("preset", preset);
        p.set("compare", String(compare));
        if (force) p.set("force", "1");

        const res = await fetch(`${origin}/api/dashboard/overview?${p.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const text = await res.text();
        let json: Record<string, unknown> | null = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = { raw: text };
        }

        if (!res.ok || !json?.ok) {
          rows.push({
            tenantId,
            ok: false,
            status: res.status,
            error: s(json?.error) || `HTTP ${res.status}`,
          });
          continue;
        }

        let callsDirect: number | null = null;
        try {
          const callsUrl =
            `${origin}/api/dashboard/calls` +
            `?tenantId=${encodeURIComponent(tenantId)}` +
            `&integrationKey=owner` +
            `&start=${encodeURIComponent(startIso)}` +
            `&end=${encodeURIComponent(endIso)}` +
            (force ? "&bust=1" : "");
          const cres = await fetch(callsUrl, { method: "GET", cache: "no-store" });
          const ctext = await cres.text();
          const cjson = ctext ? (JSON.parse(ctext) as Record<string, unknown>) : null;
          if (cres.ok && cjson?.ok) {
            callsDirect = toNum(cjson.total);
          }
        } catch {
          // best effort
        }

        let revenueDirect: number | null = null;
        try {
          const txUrl =
            `${origin}/api/dashboard/transactions` +
            `?tenantId=${encodeURIComponent(tenantId)}` +
            `&integrationKey=owner` +
            `&start=${encodeURIComponent(startIso)}` +
            `&end=${encodeURIComponent(endIso)}` +
            (force ? "&bust=1" : "");
          const txRes = await fetch(txUrl, { method: "GET", cache: "no-store" });
          const txText = await txRes.text();
          const txJson = txText ? (JSON.parse(txText) as Record<string, unknown>) : null;
          if (txRes.ok && txJson?.ok) {
            revenueDirect = pickNum(txJson, ["kpis.grossAmount", "kpis.revenue", "summary.revenue"]);
          }
        } catch {
          // best effort
        }

        let leadsDirect: number | null = null;
        try {
          const leadsUrl =
            `${origin}/api/dashboard/contacts` +
            `?tenantId=${encodeURIComponent(tenantId)}` +
            `&integrationKey=owner` +
            `&start=${encodeURIComponent(startIso)}` +
            `&end=${encodeURIComponent(endIso)}` +
            (force ? "&bust=1" : "");
          const leadsRes = await fetch(leadsUrl, { method: "GET", cache: "no-store" });
          const leadsText = await leadsRes.text();
          const leadsJson = leadsText ? (JSON.parse(leadsText) as Record<string, unknown>) : null;
          if (leadsRes.ok && leadsJson?.ok) {
            leadsDirect = pickNum(leadsJson, ["total", "kpis.total", "kpis.leads"]);
          }
        } catch {
          // best effort
        }

        let searchImpressionsDirect: number | null = null;
        try {
          const sq = new URLSearchParams();
          sq.set("tenantId", tenantId);
          sq.set("integrationKey", "default");
          if (preset === "custom") {
            sq.set("range", "custom");
            sq.set("start", startIso);
            sq.set("end", endIso);
          } else {
            sq.set("range", searchRangeFromPreset(preset));
          }
          sq.set("compare", String(compare));
          if (force) sq.set("force", "1");
          const sres = await fetch(`${origin}/api/dashboard/search-performance/join?${sq.toString()}`, {
            method: "GET",
            cache: "no-store",
          });
          const stxt = await sres.text();
          const sjson = stxt ? (JSON.parse(stxt) as Record<string, unknown>) : null;
          if (sres.ok && sjson?.ok) {
            const summary = (sjson.summaryOverall || {}) as Record<string, unknown>;
            searchImpressionsDirect = toNum(summary.impressions);
          }
        } catch {
          // best effort
        }

        let sheetStates = 0;
        let sheetSubaccounts = 0;
        try {
          const sres = await fetch(`${origin}/api/sheet/overview?tenantId=${encodeURIComponent(tenantId)}`, {
            method: "GET",
            cache: "no-store",
          });
          const stxt = await sres.text();
          const sjson = stxt ? (JSON.parse(stxt) as Record<string, unknown>) : null;
          const states = Array.isArray(sjson?.states) ? (sjson?.states as Array<Record<string, unknown>>) : [];
          sheetStates = states.length;
          sheetSubaccounts = states.reduce((acc, row) => {
            const counties = row?.counties && typeof row.counties === "object" ? (row.counties as Record<string, unknown>) : {};
            const cities = row?.cities && typeof row.cities === "object" ? (row.cities as Record<string, unknown>) : {};
            return acc + (toNum(counties.total) || 0) + (toNum(cities.total) || 0);
          }, 0);
        } catch {
          // best effort; fallback below
        }

        const [prevPayload, overviewPayload] = await Promise.all([
          loadPreviousKpis(pool, tenantId),
          loadLatestOverviewPayload(pool, tenantId),
        ]);

        const callsNow = callsDirect ?? pickNum(json, ["kpis.calls", "executive.callsNow", "modules.calls.total"]);
        const callsModuleOk = pickBool(json, ["modules.calls.ok"]);
        const prevCalls = pickNum(prevPayload, ["kpis.calls", "calls"]);
        const calls =
          callsModuleOk === false
            ? (callsNow && callsNow > 0 ? callsNow : (prevCalls ?? callsNow ?? 0))
            : callsNow ?? prevCalls ?? 0;
        const impressionsNow =
          searchImpressionsDirect ??
          pickNum(json, [
            "kpis.impressions",
            "executive.searchImpressionsNow",
            "modules.searchPerformance.totals.impressions",
            "search.current.impressions",
            "modules.gsc.totals.impressions",
            "executive.gscImpressions",
          ]) ??
          pickNum(overviewPayload, [
            "kpis.impressions",
            "executive.searchImpressionsNow",
            "modules.searchPerformance.totals.impressions",
            "modules.gsc.totals.impressions",
            "executive.gscImpressions",
          ]);
        const prevImpressions = pickNum(prevPayload, ["kpis.impressions", "impressions"]);
        const searchModuleOk = pickBool(json, ["modules.searchPerformance.ok", "modules.gsc.ok"]);
        const impressions =
          searchModuleOk === false
            ? (impressionsNow && impressionsNow > 0 ? impressionsNow : (prevImpressions ?? impressionsNow ?? 0))
            : impressionsNow ?? prevImpressions ?? 0;
        const revenue =
          revenueDirect ??
          pickNum(json, [
            "kpis.revenue",
            "modules.transactions.grossAmount",
            "executive.transactionsRevenueNow",
          ]) ??
          pickNum(overviewPayload, ["executive.transactionsRevenueNow", "modules.transactions.grossAmount", "kpis.revenue"]) ??
          pickNum(prevPayload, ["kpis.revenue", "revenue"]) ??
          0;
        const leads =
          leadsDirect ??
          pickNum(json, ["kpis.leads", "modules.contacts.total", "executive.leadsNow"]) ??
          pickNum(overviewPayload, ["executive.leadsNow", "modules.contacts.total", "kpis.leads"]) ??
          pickNum(prevPayload, ["kpis.leads", "leads"]) ??
          0;
        const callsPrev =
          pickNum(json, ["executive.callsBefore", "modules.calls.prevTotal"]) ??
          pickNum(prevPayload, ["kpis_prev.calls", "kpis.calls", "calls"]) ??
          0;
        const impressionsPrev =
          pickNum(json, ["executive.searchImpressionsBefore"]) ??
          pickNum(prevPayload, ["kpis_prev.impressions", "kpis.impressions", "impressions"]) ??
          0;
        const revenuePrev =
          pickNum(json, ["executive.transactionsRevenueBefore", "modules.transactions.prevGrossAmount"]) ??
          pickNum(prevPayload, ["kpis_prev.revenue", "kpis.revenue", "revenue"]) ??
          0;
        const leadsPrev =
          pickNum(json, ["executive.leadsBefore", "modules.contacts.prevTotal"]) ??
          pickNum(prevPayload, ["kpis_prev.leads", "kpis.leads", "leads"]) ??
          0;
        const activeStates =
          sheetStates > 0
            ? sheetStates
            : Math.max(0, Math.round(pickNum(prevPayload, ["kpis.active_states", "active_states"]) ?? 0));
        const totalSubaccounts =
          sheetSubaccounts > 0
            ? sheetSubaccounts
            : Math.max(
                0,
                Math.round(pickNum(prevPayload, ["kpis.total_subaccounts", "total_subaccounts"]) ?? 0),
              );

        const payload = {
          kpis: {
            active_states: activeStates,
            total_subaccounts: totalSubaccounts,
            calls: Math.max(0, Math.round(calls)),
            impressions: Math.max(0, Math.round(impressions)),
            revenue: Math.round(revenue * 100) / 100,
            leads: Math.max(0, Math.round(leads)),
          },
          kpis_prev: {
            calls: Math.max(0, Math.round(callsPrev)),
            impressions: Math.max(0, Math.round(impressionsPrev)),
            revenue: Math.round(revenuePrev * 100) / 100,
            leads: Math.max(0, Math.round(leadsPrev)),
          },
          kpis_delta_pct: {
            calls: percentChange(calls, callsPrev),
            impressions: percentChange(impressions, impressionsPrev),
            revenue: percentChange(revenue, revenuePrev),
            leads: percentChange(leads, leadsPrev),
          },
          generatedAt: new Date().toISOString(),
          range: { start: startIso, end: endIso },
          source: "sync_endpoint",
        };
        await pool.query(
          `
            insert into app.organization_snapshots (
              organization_id, module, snapshot_key, source, payload, captured_at
            )
            values ($1, 'projects_kpis', 'latest', 'agency_projects_sync', $2::jsonb, now())
            on conflict (organization_id, module, snapshot_key)
            do update set
              source = excluded.source,
              payload = excluded.payload,
              captured_at = excluded.captured_at,
              updated_at = now()
          `,
          [tenantId, JSON.stringify(payload)],
        );

        rows.push({
          tenantId,
          ok: res.ok && !!json?.ok,
          status: res.status,
          error: !res.ok || !json?.ok ? s(json?.error) || `HTTP ${res.status}` : undefined,
        });
      } catch (error: unknown) {
        rows.push({
          tenantId,
          ok: false,
          status: 500,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const synced = rows.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      total: rows.length,
      synced,
      failed: rows.length - synced,
      rows,
      range: { start: startIso, end: endIso },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
