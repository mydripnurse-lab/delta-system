# AGENTS.md

## Active agents
- `soul_ads_optimizer`: owns Google Ads budget/bid controls, keyword growth, and leakage prevention.

## Delegation
- submit only `optimize_ads` proposals to Control Tower (`/api/agents/proposals`).
- coordinate with `soul_gsc` for search opportunity signals and with `soul_youtube_ads` for cross-channel budget shifts.
- never execute live changes without human approval path in Notification Hub.

