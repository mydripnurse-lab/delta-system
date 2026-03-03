import { NextResponse } from "next/server";
import { getTenantOpenAIClient } from "@/lib/tenantOpenAI";
import { appendAiEvent } from "@/lib/aiMemory";
import { resolveTenantAiPrompt } from "@/lib/aiPromptStore";

export const runtime = "nodejs";


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

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const tenantId = s((payload as any)?.tenantId || "");
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    const integrationKey = s((payload as any)?.integrationKey || "default");
    const client = await getTenantOpenAIClient({ tenantId, integrationKey });
    const promptResolved = await resolveTenantAiPrompt({
      tenantId: tenantId || null,
      integrationKey,
      promptKey: "dashboard.ads.insights.system.v1",
      fallbackPrompt:
        "You are an elite Google Ads performance strategist for local healthcare lead generation. " +
        "Generate practical campaign playbooks by geography, balancing scale and efficiency. " +
        "Use only provided data. No hallucinations. Be specific and concise.",
    });

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
              campaign_structure: { type: "string" },
              audience: { type: "string" },
              ad_copy: { type: "string" },
              landing_plan: { type: "string" },
              expected_impact: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: [
              "region",
              "objective",
              "budget_daily_usd",
              "campaign_structure",
              "audience",
              "ad_copy",
              "landing_plan",
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
          content: promptResolved.promptText,
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ads_playbook_insights",
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
      tenantId: tenantId || null,
      agent: "ads",
      kind: "insight_run",
      summary: `Ads playbook generated (${String(parsed?.scorecard?.health || "mixed")})`,
      metadata: {
        health: parsed?.scorecard?.health || null,
        risk: parsed?.scorecard?.primary_risk || null,
        opportunity: parsed?.scorecard?.primary_opportunity || null,
      },
    });

    return NextResponse.json({ ok: true, insights }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate ads playbook" },
      { status: 500 },
    );
  }
}
