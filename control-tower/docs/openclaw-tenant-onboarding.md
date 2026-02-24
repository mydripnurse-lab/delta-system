# OpenClaw Tenant Onboarding (Dashboard Agents)

This project is now wired for tenant-scoped agent orchestration.

## 1) Configure tenant routing in Control Tower

Open:

- `/dashboard?tenantId=<TENANT_UUID>`
- Section: `OpenClaw Routing (Per Tenant)`

Set:

- `OpenClaw Base URL` (your Railway OpenClaw URL)
- `OpenClaw Workspace` (tenant label)
- Agent IDs (`soul_*`) per dashboard

Click:

- `Rotate API Key` (save the new key; this is the tenant key OpenClaw uses)
- `Save Routing`

This stores config in:

- `app.organization_integrations`
- `provider='custom'`
- `integration_key='agent'`

## 2) Confirm manifest for this tenant

Request:

```bash
curl -sS "https://<your-domain>/api/agents/manifest?organizationId=<TENANT_UUID>" \
  -H "x-agent-api-key: <TENANT_AGENT_KEY>" \
  -H "x-agent-id: soul_central_orchestrator"
```

Response includes:

- enabled agents per dashboard
- expected action contracts
- proposal request template

## 3) OpenClaw -> create souls

Create these souls in OpenClaw (IDs must match routing):

- `soul_central_orchestrator`
- `soul_leads_prospecting`
- `soul_ads_optimizer`
- `soul_youtube_ads`
- `soul_content_publisher`
- optional: `soul_calls`, `soul_conversations`, `soul_transactions`, `soul_appointments`, `soul_gsc`, `soul_ga`, `soul_facebook_ads`

Workspace bootstrap template for YouTube Ads soul:

- `docs/openclaw/workspaces/soul_youtube_ads/AGENTS.md`
- `docs/openclaw/workspaces/soul_youtube_ads/SOUL.md`
- `docs/openclaw/workspaces/soul_youtube_ads/TOOLS.md`
- `docs/openclaw/workspaces/soul_youtube_ads/IDENTITY.md`
- `docs/openclaw/workspaces/soul_youtube_ads/USER.md`
- `docs/openclaw/workspaces/soul_youtube_ads/HEARTBEAT.md`
- `docs/openclaw/workspaces/soul_youtube_ads/BOOTSTRAP.md`
- `docs/openclaw/workspaces/soul_youtube_ads/MEMORY.md`

## 4) OpenClaw proposal call contract

Each soul should call:

`POST /api/agents/proposals`

Headers:

- `content-type: application/json`
- `x-agent-api-key: <TENANT_AGENT_KEY>`
- `x-agent-id: <SOUL_ID>`

Body example:

```json
{
  "organizationId": "<TENANT_UUID>",
  "actionType": "optimize_ads",
  "agentId": "soul_ads_optimizer",
  "dashboardId": "ads",
  "priority": "P2",
  "riskLevel": "medium",
  "expectedImpact": "medium",
  "summary": "Reduce CPL on adset 123",
  "payload": {
    "tenant_id": "<TENANT_UUID>",
    "platform": "meta",
    "account_id": "act_123",
    "entity_type": "adset",
    "entity_id": "123",
    "changes": [
      { "field": "budget", "from": 40, "to": 50 }
    ],
    "reason": "CPL 20% above target in last 7d"
  }
}
```

## 5) Human approval + execution

Use Notification Hub in `/dashboard`:

- Approve / Edit+Approve / Reject
- Execute approved proposals

Execution path currently wired:

- `send_leads_ghl` -> `/api/dashboard/prospecting/push-ghl`

Other action types are marked executed in queue mode until external executors are connected.

## 6) Tenant isolation rules

- Never reuse API keys across tenants.
- Each tenant has its own routing + key in DB.
- Each soul call must include the tenant key and tenant ID.
