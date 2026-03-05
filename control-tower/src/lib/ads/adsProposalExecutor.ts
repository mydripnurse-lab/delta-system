import { googleAdsMutate, googleAdsSearch } from "@/lib/ads/adsRest";

type JsonMap = Record<string, unknown>;

type NormalizeContext = {
  tenantId: string;
  integrationKey: string;
  customerId?: string;
  loginCustomerId?: string;
  dryRun: boolean;
  allowHighRisk: boolean;
  allowLargeBudgetChange: boolean;
};

type NormalizedOperation =
  | { kind: "pause_campaign"; campaignId: string }
  | { kind: "enable_campaign"; campaignId: string }
  | { kind: "campaign_budget_daily"; campaignId: string; amount: number }
  | { kind: "campaign_budget_percent"; campaignId: string; percentDelta: number }
  | { kind: "add_adgroup_keywords"; adGroupId: string; keywords: string[]; matchType: "EXACT" | "PHRASE" | "BROAD"; cpcBidMicros?: number }
  | { kind: "add_campaign_negative_keywords"; campaignId: string; keywords: string[]; matchType: "EXACT" | "PHRASE" | "BROAD" };

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on";
}

function cleanCid(v: string) {
  return s(v).replace(/-/g, "");
}

function matchType(v: unknown): "EXACT" | "PHRASE" | "BROAD" {
  const x = s(v).toUpperCase();
  if (x === "EXACT" || x === "PHRASE" || x === "BROAD") return x;
  return "PHRASE";
}

function parsePercentDelta(v: unknown) {
  const raw = n(v, 0);
  if (Math.abs(raw) > 1) return raw / 100;
  return raw;
}

function asArray(v: unknown) {
  return Array.isArray(v) ? v : [];
}

function parseContext(payload: JsonMap): NormalizeContext {
  const tenantId = s(payload.tenant_id || payload.tenantId);
  const integrationKey = s(payload.integration_key || payload.integrationKey) || "default";
  const customerId = cleanCid(s(payload.customer_id || payload.customerId));
  const loginCustomerId = cleanCid(s(payload.login_customer_id || payload.loginCustomerId));
  const executeLive = boolish(payload.execute_live ?? payload.executeLive, false);
  const dryRun = boolish(payload.dry_run ?? payload.dryRun, !executeLive);
  const allowHighRisk = boolish(payload.allow_high_risk ?? payload.allowHighRisk, false);
  const allowLargeBudgetChange = boolish(
    payload.allow_large_budget_change ?? payload.allowLargeBudgetChange,
    false,
  );
  if (!tenantId) throw new Error("Missing tenant_id in optimize_ads payload.");
  return {
    tenantId,
    integrationKey,
    customerId: customerId || undefined,
    loginCustomerId: loginCustomerId || undefined,
    dryRun,
    allowHighRisk,
    allowLargeBudgetChange,
  };
}

function normalizeOperations(payload: JsonMap): NormalizedOperation[] {
  const operations = asArray(payload.operations);
  const out: NormalizedOperation[] = [];

  for (const raw of operations) {
    const row = (raw && typeof raw === "object" ? (raw as JsonMap) : {}) as JsonMap;
    const kind = s(row.kind || row.type).toLowerCase();
    const campaignId = s(row.campaign_id || row.campaignId || row.entity_id || row.entityId);
    if (!kind || !campaignId) continue;

    if (kind === "pause_campaign") {
      out.push({ kind, campaignId });
      continue;
    }
    if (kind === "enable_campaign") {
      out.push({ kind, campaignId });
      continue;
    }
    if (kind === "campaign_budget_daily") {
      const amount = n(row.amount ?? row.value ?? row.to);
      if (amount > 0) out.push({ kind, campaignId, amount });
      continue;
    }
    if (kind === "campaign_budget_percent") {
      const percentDelta = parsePercentDelta(row.percentDelta ?? row.percent_change ?? row.delta ?? row.value);
      if (Number.isFinite(percentDelta) && percentDelta !== 0) out.push({ kind, campaignId, percentDelta });
      continue;
    }
    if (kind === "add_campaign_negative_keywords") {
      const keywords = asArray(row.keywords).map((x) => s(x)).filter(Boolean).slice(0, 50);
      if (keywords.length) {
        out.push({
          kind,
          campaignId,
          keywords,
          matchType: matchType(row.matchType || row.match_type),
        });
      }
      continue;
    }
    if (kind === "add_adgroup_keywords") {
      const adGroupId = s(row.ad_group_id || row.adGroupId || row.entity_id || row.entityId);
      const keywords = asArray(row.keywords).map((x) => s(x)).filter(Boolean).slice(0, 50);
      if (adGroupId && keywords.length) {
        out.push({
          kind,
          adGroupId,
          keywords,
          matchType: matchType(row.matchType || row.match_type),
          cpcBidMicros: n(row.cpcBidMicros ?? row.cpc_bid_micros ?? 0, 0) || undefined,
        });
      }
      continue;
    }
  }

  if (!out.length) {
    const legacyChanges = asArray(payload.changes);
    const entityType = s(payload.entity_type || payload.entityType).toLowerCase();
    const campaignId = s(payload.entity_id || payload.entityId);
    if (entityType === "campaign" && campaignId && legacyChanges.length) {
      for (const raw of legacyChanges) {
        const c = (raw && typeof raw === "object" ? (raw as JsonMap) : {}) as JsonMap;
        const field = s(c.field).toLowerCase();
        if (field === "budget") {
          const to = n(c.to);
          if (to > 0) out.push({ kind: "campaign_budget_daily", campaignId, amount: to });
        }
      }
    }
  }

  return out;
}

