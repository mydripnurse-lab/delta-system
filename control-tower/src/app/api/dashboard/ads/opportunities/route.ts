import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { createProposal } from "@/lib/agentProposalStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on";
}

function asArray(v: unknown) {
  return Array.isArray(v) ? v : [];
}

function normKeyword(v: unknown) {
  return s(v).toLowerCase().replace(/\s+/g, " ").trim();
}

function isBrandKeyword(keyword: string) {
  const k = normKeyword(keyword);
  return k.includes("my drip nurse") || k.includes("drip nurse");
}

function compactKeyword(raw: string) {
  return s(raw).replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function scoreKeywordOpportunity(row: JsonMap) {
  const impressions = n(row.impressions);
  const ctr = n(row.ctr);
  const position = n(row.position);
  const posSignal = position >= 4 && position <= 20 ? 1 : 0;
  const ctrSignal = impressions >= 120 && ctr > 0 && ctr <= 0.03 ? 1 : 0;
  return impressions * 0.01 + posSignal * 40 + ctrSignal * 35;
}

function buildSearchKeywordPool(input: {
  gscRows: JsonMap[];
  bingRows: JsonMap[];
  existingAdsKeywords: Set<string>;
}) {
  const pool = [...input.gscRows, ...input.bingRows]
    .map((row) => ({
      keyword: compactKeyword(s(row.query)),
      impressions: n(row.impressions),
      ctr: n(row.ctr),
      position: n(row.position),
      source: s(row.__source || "search"),
    }))
    .filter((row) => row.keyword && row.impressions >= 80)
    .filter((row) => !isBrandKeyword(row.keyword))
    .filter((row) => !input.existingAdsKeywords.has(normKeyword(row.keyword)))
    .map((row) => ({ ...row, score: scoreKeywordOpportunity(row as unknown as JsonMap) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.impressions - a.impressions);

  const dedup = new Set<string>();
  const out: typeof pool = [];
  for (const row of pool) {
    const key = normKeyword(row.keyword);
    if (dedup.has(key)) continue;
    dedup.add(key);
    out.push(row);
    if (out.length >= 20) break;
  }
  return out;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as JsonMap;
  return { ok: res.ok && boolish(json.ok, false), status: res.status, json };
}

function buildBaseParams(input: {
  tenantId: string;
  integrationKey: string;
  range: string;
  start?: string;
  end?: string;
}) {
  const p = new URLSearchParams();
  p.set("tenantId", input.tenantId);
  p.set("integrationKey", input.integrationKey);
  p.set("range", input.range || "last_28_days");
  if (s(input.range) === "custom" && s(input.start) && s(input.end)) {
    p.set("start", s(input.start));
    p.set("end", s(input.end));
  }
  p.set("compare", "1");
  return p;
}

async function computeOpportunityPack(input: {
  origin: string;
  tenantId: string;
  integrationKey: string;
  range: string;
  start?: string;
  end?: string;
  source: "gsc" | "bing" | "all";
}) {
  const params = buildBaseParams(input);
  const adsJoinUrl = `${input.origin}/api/dashboard/ads/join?${params.toString()}`;
  const strategyUrl = `${input.origin}/api/dashboard/ads/strategy?${params.toString()}`;
  const gscUrl = `${input.origin}/api/dashboard/gsc/join?${params.toString()}`;
  const bingUrl = `${input.origin}/api/dashboard/bing/join?${params.toString()}`;

  const [adsJoinRes, strategyRes, gscRes, bingRes] = await Promise.all([
    fetchJson(adsJoinUrl),
    fetchJson(strategyUrl),
    input.source === "bing" ? Promise.resolve({ ok: true, status: 200, json: {} as JsonMap }) : fetchJson(gscUrl),
    input.source === "gsc" ? Promise.resolve({ ok: true, status: 200, json: {} as JsonMap }) : fetchJson(bingUrl),
  ]);

  if (!adsJoinRes.ok) {
    throw new Error(s(adsJoinRes.json.error) || `ads/join failed (${adsJoinRes.status})`);
  }

  const adsJoin = adsJoinRes.json;
  void strategyRes;
  const winners = asArray((adsJoin.opportunities as JsonMap)?.winners) as JsonMap[];
  const losers = asArray((adsJoin.opportunities as JsonMap)?.losers) as JsonMap[];
  const negativeIdeas = asArray((adsJoin.opportunities as JsonMap)?.negativeIdeas) as JsonMap[];
  const topKeywords = asArray(adsJoin.topKeywords) as JsonMap[];
  const meta = (adsJoin.meta || {}) as JsonMap;
  const customerId = s(meta.customerId).replace(/-/g, "");

  const gscRowsRaw =
    asArray(gscRes.json.topQueriesFiltered).length > 0
      ? (asArray(gscRes.json.topQueriesFiltered) as JsonMap[])
      : (asArray(gscRes.json.topQueriesOverall) as JsonMap[]);
  const bingRowsRaw =
    asArray(bingRes.json.topQueriesFiltered).length > 0
      ? (asArray(bingRes.json.topQueriesFiltered) as JsonMap[])
      : (asArray(bingRes.json.topQueriesOverall) as JsonMap[]);
  const gscRows = gscRowsRaw.map((r) => ({ ...r, __source: "gsc" }));
  const bingRows = bingRowsRaw.map((r) => ({ ...r, __source: "bing" }));

  const existingAdsKeywords = new Set(
    topKeywords.map((r) => normKeyword(r.keyword)).filter(Boolean),
  );
  const searchKeywordPool = buildSearchKeywordPool({
    gscRows,
    bingRows,
    existingAdsKeywords,
  });

  const bestAdGroup = [...topKeywords]
    .map((r) => ({
      adGroupId: s(r.adGroupId),
      campaignId: s(r.campaignId),
      campaign: s(r.campaign),
      conversions: n(r.conversions),
      clicks: n(r.clicks),
    }))
    .filter((r) => r.adGroupId)
    .sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks)[0] || null;

  return {
    customerId,
    winners,
    losers,
    negativeIdeas,
    searchKeywordPool,
    bestAdGroup,
  };
}

function buildProposalBlueprints(input: {
  tenantId: string;
  integrationKey: string;
  customerId: string;
  loginCustomerId?: string;
  dryRun: boolean;
  winners: JsonMap[];
  losers: JsonMap[];
  negativeIdeas: JsonMap[];
  searchKeywordPool: Array<{ keyword: string; impressions: number; position: number; ctr: number; source: string }>;
  bestAdGroup: { adGroupId: string; campaignId: string; campaign: string } | null;
  source: "gsc" | "bing" | "all";
}) {
  const proposals: Array<{
    summary: string;
    priority: "P1" | "P2" | "P3";
    riskLevel: "low" | "medium" | "high";
    expectedImpact: "low" | "medium" | "high";
    payload: JsonMap;
  }> = [];

  const winner = input.winners[0] || null;
  if (winner && s(winner.id)) {
    proposals.push({
      summary: `Scale budget on winner campaign ${s(winner.campaign) || s(winner.id)}`,
      priority: "P2",
      riskLevel: "low",
      expectedImpact: "high",
      payload: {
        tenant_id: input.tenantId,
        integration_key: input.integrationKey,
        customer_id: input.customerId,
        login_customer_id: s(input.loginCustomerId),
        dry_run: input.dryRun,
        operations: [
          {
            kind: "campaign_budget_percent",
            campaign_id: s(winner.id),
            percentDelta: 0.1,
          },
        ],
      },
    });
  }

  const loser = input.losers[0] || null;
  if (loser && s(loser.id)) {
    proposals.push({
      summary: `Reduce budget leakage on ${s(loser.campaign) || s(loser.id)}`,
      priority: "P1",
      riskLevel: "medium",
      expectedImpact: "high",
      payload: {
        tenant_id: input.tenantId,
        integration_key: input.integrationKey,
        customer_id: input.customerId,
        login_customer_id: s(input.loginCustomerId),
        dry_run: input.dryRun,
        operations: [
          {
            kind: "campaign_budget_percent",
            campaign_id: s(loser.id),
            percentDelta: -0.18,
          },
        ],
      },
    });
  }

  const negativeTargetCampaignId =
    s(loser?.id) ||
    s(winner?.id) ||
    s(input.bestAdGroup?.campaignId);
  if (negativeTargetCampaignId) {
    const negatives = input.negativeIdeas
      .map((x) => compactKeyword(s(x.term)))
      .filter(Boolean)
      .slice(0, 12);
    if (negatives.length) {
      proposals.push({
        summary: `Add negative keyword guardrail (${negatives.length} terms)`,
        priority: "P2",
        riskLevel: "low",
        expectedImpact: "medium",
        payload: {
          tenant_id: input.tenantId,
          integration_key: input.integrationKey,
          customer_id: input.customerId,
          login_customer_id: s(input.loginCustomerId),
          dry_run: input.dryRun,
          operations: [
            {
              kind: "add_campaign_negative_keywords",
              campaign_id: negativeTargetCampaignId,
              matchType: "PHRASE",
              keywords: negatives,
            },
          ],
        },
      });
    }
  }

  if (input.bestAdGroup && input.searchKeywordPool.length) {
    const newKeywords = input.searchKeywordPool.slice(0, 8).map((x) => x.keyword);
    proposals.push({
      summary: `Keyword opportunity bot (${input.source.toUpperCase()}): add ${newKeywords.length} terms to ${input.bestAdGroup.campaign}`,
      priority: "P2",
      riskLevel: "low",
      expectedImpact: "high",
      payload: {
        tenant_id: input.tenantId,
        integration_key: input.integrationKey,
        customer_id: input.customerId,
        login_customer_id: s(input.loginCustomerId),
        dry_run: input.dryRun,
        operations: [
          {
            kind: "add_adgroup_keywords",
            ad_group_id: input.bestAdGroup.adGroupId,
            matchType: "PHRASE",
            keywords: newKeywords,
          },
        ],
        keyword_opportunity_context: input.searchKeywordPool.slice(0, 12),
      },
    });
  }

  return proposals;
}

async function handle(req: Request, mode: "preview" | "queue") {
  const url = new URL(req.url);
  const body = mode === "queue" ? ((await req.json().catch(() => ({}))) as JsonMap) : ({} as JsonMap);
  const tenantId = s(body.tenantId || body.organizationId || url.searchParams.get("tenantId"));
  const integrationKey = s(body.integrationKey || url.searchParams.get("integrationKey")) || "default";
  const sourceRaw = s(body.source || url.searchParams.get("source")).toLowerCase();
  const source: "gsc" | "bing" | "all" =
    sourceRaw === "gsc" || sourceRaw === "bing" || sourceRaw === "all" ? sourceRaw : "all";
  const range = s(body.range || url.searchParams.get("range")) || "last_28_days";
  const start = s(body.start || url.searchParams.get("start"));
  const end = s(body.end || url.searchParams.get("end"));
  const maxProposals = Math.max(1, Math.min(8, n(body.maxProposals || url.searchParams.get("maxProposals"), 4)));
  const dryRun = boolish(body.dryRun ?? url.searchParams.get("dryRun"), true);
  const agentId = s(body.agentId) || "soul_ads_optimizer";

  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, mode === "queue" ? "tenant.manage" : "tenant.read");
  if ("response" in auth) return auth.response;

  const pack = await computeOpportunityPack({
    origin: url.origin,
    tenantId,
    integrationKey,
    range,
    start,
    end,
    source,
  });

  const blueprints = buildProposalBlueprints({
    tenantId,
    integrationKey,
    customerId: pack.customerId,
    dryRun,
    winners: pack.winners,
    losers: pack.losers,
    negativeIdeas: pack.negativeIdeas,
    searchKeywordPool: pack.searchKeywordPool,
    bestAdGroup: pack.bestAdGroup,
    source,
  }).slice(0, maxProposals);

  if (mode === "preview") {
    return NextResponse.json({
      ok: true,
      tenantId,
      integrationKey,
      range,
      source,
      dryRun,
      previewCount: blueprints.length,
      bestAdGroup: pack.bestAdGroup,
      searchKeywordPool: pack.searchKeywordPool.slice(0, 12),
      proposals: blueprints,
    });
  }

  const created = [];
  for (const bp of blueprints) {
    const proposal = await createProposal({
      organizationId: tenantId,
      actionType: "optimize_ads",
      agentId,
      dashboardId: "ads",
      summary: bp.summary,
      payload: bp.payload,
      priority: bp.priority,
      riskLevel: bp.riskLevel,
      expectedImpact: bp.expectedImpact,
      policyAutoApproved: false,
      approvalRequired: true,
    });
    created.push(proposal);
  }

  return NextResponse.json({
    ok: true,
    tenantId,
    integrationKey,
    range,
    source,
    dryRun,
    queued: created.length,
    proposals: created,
  });
}

export async function GET(req: Request) {
  try {
    return await handle(req, "preview");
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to preview ads opportunities" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req, "queue");
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to queue ads opportunities" },
      { status: 500 },
    );
  }
}
