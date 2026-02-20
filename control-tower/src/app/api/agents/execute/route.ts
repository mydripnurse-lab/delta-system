import { NextResponse } from "next/server";
import {
  getProposalById,
  markExecutionResult,
  markExecutionStart,
  normalizeActionType,
} from "@/lib/agentProposalStore";
import { authorizeTenantAgentRequest } from "@/lib/tenantAgentAuth";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) {
    const msg = s(json?.error) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json || {};
}

export async function POST(req: Request) {
  let proposalId = "";
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    proposalId = s(body?.proposalId || body?.id);
    let actor = s(body?.actor || "system:executor");
    if (!proposalId) {
      return NextResponse.json({ ok: false, error: "Missing proposalId" }, { status: 400 });
    }

    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
    }
    const auth = await authorizeTenantAgentRequest(req, s(proposal.organization_id), "tenant.manage");
    if ("response" in auth) return auth.response;
    if (!s(body?.actor)) actor = auth.actor;
    if (s(proposal.status) !== "approved") {
      return NextResponse.json(
        { ok: false, error: `Proposal must be approved before execute (current=${s(proposal.status)}).` },
        { status: 409 },
      );
    }

    await markExecutionStart(proposalId, actor);
    const actionType = normalizeActionType(proposal.action_type);
    const payload = (proposal.payload || {}) as JsonMap;
    let executionResult: Record<string, unknown> = { mode: "noop" };

    if (actionType === "send_leads_ghl") {
      const tenantId = s(payload.tenant_id || payload.tenantId || proposal.organization_id);
      const origin = new URL(req.url).origin;
      const pushBody: Record<string, unknown> = {
        tenantId,
        webhookUrl: s(payload.webhook_url || payload.webhookUrl),
        maxLeads: Number(payload.max_leads || payload.maxLeads || 100),
        includeUnapproved: false,
      };
      if (Array.isArray(payload.statuses) && payload.statuses.length) {
        pushBody.statuses = payload.statuses;
      }
      if (!pushBody.webhookUrl) delete pushBody.webhookUrl;
      executionResult = await postJson(`${origin}/api/dashboard/prospecting/push-ghl`, pushBody);
    } else if (actionType === "publish_content" || actionType === "publish_ads" || actionType === "optimize_ads") {
      executionResult = {
        mode: "queued",
        detail: "Action recorded as executed. Connect your publication/ad provider executor next.",
        actionType,
      };
    } else {
      throw new Error(`Unsupported action_type: ${s(proposal.action_type)}`);
    }

    const updated = await markExecutionResult({
      proposalId,
      ok: true,
      actor,
      note: "Execution completed.",
    });
    return NextResponse.json({ ok: true, proposal: updated, result: executionResult });
  } catch (e: unknown) {
    if (proposalId) {
      await markExecutionResult({
        proposalId,
        ok: false,
        actor: "system:executor",
        note: e instanceof Error ? e.message : "Failed to execute proposal",
      }).catch(() => null);
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to execute proposal" },
      { status: 500 },
    );
  }
}
