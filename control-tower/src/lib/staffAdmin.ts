import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

export type StaffApplicationStatus =
  | "submitted"
  | "under_review"
  | "stripe_pending"
  | "staff_ready"
  | "staff_processing"
  | "staff_created"
  | "calendar_deposit_pending"
  | "ready_to_complete"
  | "processing"
  | "completed"
  | "completed_with_warnings"
  | "rejected"
  | "failed";

export type StaffLocationStep = {
  id: string;
  applicationId: string;
  locationId: string;
  state: string;
  county: string;
  stripeStatus: "pending" | "complete" | "not_required";
  staffStatus: "pending" | "processing" | "complete" | "failed";
  calendarsStatus: "pending" | "processing" | "complete" | "failed";
  depositStatus: "pending" | "processing" | "complete" | "not_required" | "failed";
  stripeCompletedAt: string | null;
  depositCompletedAt: string | null;
  depositConfig: Record<string, unknown>;
  lastError: string | null;
};

export type StaffAdminApplication = {
  id: string;
  organizationId: string;
  organizationName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  status: StaffApplicationStatus;
  adminNotes: string;
  submittedAt: string;
  reviewedAt: string | null;
  provisionedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestPayload: Record<string, unknown>;
  result: Record<string, unknown>;
  lastError: string | null;
  locations: StaffLocationStep[];
};

type ApplicationRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  status: StaffApplicationStatus;
  admin_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  provisioned_at: string | null;
  created_at: string;
  updated_at: string;
  request_payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  last_error: string | null;
  locations: Array<Record<string, unknown>> | null;
};

function s(value: unknown) {
  return String(value ?? "").trim();
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableDate(value: unknown) {
  const text = s(value);
  return text || null;
}

function mapLocation(value: Record<string, unknown>): StaffLocationStep {
  return {
    id: s(value.id),
    applicationId: s(value.application_id),
    locationId: s(value.location_id),
    state: s(value.state),
    county: s(value.county),
    stripeStatus: s(value.stripe_status) as StaffLocationStep["stripeStatus"],
    staffStatus: s(value.staff_status) as StaffLocationStep["staffStatus"],
    calendarsStatus: s(value.calendars_status) as StaffLocationStep["calendarsStatus"],
    depositStatus: s(value.deposit_status) as StaffLocationStep["depositStatus"],
    stripeCompletedAt: nullableDate(value.stripe_completed_at),
    depositCompletedAt: nullableDate(value.deposit_completed_at),
    depositConfig: jsonObject(value.deposit_config),
    lastError: s(value.last_error) || null,
  };
}

function mapApplication(row: ApplicationRow): StaffAdminApplication {
  const requestPayload = jsonObject(row.request_payload);
  const firstName = s(row.first_name || requestPayload.firstName);
  const lastName = s(row.last_name || requestPayload.lastName);
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: s(row.organization_name),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || s(row.email),
    email: s(row.email).toLowerCase(),
    phone: s(row.phone || requestPayload.phone),
    company: s(row.company || requestPayload.company),
    status: row.status,
    adminNotes: s(row.admin_notes),
    submittedAt: s(row.submitted_at || row.created_at),
    reviewedAt: nullableDate(row.reviewed_at),
    provisionedAt: nullableDate(row.provisioned_at),
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
    requestPayload,
    result: jsonObject(row.result),
    lastError: s(row.last_error) || null,
    locations: (row.locations || []).map(mapLocation),
  };
}

const APPLICATION_SELECT = `
  select
    a.*,
    o.name as organization_name,
    coalesce(
      jsonb_agg(to_jsonb(ls) order by ls.created_at)
        filter (where ls.id is not null),
      '[]'::jsonb
    ) as locations
  from app.staff_applications a
  join app.organizations o on o.id = a.organization_id
  left join app.staff_application_location_steps ls on ls.application_id = a.id
`;

