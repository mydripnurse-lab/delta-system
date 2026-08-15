import { cache } from "react";

import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

export type PartnerServiceArea = {
  state: string;
  county: string;
  locationId: string;
  city?: string;
  stateCode?: string;
  stateFips?: string;
  countyFips?: string;
  countyGeoid?: string;
  placeName?: string;
  placeGeoid?: string;
  geographySource?: string;
  geographyVerifiedAt?: string;
};

export type PartnerService = {
  calendarId: string;
  name: string;
  status: string;
  normalizedName?: string;
  price?: number | null;
  priceOverride?: number | null;
};

export type PublicPartnerProfile = {
  id: string;
  organizationId: string;
  slug: string;
  displayName: string;
  businessName: string;
  publicTitle: string;
  professionalCredentials: string;
  biography: string;
  profilePhotoUrl: string;
  primaryLocationId: string;
  groupCalendarId: string;
  groupCalendarUrl: string;
  services: PartnerService[];
  serviceAreas: PartnerServiceArea[];
  websiteStatus: "draft" | "ready" | "published" | "hidden";
  directoryStatus: "published" | "hidden";
  affiliateCode: string;
};

export const TEMPLATE_PREVIEW_PROFILE: PublicPartnerProfile = {
  id: "template-preview",
  organizationId: "",
  slug: "template-preview",
  displayName: "Alexandra Rivera",
  businessName: "Sunshine IV Wellness",
  publicTitle: "Registered Nurse & Mobile IV Therapy Partner",
  professionalCredentials: "RN, BSN",
  biography:
    "Alexandra brings compassionate, detail-oriented care directly to every appointment. Her goal is to create a calm, professional experience that helps each patient feel supported from the first conversation through the final follow-up.",
  profilePhotoUrl: "",
  primaryLocationId: "preview-location",
  groupCalendarId: "preview-calendar",
  groupCalendarUrl: "",
  services: [
    { calendarId: "preview-hydration", name: "Hydration", status: "active" },
    { calendarId: "preview-brain-storm", name: "Brain Storm", status: "active" },
    { calendarId: "preview-alleviate", name: "Alleviate", status: "active" },
    { calendarId: "preview-recovery", name: "Recovery & Performance", status: "active" },
    { calendarId: "preview-myers", name: "Myers' Cocktail", status: "active" },
    { calendarId: "preview-myers-glutathione", name: "Myers' Cocktail + Glutathione Push", status: "active" },
    { calendarId: "preview-lean", name: "Get Lean / Weight Loss", status: "active" },
    { calendarId: "preview-hangover", name: "Hangover / Jet Lag", status: "active" },
    { calendarId: "preview-glow", name: "The Glow / Beauty IV Drip", status: "active" },
    { calendarId: "preview-immunity", name: "Immunity Defense / Cold & Flu", status: "active" },
    { calendarId: "preview-immunity-glutathione", name: "Immunity Defense + Glutathione", status: "active" },
    { calendarId: "preview-nad", name: "NAD+", status: "active" },
    { calendarId: "preview-nad-boost", name: "NAD+ Boost", status: "active" },
  ],
  serviceAreas: [
    { state: "Florida", county: "Orange County", locationId: "preview-location", stateCode: "FL", stateFips: "12", countyFips: "095", countyGeoid: "12095" },
    { state: "Florida", county: "Osceola County", locationId: "preview-location-2", stateCode: "FL", stateFips: "12", countyFips: "097", countyGeoid: "12097" },
  ],
  websiteStatus: "published",
  directoryStatus: "published",
  affiliateCode: "alexandra-rivera",
};

export type PartnerPortalProfile = PublicPartnerProfile & {
  applicationId: string;
  organizationId: string;
  ghlUserId: string;
  email: string;
  profilePhotoFileId: string;
  profilePhotoLocationId: string;
  ghlPhotoSyncStatus: "pending" | "syncing" | "synced" | "failed";
  ghlPhotoSyncError: string;
  referredApplications: number;
  portalTourCompleted: boolean;
  portalTourRequired: boolean;
};

