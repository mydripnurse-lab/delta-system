import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";
import {
  readLeadStore,
  writeLeadStore,
  reviewLead,
  markLeadNotificationsSeen,
  type ProspectLead,
} from "@/lib/prospectingStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function norm(v: unknown) {
  return s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asPreset(v: unknown): DashboardRangePreset {
  const x = s(v) as DashboardRangePreset;
  const allowed: DashboardRangePreset[] = ["today", "24h", "1d", "7d", "28d", "1m", "3m", "6m", "1y", "custom"];
  return allowed.includes(x) ? x : "28d";
}

function parseServices(raw: string) {
  return raw
    .split(/[,\n|;]/g)
    .map((x) => s(x))
    .filter(Boolean);
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) {
    throw new Error(s(json?.error) || `HTTP ${res.status}`);
  }
  return json || {};
}

function pickCustom(customMap: JsonMap, keys: string[]) {
  for (const k of keys) {
    const exact = s(customMap[k]);
    if (exact) return exact;
    const lower = Object.keys(customMap).find((ck) => norm(ck).endsWith(norm(k)));
    if (lower) {
      const hit = s(customMap[lower]);
      if (hit) return hit;
    }
  }
  return "";
}

type GeoRow = {
  name: string;
  opportunities: number;
  value: number;
  uniqueContacts: number;
};

