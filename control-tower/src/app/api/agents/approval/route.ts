import { NextResponse } from "next/server";
import { decideProposal, getProposalById } from "@/lib/agentProposalStore";
import { executeApprovedProposal } from "@/lib/agentExecution";
import { authorizeTenantAgentRequest } from "@/lib/tenantAgentAuth";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function decision(v: unknown): "approved" | "rejected" | "" {
  const x = s(v).toLowerCase();
  if (x === "approved" || x === "approve") return "approved";
  if (x === "rejected" || x === "reject") return "rejected";
  return "";
}

function boolish(v: unknown, fallback = true) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on";
}

function isUserActor(v: string) {
  return s(v).toLowerCase().startsWith("user:");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const proposalId = s(body?.proposalId || body?.id);
    const nextDecision = decision(body?.decision);
    const actor = s(body?.actor || body?.approvedBy || body?.rejectedBy || "user:operator");
    const note = s(body?.note || body?.reason);
    const editedPayload = ((body?.payload as JsonMap | undefined) || null) as JsonMap | null;
    const executeOnApprove = boolish(body?.executeOnApprove, true);

    if (!proposalId) {
      return NextResponse.json({ ok: false, error: "Missing proposalId" }, { status: 400 });
    }
    if (!nextDecision) {
      return NextResponse.json({ ok: false, error: "Invalid decision (approved|rejected)." }, { status: 400 });
    }

    const current = await getProposalById(proposalId);
    if (!current) {
      return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
    }
    const auth = await authorizeTenantAgentRequest(req, s(current.organization_id), "tenant.manage");
    if ("response" in auth) return auth.response;

    const updated = await decideProposal({
      proposalId,
      decision: nextDecision,
      actor: actor || auth.actor,
      note,
      editedPayload,
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
    }

    let autoExecution: Record<string, unknown> | null = null;
    if (
      nextDecision === "approved" &&
      executeOnApprove &&
      isUserActor(actor || auth.actor) &&
      s(updated.action_type).toLowerCase() === "send_leads_ghl"
    ) {
      try {
        const origin = new URL(req.url).origin;
        const out = await executeApprovedProposal({
          proposalId: s(updated.id),
          actor: actor || auth.actor,
          origin,
        });
        autoExecution = {
          ok: true,
          proposal: out.proposal,
          result: out.result,
        };
        return NextResponse.json({ ok: true, proposal: out.proposal, autoExecution });
      } catch (e: unknown) {
        autoExecution = {
          ok: false,
          error: e instanceof Error ? e.message : "Auto execution failed",
        };
        return NextResponse.json({
          ok: true,
          proposal: updated,
          autoExecution,
        });
      }
    }

    return NextResponse.json({ ok: true, proposal: updated, autoExecution });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to approve/reject proposal" },
      { status: 500 },
    );
  }
}
