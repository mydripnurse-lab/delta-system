# Regional service pricing

## Behavior

Services → Pricing keeps the nationwide default and stores only regional exceptions. Priority is an existing professional-specific assignment price, then city/municipality, county/parish, state/territory, and default. Removing an exception restores inheritance. Existing appointments keep their recorded service price and deposit; rewards retain their existing funding rules.

Public home and service embeds request a regional version of the existing service-media catalog, using the exact page hostname. The hostname must map unambiguously to the saved geographic catalog. The nationwide domain uses the default. Unknown/ambiguous subdomains with regional pricing omit prices rather than advertise an unverified amount. No URL, canonical, custom value, page content or geographic label is rewritten by this feature.

Booking uses the existing server-side coordinate-to-Census geography lookup, not the landing-page hostname or a city supplied as free text. City rules require coordinates. Unincorporated addresses without a Census place inherit county/state/default. The selected slot shows its price, deposit and remaining balance payable directly to the professional, plus optional tip. Checkout recomputes from the same rule resolver and rejects a changed quote before payment. Balanced assignment only considers professionals matching the displayed price. Pricing source is recorded in appointment metadata.

## Geographic source and admin workflow

1. Open a service's Pricing tab and select **Sync locations**. Only an owner with Services access can read/sync this catalog or save service prices.
2. The manual sync reads the organization's configured Counties/Cities Google Sheet and stored `search_builder_indexes/location-nav` index. Required columns: State, County, Status, Location Id, Domain Created; Cities also requires City. Active rows require true Status and Domain Created, a Location Id and an unambiguous My Drip Nurse domain. City Domain does not fall back to its parent's Domain when that column exists.
3. State rules are available for states with active catalog locations. State landing URLs are taken from the stored index, never guessed. This is a record of published locations, not an HTTP crawl of every service page.
4. Choose the level/location, enter the price, click **Add regional price**, then **Save changes**. The API resolves region IDs against the saved catalog, rather than trusting client-supplied names or URLs. Up to 500 explicit exceptions per service; other regions inherit.
5. **Use inherited price** removes an exception when saved. Sync preserves old location mappings as inactive, so an existing exception is not silently removed. Inactive exceptions must be reviewed/removed before saving a service.

When editing a state/territory or county/parish price, **Keep existing exceptions** is selected by default. **Use this price for every location below** explicitly removes only that region's lower-level exceptions, so they inherit the parent price now and on future edits. The editor shows the affected count and an expandable list with current/proposed prices before applying to the draft. Changing the selected location or applying a price resets the choice to preserve. The existing **Save changes** action publishes the draft; changing this option alone never writes prices. State changes include counties/parishes and cities; county/parish changes include only their cities. Sibling regions and other states remain untouched. This operates on the already-loaded rules and uses the existing save request, with no extra database queries or duplicated per-location prices.

County/parish and city/municipality selection uses searchable checkbox lists. Cities can be filtered by multiple counties/parishes; no county filter means all cities in the chosen state. Search matches names and geographic context, ignoring accents. **Select all results** selects every match, across pages; changing a search or county filter preserves selection, with a notice for selected locations outside the filter and a separate review/removal list. Changing the state or level clears the selection. One price is applied to all selected locations in one draft update and the existing save request. Existing lower-level exceptions are preserved unless explicitly replaced. The existing 500-exception service limit is checked before applying. Lists render 40 results per page; search, filtering, pagination and selection are browser-only and never fetch data or invalidate caches.

Puerto Rico's legacy umbrella county row is treated as the territory. Municipalities from legacy city rows match the Census municipio. Louisiana uses parish labels. State and county scope distinguish identically named cities; exact city names take precedence over Census suffix aliases.

## Cost controls

- No new schema migration, paid dependency, cron, polling, or per-visitor Sheets access.
- Regional rules are a projection of existing service JSON metadata in the existing service/availability/checkout queries. No additional pricing query is added to booking.
- Public catalog and location snapshot use shared Next Data Cache for one hour. Saving a service invalidates the catalog tag; manual sync invalidates the geography tag. Cache keys are shared across hosts, not one DB cache entry per hostname.
- The geographic snapshot is compressed before storage and caching (1.5 MB compressed cap, 32 MB decoded cap). Public responses expose only the computed service prices, not the full rule/catalog data.
- Regional HTTP responses use 60-second browser cache, 300-second CDN cache and 60-second stale revalidation. Public changes can take approximately six minutes under normal cache operation. Existing unversioned image/header callers retain their previous cache policy.
- The admin loads geography on first entry to Pricing and syncs only on request. Booking only quotes after an address/availability search.

This does not guarantee an identical Neon or Vercel bill: exceptions add bounded result bytes, cache misses and manual syncs do perform reads, and regional HTTP caching can increase function executions compared with the former single nationwide response. Measure production usage before/after; no cost reduction has been measured for this feature yet.

## Verification and rollout

Offline checks: `node tools/test-regional-pricing.cjs` exercises inheritance, zero prices, partner overrides, PR/LA, Census aliases, domain ambiguity, Sheet filters, failed-sync preservation, cache invalidation/reuse, availability query count, address-based checkout/deposit, and rollback for a stale quote. All fixtures are synthetic and payment/database adapters are mocked. The editor was checked in a local desktop/mobile fixture; the temporary route was removed.

Before enabling real exceptions in production: deploy the reviewed change; manually sync and inspect the actual configured Sheet/index warnings; verify one city and its parent county/state host mappings; save only business-approved prices; compare the public page quote with a verified service address through the prepayment screen. Do not create real payments as a deployment check. Then compare Neon transfer and Vercel function/cache metrics over comparable traffic windows.

The referenced public Telahagocrecer location JSON returned 404 during development. This implementation uses the stored organization index and configured Sheet instead. Live Sheet credentials, actual location mappings and production cache headers still require deployment verification. No real prices or geographic snapshot were written during local implementation.
