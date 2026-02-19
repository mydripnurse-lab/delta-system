import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type Suggestion = {
  recommendationType: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  actionPlan: string[];
  expectedImpact: string;
  fingerprintKey: string;
  evidence?: Record<string, unknown>;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}
function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function toPriority(v: unknown): Suggestion["priority"] {
  const x = s(v).toLowerCase();
  if (x === "low" || x === "medium" || x === "high" || x === "critical") return x;
  return "medium";
}
function safeJson(v: unknown) {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function fingerprintFor(x: { type: string; title: string; key: string }) {
  return createHash("sha1")
    .update(`${s(x.type).toLowerCase()}|${s(x.title).toLowerCase()}|${s(x.key).toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}

function buildHeuristicSuggestions(joinData: any): Suggestion[] {
  const out: Suggestion[] = [];
  const summary = joinData?.summaryOverall || {};
  const compare = joinData?.compare || {};
  const winners = Array.isArray(joinData?.opportunities?.winners)
    ? joinData.opportunities.winners
    : [];
  const losers = Array.isArray(joinData?.opportunities?.losers)
    ? joinData.opportunities.losers
    : [];
  const negativeIdeas = Array.isArray(joinData?.opportunities?.negativeIdeas)
    ? joinData.opportunities.negativeIdeas
    : [];
  const ctrProblems = Array.isArray(joinData?.opportunities?.ctrProblems)
    ? joinData.opportunities.ctrProblems
    : [];

  const deltaCost = n(compare?.pct?.cost);
  const deltaConv = n(compare?.pct?.conversions);
  if (Number.isFinite(deltaCost) && Number.isFinite(deltaConv) && deltaCost > 0.18 && deltaConv < -0.08) {
    out.push({
      recommendationType: "efficiency_alert",
      priority: "critical",
      title: "Cost subiendo pero conversiones bajando",
      summary:
        "Se detecta deterioro de eficiencia vs ventana previa. Recomiendo recortar fugas y re-asignar budget.",
      actionPlan: [
        "Reducir 20-30% presupuesto de campañas con CPA alto y 0-1 conversiones.",
        "Mover presupuesto a campañas con ROAS>=1 y conversiones consistentes.",
        "Revisar términos de búsqueda para ampliar negativos hoy.",
      ],
      expectedImpact: "Reduce desperdicio de gasto en 48-72h.",
      fingerprintKey: `efficiency_${Math.round(deltaCost * 100)}_${Math.round(deltaConv * 100)}`,
      evidence: { deltaCost, deltaConv },
    });
  }

  if (losers.length) {
    const l = losers[0] || {};
    out.push({
      recommendationType: "pause_or_tighten",
      priority: "high",
      title: `Controlar fuga en ${s(l.campaign || "campaña con bajo rendimiento")}`,
      summary: "Campaña con gasto relevante y bajo retorno. Requiere ajuste inmediato de targeting/keywords.",
      actionPlan: [
        "Separar ad groups por intención (exact vs phrase).",
        "Agregar negativos de baja intención detectados en search terms.",
        "Aplicar CPC cap temporal hasta recuperar conversion rate.",
      ],
      expectedImpact: "Menor CPA y más calidad de tráfico en 3-7 días.",
      fingerprintKey: `loser_${s(l.id || l.campaign || "na")}`,
      evidence: {
        campaign: s(l.campaign),
        cost: n(l.cost),
        conversions: n(l.conversions),
      },
    });
  }

  if (winners.length) {
    const w = winners[0] || {};
    out.push({
      recommendationType: "scale_winner",
      priority: "high",
      title: `Escalar presupuesto en ${s(w.campaign || "campaña ganadora")}`,
      summary: "Campaña con señal de eficiencia positiva. Se puede escalar de forma controlada.",
      actionPlan: [
        "Incrementar presupuesto diario 15-20% con monitoreo de CPA.",
        "Expandir exact match en keywords con mejor conversion rate.",
        "Crear 1 variante de RSA orientada a intención transaccional.",
      ],
      expectedImpact: "Aumenta conversiones sin degradar ROAS.",
      fingerprintKey: `winner_${s(w.id || w.campaign || "na")}`,
      evidence: {
        campaign: s(w.campaign),
        cost: n(w.cost),
        conversions: n(w.conversions),
        roas: n(w.roas),
      },
    });
  }

  if (negativeIdeas.length >= 3) {
    out.push({
      recommendationType: "negative_keywords",
      priority: "medium",
      title: "Actualizar lista de negativos de búsqueda",
      summary: "Se detectaron términos con gasto y baja conversión que deben bloquearse.",
      actionPlan: [
        "Agregar top 10 search terms no relevantes como negativos.",
        "Aplicar negativos cruzados entre ad groups para evitar overlap.",
      ],
      expectedImpact: "Mejora la calidad del tráfico en la próxima semana.",
      fingerprintKey: `negatives_${negativeIdeas.length}`,
      evidence: {
        count: negativeIdeas.length,
        terms: negativeIdeas.slice(0, 5).map((r: any) => s(r.term)),
      },
    });
  }

  if (ctrProblems.length >= 2) {
    out.push({
      recommendationType: "creative_ctr_fix",
      priority: "medium",
      title: "Bajo CTR en campañas con alto inventario",
      summary: "Hay campañas con impresiones altas pero CTR bajo; se recomienda refresh creativo.",
      actionPlan: [
        "Probar 2 nuevos titulares con geo + beneficio principal.",
        "Agregar extensiones de sitelinks/callouts adicionales.",
        "Alinear promesa del anuncio con la landing del CTA.",
      ],
      expectedImpact: "Incremento de CTR y reducción de CPC promedio.",
      fingerprintKey: `ctr_problem_${ctrProblems.length}`,
      evidence: { affectedCampaigns: ctrProblems.slice(0, 5).map((r: any) => s(r.campaign)) },
    });
  }

  if (!out.length && n(summary.clicks) > 0) {
    out.push({
      recommendationType: "monitor",
      priority: "low",
      title: "Campañas estables, mantener monitoreo diario",
      summary: "No se detectan anomalías críticas hoy. Continuar revisión con foco en ROAS y CPA.",
      actionPlan: [
        "Validar conversion tracking y valor de conversión.",
        "Continuar test A/B de anuncios en ad groups principales.",
      ],
      expectedImpact: "Mantener estabilidad y prevenir deterioro.",
      fingerprintKey: "stable_monitoring",
      evidence: {
        impressions: n(summary.impressions),
        clicks: n(summary.clicks),
        conversions: n(summary.conversions),
      },
    });
  }

  return out.slice(0, 6);
}

function hasUrgentSignals(joinData: any) {
  const compare = joinData?.compare || {};
  const opp = joinData?.opportunities || {};
  const deltaCost = n(compare?.pct?.cost);
  const deltaConv = n(compare?.pct?.conversions);
  const deltaRoas = n(compare?.pct?.roas);
  const losers = Array.isArray(opp?.losers) ? opp.losers.length : 0;
  const kwLeaks = Array.isArray(opp?.kwLeaks) ? opp.kwLeaks.length : 0;
  const ctrProblems = Array.isArray(opp?.ctrProblems) ? opp.ctrProblems.length : 0;
  return (
    (deltaCost > 0.12 && deltaConv < -0.05) ||
    deltaRoas < -0.14 ||
    losers >= 4 ||
    kwLeaks >= 8 ||
    ctrProblems >= 6
  );
}

async function aiRefineSuggestions(input: {
  joinData: any;
  heuristics: Suggestion[];
}): Promise<Suggestion[] | null> {
  if (!openaiClient) return null;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      notifications: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            recommendationType: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            title: { type: "string" },
            summary: { type: "string" },
            actionPlan: {
              type: "array",
              items: { type: "string" },
              maxItems: 5,
            },
            expectedImpact: { type: "string" },
            fingerprintKey: { type: "string" },
          },
          required: [
            "recommendationType",
            "priority",
            "title",
            "summary",
            "actionPlan",
            "expectedImpact",
            "fingerprintKey",
          ],
        },
      },
    },
    required: ["notifications"],
  };

  const resp = await openaiClient.responses.create({
    model: "gpt-5.2",
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content:
          "You are a senior Google Ads optimization lead, CRO specialist, and data analyst. " +
          "Generate actionable daily campaign recommendations based only on the given metrics. " +
          "Prioritize recommendations that can be approved/denied by an operator. Keep each recommendation concise and concrete.",
      },
      {
        role: "user",
        content: JSON.stringify({
          summary: input.joinData?.summaryOverall || {},
          compare: input.joinData?.compare || {},
          opportunities: input.joinData?.opportunities || {},
          topCampaigns: (input.joinData?.topCampaigns || []).slice(0, 15),
          trend: (input.joinData?.trend || []).slice(-30),
          heuristics: input.heuristics,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ads_daily_notifications",
        schema,
      },
    },
  });

  const outText =
    (resp as any)?.output_text ||
    (resp as any)?.output
      ?.flatMap((o: any) => o?.content || [])
      ?.find((c: any) => c?.type === "output_text")?.text ||
    "";
  if (!outText) return null;

  const parsed = JSON.parse(outText) as { notifications?: Suggestion[] };
  if (!Array.isArray(parsed?.notifications) || !parsed.notifications.length) return null;

  return parsed.notifications
    .map((x) => ({
      recommendationType: s(x.recommendationType || "optimization"),
      priority: toPriority(x.priority),
      title: s(x.title),
      summary: s(x.summary),
      actionPlan: Array.isArray(x.actionPlan) ? x.actionPlan.map((a) => s(a)).filter(Boolean).slice(0, 5) : [],
      expectedImpact: s(x.expectedImpact),
      fingerprintKey: s(x.fingerprintKey),
      evidence: {},
    }))
    .filter((x) => x.title && x.summary)
    .slice(0, 8);
}

async function fetchAdsJoinForContext(req: Request, params: URLSearchParams) {
  const url = new URL(req.url);
  const joinUrl = `${url.origin}/api/dashboard/ads/join?${params.toString()}`;
  const res = await fetch(joinUrl, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Failed join context (${res.status})`);
  }
  return json;
}