function rankGeo(rows: GeoRow[], lostBookings: number, impressions: number) {
  const lostBoost = Math.min(30, Math.round(lostBookings / 3));
  const impressionsBoost = Math.min(30, Math.round(Math.log10(Math.max(1, impressions)) * 8));
  return rows
    .map((row) => {
      const opportunities = n(row.opportunities);
      const value = n(row.value);
      const priorityScore = Math.round(opportunities * 5 + value / 150 + lostBoost + impressionsBoost);
      return {
        ...row,
        opportunities,
        value,
        uniqueContacts: n(row.uniqueContacts),
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.opportunities - a.opportunities);
}

function requiredProfileFields(profile: {
  businessCategory: string;
  servicesOffered: string;
  targetGeoScope: string;
  targetIndustries: string;
}) {
  const missing: string[] = [];
  if (!profile.businessCategory) missing.push("business_category");
  if (!profile.servicesOffered) missing.push("services_offered");
  if (!profile.targetGeoScope) missing.push("target_geo_scope");
  if (!profile.targetIndustries) missing.push("target_industries");
  return missing;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = s(url.searchParams.get("tenantId"));
    if (!tenantId) {
      return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    const integrationKey = s(url.searchParams.get("integrationKey")) || "owner";
    const preset = asPreset(url.searchParams.get("preset"));
    const customStart = s(url.searchParams.get("customStart"));
    const customEnd = s(url.searchParams.get("customEnd"));
    const directStart = s(url.searchParams.get("start"));
    const directEnd = s(url.searchParams.get("end"));
    const range = directStart && directEnd ? { start: directStart, end: directEnd } : computeDashboardRange(preset, customStart, customEnd);

    if (!range.start || !range.end) {
      return Response.json({ ok: false, error: "Missing range start/end" }, { status: 400 });
    }

    const origin = url.origin;
    const overviewQs = new URLSearchParams({
      tenantId,
      integrationKey,
      start: range.start,
      end: range.end,
    });

    const [overview, context, bootstrap, leadStore] = await Promise.all([
      fetchJson(`${origin}/api/dashboard/overview?${overviewQs.toString()}`),
      fetchJson(`${origin}/api/dashboard/campaign-factory/context?tenantId=${encodeURIComponent(tenantId)}`),
      fetchJson(`${origin}/api/tenants/${encodeURIComponent(tenantId)}/bootstrap`),
      readLeadStore(tenantId),
    ]);

    const customMap = (bootstrap?.customValues as JsonMap | undefined)?.map as JsonMap | undefined;
    const ctxBusiness = ((context?.context as JsonMap | undefined)?.business as JsonMap | undefined) || {};
    const landingServices = ((((context?.context as JsonMap | undefined)?.landingMap as JsonMap | undefined)?.services as unknown[]) || [])
      .map((x: any) => s(x?.name))
      .filter(Boolean);
    const servicesFromMap = pickCustom(customMap || {}, [
      "ghl.module.custom_values.services_offered",
      "services_offered",
      "service_list",
    ]);
    const profile = {
      businessName: s(ctxBusiness.businessName) || "My Drip Nurse",
      businessCategory:
        pickCustom(customMap || {}, ["ghl.module.custom_values.business_category", "business_category"]) ||
        s(ctxBusiness.industry),
      servicesOffered: servicesFromMap || landingServices.join(", "),
      targetGeoScope:
        pickCustom(customMap || {}, ["ghl.module.custom_values.target_geo_scope", "target_geo_scope"]) ||
        "USA and Puerto Rico",
      targetIndustries:
        pickCustom(customMap || {}, ["ghl.module.custom_values.target_industries", "target_industries"]) ||
        "Healthcare, Wellness, Medical Spas, Mobile Services",
      idealCustomerProfile: pickCustom(customMap || {}, ["ghl.module.custom_values.ideal_customer_profile", "ideal_customer_profile"]),
      highImpressionLowBookingServices: pickCustom(customMap || {}, [
        "ghl.module.custom_values.high_impression_low_booking_services",
        "high_impression_low_booking_services",
      ]),
      lostBookingReasons: pickCustom(customMap || {}, ["ghl.module.custom_values.lost_booking_reasons", "lost_booking_reasons"]),
      prospectingAutoEnabled: ["1", "true", "yes", "on", "active"].includes(
        s(
          pickCustom(customMap || {}, [
            "ghl.module.custom_values.prospecting_auto_enabled",
            "prospecting_auto_enabled",
          ]),
        ).toLowerCase(),
      ),
    };

    const executive = (overview?.executive as JsonMap | undefined) || {};
    const topGeo = (overview?.topOpportunitiesGeo as JsonMap | undefined) || {};
    const states = rankGeo((((topGeo.states as unknown[]) || []) as GeoRow[]).slice(0, 50), n(executive.appointmentsLostNow), n(executive.searchImpressionsNow));
    const counties = rankGeo((((topGeo.counties as unknown[]) || []) as GeoRow[]).slice(0, 50), n(executive.appointmentsLostNow), n(executive.searchImpressionsNow));
    const cities = rankGeo((((topGeo.cities as unknown[]) || []) as GeoRow[]).slice(0, 50), n(executive.appointmentsLostNow), n(executive.searchImpressionsNow));

    const leads = [...leadStore.leads].sort((a, b) => s(b.updatedAt).localeCompare(s(a.updatedAt)));
    const leadsWithEmail = leads.filter((x) => Boolean(s(x.email))).length;
    const leadsWithPhone = leads.filter((x) => Boolean(s(x.phone))).length;
    const contactable = leads.filter((x) => Boolean(s(x.email) || s(x.phone))).length;
    const byStatus = leads.reduce<Record<string, number>>((acc, row) => {
      const key = s(row.status) || "new";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const servicesList = parseServices(profile.servicesOffered);

    return Response.json({
      ok: true,
      tenantId,
      range,
      opportunitySignals: {
        lostBookings: n(executive.appointmentsLostNow),
        lostBookingValue: n(executive.appointmentsLostValueNow),
        impressions: n(executive.searchImpressionsNow),
        clicks: n(executive.searchClicksNow),
        leadVolume: n(executive.leadsNow),
      },
      businessProfile: {
        ...profile,
        servicesList,
        missingFields: requiredProfileFields(profile),
      },
      customFieldPlan: [
        { key: "business_category", label: "Business Category" },
        { key: "services_offered", label: "Services Offered" },
        { key: "target_geo_scope", label: "Target Geo Scope" },
        { key: "target_industries", label: "Target Industries" },
        { key: "ideal_customer_profile", label: "Ideal Customer Profile" },
        { key: "high_impression_low_booking_services", label: "High Impression / Low Booking Services" },
        { key: "lost_booking_reasons", label: "Lost Booking Reasons" },
        { key: "prospecting_auto_enabled", label: "Prospecting Auto Enabled" },
      ],
      geoQueue: {
        states,
        counties,
        cities,
      },
      leadPool: {
        summary: {
          total: leads.length,
          withEmail: leadsWithEmail,
          withPhone: leadsWithPhone,
          contactable,
          byStatus,
          updatedAt: leadStore.updatedAt,
        },
        rows: leads,
      },
      notifications: {
        pendingApproval: leads.filter((x) => s(x.reviewStatus || "pending") === "pending").length,
        unseen: leads.filter((x) => s(x.notificationCreatedAt) && !s(x.notificationSeenAt)).length,
        latest: leads
          .filter((x) => s(x.notificationCreatedAt))
          .slice(0, 12)
          .map((x) => ({
            leadId: x.id,
            businessName: x.businessName,
            state: x.state,
            county: x.county,
            city: x.city,
            reviewStatus: x.reviewStatus || "pending",
            createdAt: x.notificationCreatedAt || x.createdAt,
            seen: Boolean(s(x.notificationSeenAt)),
          })),
      },
      complianceChecklist: [
        "Respect each source terms of service and robots.txt.",
        "Store source_url and collected_at for every lead.",
        "Use opt-out and sender identification in outbound email campaigns (CAN-SPAM).",
      ],
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load prospecting dashboard" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const tenantId = s(body?.tenantId);
    if (!tenantId) {
      return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    const action = s(body?.action) || "upsertLead";
    const store = await readLeadStore(tenantId);
    const now = new Date().toISOString();

    if (action === "upsertLead") {
      const raw = (body?.lead as JsonMap | undefined) || {};
      const leadId = s(raw.id) || `lead_${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
      const next: ProspectLead = {
        id: leadId,
        businessName: s(raw.businessName),
        website: s(raw.website),
        email: s(raw.email),
        phone: s(raw.phone),
        category: s(raw.category),
        services: s(raw.services),
        state: s(raw.state),
        county: s(raw.county),
        city: s(raw.city),
        source: s(raw.source) || "manual",
        status: (s(raw.status) as ProspectLead["status"]) || "new",
        notes: s(raw.notes),
        createdAt: s(raw.createdAt) || now,
        updatedAt: now,
      };

      if (!next.businessName) {
        return Response.json({ ok: false, error: "Lead requires businessName" }, { status: 400 });
      }

      const idx = store.leads.findIndex((x) => x.id === next.id);
      if (idx >= 0) {
        const prev = store.leads[idx];
        store.leads[idx] = {
          ...prev,
          ...next,
          createdAt: prev.createdAt || next.createdAt,
          webhookSentAt: prev.webhookSentAt || "",
          webhookAttempts: Number(prev.webhookAttempts || 0) || 0,
          webhookLastError: prev.webhookLastError || "",
        };
      }
      else store.leads.push(next);

      store.updatedAt = now;
      await writeLeadStore(tenantId, store);
      return Response.json({ ok: true, lead: next, total: store.leads.length });
    }

    if (action === "deleteLead") {
      const leadId = s(body?.leadId);
      if (!leadId) {
        return Response.json({ ok: false, error: "Missing leadId" }, { status: 400 });
      }
      const before = store.leads.length;
      store.leads = store.leads.filter((x) => x.id !== leadId);
      store.updatedAt = now;
      await writeLeadStore(tenantId, store);
      return Response.json({ ok: true, deleted: before - store.leads.length, total: store.leads.length });
    }

    if (action === "reviewLead") {
      const leadId = s(body?.leadId);
      const decisionRaw = s(body?.decision).toLowerCase();
      const decision =
        decisionRaw === "approved" || decisionRaw === "rejected" || decisionRaw === "pending"
          ? (decisionRaw as "approved" | "rejected" | "pending")
          : null;
      if (!leadId || !decision) {
        return Response.json({ ok: false, error: "leadId and decision are required" }, { status: 400 });
      }
      await reviewLead(tenantId, leadId, decision, s(body?.reviewedBy));
      return Response.json({ ok: true, leadId, decision });
    }

    if (action === "markNotificationsSeen") {
      const leadIds = Array.isArray(body?.leadIds) ? (body?.leadIds as unknown[]).map((x) => s(x)).filter(Boolean) : [];
      if (!leadIds.length) {
        return Response.json({ ok: false, error: "leadIds is required" }, { status: 400 });
      }
      await markLeadNotificationsSeen(tenantId, leadIds);
      return Response.json({ ok: true, seen: leadIds.length });
    }

    return Response.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save prospecting data" },
      { status: 500 },
    );
  }
}
