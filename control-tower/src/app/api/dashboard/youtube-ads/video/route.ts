import { NextResponse } from "next/server";
import { appendAiEvent } from "@/lib/aiMemory";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

type RunwayNormalized = {
  ok: boolean;
  id: string;
  status: string;
  model: string;
  outputUrl: string;
  outputPreviewUrl: string;
  error: string;
  raw: JsonMap;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asObj(v: unknown): JsonMap {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonMap) : {};
}

function asArr(v: unknown) {
  return Array.isArray(v) ? v : [];
}

function pickText(obj: JsonMap, keys: string[]) {
  for (const key of keys) {
    const value = s(obj[key]);
    if (value) return value;
  }
  return "";
}

function normalizeModel(raw: string) {
  const m = s(raw).toLowerCase();
  if (!m) return "gen4.5";
  if (m === "gen4_5_turbo" || m === "gen4.5_turbo" || m === "gen4-5" || m === "gen4_5") return "gen4.5";
  return raw;
}

function normalizeRatio(raw: string) {
  const v = s(raw).replace(/\s+/g, "");
  if (!v) return "1280:720";
  if (v === "16:9") return "1280:720";
  if (v === "9:16") return "720:1280";
  if (v === "1:1") return "960:960";
  return v;
}

function normalizeDuration(model: string, value: number) {
  const d = Math.max(5, Math.min(30, Math.round(value)));
  const m = model.toLowerCase();
  if (m.includes("gen4_turbo")) {
    return d <= 7 ? 5 : 10;
  }
  return d;
}

function cleanProviderError(raw: string) {
  const txt = s(raw);
  if (!txt) return "";
  if (txt.includes("<!DOCTYPE") || txt.includes("<html")) {
    return "Runway endpoint not found for this request. Verify RUNWAY_API_BASE_URL and API version.";
  }
  return txt;
}

function normalizeRunwayPayload(payload: unknown, modelFallback: string): RunwayNormalized {
  const root = asObj(payload);
  const output = asObj(root.output);
  const data = asObj(root.data);
  const result = asObj(root.result);
  const task = asObj(root.task);

  const id =
    pickText(root, ["id", "taskId", "task_id", "generationId", "generation_id", "uuid"]) ||
    pickText(data, ["id", "taskId", "task_id", "generationId", "generation_id"]) ||
    pickText(result, ["id", "taskId", "task_id", "generationId", "generation_id"]) ||
    pickText(task, ["id", "taskId", "task_id"]);

  const status =
    pickText(root, ["status", "state"]) ||
    pickText(data, ["status", "state"]) ||
    pickText(result, ["status", "state"]) ||
    pickText(task, ["status", "state"]) ||
    "queued";

  const model =
    pickText(root, ["model", "modelId", "model_id"]) ||
    pickText(data, ["model", "modelId", "model_id"]) ||
    pickText(task, ["model", "modelId", "model_id"]) ||
    modelFallback;

  const taskOutput = asArr(root.output)
    .map((x) => s(x))
    .find(Boolean) || "";

  const outputUrl =
    pickText(root, ["outputUrl", "output_url", "videoUrl", "video_url", "url"]) ||
    pickText(output, ["url", "video_url", "videoUrl", "output_url", "outputUrl"]) ||
    pickText(result, ["url", "video_url", "videoUrl", "output_url", "outputUrl"]) ||
    taskOutput;

  const outputPreviewUrl =
    pickText(root, ["previewUrl", "preview_url", "thumbnailUrl", "thumbnail_url"]) ||
    pickText(output, ["preview_url", "previewUrl", "thumbnail_url", "thumbnailUrl"]) ||
    pickText(result, ["preview_url", "previewUrl", "thumbnail_url", "thumbnailUrl"]);

  const error = cleanProviderError(
    pickText(root, ["error", "message", "detail"]) ||
      pickText(data, ["error", "message", "detail"]) ||
      pickText(result, ["error", "message", "detail"]),
  );

  return {
    ok: true,
    id,
    status,
    model,
    outputUrl,
    outputPreviewUrl,
    error,
    raw: root,
  };
}

