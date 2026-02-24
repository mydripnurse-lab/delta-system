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
    primary_risk?: string;
    primary_opportunity?: string;
  };
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY in environment." }, { status: 500 });
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
        playbook: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              region: { type: "string" },
              objective: { type: "string" },
              budget_daily_usd: { type: "number" },
              audience: { type: "string" },
              video_hook: { type: "string" },
              script_15s: { type: "string" },
              script_30s: { type: "string" },
              cta: { type: "string" },
              runway_prompt: { type: "string" },
              expected_impact: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: [
              "region",
              "objective",
              "budget_daily_usd",
              "audience",
              "video_hook",
              "script_15s",
              "script_30s",
              "cta",
              "runway_prompt",
              "expected_impact",
            ],
          },
        },
      },
      required: ["executive_summary", "scorecard", "playbook"],
    };

    const resp = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "none" },
      input: [
        {
          role: "system",
          content:
            "You are an elite YouTube Ads growth strategist for local healthcare lead generation. " +
            "Build practical YouTube campaign playbooks by geography with audience, video hooks, scripts, CTA, and Runway-ready prompts. " +
            "Use only provided data and be concrete.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "youtube_ads_playbook_insights",
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
      return NextResponse.json({ ok: false, error: "Empty model output." }, { status: 502 });
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

    const parsed = insights as InsightMeta;
    await appendAiEvent({
      agent: "youtube_ads",
      kind: "insight_run",
      summary: `YouTube Ads playbook generated (${String(parsed?.scorecard?.health || "mixed")})`,
      metadata: {
        health: parsed?.scorecard?.health || null,
        risk: parsed?.scorecard?.primary_risk || null,
        opportunity: parsed?.scorecard?.primary_opportunity || null,
      },
    });

    return NextResponse.json({ ok: true, insights }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate youtube ads playbook" },
      { status: 500 },
    );
  }
}
