import { getDbPool } from "@/lib/db";
import {
  ensurePartnerCalendarSchema,
  listApplicationCalendarMatrix,
  savePartnerCalendarServiceSetup,
} from "@/lib/partnerCalendarAssignments";
import {
  getStaffFormConfigForTenant,
  inspectConfiguredCalendarSample,
  loadEligibleCounties,
} from "@/lib/publicStaffProvisioning";

async function getMyDripNurseTenantId() {
  const result = await getDbPool().query<{ id: string }>(
    `select id from app.organizations where slug = 'my-drip-nurse' limit 1`,
  );
  const tenantId = String(result.rows[0]?.id || "").trim();
  if (!tenantId) throw new Error("The My Drip Nurse organization is not configured.");
  return tenantId;
}

export async function getPartnerCalendarCatalog() {
  const tenantId = await getMyDripNurseTenantId();
  const config = await getStaffFormConfigForTenant(tenantId);
  await ensurePartnerCalendarSchema();
  const pool = getDbPool();
  for (const name of config.calendarNames) {
    const normalizedName = name.trim().normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").toLowerCase();
    await pool.query(
      `insert into app.partner_calendar_services (
         organization_id, normalized_name, display_name, active_by_default
       ) values ($1, $2, $3, true)
       on conflict (organization_id, normalized_name) do nothing`,
      [tenantId, normalizedName, name],
    );
  }
  const [counties, services] = await Promise.all([
    loadEligibleCounties(config),
    pool.query<{
      id: string;
      normalized_name: string;
      display_name: string;
      price: string | null;
      deposit_type: "percentage" | "fixed";
      deposit_value: string | null;
      currency: string;
      active_by_default: boolean;
      last_seen_at: string | null;
    }>(`select id, normalized_name, display_name, price, deposit_type, deposit_value,
               currency, active_by_default, last_seen_at
          from app.partner_calendar_services
         where organization_id = $1
         order by display_name`, [tenantId]),
  ]);
  return {
    tenantId,
    calendarMode: config.calendarMode,
    eligibleLocationCount: counties.length,
    calendars: services.rows.map((row) => ({
      id: row.id,
      normalizedName: row.normalized_name,
      name: row.display_name,
      price: row.price === null ? null : Number(row.price),
      depositType: row.deposit_type,
      depositValue: row.deposit_value === null ? null : Number(row.deposit_value),
      currency: row.currency,
      activeByDefault: row.active_by_default,
      lastSeenAt: row.last_seen_at,
      inventoryStatus: row.last_seen_at ? "discovered" as const : "not_synced" as const,
    })),
  };
}

export async function inspectPartnerCalendar(calendarName: string, sampleSize?: number) {
  const tenantId = await getMyDripNurseTenantId();
  const config = await getStaffFormConfigForTenant(tenantId);
  return inspectConfiguredCalendarSample({ config, calendarName, sampleSize });
}

export async function syncRequestedPartnerCalendars() {
  await ensurePartnerCalendarSchema();
  const applications = await getDbPool().query<{ id: string }>(
    `select a.id
       from app.staff_applications a
       join app.organizations o on o.id = a.organization_id and o.slug = 'my-drip-nurse'
      where a.status not in ('rejected', 'deactivated')
        and exists (select 1 from app.staff_application_location_steps l where l.application_id = a.id)
      order by coalesce(a.submitted_at, a.created_at) desc
      limit 50`,
  );
  const errors: Array<{ applicationId: string; error: string }> = [];
  for (const application of applications.rows) {
    try {
      await listApplicationCalendarMatrix(application.id);
    } catch (error) {
      errors.push({ applicationId: application.id, error: error instanceof Error ? error.message : "Sync failed." });
    }
  }
  return { scannedApplications: applications.rows.length, errors };
}

export async function updatePartnerCalendarSetup(opts: {
  normalizedName: string;
  price: number | null;
  depositType: "percentage" | "fixed";
  depositValue: number | null;
  activeByDefault: boolean;
}) {
  const tenantId = await getMyDripNurseTenantId();
  await savePartnerCalendarServiceSetup({ organizationId: tenantId, ...opts });
  return getPartnerCalendarCatalog();
}
