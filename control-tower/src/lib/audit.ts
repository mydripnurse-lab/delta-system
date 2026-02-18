type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

type AuditInput = {
  organizationId: string;
  actorType?: "user" | "system" | "api";
  actorUserId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  severity?: "info" | "warning" | "critical";
  payload?: Record<string, unknown> | null;
};

export async function writeAuditLog(db: Queryable, input: AuditInput) {
  await db.query(
    `
      insert into app.organization_audit_logs (
        organization_id,
        actor_type,
        actor_user_id,
        actor_label,
        action,
        entity_type,
        entity_id,
        severity,
        payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      input.organizationId,
      input.actorType || "user",
      input.actorUserId || null,
      input.actorLabel || null,
      input.action,
      input.entityType,
      input.entityId || null,
      input.severity || "info",
      JSON.stringify(input.payload || {}),
    ],
  );
}
