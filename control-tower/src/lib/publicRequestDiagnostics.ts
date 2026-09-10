type HeaderReader = Pick<Headers, "get">;

type DiagnosticDetails = Record<string, string | number | boolean | null | undefined>;

const DEFAULT_SAMPLE_RATE = 0.01;

function boundedRate(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_SAMPLE_RATE;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function sampled(headers: HeaderReader) {
  const rate = boundedRate(process.env.PUBLIC_DIAGNOSTIC_SAMPLE_RATE);
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const requestId = headers.get("x-vercel-id") || headers.get("x-request-id") || "";
  return requestId ? hash(requestId) / 0xffffffff < rate : Math.random() < rate;
}

function referrerParts(value: string | null) {
  if (!value) return { referrerHost: "", referrerPath: "" };
  try {
    const url = new URL(value);
    return { referrerHost: url.hostname.toLowerCase(), referrerPath: url.pathname };
  } catch {
    return { referrerHost: "invalid", referrerPath: "" };
  }
}

function userAgentDetails(value: string | null) {
  const userAgent = value || "";
  const signatures: Array<[RegExp, string]> = [
    [/Googlebot/i, "Googlebot"],
    [/Google-InspectionTool/i, "Google Inspection Tool"],
    [/AdsBot-Google/i, "Google AdsBot"],
    [/bingbot|BingPreview/i, "Bingbot"],
    [/HeadlessChrome/i, "Headless Chrome"],
    [/Lighthouse/i, "Lighthouse"],
    [/facebookexternalhit|Facebot/i, "Meta crawler"],
    [/Twitterbot/i, "Twitterbot"],
    [/bot|crawler|spider|slurp|preview/i, "Other crawler"],
    [/Edg\//i, "Edge"],
    [/Chrome\//i, "Chrome"],
    [/Safari\//i, "Safari"],
    [/Firefox\//i, "Firefox"],
  ];
  const match = signatures.find(([pattern]) => pattern.test(userAgent));
  const agent = match?.[1] || "Other";
  return {
    agent,
    likelyBot: /bot|crawler|spider|inspection|headless|lighthouse/i.test(agent),
  };
}

export function logPublicRequestDiagnostic(headers: HeaderReader, route: string, details: DiagnosticDetails = {}) {
  if (process.env.VERCEL_ENV !== "production" || !sampled(headers)) return;
  const referrer = referrerParts(headers.get("referer"));
  const userAgent = userAgentDetails(headers.get("user-agent"));
  console.log(JSON.stringify({
    level: "info",
    message: "public_request_diagnostic",
    route,
    requestId: headers.get("x-vercel-id") || headers.get("x-request-id") || "",
    host: (headers.get("x-forwarded-host") || headers.get("host") || "").toLowerCase(),
    ...referrer,
    ...userAgent,
    country: headers.get("x-vercel-ip-country") || "",
    region: headers.get("x-vercel-ip-country-region") || "",
    city: headers.get("x-vercel-ip-city") || "",
    deploymentRegion: (headers.get("x-vercel-id") || "").split("::")[0],
    ...details,
  }));
}
