import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";
import { STATE_ABBR_TO_NAME } from "@/lib/ghlState";
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

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
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

async function fetchJsonSafe(url: string) {
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
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

type OpportunityGeoSignals = {
  openCount: number;
  wonCount: number;
  lostCount: number;
  staleOpenOver7d: number;
  staleOpenOver14d: number;
  valueTotal: number;
  avgAgeDays: number;
  winRate: number;
};

function toDateMs(v: unknown) {
  const d = new Date(s(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : NaN;
}

function classifyOpportunityStatus(raw: unknown) {
  const st = norm(raw);
  if (!st) return "unknown" as const;
  if (/\bwon\b|\bclosed won\b|\bsucceeded\b|\bsuccess\b/.test(st)) return "won" as const;
  if (/\blost\b|\bclosed lost\b|\babandon\b|\bcancel\b|\bdead\b/.test(st)) return "lost" as const;
  if (/\bopen\b|\bnew\b|\bqualified\b|\bactive\b|\bpending\b/.test(st)) return "open" as const;
  return "other" as const;
}

function initOpportunitySignals(): OpportunityGeoSignals {
  return {
    openCount: 0,
    wonCount: 0,
    lostCount: 0,
    staleOpenOver7d: 0,
    staleOpenOver14d: 0,
    valueTotal: 0,
    avgAgeDays: 0,
    winRate: 0,
  };
}

function deriveOpportunityGeoSignals(
  rows: Array<Record<string, unknown>>,
  field: "state" | "county" | "city",
) {
  const nowMs = Date.now();
  const map = new Map<
    string,
    OpportunityGeoSignals & { _ageDaysTotal: number; _ageSamples: number }
  >();

  for (const row of rows) {
    const geoName = s(row[field]);
    if (!geoName) continue;
    const key = norm(geoName);
    if (!key) continue;

    const statusKind = classifyOpportunityStatus(row.status);
    const value = n(row.value);
    const updatedMs = toDateMs(row.updatedAt);
    const createdMs = toDateMs(row.createdAt);
    const baseMs = Number.isFinite(updatedMs) ? updatedMs : createdMs;
    const ageDays = Number.isFinite(baseMs) ? Math.max(0, (nowMs - baseMs) / (24 * 60 * 60 * 1000)) : 0;

    const agg = map.get(key) || { ...initOpportunitySignals(), _ageDaysTotal: 0, _ageSamples: 0 };
    if (statusKind === "open") {
      agg.openCount += 1;
      if (ageDays > 7) agg.staleOpenOver7d += 1;
      if (ageDays > 14) agg.staleOpenOver14d += 1;
    } else if (statusKind === "won") {
      agg.wonCount += 1;
    } else if (statusKind === "lost") {
      agg.lostCount += 1;
    }
    agg.valueTotal += value;
    if (ageDays > 0) {
      agg._ageDaysTotal += ageDays;
      agg._ageSamples += 1;
    }
    map.set(key, agg);
  }

  const out = new Map<string, OpportunityGeoSignals>();
  for (const [k, v] of map.entries()) {
    const resolvedTotal = v.openCount + v.wonCount + v.lostCount;
    out.set(k, {
      openCount: v.openCount,
      wonCount: v.wonCount,
      lostCount: v.lostCount,
      staleOpenOver7d: v.staleOpenOver7d,
      staleOpenOver14d: v.staleOpenOver14d,
      valueTotal: Math.round(v.valueTotal * 100) / 100,
      avgAgeDays: v._ageSamples > 0 ? Math.round((v._ageDaysTotal / v._ageSamples) * 10) / 10 : 0,
      winRate: resolvedTotal > 0 ? Math.round((v.wonCount / resolvedTotal) * 100) : 0,
    });
  }
  return out;
}

async function fetchCbpStateSignals() {
  const years = ["2022", "2021", "2020"];
  for (const year of years) {
    try {
      const url = `https://api.census.gov/data/${year}/cbp?get=ESTAB,STATE&for=state:*`;
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as unknown[] | null;
      if (!res.ok || !Array.isArray(json) || json.length < 2) continue;
      const rows = json as string[][];
      const header = rows[0] || [];
      const estabIdx = header.findIndex((x) => norm(x) === "estab");
      const stateIdx = header.findIndex((x) => norm(x) === "state");
      if (estabIdx < 0 || stateIdx < 0) continue;
      const out = new Map<string, number>();
      for (const row of rows.slice(1)) {
        const code = s(row[stateIdx]).toUpperCase();
        const estab = n(row[estabIdx]);
        const name = s((STATE_ABBR_TO_NAME as Record<string, string>)[code]);
        if (name && estab > 0) out.set(norm(name), estab);
      }
      if (out.size > 0) return out;
    } catch {
      // try next year
    }
  }
  return new Map<string, number>();
}

function rankGeo(
  rows: GeoRow[],
  lostBookings: number,
  impressions: number,
  options?: {
    cbpByState?: Map<string, number>;
    oppSignals?: Map<string, OpportunityGeoSignals>;
  },
) {
  const cbpByState = options?.cbpByState;
  const oppSignals = options?.oppSignals || new Map<string, OpportunityGeoSignals>();
  const lostBoost = Math.min(30, Math.round(lostBookings / 3));
  const impressionsBoost = Math.min(30, Math.round(Math.log10(Math.max(1, impressions)) * 8));
  const cbpMax = Math.max(1, ...(cbpByState ? Array.from(cbpByState.values()) : [0]));
  return rows
    .map((row) => {
      const opportunities = n(row.opportunities);
      const value = n(row.value);
      const cbpEstab = n(cbpByState?.get(norm(row.name)) || 0);
      const cbpBoost = cbpEstab > 0 ? Math.round((cbpEstab / cbpMax) * 18) : 0;
      const opp = oppSignals.get(norm(row.name)) || initOpportunitySignals();
      const openBoost = Math.min(24, opp.openCount * 2);
      const staleBoost = Math.min(20, opp.staleOpenOver7d * 3 + opp.staleOpenOver14d * 2);
      const valueBoost = Math.min(24, Math.round(opp.valueTotal / 800));
      const winRatePenalty = opp.winRate > 0 ? Math.round((opp.winRate / 100) * 10) : 0;
      const priorityScore = Math.round(
        opportunities * 5 +
          value / 150 +
          lostBoost +
          impressionsBoost +
          cbpBoost +
          openBoost +
          staleBoost +
          valueBoost -
          winRatePenalty,
      );
      return {
        ...row,
        opportunities,
        value,
        uniqueContacts: n(row.uniqueContacts),
        cbpEstablishments: cbpEstab,
        opportunityOpen: opp.openCount,
        opportunityWon: opp.wonCount,
        opportunityLost: opp.lostCount,
        opportunityStaleOver7d: opp.staleOpenOver7d,
        opportunityStaleOver14d: opp.staleOpenOver14d,
        opportunityValue: opp.valueTotal,
        opportunityWinRate: opp.winRate,
        opportunityAvgAgeDays: opp.avgAgeDays,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.opportunities - a.opportunities);
}

function deriveGeoFromLeads(leads: ProspectLead[], field: "state" | "county" | "city") {
  const grouped = new Map<string, { opportunities: number; value: number; contacts: Set<string> }>();
  for (const lead of leads) {
    const name = s(lead[field]);
    if (!name) continue;
    const key = norm(name);
    const contactKey = s(lead.email) || s(lead.phone) || s(lead.businessName) || lead.id;
    const row = grouped.get(key) || { opportunities: 0, value: 0, contacts: new Set<string>() };
    row.opportunities += 1;
    row.value += 120;
    if (contactKey) row.contacts.add(norm(contactKey));
    grouped.set(key, row);
  }
  return Array.from(grouped.entries()).map(([key, row]) => ({
    name: key
      .split(" ")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
      .join(" "),
    opportunities: row.opportunities,
    value: row.value,
    uniqueContacts: row.contacts.size,
  }));
}

function buildGeoPriorityMap(geoQueue: {
  states: Array<{ name: string; priorityScore: number }>;
  counties: Array<{ name: string; priorityScore: number }>;
  cities: Array<{ name: string; priorityScore: number }>;
}) {
  const stateMap = new Map<string, number>();
  const countyMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  for (const row of geoQueue.states || []) stateMap.set(norm(row.name), n(row.priorityScore));
  for (const row of geoQueue.counties || []) countyMap.set(norm(row.name), n(row.priorityScore));
  for (const row of geoQueue.cities || []) cityMap.set(norm(row.name), n(row.priorityScore));
  return { stateMap, countyMap, cityMap };
}

function computeLeadConvictionScore(args: {
  lead: ProspectLead;
  maxPriority: number;
  statePriority: number;
  countyPriority: number;
  cityPriority: number;
  businessCategory: string;
}) {
  const lead = args.lead;
  const geoPriority = Math.max(args.statePriority, args.countyPriority, args.cityPriority);
  const geoNorm = args.maxPriority > 0 ? clamp(geoPriority / args.maxPriority, 0, 1) : 0;
  const hasEmail = Boolean(s(lead.email));
  const hasPhone = Boolean(s(lead.phone));
  const hasWebsite = Boolean(s(lead.website));
  const validated = s(lead.status).toLowerCase() === "validated";
  const sameCategory =
    args.businessCategory &&
    norm(s(lead.category)).includes(norm(args.businessCategory));

  let score = 30;
  score += Math.round(geoNorm * 35);
  if (hasEmail) score += 12;
  if (hasPhone) score += 10;
  if (hasWebsite) score += 6;
  if (validated) score += 5;
  if (sameCategory) score += 2;

  const finalScore = clamp(score, 0, 100);
  const tier = finalScore >= 80 ? "hot" : finalScore >= 60 ? "warm" : "cold";
  const reasons: string[] = [];
  reasons.push(`Geo priority ${Math.round(geoNorm * 100)}%`);
  if (hasEmail) reasons.push("Has email");
  if (hasPhone) reasons.push("Has phone");
  if (hasWebsite) reasons.push("Has website");
  if (validated) reasons.push("Validated lead");
  if (sameCategory) reasons.push("Same category as tenant");

  return {
    convictionScore: finalScore,
    convictionTier: tier,
    convictionReasons: reasons,
  };
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

    const [overview, context, bootstrap, appointments, leadStore, cbpByState] = await Promise.all([
      fetchJsonSafe(`${origin}/api/dashboard/overview?${overviewQs.toString()}`),
      fetchJsonSafe(`${origin}/api/dashboard/campaign-factory/context?tenantId=${encodeURIComponent(tenantId)}`),
      fetchJsonSafe(`${origin}/api/tenants/${encodeURIComponent(tenantId)}/bootstrap`),
      fetchJsonSafe(
        `${origin}/api/dashboard/appointments?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}&preferSnapshot=1`,
      ),
      readLeadStore(tenantId),
      fetchCbpStateSignals(),
    ]);

    const customMap = (bootstrap?.customValues as JsonMap | undefined)?.map as JsonMap | undefined;
    const ctxBusiness = ((context?.context as JsonMap | undefined)?.business as JsonMap | undefined) || {};
    const landingServices = ((((context?.context as JsonMap | undefined)?.landingMap as JsonMap | undefined)?.services as unknown[]) || [])
      .map((x) => s((x as JsonMap | undefined)?.name))
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
    const appointmentsLost = n(((appointments?.lostBookings as JsonMap | undefined)?.total));
    const appointmentsLostValue = n(((appointments?.lostBookings as JsonMap | undefined)?.valueTotal));
    const topGeo = (overview?.topOpportunitiesGeo as JsonMap | undefined) || {};
    const opportunityRows = ((((appointments?.lostBookings as JsonMap | undefined)?.rows as unknown[]) || []) as Array<Record<string, unknown>>);
    const oppSignalsState = deriveOpportunityGeoSignals(opportunityRows, "state");
    const oppSignalsCounty = deriveOpportunityGeoSignals(opportunityRows, "county");
    const oppSignalsCity = deriveOpportunityGeoSignals(opportunityRows, "city");
    const fallbackStates = deriveGeoFromLeads(leadStore.leads, "state");
    const fallbackCounties = deriveGeoFromLeads(leadStore.leads, "county");
    const fallbackCities = deriveGeoFromLeads(leadStore.leads, "city");
    const topStates = (((topGeo.states as unknown[]) || []) as GeoRow[]).slice(0, 50);
    const topCounties = (((topGeo.counties as unknown[]) || []) as GeoRow[]).slice(0, 50);
    const topCities = (((topGeo.cities as unknown[]) || []) as GeoRow[]).slice(0, 50);
    const lostForRank = appointmentsLost || n(executive.appointmentsLostNow);
    const states = rankGeo((topStates.length ? topStates : fallbackStates).slice(0, 50), lostForRank, n(executive.searchImpressionsNow), {
      cbpByState,
      oppSignals: oppSignalsState,
    });
    const counties = rankGeo((topCounties.length ? topCounties : fallbackCounties).slice(0, 50), lostForRank, n(executive.searchImpressionsNow), {
      oppSignals: oppSignalsCounty,
    });
    const cities = rankGeo((topCities.length ? topCities : fallbackCities).slice(0, 50), lostForRank, n(executive.searchImpressionsNow), {
      oppSignals: oppSignalsCity,
    });

    const leadsRaw = [...leadStore.leads].sort((a, b) => s(b.updatedAt).localeCompare(s(a.updatedAt)));
    const leadsWithEmail = leadsRaw.filter((x) => Boolean(s(x.email))).length;
    const leadsWithPhone = leadsRaw.filter((x) => Boolean(s(x.phone))).length;
    const contactable = leadsRaw.filter((x) => Boolean(s(x.email) || s(x.phone))).length;
    const byStatus = leadsRaw.reduce<Record<string, number>>((acc, row) => {
      const key = s(row.status) || "new";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const maxPriority = Math.max(
      1,
      ...states.map((x) => n(x.priorityScore)),
      ...counties.map((x) => n(x.priorityScore)),
      ...cities.map((x) => n(x.priorityScore)),
    );
    const geoPriorityMap = buildGeoPriorityMap({ states, counties, cities });
    const leads = leadsRaw
      .map((lead) => {
        const scoring = computeLeadConvictionScore({
          lead,
          maxPriority,
          statePriority: n(geoPriorityMap.stateMap.get(norm(lead.state)) || 0),
          countyPriority: n(geoPriorityMap.countyMap.get(norm(lead.county)) || 0),
          cityPriority: n(geoPriorityMap.cityMap.get(norm(lead.city)) || 0),
          businessCategory: profile.businessCategory,
        });
        return {
          ...lead,
          ...scoring,
        };
      })
      .sort((a, b) => b.convictionScore - a.convictionScore || s(b.updatedAt).localeCompare(s(a.updatedAt)));

    const servicesList = parseServices(profile.servicesOffered);

    return Response.json({
      ok: true,
      tenantId,
      range,
      opportunitySignals: {
        lostBookings: lostForRank,
        lostBookingValue: appointmentsLostValue || n(executive.appointmentsLostValueNow),
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
