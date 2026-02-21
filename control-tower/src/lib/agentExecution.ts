import {
  getProposalById,
  markExecutionResult,
  markExecutionStart,
  normalizeActionType,
} from "@/lib/agentProposalStore";

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

export async function executeApprovedProposal(input: {
  proposalId: string;
  actor: string;
  origin: string;
}) {
  const proposalId = s(input.proposalId);
  const actor = s(input.actor) || "system:executor";
  const origin = s(input.origin);
  if (!proposalId) throw new Error("Missing proposalId");
  if (!origin) throw new Error("Missing origin");

  const proposal = await getProposalById(proposalId);
  if (!proposal) throw new Error("Proposal not found.");
  if (s(proposal.status) !== "approved") {
    throw new Error(`Proposal must be approved before execute (current=${s(proposal.status)}).`);
  }

  await markExecutionStart(proposalId, actor);
  try {
    const actionType = normalizeActionType(proposal.action_type);
    const payload = (proposal.payload || {}) as JsonMap;
    let executionResult: Record<string, unknown> = { mode: "noop" };

    if (actionType === "send_leads_ghl") {
      const tenantId = s(payload.tenant_id || payload.tenantId || proposal.organization_id);
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
    return { proposal: updated, result: executionResult };
  } catch (e: unknown) {
    await markExecutionResult({
      proposalId,
      ok: false,
      actor,
      note: e instanceof Error ? e.message : "Failed to execute proposal",
    }).catch(() => null);
    throw e;
  }
}
