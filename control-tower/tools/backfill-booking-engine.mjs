import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const scrypt = promisify(scryptCallback);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const definitionsPath = path.join(currentDirectory, "../src/data/myDripNurseServiceDefinitions.json");

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/mobile|therapy|treatment|calendar|service|booking|iv|drip|push/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function definitionForService(value, definitions) {
  const normalized = normalize(value);
  const special = normalized.includes("nad") && normalized.includes("boost") ? "nad-boost"
    : normalized.includes("nad") ? "nad-plus"
      : normalized.includes("immunity") && normalized.includes("glutathione") ? "immunity-glutathione"
        : normalized.includes("myers") && normalized.includes("glutathione") ? "myers-glutathione"
          : "";
  if (special) return definitions.find((definition) => definition.id === special) || null;
  return definitions.find((definition) => {
    const candidate = normalize(definition.name);
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  }) || null;
}

function partnerSlug(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "partner";
}

function staffPassword(firstName, lastName) {
  const initial = text(firstName).charAt(0).toUpperCase();
  const compactSurname = text(lastName).replace(/\s+/g, "");
  const surname = compactSurname.charAt(0).toUpperCase() + compactSurname.slice(1).toLowerCase();
  const suffix = "1234@";
  return `${initial}${surname}${"0".repeat(Math.max(0, 12 - initial.length - surname.length - suffix.length))}${suffix}`;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function reserveSlug(client, organizationId, preferred) {
  const base = partnerSlug(preferred);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const exists = await client.query(
      `select 1 from app.partner_profiles where organization_id = $1 and slug = $2 limit 1`,
      [organizationId, candidate],
    );
    if (!exists.rowCount) return candidate;
  }
  throw new Error(`Could not reserve a Partner slug for ${base}.`);
}