async function listNotifications(tenantId: string, integrationKey: string, status: string, limit: number) {
  const pool = getDbPool();
  const isAll = s(status).toLowerCase() === "all";
  const q = await pool.query(
    `
      select
        id,
        organization_id,
        integration_key,
        source,
        recommendation_type,
        fingerprint,
        priority,
        status,
        title,
        summary,
        recommendation_payload,
        evidence,
        decision_note,
        decided_by_user_id,
        decided_at,
        created_at,
        updated_at
      from app.ads_ai_notifications
      where organization_id = $1
        and module = 'ads'
        and integration_key = $2
        and ($3::text = 'all' or status = $3::text)
      order by
        case priority
          when 'critical' then 1
          when 'high' then 2
          when 'medium' then 3
          else 4
        end asc,
        created_at desc
      limit $4
    `,
    [tenantId, integrationKey, isAll ? "all" : status, Math.max(1, Math.min(limit, 200))],
  );

  const statsQ = await pool.query<{
    status: string;
    c: string;
  }>(
    `
      select status, count(*)::text as c
      from app.ads_ai_notifications
      where organization_id = $1
        and module = 'ads'
        and integration_key = $2
      group by status
    `,
    [tenantId, integrationKey],
  );

  const generatedQ = await pool.query<{ last_generated_at: string | null }>(
    `
      select max(created_at)::text as last_generated_at
      from app.ads_ai_notifications
      where organization_id = $1
        and module = 'ads'
        and integration_key = $2
        and source = 'ai_daily_observer'
    `,
    [tenantId, integrationKey],
  );

  const statsMap = new Map<string, number>();
  for (const row of statsQ.rows || []) {
    statsMap.set(s(row.status), n(row.c));
  }

  return {
    notifications: q.rows || [],
    stats: {
      open: statsMap.get("open") || 0,
      accepted: statsMap.get("accepted") || 0,
      denied: statsMap.get("denied") || 0,
      total:
        (statsMap.get("open") || 0) +
        (statsMap.get("accepted") || 0) +
        (statsMap.get("denied") || 0),
      lastGeneratedAt: s(generatedQ.rows[0]?.last_generated_at || ""),
    },
  };
}