export async function listStaffApplications(opts?: {
  search?: string;
  status?: string;
  limit?: number;
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const values: unknown[] = [];
  const where: string[] = [];
  const search = s(opts?.search);
  const status = s(opts?.status);
  if (search) {
    values.push(`%${search}%`);
    where.push(`(
      a.email ilike $${values.length}
      or coalesce(a.first_name, '') ilike $${values.length}
      or coalesce(a.last_name, '') ilike $${values.length}
      or coalesce(a.company, '') ilike $${values.length}
      or exists (
        select 1 from app.staff_application_location_steps x
        where x.application_id = a.id
          and (x.county ilike $${values.length} or x.state ilike $${values.length} or x.location_id ilike $${values.length})
      )
    )`);
  }
  if (status && status !== "all") {
    values.push(status);
    where.push(`a.status = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(500, Number(opts?.limit || 200))));
  const result = await pool.query<ApplicationRow>(
    `${APPLICATION_SELECT}
     ${where.length ? `where ${where.join(" and ")}` : ""}
     group by a.id, o.name
     order by coalesce(a.submitted_at, a.created_at) desc
     limit $${values.length}`,
    values,
  );
  return result.rows.map(mapApplication);
}

export async function getStaffApplication(applicationId: string) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const result = await pool.query<ApplicationRow>(
    `${APPLICATION_SELECT}
     where a.id = $1
     group by a.id, o.name
     limit 1`,
    [applicationId],
  );
  return result.rows[0] ? mapApplication(result.rows[0]) : null;
}

function allFinished(values: string[], allowed: string[]) {
  return values.length > 0 && values.every((value) => allowed.includes(value));
}

function finalWebhookWasSent(result: Record<string, unknown>) {
  if (result.finalWebhookSent === true) return true;
  const finalWebhook = jsonObject(result.finalWebhook);
  if (s(finalWebhook.status).toLowerCase() === "sent") return true;
  // Backwards compatibility for applications provisioned before the admin
  // workflow stored the final webhook under its explicit name.
  const legacyWebhook = jsonObject(result.webhook);
  return s(legacyWebhook.status).toLowerCase() === "sent";
}

export async function refreshStaffApplicationStatus(applicationId: string) {
  const application = await getStaffApplication(applicationId);
  if (!application) return null;
  if (application.status === "rejected" || application.status === "completed") return application;

  const steps = application.locations;
  const stripe = steps.map((item) => item.stripeStatus);
  const staff = steps.map((item) => item.staffStatus);
  const calendars = steps.map((item) => item.calendarsStatus);
  const deposits = steps.map((item) => item.depositStatus);
  const finalWebhookSent = finalWebhookWasSent(application.result);
  let status: StaffApplicationStatus = application.status;

  if (staff.includes("processing") || calendars.includes("processing")) {
    status = "staff_processing";
  } else if (staff.includes("failed") || calendars.includes("failed")) {
    status = "failed";
  } else if (
    allFinished(staff, ["complete"]) &&
    allFinished(calendars, ["complete"])
  ) {
    if (!finalWebhookSent) {
      status = "failed";
    } else {
      status = allFinished(deposits, ["complete", "not_required"])
        ? "ready_to_complete"
        : "calendar_deposit_pending";
    }
  } else if (allFinished(stripe, ["complete", "not_required"])) {
    status = "staff_ready";
  } else if (application.reviewedAt) {
    status = "stripe_pending";
  } else {
    status = "submitted";
  }

  if (status !== application.status) {
    const pool = getDbPool();
    await pool.query(
      `update app.staff_applications
          set status = $2,
              updated_at = now(),
              last_error = case when $2 <> 'failed' then null else last_error end
        where id = $1`,
      [applicationId, status],
    );
  }
  return getStaffApplication(applicationId);
}

export async function reviewStaffApplication(applicationId: string, userId: string) {
  await ensureStaffSchema();
  const pool = getDbPool();
  await pool.query(
    `update app.staff_applications
        set reviewed_at = coalesce(reviewed_at, now()),
            reviewed_by = coalesce(reviewed_by, $2),
            status = 'stripe_pending',
            last_error = null,
            updated_at = now()
      where id = $1 and status not in ('completed', 'rejected')`,
    [applicationId, userId],
  );
  return refreshStaffApplicationStatus(applicationId);
}

export async function updateStaffApplicationNotes(applicationId: string, notes: string) {
  await ensureStaffSchema();
  const pool = getDbPool();
  await pool.query(
    `update app.staff_applications set admin_notes = $2, updated_at = now() where id = $1`,
    [applicationId, notes],
  );
  return getStaffApplication(applicationId);
}

export async function updateStripeCheckpoint(opts: {
  applicationId: string;
  locationId: string;
  status: "pending" | "complete" | "not_required";
  userId: string;
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const application = await getStaffApplication(opts.applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.reviewedAt) {
    throw new Error("Review the application before confirming Stripe.");
  }
  if (["completed", "rejected"].includes(application.status)) {
    throw new Error("Stripe cannot be changed after the application is closed.");
  }
  const provisioningStarted = application.locations.some((location) =>
    location.staffStatus !== "pending" ||
    location.calendarsStatus !== "pending" ||
    location.depositStatus !== "pending"
  );
  if (provisioningStarted) {
    throw new Error("Stripe cannot be changed after staff or calendar provisioning has started.");
  }
  const result = await pool.query(
    `update app.staff_application_location_steps
        set stripe_status = $3,
            stripe_completed_at = case when $3 in ('complete', 'not_required') then now() else null end,
            stripe_completed_by = case when $3 in ('complete', 'not_required') then $4 else null end,
            last_error = null,
            updated_at = now()
      where application_id = $1 and location_id = $2
      returning id`,
    [opts.applicationId, opts.locationId, opts.status, opts.userId],
  );
  if (!result.rowCount) throw new Error("The requested location was not found in this application.");
  return refreshStaffApplicationStatus(opts.applicationId);
}

export async function updateDepositCheckpoint(opts: {
  applicationId: string;
  locationId: string;
  status: "pending" | "complete" | "not_required";
  percentage?: number;
  policyUrl?: string;
  message?: string;
  userId: string;
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const application = await getStaffApplication(opts.applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.reviewedAt) {
    throw new Error("Review the application before configuring deposits.");
  }
  if (["completed", "rejected"].includes(application.status)) {
    throw new Error("Deposit settings cannot be changed after the application is closed.");
  }
  if (!allFinished(application.locations.map((location) => location.stripeStatus), ["complete", "not_required"])) {
    throw new Error("Complete the Stripe checkpoint for every location first.");
  }
  const step = await pool.query<{
    staff_status: string;
    calendars_status: string;
    result: Record<string, unknown> | null;
  }>(
    `select ls.staff_status, ls.calendars_status, a.result
       from app.staff_application_location_steps ls
       join app.staff_applications a on a.id = ls.application_id
      where ls.application_id = $1 and ls.location_id = $2`,
    [opts.applicationId, opts.locationId],
  );
  if (!step.rows[0]) throw new Error("The requested location was not found in this application.");
  if (["complete", "not_required"].includes(opts.status)) {
    if (step.rows[0].staff_status !== "complete" || step.rows[0].calendars_status !== "complete") {
      throw new Error("Create the staff account and finish calendar assignment before confirming the deposit setup.");
    }
    if (!finalWebhookWasSent(jsonObject(step.rows[0].result))) {
      throw new Error("The partner account-ready webhook must be confirmed before the deposit setup can be completed.");
    }
  }
  const percentage = Math.max(0, Math.min(100, Number(opts.percentage ?? 30)));
  const policyUrl = s(opts.policyUrl) || "https://policy.mydripnurse.com";
  const message = s(opts.message) ||
    `A ${percentage}% deposit reserves the appointment. The remaining balance is collected by the nurse at the visit. Refunds follow the appointment and deposit policy.`;
  const depositConfig = {
    percentage,
    policyUrl,
    message,
    updatedAt: new Date().toISOString(),
    updatedBy: opts.userId,
  };
  await pool.query(
    `update app.staff_application_location_steps
        set deposit_status = $3,
            deposit_config = $4::jsonb,
            deposit_completed_at = case when $3 in ('complete', 'not_required') then now() else null end,
            deposit_completed_by = case when $3 in ('complete', 'not_required') then $5 else null end,
            last_error = null,
            updated_at = now()
      where application_id = $1 and location_id = $2`,
    [opts.applicationId, opts.locationId, opts.status, JSON.stringify(depositConfig), opts.userId],
  );
  return refreshStaffApplicationStatus(opts.applicationId);
}

export async function rejectStaffApplication(applicationId: string, notes: string) {
  await ensureStaffSchema();
  const pool = getDbPool();
  await pool.query(
    `update app.staff_applications
        set status = 'rejected', admin_notes = nullif($2, ''), updated_at = now()
      where id = $1 and status <> 'completed'`,
    [applicationId, notes],
  );
  return getStaffApplication(applicationId);
}

export async function completeStaffApplication(applicationId: string) {
  const application = await refreshStaffApplicationStatus(applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.reviewedAt) throw new Error("Review the application before completing it.");
  const stripeComplete = allFinished(
    application.locations.map((location) => location.stripeStatus),
    ["complete", "not_required"],
  );
  if (!stripeComplete) throw new Error("Every location must complete the Stripe checkpoint first.");
  if (!finalWebhookWasSent(application.result)) {
    throw new Error("The partner account-ready webhook has not been confirmed.");
  }
  const complete = application.locations.length > 0 && application.locations.every((location) =>
    location.staffStatus === "complete" &&
    location.calendarsStatus === "complete" &&
    ["complete", "not_required"].includes(location.depositStatus)
  );
  if (!complete) throw new Error("Every location must have staff, calendars, and deposit setup completed first.");
  const pool = getDbPool();
  await pool.query(
    `update app.staff_applications
        set status = 'completed',
            provisioned_at = coalesce(provisioned_at, now()),
            updated_at = now()
      where id = $1 and status <> 'rejected'`,
    [applicationId],
  );
  return getStaffApplication(applicationId);
}