type ProfileRow = {
  id: string;
  organization_id: string;
  slug: string;
  display_name: string;
  business_name: string | null;
  public_title: string | null;
  professional_credentials: string | null;
  biography: string | null;
  profile_photo_url: string | null;
  primary_location_id: string | null;
  group_calendar_id: string | null;
  group_calendar_url: string | null;
  services: PartnerService[] | null;
  service_areas: PartnerServiceArea[] | null;
  website_status: PublicPartnerProfile["websiteStatus"];
  directory_status: PublicPartnerProfile["directoryStatus"];
  application_id?: string;
  ghl_user_id?: string;
  email?: string;
  profile_photo_file_id?: string | null;
  profile_photo_location_id?: string | null;
  ghl_photo_sync_status?: PartnerPortalProfile["ghlPhotoSyncStatus"];
  ghl_photo_sync_error?: string | null;
  affiliate_code?: string | null;
  referred_applications?: number | string | null;
  portal_tour_completed_at?: string | null;
  portal_tour_required?: boolean | null;
};

function s(value: unknown) {
  return String(value ?? "").trim();
}

function mapProfile(row: ProfileRow): PublicPartnerProfile {
  return {
    id: row.id,
    organizationId: s(row.organization_id),
    slug: row.slug,
    displayName: s(row.display_name),
    businessName: s(row.business_name),
    publicTitle: s(row.public_title),
    professionalCredentials: s(row.professional_credentials),
    biography: s(row.biography),
    profilePhotoUrl: s(row.profile_photo_url),
    primaryLocationId: s(row.primary_location_id),
    groupCalendarId: s(row.group_calendar_id),
    groupCalendarUrl: s(row.group_calendar_url),
    services: Array.isArray(row.services) ? row.services : [],
    serviceAreas: Array.isArray(row.service_areas) ? row.service_areas : [],
    websiteStatus: row.website_status,
    directoryStatus: row.directory_status || "hidden",
    affiliateCode: s(row.affiliate_code) || row.slug,
  };
}

const PUBLIC_PROFILE_SELECT = `
  select id, organization_id, slug, display_name, business_name, public_title,
         professional_credentials, biography, profile_photo_url,
         primary_location_id, group_calendar_id, group_calendar_url,
         services, service_areas, website_status, directory_status
         , affiliate_code
    from app.partner_profiles
`;

export const getPublicPartnerProfile = cache(async function getPublicPartnerProfile(slugRaw: string) {
  await ensureStaffSchema();
  const slug = s(slugRaw).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const result = await getDbPool().query<ProfileRow>(
    `${PUBLIC_PROFILE_SELECT}
      where slug = $1 and website_status = 'published'
      limit 1`,
    [slug],
  );
  return result.rows[0] ? mapProfile(result.rows[0]) : null;
});

export async function getPartnerProfileForPublicPage(slugRaw: string, previewApplicationId?: string) {
  const slug = s(slugRaw).toLowerCase();
  if (slug === TEMPLATE_PREVIEW_PROFILE.slug) return TEMPLATE_PREVIEW_PROFILE;
  if (previewApplicationId) return getPartnerProfileForWebsitePreview(slug, previewApplicationId);
  return getPublicPartnerProfile(slug);
}

export async function getPartnerProfileForWebsitePreview(slugRaw: string, applicationIdRaw: string) {
  await ensureStaffSchema();
  const slug = s(slugRaw).toLowerCase();
  const applicationId = s(applicationIdRaw);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(applicationId)) return null;
  const result = await getDbPool().query<ProfileRow>(
    `${PUBLIC_PROFILE_SELECT}
      where slug = $1
        and application_id = $2
        and website_status in ('ready', 'published', 'hidden')
      limit 1`,
    [slug, applicationId],
  );
  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function listPublicPartnerProfiles(limit = 100) {
  await ensureStaffSchema();
  const result = await getDbPool().query<ProfileRow>(
    `${PUBLIC_PROFILE_SELECT}
      where directory_status = 'published'
      order by display_name asc
      limit $1`,
    [Math.max(1, Math.min(250, limit))],
  );
  return result.rows.map(mapProfile);
}

export async function listPublishedPartnerWebsites(limit = 100) {
  await ensureStaffSchema();
  const result = await getDbPool().query<ProfileRow>(
    `${PUBLIC_PROFILE_SELECT}
      where website_status = 'published'
      order by display_name asc
      limit $1`,
    [Math.max(1, Math.min(250, limit))],
  );
  return result.rows.map(mapProfile);
}

