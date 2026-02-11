import { NextResponse } from "next/server";
import OpenAI from "openai";

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
        document_title: { type: "string" },
        audience_note: { type: "string" },
        executive_summary: { type: "string" },
        decisions_this_week: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
        },
        playbooks: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              priority: { type: "string", enum: ["P1", "P2", "P3"] },
              owner: { type: "string" },
              module: { type: "string" },
              business_signal: { type: "string" },
              expected_impact: { type: "string" },
              plain_language_goal: { type: "string" },
              setup_steps: {
                type: "array",
                items: { type: "string" },
                maxItems: 6,
              },
              success_check: { type: "string" },
            },
            required: [
              "title",
              "priority",
              "owner",
              "module",
              "business_signal",
              "expected_impact",
              "plain_language_goal",
              "setup_steps",
              "success_check",
            ],
          },
        },
        meeting_agenda: {
          type: "array",
          items: { type: "string" },
          maxItems: 8,
        },
        risks_if_not_executed: {
          type: "array",
          items: { type: "string" },
          maxItems: 6,
        },
      },
      required: [
        "document_title",
        "audience_note",
        "executive_summary",
        "decisions_this_week",
        "playbooks",
        "meeting_agenda",
        "risks_if_not_executed",
      ],
    };

    const resp = await client.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "You are a CEO operator writing a board-meeting playbook. " +
            "Write in clear, non-technical business language for stakeholders with limited analytics background. " +
            "Use only provided data. Do not invent metrics. Keep recommendations concrete and actionable.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "action_center_playbook",
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

    let document: unknown = null;
    try {
      document = JSON.parse(outText);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Model did not return valid JSON.", raw: outText.slice(0, 800) },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, document });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to generate action center playbook" },
      { status: 500 },
    );
  }
}