async function lookupCampaignBudget(input: {
  tenantId: string;
  integrationKey: string;
  customerId?: string;
  loginCustomerId?: string;
  campaignId: string;
}) {
  const out = await googleAdsSearch({
    tenantId: input.tenantId,
    integrationKey: input.integrationKey,
    customerId: input.customerId,
    loginCustomerId: input.loginCustomerId,
    query: `
      SELECT
        campaign.id,
        campaign.name,
        campaign_budget.resource_name,
        campaign_budget.amount_micros
      FROM campaign
      WHERE campaign.id = ${cleanCid(input.campaignId)}
      LIMIT 1
    `.trim(),
  });
  const row = Array.isArray(out.results) ? out.results[0] : null;
  const campaignBudget = (row as JsonMap | null)?.campaignBudget as JsonMap | undefined;
  const resourceName = s(campaignBudget?.resourceName);
  const amountMicros = Math.trunc(n(campaignBudget?.amountMicros, 0));
  if (!resourceName) {
    throw new Error(`Could not resolve campaign budget for campaign ${input.campaignId}.`);
  }
  if (!(amountMicros > 0)) {
    throw new Error(`Invalid current budget for campaign ${input.campaignId}.`);
  }
  return { resourceName, amountMicros };
}

function budgetMicrosFromCurrency(amount: number) {
  return Math.max(1, Math.trunc(amount * 1_000_000));
}

async function resolveEffectiveCustomerId(ctx: NormalizeContext) {
  if (ctx.customerId) return cleanCid(ctx.customerId);
  const out = await googleAdsSearch({
    tenantId: ctx.tenantId,
    integrationKey: ctx.integrationKey,
    loginCustomerId: ctx.loginCustomerId,
    query: `
      SELECT customer.id
      FROM customer
      LIMIT 1
    `.trim(),
  });
  const row = Array.isArray(out.results) ? out.results[0] : null;
  const customer = (row as JsonMap | null)?.customer as JsonMap | undefined;
  const resolved = cleanCid(s(customer?.id));
  if (!resolved) throw new Error("Could not resolve customer_id from Google Ads.");
  return resolved;
}