export async function getPartnerProfileForPortal(profileIdRaw: string): Promise<PartnerPortalProfile | null> {
  await ensureStaffSchema();
  const profileId = s(profileIdRaw);
  if (!profileId) return null;
  const result = await getDbPool().query<ProfileRow>(
    `select id, application_id, organization_id, ghl_user_id, email,
            slug, display_name, business_name, public_title,
            professional_credentials, biography, profile_photo_url,
            profile_photo_file_id, profile_photo_location_id,
            primary_location_id, group_calendar_id, group_calendar_url,
            services, service_areas, website_status,
            ghl_photo_sync_status, ghl_photo_sync_error, affiliate_code,
            portal_tour_completed_at, portal_tour_required,
            (select count(*) from app.staff_applications a where a.referred_by_profile_id = p.id)::int as referred_applications
       from app.partner_profiles p
      where p.id = $1
      limit 1`,
    [profileId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapProfile(row),
    applicationId: s(row.application_id),
    organizationId: s(row.organization_id),
    ghlUserId: s(row.ghl_user_id),
    email: s(row.email),
    profilePhotoFileId: s(row.profile_photo_file_id),
    profilePhotoLocationId: s(row.profile_photo_location_id),
    ghlPhotoSyncStatus: row.ghl_photo_sync_status || "pending",
    ghlPhotoSyncError: s(row.ghl_photo_sync_error),
    referredApplications: Number(row.referred_applications || 0),
    portalTourCompleted: Boolean(row.portal_tour_completed_at),
    portalTourRequired: Boolean(row.portal_tour_required),
  };
}

export async function markPartnerPortalTourCompleted(profileIdRaw: string) {
  await ensureStaffSchema();
  const profileId = s(profileIdRaw);
  if (!profileId) return false;
  const result = await getDbPool().query(
    `update app.partner_profiles
        set portal_tour_completed_at = coalesce(portal_tour_completed_at, now()),
            portal_tour_required = false,
            updated_at = now()
      where id = $1`,
    [profileId],
  );
  return (result.rowCount || 0) > 0;
}

export async function updatePartnerPortalProfile(opts: {
  profileId: string;
  displayName: string;
  businessName: string;
  publicTitle: string;
  professionalCredentials: string;
  biography: string;
  profilePhoto?: {
    url: string;
    fileId: string;
    locationId: string;
    data?: string;
    contentType?: string;
  };
}) {
  await ensureStaffSchema();
  const result = await getDbPool().query<ProfileRow>(
    `update app.partner_profiles
        set display_name = $2,
            business_name = nullif($3, ''),
            public_title = $4,
            professional_credentials = nullif($5, ''),
            biography = $6,
            profile_photo_url = coalesce(nullif($7, ''), profile_photo_url),
            profile_photo_data = coalesce(nullif($10, ''), profile_photo_data),
            profile_photo_content_type = coalesce(nullif($11, ''), profile_photo_content_type),
            profile_photo_file_id = coalesce(nullif($8, ''), profile_photo_file_id),
            profile_photo_location_id = coalesce(nullif($9, ''), profile_photo_location_id),
            updated_at = now()
      where id = $1
      returning id`,
    [
      opts.profileId,
      opts.displayName,
      opts.businessName,
      opts.publicTitle,
      opts.professionalCredentials,
      opts.biography,
      opts.profilePhoto?.url || "",
      opts.profilePhoto?.fileId || "",
      opts.profilePhoto?.locationId || "",
      opts.profilePhoto?.data || "",
      opts.profilePhoto?.contentType || "",
    ],
  );
  return Boolean(result.rows[0]);
}

export async function setPartnerPhotoSyncResult(opts: {
  profileId: string;
  status: "synced" | "failed";
  error?: string;
}) {
  await ensureStaffSchema();
  await getDbPool().query(
    `update app.partner_profiles
        set ghl_photo_sync_status = $2,
            ghl_photo_synced_at = case when $2 = 'synced' then now() else ghl_photo_synced_at end,
            ghl_photo_sync_error = nullif($3, ''),
            updated_at = now()
      where id = $1`,
    [opts.profileId, opts.status, opts.error || ""],
  );
}