async function generateNotifications(args: {
  req: Request;
  tenantId: string;
  integrationKey: string;
  range: string;
  start: string;
  end: string;
  force: boolean;
}) {
  const pool = getDbPool();
  const dailyIntervalMs = 20 * 60 * 60 * 1000;
  const anomalyCooldownMs = 4 * 60 * 60 * 1000;
  const lastQ = await pool.query<{ last_generated_at: string | null }>(
    `
      select max(created_at)::text as last_generated_at
      from app.ads_ai_notifications
      where organization_id = $1
        and module = 'ads'
        and integration_key = $2
        and source = 'ai_daily_observer'
    `,
    [args.tenantId, args.integrationKey],
  );

  const lastGeneratedAt = s(lastQ.rows[0]?.last_generated_at || "");
  const ageMs = lastGeneratedAt ? Date.now() - new Date(lastGeneratedAt).getTime() : Number.POSITIVE_INFINITY;

  const params = new URLSearchParams();
  params.set("tenantId", args.tenantId);
  params.set("integrationKey", args.integrationKey);
  params.set("range", args.range || "last_28_days");
  if (s(args.start)) params.set("start", args.start);
  if (s(args.end)) params.set("end", args.end);
  params.set("compare", "1");

  const joinData = await fetchAdsJoinForContext(args.req, params);
  const urgent = hasUrgentSignals(joinData);

  if (!args.force && Number.isFinite(ageMs) && ageMs < dailyIntervalMs) {
    if (!urgent) {
      return {
        created: 0,
        skipped: true,
        reason: "Within daily window and no urgent anomaly detected.",
      };
    }
    if (ageMs < anomalyCooldownMs) {
      return {
        created: 0,
        skipped: true,
        reason: "Urgent anomaly detected but event-driven cooldown still active.",
      };
    }
  }

  const heuristics = buildHeuristicSuggestions(joinData);
  let suggestions: Suggestion[] = heuristics;
  try {
    const ai = await aiRefineSuggestions({ joinData, heuristics });
    if (ai?.length) suggestions = ai;
  } catch {
    // fallback to heuristics
  }

  if (!suggestions.length) {
    return { created: 0, skipped: true, reason: "No recommendations produced." };
  }

  let created = 0;
  for (const rec of suggestions) {
    const f = fingerprintFor({
      type: rec.recommendationType,
      title: rec.title,
      key: rec.fingerprintKey || rec.title,
    });
    const ins = await pool.query<{ id: string }>(
      `
        insert into app.ads_ai_notifications (
          organization_id,
          module,
          integration_key,
          source,
          recommendation_type,
          fingerprint,
          priority,
          status,
          title,
          summary,
          recommendation_payload,
          evidence
        )
        values (
          $1, 'ads', $2, 'ai_daily_observer', $3, $4, $5, 'open', $6, $7, $8::jsonb, $9::jsonb
        )
        on conflict (organization_id, module, integration_key, fingerprint) where status = 'open'
        do nothing
        returning id
      `,
      [
        args.tenantId,
        args.integrationKey,
        s(rec.recommendationType || "optimization"),
        f,
        toPriority(rec.priority),
        s(rec.title),
        s(rec.summary),
        JSON.stringify({
          actionPlan: Array.isArray(rec.actionPlan) ? rec.actionPlan.slice(0, 5) : [],
          expectedImpact: s(rec.expectedImpact || ""),
        }),
        JSON.stringify(safeJson(rec.evidence)),
      ],
    );
    if (ins.rows[0]?.id) created += 1;
  }

  return { created, skipped: false, reason: created ? "" : "All recommendations already open." };
}

