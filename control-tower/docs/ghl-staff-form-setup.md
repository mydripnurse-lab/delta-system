# My Drip Nurse Partner application form for GHL

The copy-ready form is `docs/ghl-staff-form.html`. It is the Partner application shown before the Admin approval and provisioning workflow. It collects the applicant's public profile, credentials, biography, photo, coverage counties, and referral code.

When an applicant selects more than one county, the form requires a primary county. The Partner website, personal service calendars, and booking group are created only in that primary county after the application is approved.

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

## 4. Copy and paste the HTML into GHL

The production API and form key are already configured in `docs/ghl-staff-form.html`:

```js
var API_BASE = "https://admin.mydripnurse.com";
var FORM_KEY = "848e57527017c5dac9f142dec3bfb6f6c51a7c31ab42c477";
```

1. Open `docs/ghl-staff-form.html`.
2. Select and copy the entire file, including `<!DOCTYPE html>` through `</html>`.
3. Paste it into a GHL Custom HTML/JS element.
4. Do not paste it into a native GHL Form element; the file already contains the complete form, styles, validation, upload, and submission code.
5. Preserve `?ref=PARTNER_CODE` when linking to the page so the affiliate referral is attached to the application.

For the hosted application page, use `/apply`. When the form is loaded by the Partner website iframe, `?embedded=1` automatically removes the duplicate promotional panel and applies the compact responsive layout.

## Behavior and safety

- Only configured counties with State, County, and Location ID are returned.
- The browser receives opaque county keys and the backend validates every selection again.
- A primary county is selected automatically for one county and is required when multiple counties are chosen.
- The applicant can upload a profile photo, choose professional credentials, and provide the biography used on the Partner website.
- The backend preserves the referral code from `?ref=PARTNER_CODE`.
- Duplicate submissions are protected by a session-scoped submission key.
- Existing GHL users are updated instead of duplicated.
- Shared calendar members are preserved; personal Partner calendars are created only in the primary county.
- The generated LeadConnector password is stored only as a secure hash for Partner Portal login. The plaintext password is sent only through the final secure workflow payload.
- The final welcome webhook is held until the website has been reviewed and published from the Partner Admin profile.
