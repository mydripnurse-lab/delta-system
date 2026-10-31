# Geographic pricing selections

The pricing editor lists all 50 states, District of Columbia and Puerto Rico. County/parish and city/municipality choices come from the project's existing `resources/statesFiles` catalog, compiled into a names-only artifact by `tools/build-pricing-geography.cjs`.

Page publication does not determine geographic eligibility. The cached active-page snapshot supplies verified domain associations; template domains in the geographic source are never published as links. Existing geographic IDs and price rules remain valid. The source catalog is not a live Census feed; DC currently has a state-level choice only.

The admin requests state-level choices first and loads descendants for the selected state. Search and checkbox filtering run locally. Geographic definitions are bundled with the application, and page associations reuse the existing shared cache. Public visitor requests do not load the full geography dataset.

The existing price hierarchy remains city → county/parish → state → default. Lower exceptions are preserved unless the admin explicitly selects replacement. Puerto Rico's municipalities use the existing municipality/city IDs, without creating a fictitious Puerto Rico County. Booking continues to resolve the verified address and validate the current quote before charging the deposit.

Validation: `tools/test-regional-pricing.cjs` covers all 52 state choices without published pages, California county/city pricing without a page, PR's 78 municipalities, inheritance, cached reads, public page prices, and checkout deposit validation. These tests use synthetic data and mocked payments, without production queries.
