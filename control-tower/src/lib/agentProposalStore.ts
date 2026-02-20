import { getDbPool } from "@/lib/db";

export type AgentActionType =
  | "publish_content"
  | "send_leads_ghl"
  | "publish_ads"
  | "optimize_ads";

export type AgentStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type AgentPriority = "P1" | "P2" | "P3";
export type AgentRisk = "low" | "medium" | "high";
export type AgentImpact = "low" | "medium" | "high";

export type AgentProposalInput = {
  organizationId: string;
  actionType: AgentActionType;
  agentId: string;
  dashboardId: string;
  summary: string;
  payload: Record<string, unknown>;
  priority?: AgentPriority;
  riskLevel?: AgentRisk;
  expectedImpact?: AgentImpact;
  policyAutoApproved?: boolean;
  approvalRequired?: boolean;
};

type EventType = "proposed" | "approved" | "rejected" | "execute_started" | "executed" | "failed" | "edited";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeActionType(v: unknown): AgentActionType | "" {
  const x = s(v).toLowerCase();
  if (x === "publish_content") return "publish_content";
  if (x === "send_leads_ghl") return "send_leads_ghl";
  if (x === "publish_ads") return "publish_ads";
  if (x === "optimize_ads") return "optimize_ads";
  return "";
}

export function normalizePriority(v: unknown): AgentPriority {
  const x = s(v).toUpperCase();
  return x === "P1" || x === "P2" || x === "P3" ? x : "P2";
}

export function normalizeRisk(v: unknown): AgentRisk {
  const x = s(v).toLowerCase();
  return x === "low" || x === "medium" || x === "high" ? x : "medium";
}

