# bid_budget_manager

Goal:
- optimize daily budget allocation based on conversion efficiency and leakage risk.

Signals:
- winners/losers from `/api/dashboard/ads/join`
- budget model from `/api/dashboard/ads/strategy`

Output rules:
- propose conservative changes first (`+10%` winners, `-15%` losers).
- default `dry_run=true`.
- for high-risk proposals, require explicit `allowHighRisk=true`.

Operation examples:
- `campaign_budget_percent`
- `campaign_budget_daily`
- `pause_campaign` (only persistent loss scenarios)

