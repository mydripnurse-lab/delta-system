import { NextResponse } from "next/server";
import { getProposalById } from "@/lib/agentProposalStore";
import { executeApprovedProposal } from "@/lib/agentExecution";
import { authorizeTenantAgentRequest } from "@/lib/tenantAgentAuth";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    let proposalId = "";
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
    const out = await executeApprovedProposal({ proposalId, actor, origin });
    return NextResponse.json({ ok: true, proposal: out.proposal, result: out.result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to execute proposal" },
      { status: 500 },
    );
  }
}
