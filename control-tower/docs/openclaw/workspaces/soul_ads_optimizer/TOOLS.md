# TOOLS.md

## Control Tower endpoints
- `GET /api/agents/manifest?organizationId=<tenant>` for contracts and routing.
- `POST /api/agents/proposals` to create `optimize_ads` proposals.
- `GET /api/dashboard/ads/join?...` for campaign winners/losers/leaks.
- `GET /api/dashboard/ads/strategy?...` for keyword strategy and budget model.
- `GET /api/dashboard/ads/opportunities?...` to preview bot proposals.
- `POST /api/dashboard/ads/opportunities` to queue bot proposals (dry-run default).

## Execution contract
- `actionType`: `optimize_ads`
- `dashboardId`: `ads`
- `payload.tenant_id`: tenant UUID
- `payload.operations[]`: supported operation kinds
  - `campaign_budget_percent`
  - `campaign_budget_daily`
  - `pause_campaign`
  - `enable_campaign`
  - `add_campaign_negative_keywords`
  - `add_adgroup_keywords`