async function main() {
  const databaseUrl = process.env.SEED_PRODUCTION === "1"
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("A database URL is required.");
  const definitions = JSON.parse(await fs.readFile(definitionsPath, "utf8"));
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let assignments = 0;
  let coverageAreas = 0;
  let profiles = 0;
  let createdProfiles = 0;
  let skippedProfiles = 0;
  try {
    await client.query("begin");
    const legacyDefaults = await client.query(
      `select organization_id, normalized_name, display_name
         from app.partner_calendar_services
        where active_by_default = true`,
    );
    const defaultsByOrganization = new Map();
    for (const row of legacyDefaults.rows) {
      const definition = definitionForService(row.display_name || row.normalized_name, definitions);
      if (!definition) continue;
      const current = defaultsByOrganization.get(row.organization_id) || new Set();
      current.add(definition.id);
      defaultsByOrganization.set(row.organization_id, current);
    }

    const applications = await client.query(
      `select a.*,
              coalesce(jsonb_agg(jsonb_build_object(
                'state', l.state,
                'county', l.county,
                'locationId', l.location_id
              ) order by l.created_at) filter (where l.id is not null), '[]'::jsonb) as service_areas
         from app.staff_applications a
         left join app.staff_application_location_steps l on l.application_id = a.id
        where a.status in ('completed', 'completed_with_warnings')
        group by a.id
        order by a.created_at`,
    );
    for (const application of applications.rows) {
      const existing = await client.query(`select id from app.partner_profiles where application_id = $1 limit 1`, [application.id]);
      if (existing.rowCount) continue;
      const result = record(application.result);
      const resultUser = record(result.user);
      const integration = record(result.ghlIntegration);
      const ghlUserId = text(application.ghl_user_id || integration.userId || resultUser.userId);
      if (!ghlUserId) {
        skippedProfiles += 1;
        continue;
      }
      const requestPayload = record(application.request_payload);
      const firstName = text(application.first_name || requestPayload.firstName);
      const lastName = text(application.last_name || requestPayload.lastName);
      const displayName = `${firstName} ${lastName}`.trim() || text(application.email);
      const businessName = text(application.company || requestPayload.company);
      const slug = await reserveSlug(client, application.organization_id, businessName || displayName);
      const defaultSlugs = defaultsByOrganization.get(application.organization_id) || new Set();
      const catalog = await client.query(
        `select s.id, s.slug, s.name, s.price::text, s.currency, s.deposit_type,
                s.deposit_value::text, c.public_key
           from app.services s
           join app.service_calendars c on c.service_id = s.id
          where s.organization_id = $1 and s.is_active = true and c.status = 'active'
          order by s.name`,
        [application.organization_id],
      );
      const selectedCatalog = catalog.rows.filter((service) => defaultSlugs.has(service.slug));
      const services = selectedCatalog.map((service) => ({
        calendarId: service.public_key,
        name: service.name,
        normalizedName: service.slug,
        status: "active",
        price: numberOrNull(service.price),
        depositType: service.deposit_type,
        depositValue: numberOrNull(service.deposit_value),
        currency: service.currency,
      }));
      const serviceAreas = Array.isArray(application.service_areas) ? application.service_areas : [];
      const primaryLocationId = text(application.primary_location_id || requestPayload.primaryLocationId || serviceAreas[0]?.locationId);
      const portalPasswordHash = await hashPassword(staffPassword(firstName, lastName));
      await client.query(
        `insert into app.partner_profiles (
           organization_id, application_id, ghl_user_id, email, slug, display_name,
           business_name, public_title, professional_credentials, biography,
           profile_photo_url, profile_photo_file_id, profile_photo_location_id,
           primary_location_id, service_areas, website_status, ghl_photo_sync_status,
           profile_consent_at, affiliate_code, portal_password_hash, services
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15::jsonb, 'draft', $16, nullif($17, '')::timestamptz, $5, $18, $19::jsonb
         )`,
        [
          application.organization_id,
          application.id,
          ghlUserId,
          text(application.email).toLowerCase(),
          slug,
          displayName,
          businessName,
          text(application.public_title || requestPayload.publicTitle),
          text(application.professional_credentials || requestPayload.professionalCredentials),
          text(application.biography || requestPayload.biography),
          text(application.profile_photo_url || requestPayload.profilePhotoUrl),
          text(application.profile_photo_file_id || requestPayload.profilePhotoFileId),
          text(application.profile_photo_location_id || requestPayload.profilePhotoLocationId),
          primaryLocationId,
          JSON.stringify(serviceAreas),
          text(application.profile_photo_url || requestPayload.profilePhotoUrl) ? "synced" : "pending",
          text(application.profile_consent_at || requestPayload.profileConsentAt),
          portalPasswordHash,
          JSON.stringify(services),
        ],
      );
      createdProfiles += 1;
    }

    const result = await client.query(
      `select id, organization_id, services, service_areas, created_at::text
         from app.partner_profiles
        order by created_at`,
    );
    profiles = result.rows.length;
    for (const profile of result.rows) {
      const configuredServices = Array.isArray(profile.services) ? profile.services : [];
      for (const configured of configuredServices) {
        if (["inactive", "disabled", "removed"].includes(text(configured.status).toLowerCase())) continue;
        const definition = definitionForService(configured.name || configured.normalizedName, definitions);
        if (!definition) continue;
        const service = await client.query(
          `select id from app.services where organization_id = $1 and slug = $2 limit 1`,
          [profile.organization_id, definition.id],
        );
        const serviceId = service.rows[0]?.id;
        if (!serviceId) continue;
        const assignment = await client.query(
          `insert into app.partner_service_assignments (
             organization_id, partner_profile_id, service_id, status,
             price_override, activated_at, metadata
           ) values ($1, $2, $3, 'active', $4, coalesce($5::timestamptz, now()), '{"source":"profile_backfill"}'::jsonb)
           on conflict (partner_profile_id, service_id) do update set
             status = 'active',
             price_override = coalesce(app.partner_service_assignments.price_override, excluded.price_override),
             activated_at = coalesce(app.partner_service_assignments.activated_at, excluded.activated_at),
             deactivated_at = null,
             updated_at = now()
           returning id`,
          [profile.organization_id, profile.id, serviceId, numberOrNull(configured.priceOverride), profile.created_at],
        );
        const assignmentId = assignment.rows[0]?.id;
        if (!assignmentId) continue;
        assignments += 1;
        for (const area of Array.isArray(profile.service_areas) ? profile.service_areas : []) {
          const state = text(area.state);
          const county = text(area.county);
          if (!state || !county) continue;
          const inserted = await client.query(
            `insert into app.partner_coverage_areas (assignment_id, state, county, metadata)
             values ($1, $2, $3, $4::jsonb)
             on conflict do nothing`,
            [assignmentId, state, county, JSON.stringify({ locationId: text(area.locationId), source: "profile_backfill" })],
          );
          coverageAreas += inserted.rowCount || 0;
        }
      }
    }
    await client.query("commit");
    const totals = await client.query(
      `select
         (select count(*)::int from app.partner_service_assignments where status = 'active') as assignments,
         (select count(*)::int from app.partner_coverage_areas where status = 'active') as coverage_areas,
         (select count(*)::int from app.partner_availability_rules where is_active = true) as availability_rules`,
    );
    console.log(JSON.stringify({
      profiles,
      createdProfiles,
      skippedProfilesWithoutGhlIdentity: skippedProfiles,
      defaultServiceCount: legacyDefaults.rows.length,
      processedAssignments: assignments,
      insertedCoverageAreas: coverageAreas,
      activeAssignments: totals.rows[0]?.assignments || 0,
      activeCoverageAreas: totals.rows[0]?.coverage_areas || 0,
      availabilityRules: totals.rows[0]?.availability_rules || 0,
    }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
