import { resolveCountyBoundary, resolvePartnerAreaCoordinates } from "@/lib/partnerDirectoryGeo";
import { getPartnerDirectoryRankingSignals } from "@/lib/partnerDirectoryAnalytics";
import { loadPartnerCities } from "@/lib/partnerServiceAreas";
import type { PublicPartnerProfile } from "@/lib/partnerProfiles";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function locationSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLocationName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function enrichDirectoryProfiles(profiles: PublicPartnerProfile[]) {
  const rankingSignals = await getPartnerDirectoryRankingSignals(
    profiles.map((profile) => profile.id).filter((id) => UUID_PATTERN.test(id)),
  );
  return Promise.all(
    profiles.map(async (profile) => {
      const explicitCityAreas = profile.serviceAreas.filter((area) => area.city);
      const cities = explicitCityAreas.length || !profile.organizationId
        ? []
        : await loadPartnerCities(profile.organizationId, profile.serviceAreas);
      const mapAreas = cities.length
        ? cities.flatMap((city) => {
            const area = profile.serviceAreas.find(
              (candidate) =>
                normalizeLocationName(candidate.county) === normalizeLocationName(city.county || "") &&
                normalizeLocationName(candidate.state) === normalizeLocationName(city.state),
            );
            return area ? [{ ...area, city: city.name }] : [];
          })
        : profile.serviceAreas;
      const resolvedPoints = await Promise.all(mapAreas.map((area) => resolvePartnerAreaCoordinates(area)));
      const seenCounties = new Set<string>();
      const countyAreas = profile.serviceAreas.filter((area) => {
        const key = `${normalizeLocationName(area.state)}:${normalizeLocationName(area.county)}`;
        if (seenCounties.has(key)) return false;
        seenCounties.add(key);
        return true;
      });
      const countyCoverages = (await Promise.all(countyAreas.map((area) => resolveCountyBoundary(area))))
        .filter((coverage): coverage is NonNullable<typeof coverage> => Boolean(coverage));
      const seenPoints = new Set<string>();
      return {
        ...profile,
        ranking: rankingSignals.get(profile.id) || {
          availabilityConfigured: false,
          acceptanceRate: 100,
          completedAppointments: 0,
          organicScore: 50,
        },
        countyCoverages,
        mapPoints: resolvedPoints.filter((point): point is NonNullable<typeof point> => {
          if (!point) return false;
          const key = `${point.city || point.county}:${point.state}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
          if (seenPoints.has(key)) return false;
          seenPoints.add(key);
          return true;
        }),
      };
    }),
  );
}
