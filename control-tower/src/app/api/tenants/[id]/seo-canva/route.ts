import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";
import { loadTenantProductsServices } from "@/lib/tenantProductsServices";
import { googleAdsGenerateKeywordIdeas } from "@/lib/ads/adsRest";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type AwarenessStage =
  | "unaware"
  | "problem_aware"
  | "solution_aware"
  | "product_aware"
  | "most_aware";

type IndustryProfile = "healthcare" | "legal" | "home_services" | "saas" | "ecommerce" | "generic";
type UrlFormat =
  | "service_page"
  | "location_page"
  | "pricing_page"
  | "comparison_page"
  | "faq_page"
  | "how_to_page"
  | "template_page"
  | "alternatives_page"
  | "insights_page";

type UrlStrategyRow = {
  url: string;
  format: UrlFormat;
  traffic: number;
  value: number;
  keywords: number;
  topKeyword: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function norm(v: string) {
  return s(v).toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = s(value);
    const key = norm(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function ensureHttp(urlOrHost: string) {
  const raw = s(urlOrHost);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function kebab(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function buildHowToSlug(keyword: string) {
  const k = norm(keyword)
    .replace(/^how to\s+/i, "")
    .replace(/^how-to\s+/i, "");
  const slug = kebab(k);
  return slug ? `how-to-${slug}` : "how-to-guide";
}

function parseIndustryProfile(v: unknown): IndustryProfile {
  const x = s(v).toLowerCase();
  if (x === "healthcare" || x === "legal" || x === "home_services" || x === "saas" || x === "ecommerce") {
    return x;
  }
  return "generic";
}

function profileFormatWeights(profile: IndustryProfile): Record<UrlFormat, number> {
  if (profile === "healthcare") {
    return {
      service_page: 0.31,
      location_page: 0.2,
      pricing_page: 0.14,
      comparison_page: 0.08,
      faq_page: 0.12,
      how_to_page: 0.07,
      template_page: 0.0,
      alternatives_page: 0.03,
      insights_page: 0.05,
    };
  }
  if (profile === "legal") {
    return {
      service_page: 0.29,
      location_page: 0.2,
      pricing_page: 0.08,
      comparison_page: 0.14,
      faq_page: 0.12,
      how_to_page: 0.04,
      template_page: 0.02,
      alternatives_page: 0.06,
      insights_page: 0.05,
    };
  }
  if (profile === "home_services") {
    return {
      service_page: 0.3,
      location_page: 0.25,
      pricing_page: 0.1,
      comparison_page: 0.08,
      faq_page: 0.09,
      how_to_page: 0.05,
      template_page: 0.0,
      alternatives_page: 0.04,
      insights_page: 0.09,
    };
  }
  if (profile === "saas") {
    return {
      service_page: 0.16,
      location_page: 0.02,
      pricing_page: 0.14,
      comparison_page: 0.16,
      faq_page: 0.1,
      how_to_page: 0.15,
      template_page: 0.12,
      alternatives_page: 0.1,
      insights_page: 0.05,
    };
  }
  if (profile === "ecommerce") {
    return {
      service_page: 0.23,
      location_page: 0.03,
      pricing_page: 0.16,
      comparison_page: 0.14,
      faq_page: 0.09,
      how_to_page: 0.08,
      template_page: 0.1,
      alternatives_page: 0.11,
      insights_page: 0.06,
    };
  }
  return {
    service_page: 0.24,
    location_page: 0.12,
    pricing_page: 0.12,
    comparison_page: 0.12,
    faq_page: 0.12,
    how_to_page: 0.1,
    template_page: 0.06,
    alternatives_page: 0.06,
    insights_page: 0.06,
  };
}

function chooseUrlFormat(input: {
  keyword: string;
  stage: AwarenessStage;
  profile: IndustryProfile;
}): UrlFormat {
  const k = norm(input.keyword);
  const has = (parts: string[]) => parts.some((part) => k.includes(part));

  if (has(["near me", " in ", " city ", " county ", " location"])) return "location_page";
  if (has(["price", "pricing", "cost", "quote"])) return "pricing_page";
  if (has(["vs", "versus", "compare", "comparison"])) return "comparison_page";
  if (has(["alternative", "alternatives"])) return "alternatives_page";
  if (has(["faq", "faqs", "questions"])) return "faq_page";
  if (has(["template", "templates"])) return "template_page";
  if (has(["how to", "guide", "checklist"])) return "how_to_page";

  if (input.stage === "most_aware") return "service_page";
  if (input.stage === "product_aware") return "comparison_page";
  if (input.stage === "solution_aware") {
    const weights = profileFormatWeights(input.profile);
    if (weights.template_page >= 0.1) return "template_page";
    if (weights.how_to_page >= 0.08) return "how_to_page";
    return "service_page";
  }
  if (input.stage === "problem_aware") return "faq_page";
  if (input.profile === "saas" && has(["api", "integration", "automation"])) return "template_page";
  return "insights_page";
}

function buildUrlPath(input: {
  format: UrlFormat;
  keyword: string;
  serviceId: string;
}) {
  const keySlug = kebab(input.keyword);
  const serviceSlug = kebab(input.serviceId);
  if (input.format === "location_page") return `/locations/${keySlug || serviceSlug}/`;
  if (input.format === "pricing_page") return `/pricing/${serviceSlug || keySlug}/`;
  if (input.format === "comparison_page") return `/compare/${keySlug || serviceSlug}/`;
  if (input.format === "faq_page") return `/faq/${keySlug || serviceSlug}/`;
  if (input.format === "how_to_page") return `/learn/${buildHowToSlug(input.keyword)}/`;
  if (input.format === "template_page") return `/templates/${keySlug || serviceSlug}/`;
  if (input.format === "alternatives_page") return `/alternatives/${keySlug || serviceSlug}/`;
  if (input.format === "insights_page") return `/insights/${keySlug || serviceSlug}/`;
  return `/services/${serviceSlug || keySlug}/`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleFromStage(stage: AwarenessStage) {
  if (stage === "problem_aware") return "Problem Aware";
  if (stage === "solution_aware") return "Solution Aware";
  if (stage === "product_aware") return "Product Aware";
  if (stage === "most_aware") return "Most Aware";
  return "Unaware";
}

function classifyAwareness(keyword: string, brandHints: string[]) {
  const k = norm(keyword);
  const has = (parts: string[]) => parts.some((part) => k.includes(part));
  const hasBrand = brandHints.some((hint) => hint && k.includes(hint));

  if (
    hasBrand ||
    has([
      "book",
      "booking",
      "appointment",
      "schedule",
      "near me",
      "pricing",
      "price",
      "cost",
      "quote",
      "buy",
      "order",
      "contact",
    ])
  ) {
    return "most_aware" as const;
  }

  if (
    has([
      "vs ",
      " vs",
      "alternative",
      "alternatives",
      "compare",
      "comparison",
      "best ",
      " top ",
      "reviews",
      "review",
      "faq",
      "faqs",
    ])
  ) {
    return "product_aware" as const;
  }

  if (
    has([
      "how to",
      "guide",
      "checklist",
      "template",
      "templates",
      "tools",
      "examples",
      "benefits",
      "treatment",
      "therapy",
      "service",
      "services",
      "clinic",
      "doctor",
    ])
  ) {
    return "solution_aware" as const;
  }

  if (
    has([
      "symptom",
      "symptoms",
      "pain",
      "problem",
      "trigger",
      "cause",
      "causes",
      "why",
      "risk",
      "issue",
      "issues",
      "suffering",
    ])
  ) {
    return "problem_aware" as const;
  }

  return "unaware" as const;
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query("select 1 from app.organizations where id = $1::uuid limit 1", [tenantId]);
  return Boolean(q.rows[0]);
}

async function loadRootDomain(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ root_domain: string | null }>(
    "select root_domain from app.organization_settings where organization_id = $1::uuid limit 1",
    [tenantId],
  );
  return ensureHttp(s(q.rows[0]?.root_domain || ""));
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const integrationKey = s(searchParams.get("integrationKey")) || "default";
    const industryProfile = parseIndustryProfile(searchParams.get("industryProfile"));
    const businessCategory = s(searchParams.get("businessCategory"));
    const languageConstant = s(searchParams.get("languageConstant")) || "languageConstants/1000";
    const geoTargetRaw = s(searchParams.get("geoTargetConstant")) || "geoTargetConstants/2840";
    const geoTargetConstants = dedupeStrings(
      geoTargetRaw
        .split(",")
        .map((x) => s(x))
        .filter(Boolean),
    );

    const rootDomainFromQuery = ensureHttp(s(searchParams.get("rootDomain")));
    const [loaded, rootDomainFromDb] = await Promise.all([
      loadTenantProductsServices(tenantId),
      loadRootDomain(tenantId),
    ]);
    const rootDomain = rootDomainFromQuery || rootDomainFromDb;
    const services = (loaded.services || [])
      .map((svc) => ({
        serviceId: s(svc.id),
        name: s(svc.name),
        description: s(svc.description),
        landingPath: s(svc.landingPath),
      }))
      .filter((svc) => svc.serviceId && svc.name && svc.landingPath);

    if (!services.length) {
      return NextResponse.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        rootDomain,
        industryProfile,
        businessCategory,
        services: [],
        boardSummary: [],
        urlStrategyRows: [],
        formatMix: [],
        planner: {
          ok: true,
          source: loaded.source,
          totalIdeas: 0,
          mappedIdeas: 0,
          services: 0,
          errors: [],
        },
      });
    }

    const brandHints = dedupeStrings([
      "my drip nurse",
      "drip nurse",
      ...services.slice(0, 12).map((x) => x.name.split(" ").slice(0, 2).join(" ")),
    ]).map((x) => norm(x));

    const serviceResults: Array<{
      serviceId: string;
      name: string;
      landingPath: string;
      seeds: string[];
      ideas: Array<{
        keyword: string;
        stage: AwarenessStage;
        stageLabel: string;
        avgMonthlySearches: number;
        competition: string;
        competitionIndex: number;
        lowTopBid: number;
        highTopBid: number;
      }>;
      board: Array<{
        stage: AwarenessStage;
        stageLabel: string;
        count: number;
        topKeywords: Array<{
          keyword: string;
          stage: AwarenessStage;
          stageLabel: string;
          avgMonthlySearches: number;
          competition: string;
          competitionIndex: number;
          lowTopBid: number;
          highTopBid: number;
        }>;
      }>;
      urlStrategyRows: UrlStrategyRow[];
      howToUrls: UrlStrategyRow[];
      error: string;
    }> = [];

    for (let idx = 0; idx < services.length; idx += 1) {
      const svc = services[idx];
      const serviceName = s(svc.name);
      const base = serviceName
        .replace(/\bmobile\b/gi, "")
        .replace(/\btherapy\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const seeds = dedupeStrings([
        serviceName,
        base,
        `${base} near me`,
        `${base} cost`,
        `${base} benefits`,
      ]).slice(0, 5);

      if (!seeds.length) {
        serviceResults.push({
          serviceId: svc.serviceId,
          name: svc.name,
          landingPath: svc.landingPath,
          seeds: [],
          ideas: [],
          board: [],
          urlStrategyRows: [],
          howToUrls: [],
          error: "No valid seeds for this service.",
        });
        continue;
      }

      try {
        const planner = await googleAdsGenerateKeywordIdeas({
          tenantId,
          integrationKey,
          keywords: seeds,
          languageConstant,
          geoTargetConstants: geoTargetConstants.length ? geoTargetConstants : ["geoTargetConstants/2840"],
          pageSize: 120,
        });

        const ideas = (planner.results || [])
          .map((idea) => {
            const keyword = s(idea.text);
            const stage = classifyAwareness(keyword, brandHints);
            return {
              keyword,
              stage,
              stageLabel: titleFromStage(stage),
              avgMonthlySearches: n(idea.avgMonthlySearches),
              competition: s(idea.competition),
              competitionIndex: n(idea.competitionIndex),
              lowTopBid: n(idea.lowTopOfPageBidMicros) / 1_000_000,
              highTopBid: n(idea.highTopOfPageBidMicros) / 1_000_000,
            };
          })
          .filter((row) => row.keyword)
          .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches || b.competitionIndex - a.competitionIndex)
          .slice(0, 80);

        const board = ([
          "unaware",
          "problem_aware",
          "solution_aware",
          "product_aware",
          "most_aware",
        ] as AwarenessStage[]).map((stage) => {
          const rows = ideas.filter((idea) => idea.stage === stage);
          return {
            stage,
            stageLabel: titleFromStage(stage),
            count: rows.length,
            topKeywords: rows.slice(0, 10),
          };
        });

        const strategyRows = ideas
          .slice(0, 30)
          .map((row) => {
            const format = chooseUrlFormat({
              keyword: row.keyword,
              stage: row.stage,
              profile: industryProfile,
            });
            const urlPath = buildUrlPath({
              format,
              keyword: row.keyword,
              serviceId: svc.serviceId,
            });
            const traffic = Math.max(0, Math.round(row.avgMonthlySearches * 0.22));
            const bidMid = (row.lowTopBid + row.highTopBid) / 2;
            const value = Math.max(0, Math.round(traffic * Math.max(0.2, bidMid)));
            const keywords = Math.max(1, Math.round((row.competitionIndex || 0) / 12) + 1);
            return {
              url: `${rootDomain || "https://example.com"}${urlPath}`,
              format,
              traffic,
              value,
              keywords,
              topKeyword: row.keyword,
            };
          })
          .filter((row) => row.url);

        const howToUrls = strategyRows.filter((row) => row.format === "how_to_page");

        serviceResults.push({
          serviceId: svc.serviceId,
          name: svc.name,
          landingPath: svc.landingPath,
          seeds,
          ideas,
          board,
          urlStrategyRows: strategyRows,
          howToUrls,
          error: "",
        });
      } catch (error: unknown) {
        serviceResults.push({
          serviceId: svc.serviceId,
          name: svc.name,
          landingPath: svc.landingPath,
          seeds,
          ideas: [],
          board: [],
          urlStrategyRows: [],
          howToUrls: [],
          error: error instanceof Error ? error.message : "Keyword Planner error",
        });
      }

      if (idx < services.length - 1) {
        await sleep(250);
      }
    }

    const allIdeas = serviceResults.flatMap((result) => result.ideas || []);
    const boardSummary = ([
      "unaware",
      "problem_aware",
      "solution_aware",
      "product_aware",
      "most_aware",
    ] as AwarenessStage[]).map((stage) => {
      const rows = allIdeas.filter((idea) => idea.stage === stage);
      return {
        stage,
        stageLabel: titleFromStage(stage),
        count: rows.length,
      };
    });

    const plannerErrors = serviceResults.map((x) => s(x.error)).filter(Boolean);
    const mappedIdeas = allIdeas.filter((x) => x.avgMonthlySearches > 0).length;
    const urlStrategyRows = serviceResults
      .flatMap((row) => row.urlStrategyRows || [])
      .sort((a, b) => b.traffic - a.traffic || b.value - a.value)
      .slice(0, 120);
    const formatMix = (() => {
      const counts: Record<UrlFormat, number> = {
        service_page: 0,
        location_page: 0,
        pricing_page: 0,
        comparison_page: 0,
        faq_page: 0,
        how_to_page: 0,
        template_page: 0,
        alternatives_page: 0,
        insights_page: 0,
      };
      for (const row of urlStrategyRows) {
        if (row.format in counts) counts[row.format as UrlFormat] += 1;
      }
      return Object.entries(counts).map(([format, count]) => ({ format, count }));
    })();

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      rootDomain,
      industryProfile,
      businessCategory,
      services: serviceResults,
      boardSummary,
      urlStrategyRows,
      formatMix,
      planner: {
        ok: plannerErrors.length === 0,
        source: loaded.source,
        totalIdeas: allIdeas.length,
        mappedIdeas,
        services: services.length,
        errors: plannerErrors,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run SEO Canva model";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
