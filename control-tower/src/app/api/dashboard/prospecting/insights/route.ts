import { NextResponse } from "next/server";
import OpenAI from "openai";
import { appendAiEvent } from "@/lib/aiMemory";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ResponseOutputText = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in environment." },
        { status: 500 },
      );
    }

    const payload = await req.json();

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        executive_summary: { type: "string" },
        scorecard: {
          type: "object",
          additionalProperties: false,
          properties: {
            health: { type: "string", enum: ["good", "mixed", "bad"] },
            primary_risk: { type: "string" },
            primary_opportunity: { type: "string" },
          },
          required: ["health", "primary_risk", "primary_opportunity"],
        },
        opportunities: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              why_it_matters: { type: "string" },
              evidence: { type: "string" },
              expected_impact: { type: "string", enum: ["low", "medium", "high"] },
              recommended_actions: {
                type: "array",
                items: { type: "string" },
                maxItems: 6,
              },
            },
            required: [
              "title",
              "why_it_matters",
              "evidence",
              "expected_impact",
              "recommended_actions",
            ],
          },
        },
        quick_wins_next_7_days: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        experiments_next_30_days: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
      },
      required: [
        "executive_summary",
        "scorecard",
        "opportunities",
        "quick_wins_next_7_days",
        "experiments_next_30_days",
      ],
    };

    const resp = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "none" },
      input: [
        {
          role: "system",
          content:
            "You are an elite prospecting strategist for local growth operations. " +
            "Prioritize actions that increase qualified lead discovery, contactability, and conversion readiness. " +
            "Focus on geo queue prioritization, enrichment quality, and webhook-ready lead flow. " +
            "Use only provided data; do not invent metrics.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "prospecting_dashboard_insights",
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
        { ok: false, error: "Model did not return valid JSON.", raw: outText.slice(0, 800) },
        { status: 502 },
      );
    }

    const parsed = insights as Record<string, any>;
    await appendAiEvent({
      agent: "prospecting",
      kind: "insight_run",
      summary: `Prospecting insights generated (${String(parsed?.scorecard?.health || "mixed")})`,
      metadata: {
        health: parsed?.scorecard?.health || null,
        risk: parsed?.scorecard?.primary_risk || null,
        opportunity: parsed?.scorecard?.primary_opportunity || null,
      },
    });

    return NextResponse.json({ ok: true, insights });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate prospecting insights" },
      { status: 500 },
    );
  }
}
