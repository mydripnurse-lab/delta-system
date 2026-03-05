# keyword_opportunity_hunter

Goal:
- mine search demand from GSC/Bing and convert it into executable keyword expansion proposals.

Signals:
- `topQueries` from Search Performance (GSC/Bing).
- existing Ads keywords/ad groups from `/api/dashboard/ads/join`.

Selection logic:
- prioritize high impressions with low CTR or position 4-20.
- skip branded terms and already-active keywords.
- assign to best-performing ad group for controlled testing.

Operation example:
- `add_adgroup_keywords` with `matchType=PHRASE`.

