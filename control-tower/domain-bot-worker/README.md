# Domain Bot Worker

Worker HTTP que ejecuta automatizaciones de navegador con Playwright.

## Endpoints

- `GET /health`
- `POST /run`

## Request `POST /run`

```json
{
  "locationId": "abc123",
  "url": "https://app.devasks.com/v2/location/abc123/settings/domain",
  "openActivationUrl": "https://optional-direct-activation-link",
  "maxAttempts": 180,
  "intervalMs": 700,
  "steps": [
    { "action": "click", "selector": "button[data-testid='foo']" },
    { "action": "fill", "selector": "input[name='email']", "value": "test@example.com" }
  ],
  "variables": {
    "email": "test@example.com"
  }
}
```

Si envias `steps`, ejecuta esos pasos. Si no envias `steps`, corre fallback de click sobre:

- `#connect-domain-button`
- `#connect-domain-button-text`
- `#manage-domain`

## Actions soportadas en `steps`

- `goto`
- `wait_ms` / `wait_for_timeout`
- `wait_for_selector`
- `wait_for_url_contains`
- `click`
- `fill`
- `type`
- `press`
- `select`
- `evaluate` (ejecuta JS en la pagina)
- `close_page`

Tambien soporta placeholders `{{variable}}` en strings del step.

## Seguridad

Si defines `WORKER_API_KEY`, cada request debe incluir:

- `Authorization: Bearer <WORKER_API_KEY>` o
- `x-api-key: <WORKER_API_KEY>`

## Variables

- `PORT` (default `3000`)
- `WORKER_API_KEY` (opcional)
- `WORKER_NAV_TIMEOUT_MS` (default `60000`)

## Correr local

```bash
npm install
npm run dev
```

## Deploy en Render (Docker)

1. Crea un nuevo **Web Service** en Render.
2. Conecta este repo.
3. Root Directory: `control-tower/domain-bot-worker`
4. Environment: `Docker`
5. Agrega env var opcional: `WORKER_API_KEY=<secret>`
6. Deploy.

Render te devuelve una URL, por ejemplo:

- `https://domain-bot-worker.onrender.com/run`

Opcional: puedes usar el archivo `render.yaml` incluido en esta carpeta.

## Config en Control Tower (Vercel)

En Vercel agrega:

- `DOMAIN_BOT_MODE=remote`
- `DOMAIN_BOT_WORKER_URL=https://domain-bot-worker.onrender.com/run`
- `DOMAIN_BOT_WORKER_API_KEY=<same-secret>` (si usas auth)
