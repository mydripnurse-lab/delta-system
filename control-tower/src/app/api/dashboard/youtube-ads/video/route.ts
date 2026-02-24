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

function pickText(obj: JsonMap, keys: string[]) {
  for (const key of keys) {
    const value = s(obj[key]);
    if (value) return value;
  }
  return "";
}

function normalizeRunwayPayload(payload: unknown, modelFallback: string): RunwayNormalized {
  const root = asObj(payload);
  const output = asObj(root.output);
  const data = asObj(root.data);
  const result = asObj(root.result);

  const id =
    pickText(root, ["id", "taskId", "task_id", "generationId", "generation_id", "uuid"]) ||
    pickText(data, ["id", "taskId", "task_id", "generationId", "generation_id"]) ||
    pickText(result, ["id", "taskId", "task_id", "generationId", "generation_id"]);

  const status =
    pickText(root, ["status", "state"]) ||
    pickText(data, ["status", "state"]) ||
    pickText(result, ["status", "state"]) ||
    "queued";

  const model =
    pickText(root, ["model", "modelId", "model_id"]) ||
    pickText(data, ["model", "modelId", "model_id"]) ||
    modelFallback;

  const outputUrl =
    pickText(root, ["outputUrl", "output_url", "videoUrl", "video_url", "url"]) ||
    pickText(output, ["url", "video_url", "videoUrl", "output_url", "outputUrl"]) ||
    pickText(result, ["url", "video_url", "videoUrl", "output_url", "outputUrl"]);

  const outputPreviewUrl =
    pickText(root, ["previewUrl", "preview_url", "thumbnailUrl", "thumbnail_url"]) ||
    pickText(output, ["preview_url", "previewUrl", "thumbnail_url", "thumbnailUrl"]) ||
    pickText(result, ["preview_url", "previewUrl", "thumbnail_url", "thumbnailUrl"]);

  const error =
    pickText(root, ["error", "message", "detail"]) ||
    pickText(data, ["error", "message", "detail"]) ||
    pickText(result, ["error", "message", "detail"]);

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
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 1500) };
  }

  return { res, json };
}

async function createVideo(body: JsonMap) {
  const model = s(body.model || process.env.RUNWAY_MODEL || "gen4_5_turbo");
  const prompt = s(body.prompt);
  const ratio = s(body.ratio || "16:9");
  const durationSeconds = Math.max(5, Math.min(30, num(body.durationSeconds, 10)));
  const seedImageUrl = s(body.seedImageUrl);

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "Missing prompt." }, { status: 400 });
  }

  const candidates = [
    {
      path: "/v1/video/generations",
      payload: {
        model,
        prompt,
        ratio,
        duration: durationSeconds,
        seed_image_url: seedImageUrl || undefined,
      },
    },
    {
      path: "/v1/generations",
      payload: {
        model,
        prompt,
        ratio,
        duration: durationSeconds,
        seed_image_url: seedImageUrl || undefined,
      },
    },
    {
      path: "/v1/tasks",
      payload: {
        type: "video_generation",
        model,
        input: {
          prompt,
          ratio,
          duration: durationSeconds,
          seed_image_url: seedImageUrl || undefined,
        },
      },
    },
  ];

  let lastError = "";
  for (const c of candidates) {
    const { res, json } = await runwayFetch(c.path, {
      method: "POST",
      body: JSON.stringify(c.payload),
    });
    if (!res.ok && (res.status === 404 || res.status === 405)) {
      lastError = s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`);
      continue;
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`), raw: json },
        { status: res.status },
      );
    }

    const out = normalizeRunwayPayload(json, model);
    await appendAiEvent({
      agent: "youtube_ads",
      kind: "video_generation",
      summary: `Runway video requested (${out.status || "queued"})`,
      metadata: {
        model: out.model,
        generation_id: out.id || null,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: "runway",
      endpoint: c.path,
      ...out,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: lastError || "Could not find a compatible Runway generation endpoint. Set RUNWAY_API_BASE_URL if needed.",
    },
    { status: 502 },
  );
}

async function getVideoStatus(id: string) {
  const model = s(process.env.RUNWAY_MODEL || "gen4_5_turbo");
  const endpoints = [
    `/v1/video/generations/${encodeURIComponent(id)}`,
    `/v1/generations/${encodeURIComponent(id)}`,
    `/v1/tasks/${encodeURIComponent(id)}`,
  ];

  let lastError = "";
  for (const path of endpoints) {
    const { res, json } = await runwayFetch(path, { method: "GET" });
    if (!res.ok && (res.status === 404 || res.status === 405)) {
      lastError = s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`);
      continue;
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`), raw: json },
        { status: res.status },
      );
    }
    const out = normalizeRunwayPayload(json, model);
    return NextResponse.json({ ok: true, provider: "runway", endpoint: path, ...out });
  }

  return NextResponse.json({ ok: false, error: lastError || "Runway status endpoint not found." }, { status: 404 });
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