export async function executeOptimizeAdsProposal(input: {
  payload: JsonMap;
  riskLevel?: string;
}) {
  const ctx = parseContext(input.payload);
  const operations = normalizeOperations(input.payload);
  if (!operations.length) {
    throw new Error(
      "No executable operations found. Provide payload.operations with supported kinds (budget/pause/negative keywords).",
    );
  }

  if (!ctx.dryRun) {
    const risk = s(input.riskLevel).toLowerCase();
    if (risk === "high" && !ctx.allowHighRisk) {
      throw new Error("High-risk optimize_ads proposal requires allowHighRisk=true for live execution.");
    }
  }

  const maxOps = ctx.dryRun ? 100 : 40;
  if (operations.length > maxOps) {
    throw new Error(`Too many operations (${operations.length}). Max allowed is ${maxOps}.`);
  }

  const mutateOperations: Array<Record<string, unknown>> = [];
  const notes: string[] = [];
  const customerId = await resolveEffectiveCustomerId(ctx);
  for (const op of operations) {
    const campaignResourceName =
      "campaignId" in op
        ? `customers/${cleanCid(customerId)}/campaigns/${cleanCid(op.campaignId)}`
        : "";

    if (op.kind === "pause_campaign" || op.kind === "enable_campaign") {
      mutateOperations.push({
        campaignOperation: {
          update: {
            resourceName: campaignResourceName,
            status: op.kind === "pause_campaign" ? "PAUSED" : "ENABLED",
          },
          updateMask: "status",
        },
      });
      notes.push(`${op.kind}:${op.campaignId}`);
      continue;
    }

    if (op.kind === "add_campaign_negative_keywords") {
      for (const keyword of op.keywords) {
        mutateOperations.push({
          campaignCriterionOperation: {
            create: {
              campaign: campaignResourceName,
              negative: true,
              keyword: {
                text: keyword,
                matchType: op.matchType,
              },
            },
          },
        });
      }
      notes.push(`${op.kind}:${op.campaignId}:${op.keywords.length}`);
      continue;
    }

    if (op.kind === "add_adgroup_keywords") {
      const adGroupResourceName = `customers/${cleanCid(customerId)}/adGroups/${cleanCid(op.adGroupId)}`;
      for (const keyword of op.keywords) {
        const keywordCreate: JsonMap = {
          adGroup: adGroupResourceName,
          status: "ENABLED",
          keyword: {
            text: keyword,
            matchType: op.matchType,
          },
        };
        if (n(op.cpcBidMicros, 0) > 0) {
          keywordCreate.cpcBidMicros = String(Math.trunc(n(op.cpcBidMicros, 0)));
        }
        mutateOperations.push({
          adGroupCriterionOperation: {
            create: keywordCreate,
          },
        });
      }
      notes.push(`${op.kind}:${op.adGroupId}:${op.keywords.length}`);
      continue;
    }

    if (op.kind === "campaign_budget_daily" || op.kind === "campaign_budget_percent") {
      const budget = await lookupCampaignBudget({
        tenantId: ctx.tenantId,
        integrationKey: ctx.integrationKey,
        customerId: customerId || undefined,
        loginCustomerId: ctx.loginCustomerId || undefined,
        campaignId: op.campaignId,
      });

      let nextAmountMicros = budget.amountMicros;
      if (op.kind === "campaign_budget_daily") {
        nextAmountMicros = budgetMicrosFromCurrency(op.amount);
      } else {
        if (!ctx.dryRun && Math.abs(op.percentDelta) > 0.35 && !ctx.allowLargeBudgetChange) {
          throw new Error(
            `Large budget change blocked for campaign ${op.campaignId}. Set allowLargeBudgetChange=true to override.`,
          );
        }
        nextAmountMicros = Math.max(1, Math.trunc(budget.amountMicros * (1 + op.percentDelta)));
      }

      mutateOperations.push({
        campaignBudgetOperation: {
          update: {
            resourceName: budget.resourceName,
            amountMicros: String(nextAmountMicros),
          },
          updateMask: "amount_micros",
        },
      });
      notes.push(`${op.kind}:${op.campaignId}:${budget.amountMicros}->${nextAmountMicros}`);
      continue;
    }
  }

  const mutate = await googleAdsMutate({
    tenantId: ctx.tenantId,
    integrationKey: ctx.integrationKey,
    customerId: customerId || undefined,
    loginCustomerId: ctx.loginCustomerId || undefined,
    mutateOperations,
    validateOnly: ctx.dryRun,
    partialFailure: false,
  });

  const results = asArray((mutate.result as JsonMap).mutateOperationResponses).length;
  const partialFailureError = s((mutate.result as JsonMap).partialFailureError);
  return {
    mode: ctx.dryRun ? "dry_run" : "live",
    operationsRequested: operations.length,
    mutateOperationsSent: mutateOperations.length,
    notes,
    googleAds: {
      version: mutate.version,
      customerId: mutate.customerId,
      validateOnly: mutate.validateOnly,
      requestId: mutate.requestId || "",
      resultCount: results,
      partialFailureError: partialFailureError || null,
    },
  };
}
