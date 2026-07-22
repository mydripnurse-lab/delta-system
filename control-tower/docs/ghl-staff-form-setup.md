# GHL staff provisioning form

This form creates or updates a restricted GHL staff user and then adds that user to compatible team calendars for every selected county/location. Existing calendar members are preserved and inactive compatible calendars are activated.

## 1. OAuth scopes

Reconnect the tenant's GHL `owner` integration after adding these scopes to the Marketplace app:

- `users.write`
- `users.readonly`
- `calendars.readonly`
- `calendars.write`

## 2. Apply the database migration

From `control-tower`:

```bash
npm run db:migrate
```

## 3. Create the form configuration

Choose a long, unguessable public form key and insert the configuration. Replace the tenant slug and webhook URL:

```sql
insert into app.staff_form_configs (
  organization_id,
  form_key,
  enabled,
  webhook_url,
  calendar_mode,
  calendar_ids
)
select
  id,
  'REPLACE-WITH-A-LONG-RANDOM-FORM-KEY',
  true,
  'https://services.leadconnectorhq.com/hooks/REPLACE',
  'all_compatible',
  array[]::text[]
from app.organizations
where slug = 'REPLACE-TENANT-SLUG'
on conflict (organization_id) do update set
  form_key = excluded.form_key,
  enabled = excluded.enabled,
  webhook_url = excluded.webhook_url,
  calendar_mode = excluded.calendar_mode,
  calendar_ids = excluded.calendar_ids;
```

Use `calendar_mode = 'specific'` with GHL IDs in `calendar_ids`, or `calendar_mode = 'specific_names'` with exact names in `calendar_names`, when only selected calendars should be modified.

## 4. Configure and paste the HTML

Open `docs/ghl-staff-form.html` and replace:

```js
var API_BASE = "https://YOUR-CONTROL-TOWER-DOMAIN";
var FORM_KEY = "848e57527017c5dac9f142dec3bfb6f6c51a7c31ab42c477";
```

Copy the entire file and paste it into a GHL Custom HTML/JS element.

## Behavior and safety

- Only rows from the tenant's Counties sheet with State, County and Location Id are returned.
- Location IDs are not exposed to the browser; it receives deterministic opaque keys.
- The generated password is sent over HTTPS to GHL for user creation and to the configured GHL webhook as `password`; it is never stored in `staff_applications` or returned to the browser.
- Existing users are updated instead of duplicated.
- Existing calendar members are never removed.
- Compatible team calendar types are Round Robin, Collective, Class and Service.
- Personal/event/unknown calendars are skipped and recorded as warnings.
- `showDrafted=true` ensures inactive calendars are found; modified compatible calendars are saved with `isActive=true`.
- The existing LeadConnector webhook, if configured, is sent by the backend after provisioning.
