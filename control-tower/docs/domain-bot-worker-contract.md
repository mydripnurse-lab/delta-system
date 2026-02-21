# Domain Bot Worker Contract (Production Browser)

`/api/tools/domain-bot-click` now supports remote browser execution.

When `DOMAIN_BOT_WORKER_URL` is configured, Control Tower sends this payload:

```json
{
  "task": "domain-bot-click",
  "provider": "control-tower",
  "locationId": "abc123",
  "url": "https://app.devasks.com/v2/location/abc123/settings/domain",
  "openActivationUrl": "https://...",
  "maxAttempts": 180,
  "intervalMs": 700,
  "steps": [],
  "variables": {},
  "timestamp": "2026-02-21T00:00:00.000Z"
}
```

Worker should return JSON:

```json
{
  "ok": true,
  "clicked": "connect-domain-button",
  "attempts": 4,
  "lastResult": "clicked:connect-domain-button",
  "screenshotUrl": "https://...",
  "logUrl": "https://..."
}
```

On failure:

```json
{
  "ok": false,
  "error": "Button not found",
  "lastResult": "not-found connect=... manage=..."
}
```

## Auth

If `DOMAIN_BOT_WORKER_API_KEY` exists, Control Tower sends:

- `Authorization: Bearer <key>`
- `x-api-key: <key>`

## Notes

- `url` defaults to Devasks domain settings URL and is overridden by `openActivationUrl` if present.
- `steps` and `variables` are passthrough fields for future recipe-based flows (click/fill/select/wait).

## Local smoke test (without Playwright)

There is a mock endpoint:

- `POST /api/tools/domain-bot-worker-mock`

Set:

```env
DOMAIN_BOT_MODE=remote
DOMAIN_BOT_WORKER_URL=http://localhost:3001/api/tools/domain-bot-worker-mock
```

Then click `Run Domain Bot` in the activation drawer and verify status message returns:

- `Domain Bot OK (...) [remote]`
