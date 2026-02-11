import { NextResponse } from "next/server";
import OpenAI from "openai";
import { appendAiEvent } from "@/lib/aiMemory";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ResponseOutputText = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type InsightMeta = {
  scorecard?: {
    health?: string;
  };
  quick_summary?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function clip(v: unknown, max = 320) {
  const txt = s(v);
  return txt.length > max ? `${txt.slice(0, max - 1)}...` : txt;
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 },
      );
    }

    const payload = await req.json();
    const p = (payload || {}) as Record<string, unknown>;
    const campaign = (p.campaign || {}) as Record<string, unknown>;
    const context = (p.context || {}) as Record<string, unknown>;
    const topGeo = Array.isArray(context.topGeo) ? context.topGeo : [];
    const attribution = Array.isArray(context.attribution) ? context.attribution : [];
    const gscTopQueries = Array.isArray(context.gscTopQueries) ? context.gscTopQueries : [];

    const compactPayload = {
      range: p.range || null,
      campaign: {
        channel: clip(campaign.channel, 80),
        region: clip(campaign.region, 120),
        geoTier: clip(campaign.geoTier, 40),
        objective: clip(campaign.objective, 140),
        intentCluster: clip(campaign.intentCluster, 140),
        serviceLine: clip(campaign.serviceLine, 140),
        priorityScore: n(campaign.priorityScore),
        potentialRevenueUsd: n(campaign.potentialRevenueUsd),
        budgetDailyUsd: n(campaign.budgetDailyUsd),
        campaignName: clip(campaign.campaignName, 180),
        adSetOrAdGroup: clip(campaign.adSetOrAdGroup, 180),
        landingUrl: clip(campaign.landingUrl, 220),
        formUrl: clip(campaign.formUrl, 220),
        bookingUrl: clip(campaign.bookingUrl, 220),
        audience: clip(campaign.audience, 240),
        copyHeadline: clip(campaign.copyHeadline, 160),
        copyPrimary: clip(campaign.copyPrimary, 320),
        cta: clip(campaign.cta, 60),
        funnel: clip(campaign.funnel, 180),
        kpiTarget: clip(campaign.kpiTarget, 180),
        roasFloor: n(campaign.roasFloor),
        roasTarget: n(campaign.roasTarget),
        roasStretch: n(campaign.roasStretch),
      },
      context: {
        business: {
          name: clip((context.business as Record<string, unknown>)?.name, 120),
          offer: clip((context.business as Record<string, unknown>)?.offer, 180),
          geo: clip((context.business as Record<string, unknown>)?.geo, 120),
          positioning: clip((context.business as Record<string, unknown>)?.positioning, 220),
        },
        topGeo: topGeo.slice(0, 8).map((x) => ({
          name: clip((x as Record<string, unknown>).name, 120),
          level: clip((x as Record<string, unknown>).level, 40),
          leads: n((x as Record<string, unknown>).leads),
          opportunities: n((x as Record<string, unknown>).opportunities),
          revenue: n((x as Record<string, unknown>).revenue),
        })),
        attribution: attribution.slice(0, 8).map((x) => ({
          source: clip((x as Record<string, unknown>).source, 80),
          leads: n((x as Record<string, unknown>).leads),
          revenue: n((x as Record<string, unknown>).revenue),
        })),
        gscTopQueries: gscTopQueries.slice(0, 12).map((q) => clip(q, 100)),
      },
    };

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        quick_summary: { type: "string" },
        scorecard: {
          type: "object",
          additionalProperties: false,
          properties: {
            health: { type: "string", enum: ["good", "mixed", "bad"] },
            setup_difficulty: { type: "string", enum: ["easy", "medium", "advanced"] },
            expected_impact: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["health", "setup_difficulty", "expected_impact"],
        },
        setup_steps: {
          type: "array",
          minItems: 6,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              step: { type: "integer" },
              title: { type: "string" },
              action: { type: "string" },
              expected_output: { type: "string" },
              common_mistake: { type: "string" },
            },
            required: ["step", "title", "action", "expected_output", "common_mistake"],
          },
        },
        creative_pack: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary_text: { type: "string" },
            headline: { type: "string" },
            cta: { type: "string" },
            landing_message: { type: "string" },
          },
          required: ["primary_text", "headline", "cta", "landing_message"],
        },
        launch_checklist: {
          type: "array",
          minItems: 5,
          maxItems: 10,
          items: { type: "string" },
        },
      },
      required: ["quick_summary", "scorecard", "setup_steps", "creative_pack", "launch_checklist"],
    };

    const resp = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "none" },
      input: [
        {
          role: "system",
          content:
            "You are a senior paid-ads operator and trainer for a multi-geo business architecture (state/county/city landing structure). " +
            "Create a short, precise setup guide for a beginner with almost no ads knowledge. " +
            "Use plain language, practical steps, and avoid jargon overload. " +
            "Use the business context provided in payload and never mention internal project names in public ad copy. " +
            "Output only structured JSON matching schema.",
        },
        {
          role: "user",
          content: JSON.stringify(compactPayload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "campaign_factory_setup_guide",
          schema,
        },
      },
    });

    const out = resp as ResponseOutputText;
    let outText = out.output_text;
    if (!outText) {
      outText =
        out.output
          ?.flatMap((o) => o.content || [])
          ?.find((c) => c.type === "output_text")?.text || "";
    }

    if (!outText) {
      return NextResponse.json(
        { ok: false, error: "Empty model output." },
        { status: 502 },
      );
    }

    let insights: unknown = null;
    try {
      insights = JSON.parse(outText);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Model did not return valid JSON.",
          raw: outText.slice(0, 800),
        },
        { status: 502 },
      );
    }

    const parsed = insights as InsightMeta;
    await appendAiEvent({
      agent: "overview",
      kind: "insight_run",
      summary: `Campaign setup guide generated (${String(parsed?.scorecard?.health || "mixed")})`,
      metadata: {
        health: parsed?.scorecard?.health || null,
        summary: parsed?.quick_summary || null,
      },
    });

    return NextResponse.json({ ok: true, insights });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate campaign guide" },
      { status: 500 },
    );
  }
}
