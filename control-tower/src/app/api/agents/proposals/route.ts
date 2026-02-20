import { NextResponse } from "next/server";
import {
  createProposal,
  listProposals,
  normalizeActionType,
  normalizeImpact,
  normalizePriority,
  normalizeRisk,
  parseApprovalRequired,
} from "@/lib/agentProposalStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function asStatus(v: unknown): "all" | "proposed" | "approved" | "rejected" | "executed" | "failed" {
  const x = s(v).toLowerCase();
  if (x === "proposed" || x === "approved" || x === "rejected" || x === "executed" || x === "failed") return x;
  return "all";
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function isAuthorized(req: Request) {
  const expected = s(process.env.AGENT_INTERNAL_API_KEY);
  if (!expected) return true;
  const got = s(req.headers.get("x-agent-api-key"));
  return got && got === expected;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized agent key." }, { status: 401 });
    }
    const url = new URL(req.url);
    const organizationId = s(url.searchParams.get("organizationId") || url.searchParams.get("tenantId"));
    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400 });
    }
    const status = asStatus(url.searchParams.get("status"));
    const actionType = normalizeActionType(url.searchParams.get("actionType"));
    const limit = Number(url.searchParams.get("limit") || 50);
    const rows = await listProposals({
      organizationId,
      status,
      actionType,
      limit,
    });
    return NextResponse.json({ ok: true, organizationId, count: rows.length, proposals: rows });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to list proposals" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized agent key." }, { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const organizationId = s(body?.organizationId || body?.tenantId);
    const actionType = normalizeActionType(body?.actionType);
    const agentId = s(body?.agentId);
    const dashboardId = s(body?.dashboardId);
    const summary = s(body?.summary);
    const payload = (body?.payload as JsonMap | undefined) || {};

    if (!organizationId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400 });
    }
    if (!actionType) {
      return NextResponse.json({ ok: false, error: "Invalid actionType" }, { status: 400 });
    }
    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Missing agentId" }, { status: 400 });
    }
    if (!dashboardId) {
      return NextResponse.json({ ok: false, error: "Missing dashboardId" }, { status: 400 });
    }
    if (!summary) {
      return NextResponse.json({ ok: false, error: "Missing summary" }, { status: 400 });
    }

    const riskLevel = normalizeRisk(body?.riskLevel);
    const policyAutoApproved = boolish(body?.policyAutoApproved, riskLevel === "low");
    const approvalRequired = parseApprovalRequired(body?.approvalRequired, !policyAutoApproved);
    const proposal = await createProposal({
      organizationId,
      actionType,
      agentId,
      dashboardId,
      summary,
      payload,
      priority: normalizePriority(body?.priority),
      riskLevel,
      expectedImpact: normalizeImpact(body?.expectedImpact),
      policyAutoApproved,
      approvalRequired,
    });
    return NextResponse.json({ ok: true, proposal }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to create proposal" },
      { status: 500 },
    );
  }
}
