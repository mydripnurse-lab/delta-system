import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";
import { stateScopeNames } from "@/lib/usStateOptions";

let supportSchemaReady: Promise<void> | null = null;

export type SupportTicketStatus = "open" | "pending" | "closed";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";

export type SupportMessage = {
  id: string;
  authorType: "partner" | "admin" | "system";
  authorName: string;
  body: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  partnerProfileId: string;
  partnerName: string;
  partnerEmail: string;
  subject: string;
  category: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messages: SupportMessage[];
};

export async function ensurePartnerSupportSchema() {
  if (supportSchemaReady) return supportSchemaReady;
  supportSchemaReady = (async () => {
    await ensureStaffSchema();
    await getDbPool().query(`
      create table if not exists app.partner_support_tickets (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        subject text not null,
        category text not null default 'general',
        priority text not null default 'normal',
        status text not null default 'open',
        assigned_user_id uuid references app.users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_message_at timestamptz not null default now(),
        closed_at timestamptz,
        check (priority in ('low', 'normal', 'high', 'urgent')),
        check (status in ('open', 'pending', 'closed'))
      );
      create index if not exists partner_support_tickets_org_status_idx
        on app.partner_support_tickets (organization_id, status, last_message_at desc);
      create index if not exists partner_support_tickets_partner_idx
        on app.partner_support_tickets (partner_profile_id, last_message_at desc);
      create table if not exists app.partner_support_messages (
        id uuid primary key default gen_random_uuid(),
        ticket_id uuid not null references app.partner_support_tickets(id) on delete cascade,
        author_type text not null,
        author_user_id uuid references app.users(id) on delete set null,
        author_profile_id uuid references app.partner_profiles(id) on delete set null,
        body text not null,
        created_at timestamptz not null default now(),
        check (author_type in ('partner', 'admin', 'system'))
      );
      create index if not exists partner_support_messages_ticket_idx
        on app.partner_support_messages (ticket_id, created_at asc);
    `);
  })().catch((error) => {
    supportSchemaReady = null;
    throw error;
  });
  return supportSchemaReady;
}