function readGenerateInput(req: Request, body: Record<string, unknown>) {
  const url = new URL(req.url);
  const q = url.searchParams;

  return {
    tenantId: s(body.tenantId || q.get("tenantId")),
    integrationKey: s(body.integrationKey || q.get("integrationKey")) || "default",
    range: s(body.range || q.get("range")) || "last_28_days",
    start: s(body.start || q.get("start")),
    end: s(body.end || q.get("end")),
    force: body.force === true || q.get("force") === "1",
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = s(url.searchParams.get("tenantId"));
    const integrationKey = s(url.searchParams.get("integrationKey")) || "default";
    const status = s(url.searchParams.get("status")) || "open";
    const limit = n(url.searchParams.get("limit")) || 60;
    const autoGenerate = url.searchParams.get("autoGenerate") !== "0";

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    let autoResult: Record<string, unknown> | null = null;
    if (autoGenerate) {
      try {
        autoResult = await generateNotifications({
          req,
          tenantId,
          integrationKey,
          range: s(url.searchParams.get("range")) || "last_28_days",
          start: s(url.searchParams.get("start")),
          end: s(url.searchParams.get("end")),
          force: false,
        });
      } catch (error: unknown) {
        autoResult = {
          created: 0,
          skipped: true,
          reason: error instanceof Error ? error.message : "Auto generation failed",
        };
      }
    }

    const listed = await listNotifications(tenantId, integrationKey, status, limit);
    return NextResponse.json({ ok: true, ...listed, auto: autoResult });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to list ads notifications" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = readGenerateInput(req, body);
    if (!input.tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    const result = await generateNotifications({
      req,
      tenantId: input.tenantId,
      integrationKey: input.integrationKey,
      range: input.range,
      start: input.start,
      end: input.end,
      force: !!input.force,
    });

    const listed = await listNotifications(input.tenantId, input.integrationKey, "open", 100);
    return NextResponse.json({
      ok: true,
      generated: result,
      ...listed,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate ads notifications" },
      { status: 500 },
    );
  }
}
