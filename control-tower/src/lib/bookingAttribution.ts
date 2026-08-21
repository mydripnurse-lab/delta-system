import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export const ATTRIBUTION_EVENT_TYPES = [
  "page_view",
  "service_view",
  "booking_started",
  "availability_searched",
  "slot_selected",
  "checkout_started",
  "payment_completed",
] as const;

export type AttributionEventType = (typeof ATTRIBUTION_EVENT_TYPES)[number];

export type BookingAttributionContext = {
  eventId: string;
  sessionId: string;
  visitorId: string;
  pageUrl: string;
  referrer?: string;
  eventType: AttributionEventType;
  source?: string;
  channel?: string;
  campaign?: string;
  serviceSlug?: string;
  partnerProfileId?: string;
  attribution?: Record<string, string>;
  occurredAt?: string;
};

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    const allowed = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ref", "source", "partner", "partnerId", "directoryPartnerId"]);
    [...url.searchParams.keys()].forEach((key) => { if (!allowed.has(key)) url.searchParams.delete(key); });
    url.hash = "";
    return url.toString().slice(0, 2000);
  } catch {
    return "";
  }
}

function hostname(value: string) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function deriveSource(input: BookingAttributionContext) {
  const attribution = input.attribution || {};
  if (text(input.source, 120)) return text(input.source, 120).toLowerCase();
  if (text(attribution.utm_source, 120)) return text(attribution.utm_source, 120).toLowerCase();
  if (attribution.gclid) return "google";
  if (attribution.fbclid) return "meta";
  const referrerHost = hostname(safeUrl(input.referrer));
  if (referrerHost) return referrerHost;
  return "direct";
}

function deriveChannel(input: BookingAttributionContext, source: string) {
  const attribution = input.attribution || {};
  if (text(input.channel, 120)) return text(input.channel, 120).toLowerCase();
  const medium = text(attribution.utm_medium, 120).toLowerCase();
  if (medium) return medium;
  if (attribution.gclid) return "paid_search";
  if (attribution.fbclid) return "paid_social";
  if (attribution.ref === "directory" || attribution.source === "partner_directory") return "partner_directory";
  if (source === "direct") return "direct";
  if (source.includes("google.") || source === "google") return "organic_search";
  return "referral";
}

export async function recordBookingAttributionTouchpoint(input: BookingAttributionContext) {
  await ensureBookingEngineSchema();
  const pageUrl = safeUrl(input.pageUrl);
  const referrer = safeUrl(input.referrer);
  const source = deriveSource(input);
  const channel = deriveChannel(input, source);
  const campaign = text(input.campaign || input.attribution?.utm_campaign, 200);
  const eventId = text(input.eventId, 160);
  const sessionId = text(input.sessionId, 160);
  const visitorId = text(input.visitorId, 160);
  if (!eventId || !sessionId || !visitorId || !pageUrl) throw new Error("Attribution context is incomplete.");
  const occurredAt = input.occurredAt && Number.isFinite(Date.parse(input.occurredAt)) ? input.occurredAt : new Date().toISOString();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into app.booking_attribution_sessions (
         session_id, visitor_id, first_url, first_referrer, first_source, first_channel, first_campaign,
         last_url, last_referrer, last_source, last_channel, last_campaign, first_touched_at, last_touched_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$3,$4,$5,$6,$7,$8::timestamptz,$8::timestamptz)
       on conflict (session_id) do nothing`,
      [sessionId, visitorId, pageUrl, referrer, source, channel, campaign, occurredAt],
    );
    const inserted = await client.query<{ id: string }>(
      `insert into app.booking_attribution_touchpoints (
         event_id, session_id, visitor_id, event_type, page_url, referrer, source, channel,
         campaign, service_slug, partner_profile_id, metadata, occurred_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::timestamptz)
       on conflict (event_id) do nothing
       returning id::text`,
      [eventId, sessionId, visitorId, input.eventType, pageUrl, referrer, source, channel, campaign, text(input.serviceSlug, 160), text(input.partnerProfileId, 160), JSON.stringify(input.attribution || {}), occurredAt],
    );
    if (inserted.rows[0]) {
      await client.query(
        `update app.booking_attribution_sessions
            set last_url = $2, last_referrer = $3, last_source = $4, last_channel = $5,
                last_campaign = $6, last_touched_at = $7::timestamptz,
                touch_count = touch_count + 1, updated_at = now()
          where session_id = $1`,
        [sessionId, pageUrl, referrer, source, channel, campaign, occurredAt],
      );
    }
    await client.query("commit");
    return { recorded: Boolean(inserted.rows[0]), source, channel, campaign };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function attributionSessionSummary(sessionId: string) {
  const id = text(sessionId, 160);
  if (!id) return null;
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    session_id: string; visitor_id: string; first_url: string; first_referrer: string; first_source: string; first_channel: string; first_campaign: string;
    last_url: string; last_referrer: string; last_source: string; last_channel: string; last_campaign: string; touch_count: number;
  }>(`select session_id, visitor_id, first_url, first_referrer, first_source, first_channel, first_campaign,
             last_url, last_referrer, last_source, last_channel, last_campaign, touch_count
        from app.booking_attribution_sessions where session_id = $1 limit 1`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    visitorId: row.visitor_id,
    firstTouch: { url: row.first_url, referrer: row.first_referrer, source: row.first_source, channel: row.first_channel, campaign: row.first_campaign },
    lastTouch: { url: row.last_url, referrer: row.last_referrer, source: row.last_source, channel: row.last_channel, campaign: row.last_campaign },
    touchCount: Number(row.touch_count || 0),
  };
}
