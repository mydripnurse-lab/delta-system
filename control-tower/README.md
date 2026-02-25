# Delta Control Tower (My Drip Nurse)

Guia oficial de setup y operacion del dashboard.

Objetivo: que puedas levantar el proyecto desde cero aunque tengas poca experiencia tecnica.

## 1) Que es este proyecto

`control-tower` es un dashboard Next.js para operar Delta System:

- Ver progreso de cuentas por `State / County / City`
- Ejecutar jobs (runner) para crear/actualizar data
- Ver dashboards de negocio (Calls, Leads, Conversations, Transactions, Appointments, Search, GA, etc.)
- Integrar Google Sheets, GHL, Google Search Console, GA4, OpenAI y (opcional) Ads/Bing

## 2) Requisitos

- Node.js 20+ (recomendado LTS)
- npm 10+
- Acceso al repo completo (incluye carpeta `resources/`)
- Cuenta Google Cloud con permisos de APIs
- Acceso al Google Sheet principal
- Credenciales GHL (OAuth app y/o tokens, segun tu flujo)

## 3) Instalacion rapida

Desde la carpeta del repo:

```bash
cd control-tower
npm install
cp .env.example .env.local
npm run dev
```

Abrir: [http://localhost:3001](http://localhost:3001)

## 3.1 Auth y roles (multi-tenant)

El backend ahora valida usuario y permisos por tenant en endpoints de tenants/staff/audit.

### Headers requeridos (API server-to-server / pruebas manuales)

En cada request a API protegida, enviar al menos uno:

- `x-user-email: user@company.com`
- `x-user-id: <uuid>`

Opcional:

- `x-user-name: Nombre Apellido` (se usa para autocreacion en dev)

### Variables de desarrollo

```env
DEV_AUTH_EMAIL=admin@mydripnurse.com
DEV_AUTH_AUTO_CREATE=1
```

Si no envias headers, `DEV_AUTH_EMAIL` se usa como fallback local.
Con `DEV_AUTH_AUTO_CREATE=1`, si el usuario no existe en `app.users`, se crea automaticamente.

### Sesion web (cookie)

Para login de la UI se usa cookie `httpOnly` firmada:

```env
AUTH_SESSION_SECRET=pon-un-secreto-largo-y-unico
```

En local tambien puedes usar:

```env
DEV_AUTH_SESSION_SECRET=dev-secret-local
```

### Password auth (profesional)

El login ahora usa `email + password` con hash `scrypt` y bloqueo temporal por intentos fallidos.

Variables recomendadas:

```env
AUTH_ALLOW_SELF_SIGNUP=0
```

Pon `AUTH_ALLOW_SELF_SIGNUP=1` solo si quieres habilitar registro desde UI.

### Roles soportados

- Globales (`app.user_global_roles`): `platform_admin`, `agency_admin`, `analytics`
- Tenant/Staff: `owner`, `admin`, `analyst`, `viewer`, `agency_admin`, `tenant_admin`, `project_manager`, `analytics`, `member`

### Migracion nueva

Corre migraciones para habilitar RBAC extendido + proyectos:

```bash
npm run db:migrate
```

Incluye tambien auth de password (migracion `013_user_password_auth.sql`).

### Endpoints nuevos

- `GET /api/auth/me`: devuelve usuario actual + tenants/proyectos accesibles
- `POST /api/auth/login`: crea sesion por `email + password` y setea cookie
- `POST /api/auth/register`: actualmente deshabilitado (siempre `403`)
- `POST /api/auth/logout`: cierra sesion (borra cookie)
- `POST /api/auth/bootstrap-admin`: crea/actualiza el primer admin (requiere `AUTH_BOOTSTRAP_TOKEN`)
- `GET|POST /api/tenants/:id/projects`: lista o crea proyectos del tenant
- `GET|POST /api/tenants/:id/projects/:projectId/members`: lista o asigna usuarios a proyecto

Bootstrap admin (recomendado en produccion cuando `AUTH_ALLOW_SELF_SIGNUP=0`):

```bash
curl -X POST "$APP_URL/api/auth/bootstrap-admin" \
  -H "content-type: application/json" \
  -d '{
    "token":"'"$AUTH_BOOTSTRAP_TOKEN"'",
    "email":"admin@mydripnurse.com",
    "fullName":"Agency Admin",
    "password":"StrongPass123A"
  }'
```

### Rutas protegidas por middleware

- `/`
- `/dashboard/*`
- `/projects/*`

Si no hay cookie de sesion, redirige a `/login`.

## 4) Setup minimo obligatorio (para que el dashboard cargue)

Si solo quieres que abra el Control Tower y lea Sheets, completa esto primero.

### 4.1 Google Cloud -> Service Account para Google Sheets

1. Entra a Google Cloud Console.
2. Selecciona tu proyecto (o crea uno nuevo).
3. Habilita APIs:
   - `Google Sheets API`
   - `Google Drive API`
4. Ve a `IAM & Admin -> Service Accounts`.
5. Crea una service account (ej: `delta-sheets-reader`).
6. Crea una key JSON (`Keys -> Add key -> Create new key -> JSON`).
7. Guarda ese archivo como:
   - `../resources/config/google-cloud.json` (recomendado desde `control-tower`)

### 4.2 Compartir el Google Sheet

1. Abre el spreadsheet.
2. Click `Share`.
3. Agrega el `client_email` de la service account.
4. Rol: `Editor`.

Si no haces esto, veras errores `403` como `values.get Counties failed`.

### 4.3 Variables minimas en `.env.local`

```env
GOOGLE_SHEET_ID=TU_SPREADSHEET_ID
GOOGLE_SHEET_COUNTY_TAB=Counties
GOOGLE_SHEET_CITY_TAB=Cities
GOOGLE_SERVICE_ACCOUNT_KEYFILE=../resources/config/google-cloud.json
```

Con eso, ya deberia cargar `Sheet overview` y `Sheet Explorer`.

## 5) Google Search Console (inspect + sitemap discovery)

Para usar los botones de `Inspect` y `Sitemap` en el modal de activacion:

### 5.1 Habilitar API

En Google Cloud -> `APIs & Services -> Library`:

- Habilita `Google Search Console API` (`searchconsole.googleapis.com`)

### 5.2 Permiso en Search Console

En Search Console:

1. Abre la propiedad (recomendado tipo dominio): `sc-domain:mydripnurse.com`
2. `Settings -> Users and permissions`
3. Agrega el `client_email` de la service account como `Owner` o `Full`

### 5.3 Variables recomendadas

```env
INDEX_GOOGLE_ENABLED=true
GSC_SITE_URL=sc-domain:mydripnurse.com
```

Notas:

- `Inspect` valida estado de indexacion actual.
- `Sitemap Discovery` envia `https://<dominio>/sitemap.xml` a Search Console API.
- Si sale `URL is unknown to Google`, no significa que este roto; puede tardar horas/dias en reflejarse.

## 6) GHL (datos de dashboards)

Para dashboards que dependen de GoHighLevel:

Variables comunes:

```env
GHL_CLIENT_ID=...
GHL_CLIENT_SECRET=...
GHL_COMPANY_ID=...
GHL_LOCATION_ID=...
```

Dependiendo del modulo, tambien puedes usar tokens/cache locales.

## 7) OpenAI (insights y playbooks)

Para agentes AI, insights y guias:

```env
OPENAI_API_KEY=sk-...
```

Sin esta variable, las partes AI fallan o quedan deshabilitadas.

## 8) Google Analytics 4 (dashboard GA)

```env
GA4_PROPERTY_ID=123456789
```

Y el auth de Google debe tener acceso a esa propiedad.

## 9) Google Ads (opcional)

Solo si usaras modulos de ads:

```env
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=...
ADS_CLIENT_ID=...
ADS_CLIENT_SECRET=...
ADS_REDIRECT_URI=...
ADS_TOKENS_FILE=...
```

### 9.1 Ads AI Notifications (recomendado en produccion)

El dashboard de Google Ads incluye observador AI con recomendaciones accionables (`accept/deny`).

Modo operativo:

- Baseline diario
- Trigger adicional por anomalias criticas (cost up + conv down, ROAS drop, leaks, etc.) con cooldown

Variables:

```env
ADS_NOTIF_CRON_KEY=tu-clave-segura
ADS_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ADS_ALERT_EMAIL_WEBHOOK_URL=https://tu-webhook-email
ADS_ALERT_GHL_WEBHOOK_URL=https://tu-webhook-global-ghl
```

Webhook por tenant en GHL (recomendado):

- Guardar en `app.organization_settings` (preferido) los campos:
  - `ads_alert_webhook_url`
  - `ads_alert_sms_enabled`
  - `ads_alert_sms_to`
- O guardar en `app.organization_integrations.config` del provider `ghl` alguno de estos campos:
  - `alerts.adsWebhookUrl`
  - `alerts.ghlWebhookUrl`
  - `webhooks.adsNotifications`
- Si no existe por tenant, se usa `ADS_ALERT_GHL_WEBHOOK_URL` como fallback global.
- Cuando `ads_alert_sms_enabled=true`, el webhook recibe `action.sendSms=true` y `action.smsTo` para que GHL dispare SMS.

Sample payload (para mapear campos en GHL):

```bash
curl -X POST "http://localhost:3001/api/tenants/<TENANT_ID>/integrations/ghl-alerts/sample" \
  -H "content-type: application/json" \
  -d '{"webhookUrl":"https://services.leadconnectorhq.com/hooks/...","smsEnabled":true}'
```

Ejecucion cron (recomendada cada hora):

```bash
curl -X POST "http://localhost:3001/api/dashboard/ads/notifications/cron" \
  -H "content-type: application/json" \
  -H "x-cron-key: $ADS_NOTIF_CRON_KEY" \
  -d '{}'
```

Ejecucion para un tenant especifico:

```bash
curl -X POST "http://localhost:3001/api/dashboard/ads/notifications/cron" \
  -H "content-type: application/json" \
  -H "x-cron-key: $ADS_NOTIF_CRON_KEY" \
  -d '{"tenantId":"<organization_uuid>"}'
```

## 10) Bing Webmaster (opcional)

```env
BING_WEBMASTER_API_KEY=...
BING_WEBMASTER_SITE_URL=https://tu-dominio.com/
```

## 11) Variables utiles de rendimiento/cache

Ejemplos usados por modulos pesados:

```env
DASH_CACHE_DIR=./storage/cache
TRANSACTIONS_MAX_PAGES=200

## 12) Runs largos en Railway (recomendado)

Si `run-delta-system` puede tardar horas, usa worker remoto en Railway para no depender del ciclo de vida de Vercel Functions.

Guia completa:

- `docs/railway-runner-worker.md`

TRANSACTIONS_PAGE_DELAY_MS=250
SHEETS_WRITE_DELAY_MS=1200
SHEETS_LOG=1
SHEETS_LOG_SCOPE=overview,state
```

## 12) Scripts npm

```bash
npm run dev     # desarrollo (puerto 3001)
npm run build   # build produccion
npm run start   # correr build
npm run lint    # linter
```

## 13) Checklist de primer arranque (5 minutos)

1. `npm install`
2. `cp .env.example .env.local`
3. Completar 4 vars minimas de Sheets
4. Compartir Sheet con service account
5. `npm run dev`
6. Abrir `/` y verificar que aparece `Sheet overview`

## 14) Errores comunes y solucion

### Error: `values.get Counties failed (code=403)`

Causa: la service account no tiene acceso al sheet o usas keyfile equivocado.

Solucion:

1. Verifica `GOOGLE_SERVICE_ACCOUNT_KEYFILE`
2. Abre el JSON y copia `client_email`
3. Comparte el sheet a ese email (Editor)

### Error: `Google Search Console API has not been used...`

Causa: API no habilitada en el proyecto del keyfile.

Solucion:

1. Habilita `Google Search Console API`
2. Espera 3-10 minutos
3. Reintenta

### Error: `URL is unknown to Google`

Causa: Google aun no descubre/indexa la URL.

Solucion:

1. Ejecuta `Sitemap Discovery`
2. Espera 12-24h
3. Corre `Inspect` nuevamente

### Error de fonts en build (`Geist` fetch fail)

Causa: ambiente sin acceso a internet para descargar Google Fonts.

Solucion:

- Probar build con internet, o cambiar a fuentes locales/system en `layout.tsx`.

## 15) Estructura recomendada de archivos sensibles

```text
mydripnurse-sitemaps/
  resources/
    config/
      google-cloud.json
      gsc_oauth_client.json
      gsc_tokens.json
  control-tower/
    .env.local
```

Nunca subas credenciales reales al repositorio.

## 16) Buenas practicas de seguridad

- No commitear keys/tokens
- Rotar service account keys periodicamente
- Usar permisos minimos necesarios
- Mantener `Essential Contacts` y alerts de billing activos en Google Cloud

## 17) Soporte rapido (orden recomendado de debug)

1. Revisar `.env.local`
2. Verificar existencia del keyfile
3. Verificar sharing del Google Sheet
4. Verificar APIs habilitadas en GCP
5. Revisar logs en UI (`Runner -> Logs`)
6. Probar endpoint de debug:
   - `GET /api/debug/env`

---

Si necesitas, puedo convertir este README en un "Runbook de Produccion" con checklist diario/semanal y recovery steps.