export function normalizeImpact(v: unknown): AgentImpact {
  const x = s(v).toLowerCase();
  return x === "low" || x === "medium" || x === "high" ? x : "medium";
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

export async function createProposal(input: AgentProposalInput) {
  const pool = getDbPool();
  const q = await pool.query(
    `
      insert into app.agent_proposals (
        organization_id,
        action_type,
        status,
        agent_id,
        dashboard_id,
        priority,
        risk_level,
        expected_impact,
        summary,
        payload,
        policy_auto_approved,
        approval_required
      ) values (
        $1::uuid,
        $2,
        'proposed',
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11
      )
      returning *
    `,
    [
      input.organizationId,
      input.actionType,
      input.agentId,
      input.dashboardId,
      input.priority || "P2",
      input.riskLevel || "medium",
      input.expectedImpact || "medium",
      input.summary,
      JSON.stringify(input.payload || {}),
      !!input.policyAutoApproved,
      input.approvalRequired !== false,
    ],
  );
  const row = q.rows[0];
  await addProposalEvent({
    proposalId: row.id,
    eventType: "proposed",
    actor: `agent:${s(input.agentId) || "unknown"}`,
    note: row.summary,
    afterPayload: row.payload || {},
  });
  return row;
}

export async function addProposalEvent(args: {
  proposalId: string;
  eventType: EventType;
  actor: string;
  note?: string;
  beforePayload?: Record<string, unknown> | null;
  afterPayload?: Record<string, unknown> | null;
}) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.agent_proposal_events (
        proposal_id, event_type, actor, note, before_payload, after_payload
      ) values (
        $1::uuid, $2, $3, nullif($4,''), $5::jsonb, $6::jsonb
      )
    `,
    [
      args.proposalId,
      args.eventType,
      s(args.actor) || "system",
      s(args.note),
      JSON.stringify(args.beforePayload || null),
      JSON.stringify(args.afterPayload || null),
    ],
  );
}

export async function getProposalById(id: string) {
  const pool = getDbPool();
  const q = await pool.query(`select * from app.agent_proposals where id = $1::uuid limit 1`, [id]);
  return q.rows[0] || null;
}

export async function listProposals(input: {
  organizationId: string;
  status?: AgentStatus | "all";
  actionType?: AgentActionType | "";
  limit?: number;
}) {
  const pool = getDbPool();
  const status = s(input.status).toLowerCase();
  const useAllStatus = !status || status === "all";
  const action = normalizeActionType(input.actionType || "");
  const limit = Math.max(1, Math.min(Number(input.limit || 50), 200));
  const vals: unknown[] = [input.organizationId];
  let where = `where organization_id = $1::uuid`;
  if (!useAllStatus) {
    vals.push(status);
    where += ` and status = $${vals.length}`;
  }
  if (action) {
    vals.push(action);
    where += ` and action_type = $${vals.length}`;
  }
  vals.push(limit);
  const q = await pool.query(
    `
      select *
      from app.agent_proposals
      ${where}
      order by created_at desc
      limit $${vals.length}
    `,
    vals,
  );
  return q.rows;
}

export async function decideProposal(input: {
  proposalId: string;
  decision: "approved" | "rejected";
  actor: string;
  note?: string;
  editedPayload?: Record<string, unknown> | null;
}) {
  const current = await getProposalById(input.proposalId);
  if (!current) return null;
  if (s(current.status) !== "proposed") {
    throw new Error(`Proposal is not in proposed state (current=${s(current.status)})`);
  }
  const pool = getDbPool();
  const edited = input.editedPayload && Object.keys(input.editedPayload).length ? input.editedPayload : null;
  const q =
    input.decision === "approved"
      ? await pool.query(
          `
            update app.agent_proposals
            set
              status = 'approved',
              approved_by = $2,
              approved_at = now(),
              payload = coalesce($3::jsonb, payload),
              updated_at = now()
            where id = $1::uuid
            returning *
          `,
          [input.proposalId, input.actor, JSON.stringify(edited)],
        )
      : await pool.query(
          `
            update app.agent_proposals
            set
              status = 'rejected',
              rejected_by = $2,
              rejected_at = now(),
              rejection_reason = nullif($3,''),
              updated_at = now()
            where id = $1::uuid
            returning *
          `,
          [input.proposalId, input.actor, s(input.note)],
        );
  const row = q.rows[0] || null;
  if (!row) return null;
  if (edited) {
    await addProposalEvent({
      proposalId: row.id,
      eventType: "edited",
      actor: input.actor,
      note: "Payload edited before approval.",
      beforePayload: current.payload || {},
      afterPayload: row.payload || {},
    });
  }
  await addProposalEvent({
    proposalId: row.id,
    eventType: input.decision === "approved" ? "approved" : "rejected",
    actor: input.actor,
    note: input.note,
  });
  return row;
}

export async function markExecutionStart(proposalId: string, actor: string) {
  const pool = getDbPool();
  const q = await pool.query(
    `
      update app.agent_proposals
      set execution_started_at = now(), updated_at = now()
      where id = $1::uuid
      returning *
    `,
    [proposalId],
  );
  const row = q.rows[0] || null;
  if (row) {
    await addProposalEvent({
      proposalId: proposalId,
      eventType: "execute_started",
      actor,
    });
  }
  return row;
}

export async function markExecutionResult(input: {
  proposalId: string;
  ok: boolean;
  actor: string;
  note?: string;
}) {
  const pool = getDbPool();
  const q = await pool.query(
    `
      update app.agent_proposals
      set
        status = $2,
        executed_at = case when $2 = 'executed' then now() else executed_at end,
        execution_error = case when $2 = 'failed' then nullif($3,'') else '' end,
        updated_at = now()
      where id = $1::uuid
      returning *
    `,
    [input.proposalId, input.ok ? "executed" : "failed", s(input.note)],
  );
  const row = q.rows[0] || null;
  if (row) {
    await addProposalEvent({
      proposalId: input.proposalId,
      eventType: input.ok ? "executed" : "failed",
      actor: input.actor,
      note: input.note,
    });
  }
  return row;
}

export function parseApprovalRequired(v: unknown, fallback: boolean) {
  return boolish(v, fallback);
}