function mapTicket(row: any): SupportTicket {
  return {
    id: row.id,
    partnerProfileId: row.partner_profile_id,
    partnerName: row.partner_name,
    partnerEmail: row.partner_email,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

const ticketSelect = `
  select t.id, t.partner_profile_id, p.display_name as partner_name, p.email as partner_email,
         t.subject, t.category, t.priority, t.status, t.assigned_user_id,
         coalesce(u.full_name, u.email) as assigned_user_name,
         t.created_at::text, t.updated_at::text, t.last_message_at::text,
         coalesce((select jsonb_agg(jsonb_build_object(
           'id', m.id,
           'authorType', m.author_type,
           'authorName', case when m.author_type = 'partner' then p.display_name else coalesce(mu.full_name, mu.email, 'My Drip Nurse Support') end,
           'body', m.body,
           'createdAt', m.created_at::text
         ) order by m.created_at asc) from app.partner_support_messages m
           left join app.users mu on mu.id = m.author_user_id
          where m.ticket_id = t.id), '[]'::jsonb) as messages
    from app.partner_support_tickets t
    join app.partner_profiles p on p.id = t.partner_profile_id
    left join app.users u on u.id = t.assigned_user_id
`;

export async function listPartnerSupportTickets(profileId: string) {
  await ensurePartnerSupportSchema();
  const result = await getDbPool().query(`${ticketSelect} where t.partner_profile_id = $1 order by t.last_message_at desc`, [profileId]);
  return result.rows.map(mapTicket);
}

export async function createPartnerSupportTicket(input: {
  organizationId: string;
  profileId: string;
  subject: string;
  category: string;
  priority: SupportTicketPriority;
  body: string;
}) {
  await ensurePartnerSupportSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const ticket = await client.query<{ id: string }>(
      `insert into app.partner_support_tickets (organization_id, partner_profile_id, subject, category, priority)
       values ($1, $2, $3, $4, $5) returning id`,
      [input.organizationId, input.profileId, input.subject, input.category, input.priority],
    );
    await client.query(
      `insert into app.partner_support_messages (ticket_id, author_type, author_profile_id, body)
       values ($1, 'partner', $2, $3)`,
      [ticket.rows[0].id, input.profileId, input.body],
    );
    await client.query("commit");
    return ticket.rows[0].id;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function addPartnerSupportMessage(input: { ticketId: string; profileId: string; body: string }) {
  await ensurePartnerSupportSchema();
  const result = await getDbPool().query<{ id: string }>(
    `with owned as (
       select id from app.partner_support_tickets where id = $1 and partner_profile_id = $2 and status <> 'closed'
     )
     insert into app.partner_support_messages (ticket_id, author_type, author_profile_id, body)
     select id, 'partner', $2, $3 from owned returning id`,
    [input.ticketId, input.profileId, input.body],
  );
  if (!result.rows[0]) throw new Error("Ticket not found or already closed.");
  await getDbPool().query(`update app.partner_support_tickets set status = 'open', updated_at = now(), last_message_at = now() where id = $1`, [input.ticketId]);
}

function supportStateScopeSql(stateCodes: readonly string[], parameterNumber: number) {
  if (!stateCodes.length) return "";
  return `and exists (
    select 1
      from app.partner_service_assignments scope_assignment
      join app.partner_coverage_areas scope_area
        on scope_area.assignment_id = scope_assignment.id
       and scope_area.status = 'active'
     where scope_assignment.partner_profile_id = t.partner_profile_id
       and scope_assignment.status = 'active'
       and lower(trim(scope_area.state)) = any($${parameterNumber}::text[])
  )`;
}

function normalizedSupportStateValues(stateCodes: readonly string[]) {
  return [...stateCodes, ...stateScopeNames(stateCodes)].map((value) => value.toLowerCase());
}

export async function listAdminSupportTickets(organizationId: string, stateCodes: string[] = []) {
  await ensurePartnerSupportSchema();
  const values: unknown[] = [organizationId];
  if (stateCodes.length) values.push(normalizedSupportStateValues(stateCodes));
  const result = await getDbPool().query(
    `${ticketSelect}
      where t.organization_id = $1
      ${supportStateScopeSql(stateCodes, values.length)}
      order by case when t.status = 'open' then 0 when t.status = 'pending' then 1 else 2 end,
               t.last_message_at desc`,
    values,
  );
  return result.rows.map(mapTicket);
}

export async function listSupportAgents() {
  await ensurePartnerSupportSchema();
  const result = await getDbPool().query<{ id: string; full_name: string | null; email: string }>(
    `select id, full_name, email from app.users where is_active = true order by coalesce(full_name, email) asc`,
  );
  return result.rows.map((row) => ({ id: row.id, name: row.full_name || row.email, email: row.email }));
}

export async function updateAdminSupportTicket(input: {
  ticketId: string;
  organizationId: string;
  adminUserId: string;
  body?: string;
  status?: SupportTicketStatus;
  assignedUserId?: string | null;
  stateCodes?: string[];
}) {
  await ensurePartnerSupportSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const values: unknown[] = [input.ticketId, input.organizationId];
    if (input.stateCodes?.length) values.push(normalizedSupportStateValues(input.stateCodes));
    const owned = await client.query<{ id: string; partner_profile_id: string }>(
      `select t.id, t.partner_profile_id
         from app.partner_support_tickets t
        where t.id = $1 and t.organization_id = $2
          ${supportStateScopeSql(input.stateCodes || [], values.length)}
        for update`,
      values,
    );
    if (!owned.rows[0]) throw new Error("Ticket not found.");
    if (input.body) {
      await client.query(`insert into app.partner_support_messages (ticket_id, author_type, author_user_id, body) values ($1, 'admin', $2, $3)`, [input.ticketId, input.adminUserId, input.body]);
    }
    await client.query(
      `update app.partner_support_tickets
          set status = coalesce($2, status),
              assigned_user_id = case when $3::boolean then $4 else assigned_user_id end,
              closed_at = case when coalesce($2, status) = 'closed' then coalesce(closed_at, now()) else null end,
              updated_at = now(), last_message_at = case when $5::boolean then now() else last_message_at end
        where id = $1`,
      [input.ticketId, input.status || null, input.assignedUserId !== undefined, input.assignedUserId || null, Boolean(input.body)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
