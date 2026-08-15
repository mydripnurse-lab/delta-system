import { cache } from "react";

import { getDbPool } from "@/lib/db";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import type { PartnerService } from "@/lib/partnerProfiles";

export type MyDripNurseServiceDefinition = {
  id: string;
  name: string;
  imageUrl: string;
  landingPath: string;
  priceKey: string;
  priceAliases: string[];
  ingredients: string[];
  description: string;
};

export type MyDripNurseServiceWithPrice = MyDripNurseServiceDefinition & {
  price: string;
  priceUpdatedAt: string;
  calendarId?: string;
  availabilityStatus?: "active" | "out_of_stock";
};

export const MY_DRIP_NURSE_SERVICES: MyDripNurseServiceDefinition[] = [
  {
    id: "hydration",
    name: "Hydration",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d28.png",
    landingPath: "/hydration-mobile-iv-therapy",
    priceKey: "price__hydrate",
    priceAliases: ["Price - Hydrate", "Price Hydrate", "price__hydrate"],
    ingredients: ["Vitamin C", "Mineral Blend", "B-Complex"],
    description: "Everyday hydration support delivered directly to you.",
  },
  {
    id: "brain-storm",
    name: "Brain Storm",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b16b0e5e2bb7ffb13f6.png",
    landingPath: "/mobile-iv-therapy-brain-storm",
    priceKey: "price__brain_storm",
    priceAliases: ["Price - Brain Storm", "Price Brain Storm", "price__brain_storm"],
    ingredients: ["Vitamin C", "B-Complex", "Amino Blend", "Mineral Blend"],
    description: "A focused blend designed for mental clarity and wellness support.",
  },
  {
    id: "alleviate",
    name: "Alleviate",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eea0199fe87a9994383bdb.png",
    landingPath: "/mobile-iv-therapy-alleviate",
    priceKey: "price__alleviate",
    priceAliases: ["Price - Alleviate", "Price Alleviate", "price__alleviate"],
    ingredients: ["Calcium", "Magnesium", "B-Complex", "Vitamin B-12"],
    description: "Targeted replenishment for a more comfortable recovery experience.",
  },
  {
    id: "recovery-performance",
    name: "Recovery & Performance",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b4f05d4199001cea525.png",
    landingPath: "/mobile-iv-therapy-recovery-and-performance",
    priceKey: "price__recovery__performance",
    priceAliases: ["Price - Recovery & Performance", "Price Recovery Performance", "price__recovery__performance"],
    ingredients: ["Vitamin C", "B-Complex", "Amino Blend", "Mineral Blend"],
    description: "Hydration and nutrient support for active lifestyles and recovery days.",
  },
  {
    id: "myers-cocktail",
    name: "Myers' Cocktail",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d26.png",
    landingPath: "/mobile-iv-therapy-myers-cocktail",
    priceKey: "price__myers_cocktail",
    priceAliases: ["Price - Myers Cocktail", "Price Myers Cocktail", "price__myers_cocktail"],
    ingredients: ["Vitamin C", "B-Complex", "Vitamin B-12", "Mineral Blend"],
    description: "A classic wellness blend with vitamins and minerals for whole-body support.",
  },
  {
    id: "myers-glutathione",
    name: "Myers' Cocktail + Glutathione Push",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb3191717d5dd4e1934c0d.png",
    landingPath: "/mobile-iv-therapy-myers-cocktail-and-glutathione-push",
    priceKey: "price__myers_cocktail__glutathione",
    priceAliases: ["Price - Myers Cocktail - Glutathione", "Price Myers Cocktail Glutathione", "price__myers_cocktail__glutathione"],
    ingredients: ["Vitamin C", "B-Complex", "Vitamin B-12", "Mineral Blend", "Glutathione Push"],
    description: "Our Myers' Cocktail enhanced with a Glutathione Push.",
  },
  {
    id: "get-lean",
    name: "Get Lean / Weight Loss",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb3191717d5dd4e1934c0e.png",
    landingPath: "/get-lean-weight-loss-mobile-iv-therapy",
    priceKey: "price__get_lean__weight_loss",
    priceAliases: ["Price - Get Lean - Weight Loss", "Price Get Lean Weight Loss", "price__get_lean__weight_loss"],
    ingredients: ["Vitamin C", "B-Complex", "Amino Blend", "Mineral Blend"],
    description: "Nutrient support designed to complement an active wellness plan.",
  },
  {
    id: "hangover-jet-lag",
    name: "Hangover / Jet Lag",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb342a0d66f2a665c9a731.png",
    landingPath: "/mobile-iv-therapy-hangover-jet-lag",
    priceKey: "price__hangover__jet_lag",
    priceAliases: ["Price - Hangover - Jet Lag", "Price Hangover Jet Lag", "price__hangover__jet_lag"],
    ingredients: ["Ondansetron", "Mineral Blend", "B-Complex"],
    description: "Rehydration and wellness support after travel or a long night.",
  },
  {
    id: "the-glow",
    name: "The Glow / Beauty IV Drip",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31919fe87a9994954d27.png",
    landingPath: "/mobile-iv-the-glow-beauty-iv-drip",
    priceKey: "price__the_glow",
    priceAliases: ["Price - The Glow", "Price The Glow", "price__the_glow"],
    ingredients: ["Vitamin C", "B-Complex", "Biotin"],
    description: "Beauty-focused nutrient support for your inside-out wellness routine.",
  },
  {
    id: "immunity-defense",
    name: "Immunity Defense / Cold & Flu",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69b38ce2bfc81fb94cdb5931.png",
    landingPath: "/mobile-iv-therapy-immunity-defense-cold-flu",
    priceKey: "price__immunity_defense",
    priceAliases: ["Price - Immunity Defense", "Price Immunity Defense", "price__immunity_defense"],
    ingredients: ["Vitamin C", "Zinc", "B-Complex"],
    description: "A nutrient blend selected to support immune wellness.",
  },
  {
    id: "immunity-glutathione",
    name: "Immunity Defense + Glutathione",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/6a1a6fe85a3e6e89b6f1b119.png",
    landingPath: "/mobile-iv-therapy-immunity-defense-cold-flu-and-glutathione",
    priceKey: "price__immunity_defense__glutathione_push",
    priceAliases: ["Price - Immunity Defense - Glutathione Push", "Price Immunity Defense Glutathione Push", "price__immunity_defense__glutathione_push"],
    ingredients: ["Vitamin C", "Zinc", "B-Complex", "Glutathione Push"],
    description: "Immunity Defense enhanced with a Glutathione Push.",
  },
  {
    id: "nad-plus",
    name: "NAD+",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69eb31910d66f2a665c92182.png",
    landingPath: "/nad-plus-mobile-iv-therapy",
    priceKey: "price__nad",
    priceAliases: ["Price - NAD", "Price NAD", "price__nad"],
    ingredients: ["NAD+", "1000 mL IV Fluids"],
    description: "A premium NAD+ infusion designed for comprehensive wellness support.",
  },
  {
    id: "nad-boost",
    name: "NAD+ Boost",
    imageUrl: "https://assets.cdn.filesafe.space/K8GcSVZWinRaQTMF6Sb8/media/69ee9b7e05d4199001cead8a.png",
    landingPath: "/nad-plus-boost-mobile-iv-therapy",
    priceKey: "price__nad_boost",
    priceAliases: ["Price - NAD Boost", "Price NAD Boost", "price__nad_boost"],
    ingredients: ["NAD+", "1000 mL IV Fluids", "Magnesium", "Vitamin C", "Vitamin B-12", "B-Complex", "Glutathione Push"],
    description: "NAD+ with additional fluids, vitamins, minerals, and Glutathione.",
  },
];

