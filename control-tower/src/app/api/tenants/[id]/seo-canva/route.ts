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
    const languageConstant = s(searchParams.get("languageConstant")) || "languageConstants/1000";
    const geoTargetRaw = s(searchParams.get("geoTargetConstant")) || "geoTargetConstants/2840";
    const geoTargetConstants = dedupeStrings(
      geoTargetRaw
        .split(",")
        .map((x) => s(x))
        .filter(Boolean),
    );

    const loaded = await loadTenantProductsServices(tenantId);
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
        services: [],
        boardSummary: [],
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

    const serviceResults = await Promise.all(
      services.map(async (svc) => {
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
          return {
            serviceId: svc.serviceId,
            name: svc.name,
            landingPath: svc.landingPath,
            seeds: [],
            ideas: [],
            board: [],
            error: "No valid seeds for this service.",
          };
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

          return {
            serviceId: svc.serviceId,
            name: svc.name,
            landingPath: svc.landingPath,
            seeds,
            ideas,
            board,
            error: "",
          };
        } catch (error: unknown) {
          return {
            serviceId: svc.serviceId,
            name: svc.name,
            landingPath: svc.landingPath,
            seeds,
            ideas: [],
            board: [],
            error: error instanceof Error ? error.message : "Keyword Planner error",
          };
        }
      }),
    );

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

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      services: serviceResults,
      boardSummary,
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
