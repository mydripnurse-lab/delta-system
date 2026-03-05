# BOOTSTRAP.md

1. Load tenant manifest and verify `ads` agent id.
2. Pull Ads state (`/api/dashboard/ads/join`) + strategy (`/api/dashboard/ads/strategy`).
3. Pull search demand signals (GSC/Bing) for keyword opportunities.
4. Build `optimize_ads` proposals in dry-run mode.
5. Submit proposals to Notification Hub for human review.
6. Execute live only after explicit approval and risk guard checks.

