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

function safeJsonStringify(x: unknown, maxChars = 140_000) {
  let out = "";
  try {
    out = JSON.stringify(x);
  } catch {
    out = String(x ?? "");
  }
  if (out.length <= maxChars) return out;
  return out.slice(0, maxChars) + `\n\n[TRUNCATED ${out.length - maxChars} chars]`;
}

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
        opportunities: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              expected_impact: { type: "string", enum: ["low", "medium", "high"] },
              why_it_matters: { type: "string" },
              evidence: { type: "string" },
              recommended_actions: { type: "array", items: { type: "string" }, maxItems: 7 },
            },
            required: ["title", "expected_impact", "why_it_matters", "evidence", "recommended_actions"],
          },
        },
        quick_wins_next_7_days: { type: "array", items: { type: "string" }, maxItems: 8 },
        experiments_next_30_days: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
      required: ["executive_summary", "scorecard", "opportunities", "quick_wins_next_7_days", "experiments_next_30_days"],
    };

    const systemPrompt =
      "You are an elite Bing Webmaster SEO analyst. Use only provided dataset and output concise, action-oriented insights. " +
      "Do not invent data. Prioritize CTR, clicks, impressions, average position, and geo opportunities. " +
      "Output valid JSON per schema.";

    const resp = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: safeJsonStringify(payload, 160_000) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bing_dashboard_insights",
          schema,
        },
      },
    });

    const outAny = resp as ResponseOutputText;
    let outText = outAny?.output_text as string | undefined;
    if (!outText) {
      outText = outAny?.output?.flatMap((o) => o.content || [])?.find((c) => c.type === "output_text")?.text || "";
    }

    if (!outText) {
      return NextResponse.json({ ok: false, error: "Empty model output." }, { status: 502 });
    }

    let insights: unknown = null;
    try {
      insights = JSON.parse(outText);
    } catch {
      return NextResponse.json({ ok: false, error: "Model did not return valid JSON.", raw: outText.slice(0, 1200) }, { status: 502 });
    }

    const parsed = insights as {
      scorecard?: {
        health?: string;
        primary_risk?: string;
        primary_opportunity?: string;
      };
    };

    await appendAiEvent({
      agent: "bing_webmaster",
      kind: "insight_run",
      summary: `Bing insights generated (${String(parsed?.scorecard?.health || "mixed")})`,
      metadata: {
        health: parsed?.scorecard?.health || null,
        risk: parsed?.scorecard?.primary_risk || null,
        opportunity: parsed?.scorecard?.primary_opportunity || null,
      },
    });

    return NextResponse.json({ ok: true, insights }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to generate Bing insights" }, { status: 500 });
  }
}