async function runwayFetch(path: string, init?: RequestInit) {
  const baseUrl = s(process.env.RUNWAY_API_BASE_URL || "https://api.dev.runwayml.com").replace(/\/+$/, "");
  const apiKey = s(process.env.RUNWAY_API_KEY);
  const apiVersion = s(process.env.RUNWAY_API_VERSION || "2024-11-06");
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-runway-version": apiVersion,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: cleanProviderError(text.slice(0, 1500)) };
  }

  return { res, json };
}

async function createVideo(body: JsonMap) {
  const model = normalizeModel(s(body.model || process.env.RUNWAY_MODEL || "gen4.5"));
  const promptText = s(body.prompt);
  const ratio = normalizeRatio(s(body.ratio || "1280:720"));
  const duration = normalizeDuration(model, num(body.durationSeconds, 10));
  const seedImageUrl = s(body.seedImageUrl || body.promptImage);

  if (!promptText) {
    return NextResponse.json({ ok: false, error: "Missing prompt." }, { status: 400 });
  }

  const requests: Array<{ path: string; payload: JsonMap }> = [
    {
      path: "/v1/text_to_video",
      payload: {
        model,
        promptText,
        ratio,
        duration,
      },
    },
  ];

  if (seedImageUrl) {
    requests.push({
      path: "/v1/image_to_video",
      payload: {
        model,
        promptText,
        promptImage: seedImageUrl,
        ratio,
        duration,
      },
    });
  }

  const errors: string[] = [];

  for (const req of requests) {
    const { res, json } = await runwayFetch(req.path, {
      method: "POST",
      body: JSON.stringify(req.payload),
    });

    if (res.ok) {
      const out = normalizeRunwayPayload(json, model);
      if (!out.id) {
        return NextResponse.json(
          { ok: false, error: "Runway response did not include task id.", raw: json },
          { status: 502 },
        );
      }

      await appendAiEvent({
        agent: "youtube_ads",
        kind: "insight_run",
        summary: `Runway video requested (${out.status || "queued"})`,
        metadata: {
          model: out.model,
          generation_id: out.id || null,
        },
      });

      return NextResponse.json({
        ok: true,
        provider: "runway",
        endpoint: req.path,
        ...out,
      });
    }

    const err = cleanProviderError(s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`));
    errors.push(`${req.path} -> ${res.status}: ${err || "Unknown error"}`);

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { ok: false, error: `Runway auth failed. ${errors[errors.length - 1]}`, raw: json },
        { status: res.status },
      );
    }
  }

  const help =
    "If model requires image input, set a Seed Image URL. Also verify model id (example: gen4.5, gen4_turbo, veo3.1).";
  return NextResponse.json(
    {
      ok: false,
      error: `${errors.join(" | ")} | ${help}`,
    },
    { status: 502 },
  );
}

async function getVideoStatus(id: string) {
  const model = normalizeModel(s(process.env.RUNWAY_MODEL || "gen4.5"));
  const path = `/v1/tasks/${encodeURIComponent(id)}`;
  const { res, json } = await runwayFetch(path, { method: "GET" });

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: cleanProviderError(s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`)), raw: json },
      { status: res.status },
    );
  }

  const out = normalizeRunwayPayload(json, model);
  return NextResponse.json({ ok: true, provider: "runway", endpoint: path, ...out });
}

export async function POST(req: Request) {
  try {
    if (!process.env.RUNWAY_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing RUNWAY_API_KEY in environment." }, { status: 500 });
    }
    const body = (await req.json().catch(() => ({}))) as JsonMap;
    return createVideo(body);
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to request Runway video generation" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    if (!process.env.RUNWAY_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing RUNWAY_API_KEY in environment." }, { status: 500 });
    }
    const url = new URL(req.url);
    const id = s(url.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
    }
    return getVideoStatus(id);
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load Runway generation status" },
      { status: 500 },
    );
  }
}