function s(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function displayPrice(value: unknown) {
  const raw = s(value);
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return `$${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
    }
  }
  return raw;
}

async function resolveCatalogOrganizationId(organizationIdRaw: string) {
  const organizationId = s(organizationIdRaw);
  if (organizationId) return organizationId;
  const result = await getDbPool().query<{ id: string }>(
    `select id
       from app.organizations
      where lower(slug) = 'my-drip-nurse'
         or lower(name) = 'my drip nurse'
      order by case when lower(slug) = 'my-drip-nurse' then 0 else 1 end
      limit 1`,
  );
  return s(result.rows[0]?.id);
}

export const loadCurrentMyDripNurseServices = cache(async function loadCurrentMyDripNurseServices(
  organizationIdRaw = "",
): Promise<MyDripNurseServiceWithPrice[]> {
  const organizationId = await resolveCatalogOrganizationId(organizationIdRaw);
  const catalogOrganizationId = (await resolveCatalogOrganizationId("")) || organizationId;
  if (!catalogOrganizationId) {
    return MY_DRIP_NURSE_SERVICES.map((service) => ({ ...service, price: "", priceUpdatedAt: "" }));
  }
  const { seedMyDripNurseServices } = await import("@/lib/myDripNurseServiceCatalog");
  await seedMyDripNurseServices();
  const result = await getDbPool().query<{
    slug: string;
    name: string;
    short_description: string;
    ingredients: string[] | null;
    price: string;
    image_url: string;
    updated_at: string;
    public_key: string;
  }>(
    `select s.slug, s.name, s.short_description, s.ingredients,
            s.price::text, s.image_url, s.updated_at::text, c.public_key
       from app.services s
       join app.service_calendars c on c.service_id = s.id
      where s.organization_id = $1 and s.is_active = true`,
    [catalogOrganizationId],
  );
  const catalog = new Map(result.rows.map((row) => [row.slug, row] as const));
  return MY_DRIP_NURSE_SERVICES.flatMap((service) => {
    const current = catalog.get(service.id) as (typeof result.rows)[number] | undefined;
    if (!current) return [];
    return [{
      ...service,
      name: current.name || service.name,
      description: current.short_description || service.description,
      ingredients: current.ingredients || service.ingredients,
      imageUrl: current.image_url || service.imageUrl,
      price: displayPrice(current.price),
      priceUpdatedAt: s(current.updated_at),
      calendarId: current.public_key,
    }];
  });
});

function normalizeCalendarService(value: unknown) {
  return s(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/mobile|therapy|treatment|calendar|service|booking|iv|drip|push/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function definitionForCalendar(name: string) {
  const normalized = normalizeCalendarService(name);
  const special = normalized.includes("nad") && normalized.includes("boost") ? "nad-boost"
    : normalized.includes("nad") ? "nad-plus"
      : normalized.includes("immunity") && normalized.includes("glutathione") ? "immunity-glutathione"
        : normalized.includes("myers") && normalized.includes("glutathione") ? "myers-glutathione"
          : "";
  if (special) return MY_DRIP_NURSE_SERVICES.find((service) => service.id === special) || null;
  return MY_DRIP_NURSE_SERVICES.find((service) => {
    const candidate = normalizeCalendarService(service.name);
    return normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized);
  }) || null;
}

export function partnerServiceSlug(service: Pick<MyDripNurseServiceDefinition, "landingPath">) {
  return service.landingPath.replace(/^\/+|\/+$/g, "");
}

export function definitionForServiceSlug(slugRaw: string) {
  const slug = s(slugRaw).toLowerCase().replace(/^\/+|\/+$/g, "");
  return MY_DRIP_NURSE_SERVICES.find((service) => partnerServiceSlug(service) === slug) || null;
}

export function partnerCalendarBookingUrl(calendarIdRaw: string) {
  const calendarId = s(calendarIdRaw);
  if (!calendarId || calendarId.startsWith("preview-") || !/^[a-zA-Z0-9_-]+$/.test(calendarId)) return "";
  return `https://api.leadconnectorhq.com/widget/booking/${calendarId}`;
}

export const loadPartnerCalendarServices = cache(async function loadPartnerCalendarServices(
  organizationIdRaw: string,
  activeServices: PartnerService[],
  partnerProfileIdRaw = "",
): Promise<MyDripNurseServiceWithPrice[]> {
  const organizationId = await resolveCatalogOrganizationId(organizationIdRaw);
  let active = activeServices.filter((service) => !["inactive", "disabled", "removed", "paused", "revoked"].includes(s(service.status).toLowerCase()));
  const partnerProfileId = s(partnerProfileIdRaw);
  // The public profile keeps a legacy snapshot for backwards compatibility,
  // but the booking engine is authoritative. Rebuild the visible service list
  // from active assignments so a partner can see the calendars created in Admin
  // even when that snapshot has not been refreshed yet.
  if (organizationId && /^[0-9a-f-]{36}$/i.test(partnerProfileId)) {
    await ensureBookingEngineSchema();
    const assignments = await getDbPool().query<{
      slug: string;
      name: string;
      calendar_id: string;
      price_override: string | null;
      assignment_status: "active" | "out_of_stock";
    }>(
      `select s.slug, s.name, c.public_key as calendar_id, a.price_override::text,
              a.status as assignment_status
         from app.partner_service_assignments a
         join app.services s on s.id = a.service_id
         join app.service_calendars c on c.service_id = s.id and c.status = 'active'
        where a.partner_profile_id = $1
          and a.status in ('active', 'out_of_stock')
          and s.is_active = true
        order by s.name asc`,
      [partnerProfileId],
    );
    if (assignments.rows.length) {
      active = assignments.rows.map((assignment) => ({
        calendarId: assignment.calendar_id,
        name: assignment.name,
        status: assignment.assignment_status,
        normalizedName: assignment.slug,
        priceOverride: assignment.price_override === null ? null : Number(assignment.price_override),
      }));
    }
  }
  if (!organizationId) {
    return active.map((service, index) => {
      const definition = definitionForCalendar(service.name) || MY_DRIP_NURSE_SERVICES[index % MY_DRIP_NURSE_SERVICES.length];
      return {
        ...definition,
        name: service.name || definition.name,
        price: "",
        priceUpdatedAt: "",
        calendarId: service.calendarId,
        availabilityStatus: service.status === "out_of_stock" ? "out_of_stock" : "active",
      };
    });
  }
  const { seedMyDripNurseServices } = await import("@/lib/myDripNurseServiceCatalog");
  await seedMyDripNurseServices();
  const result = await getDbPool().query<{
    slug: string;
    name: string;
    short_description: string;
    ingredients: string[] | null;
    price: string;
    image_url: string;
    updated_at: string;
    public_key: string | null;
  }>(
    `select s.slug, s.name, s.short_description, s.ingredients,
            s.price::text, s.image_url, s.updated_at::text,
            c.public_key
       from app.services s
       left join lateral (
         select public_key
           from app.service_calendars
          where service_id = s.id and status = 'active'
          order by created_at asc
          limit 1
       ) c on true
      where s.organization_id = $1 and s.is_active = true`,
    [organizationId],
  );
  const catalog = new Map(result.rows.map((row) => [row.slug, row]));
  const seen = new Set<string>();
  return active.flatMap((service) => {
    const definition = MY_DRIP_NURSE_SERVICES.find((candidate) => candidate.id === service.normalizedName)
      || definitionForCalendar(service.name);
    if (!definition || seen.has(definition.id)) return [];
    const current = catalog.get(definition.id) as (typeof result.rows)[number] | undefined;
    if (!current) return [];
    seen.add(definition.id);
    const hasPartnerOverride = Object.prototype.hasOwnProperty.call(service, "priceOverride")
      && service.priceOverride !== null
      && service.priceOverride !== undefined;
    const effectivePrice = hasPartnerOverride ? service.priceOverride : current.price;
    return [{
      ...definition,
      name: current.name || definition.name,
      description: current.short_description || definition.description,
      ingredients: current.ingredients || definition.ingredients,
      imageUrl: current.image_url || definition.imageUrl,
      price: displayPrice(effectivePrice),
      priceUpdatedAt: s(current.updated_at),
      availabilityStatus: service.status === "out_of_stock" ? "out_of_stock" : "active",
      calendarId: service.calendarId?.startsWith("preview-")
        ? service.calendarId
        : current.public_key || service.calendarId || "",
    }];
  });
});
