import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const definitionsPath = path.join(
  currentDirectory,
  "../src/data/myDripNurseServiceDefinitions.json",
);
const sheetId = "1KZ_L0lIhoc2LHp67C6oT_V1ZAd5nxxjIH9fARiNEo2E";

function text(value) {
  return String(value ?? "").trim();
}

function normalizedService(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/mobile|therapy|treatment|calendar|service|booking|iv|drip|push/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function definitionKey(value) {
  const normalized = normalizedService(value);
  if (normalized.includes("nad") && normalized.includes("boost")) return "nad-boost";
  if (normalized.includes("nad")) return "nad-plus";
  if (normalized.includes("immunity") && normalized.includes("glutathione")) return "immunity-glutathione";
  if (normalized.includes("myers") && normalized.includes("glutathione")) return "myers-glutathione";
  return normalized;
}

function legacySettingFor(definition, legacyRows) {
  const target = definitionKey(definition.name);
  const matches = legacyRows.filter((row) => {
    const display = definitionKey(row.display_name);
    const normalized = definitionKey(row.normalized_name);
    const id = definition.id;
    return display === target || normalized === target || display === id || normalized === id;
  });
  return matches.find((row) => row.price !== null) || matches[0] || null;
}

async function main() {
  const databaseUrl = process.env.SEED_PRODUCTION === "1"
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(process.env.SEED_PRODUCTION === "1"
      ? "PROD_DATABASE_URL is required when SEED_PRODUCTION=1."
      : "DATABASE_URL is required.");
  }
  const definitions = JSON.parse(await fs.readFile(definitionsPath, "utf8"));
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const organization = await client.query(
      `select id
         from app.organizations
        where lower(slug) = 'my-drip-nurse'
           or lower(name) = 'my drip nurse'
        order by case when lower(slug) = 'my-drip-nurse' then 0 else 1 end
        limit 1`,
    );
    const organizationId = text(organization.rows[0]?.id);
    if (!organizationId) throw new Error("The My Drip Nurse organization is not configured.");

    const legacyTable = await client.query(
      `select to_regclass('app.partner_calendar_services')::text as table_name`,
    );
    const legacyRows = legacyTable.rows[0]?.table_name
      ? (await client.query(
        `select display_name, normalized_name, price::text, deposit_type,
                deposit_value::text, currency
           from app.partner_calendar_services
          where organization_id = $1`,
        [organizationId],
      )).rows
      : [];

    await client.query("begin");
    let insertedServices = 0;
    let insertedCalendars = 0;
    for (const definition of definitions) {
      const legacy = legacySettingFor(definition, legacyRows);
      const inserted = await client.query(
        `insert into app.services (
           organization_id, slug, name, short_description, ingredients,
           price, currency, deposit_type, deposit_value,
           image_url, image_alt, image_title,
           landing_page_url, survey_cta_url, source_metadata
         ) values (
           $1, $2, $3, $4, $5::text[],
           $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15::jsonb
         )
         on conflict (organization_id, slug) do update set
           name = excluded.name,
           short_description = excluded.short_description,
           ingredients = excluded.ingredients,
           deposit_type = 'percentage',
           deposit_value = 35,
           image_url = excluded.image_url,
           image_alt = excluded.image_alt,
           image_title = excluded.image_title,
           landing_page_url = excluded.landing_page_url,
           survey_cta_url = excluded.survey_cta_url,
           source_metadata = app.services.source_metadata || excluded.source_metadata,
           updated_at = now()
         returning id`,
        [
          organizationId,
          definition.id,
          definition.name,
          definition.description,
          definition.ingredients,
          Number(legacy?.price || 0),
          legacy?.currency || "USD",
          "percentage",
          35,
          definition.imageUrl,
          `${definition.name} mobile IV therapy`,
          `${definition.name} mobile IV therapy`,
          `{{custom_values.business__county_domain}}${definition.landingPath}`,
          `{{custom_values.business__county_domain}}${definition.surveyPath}`,
          JSON.stringify({ googleSheetId: sheetId, googleSheetRow: definition.sheetRow }),
        ],
      );
      insertedServices += inserted.rowCount || 0;
      const serviceId = inserted.rows[0]?.id || (await client.query(
        `select id from app.services where organization_id = $1 and slug = $2 limit 1`,
        [organizationId, definition.id],
      )).rows[0]?.id;
      if (!serviceId) throw new Error(`Could not seed ${definition.name}.`);
      const calendar = await client.query(
        `insert into app.service_calendars (service_id, public_key)
         values ($1, $2)
         on conflict (service_id) do update set
           status = 'active',
           minimum_notice_minutes = 120,
           updated_at = now()
         returning id`,
        [serviceId, `mdn-${definition.id}`],
      );
      insertedCalendars += calendar.rowCount || 0;
    }
    await client.query(
      `update app.service_calendars
          set minimum_notice_minutes = 120,
              updated_at = now()
        where minimum_notice_minutes < 120`,
    );
    await client.query(`
      do $$
      begin
        if not exists (
          select 1
            from pg_constraint
           where conrelid = 'app.service_calendars'::regclass
             and conname = 'service_calendars_minimum_notice_two_hours_ck'
        ) then
          alter table app.service_calendars
            add constraint service_calendars_minimum_notice_two_hours_ck
            check (minimum_notice_minutes >= 120);
        end if;
      end $$;
    `);
    await client.query("commit");
    const totals = await client.query(
      `select
         (select count(*)::int from app.services where organization_id = $1) as services,
         (select count(*)::int
            from app.service_calendars c
            join app.services s on s.id = c.service_id
           where s.organization_id = $1) as calendars`,
      [organizationId],
    );
    console.log(JSON.stringify({ insertedServices, insertedCalendars, ...totals.rows[0] }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[db:seed:services] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
