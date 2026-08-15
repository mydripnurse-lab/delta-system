# My Drip Nurse Partner application form for GHL

## Copy-ready production links

- Standalone hosted application: `https://admin.mydripnurse.com/partner-application.html`
- Compact form used inside GHL: `https://admin.mydripnurse.com/partner-application.html?embedded=1`
- Partner website application: `https://partners.mydripnurse.com/PARTNER-SLUG/apply`
- Copy-ready GHL iframe block: `docs/ghl-partner-application-embed.html`
- Full self-contained GHL V2 form: `docs/ghl-staff-form-for-ghl-v2.html`
- Copy-ready GHL welcome email: `docs/ghl-partner-welcome-email.html`

The Partner website route automatically supplies its affiliate code. For a campaign link created manually, append `&ref=PARTNER_CODE` to the embedded URL or `?ref=PARTNER_CODE` to the standalone URL.

## Recommended GHL setup

1. Add a **Custom HTML/JS** element to the GHL page.
2. Paste the complete contents of `docs/ghl-partner-application-embed.html`.
3. Do not use a native GHL Form element around it.
4. In the account-ready workflow, use an **Inbound Webhook** trigger and select the most recent `partner_account_ready` request as the Mapping Reference.
5. Map or find the Contact using `{{inboundWebhookRequest.body.email}}`.
6. Add the Send Email action and paste `docs/ghl-partner-welcome-email.html` as Custom HTML.

Recommended email configuration:

- Subject: `Welcome to My Drip Nurse — activate your Partner Portal`
- From name: `My Drip Nurse Partner Team`
- CTA value: `{{inboundWebhookRequest.body.welcomeLandingPageUrl}}`

The welcome webhook fields used by the email are:

- `{{inboundWebhookRequest.body.firstName}}`
- `{{inboundWebhookRequest.body.countyStateNames}}`
- `{{inboundWebhookRequest.body.welcomeLandingPageUrl}}`
- `{{inboundWebhookRequest.body.partnerWebsiteUrl}}`

HighLevel requires the Inbound Webhook Mapping Reference to be refreshed if the payload structure changes. The welcome email must run from the `partner_account_ready` event because that event confirms the Partner website and activation link are ready.

The current full copy-ready form is `docs/ghl-staff-form-for-ghl-v2.html`. It is the Partner application shown before the Admin approval and provisioning workflow. It collects the applicant's public profile, credentials, biography, photo, coverage counties, and referral code. Use this V2 file when the complete HTML must be pasted directly into GHL.

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

## 4. Add the form to GHL

The recommended production method is the hosted iframe in `docs/ghl-partner-application-embed.html`. It keeps GHL synchronized automatically when the application form is updated.

The production API and form key are already configured in the hosted form and in the full V2 copy at `docs/ghl-staff-form-for-ghl-v2.html`:

```js
var API_BASE = "https://admin.mydripnurse.com";
var FORM_KEY = "848e57527017c5dac9f142dec3bfb6f6c51a7c31ab42c477";
```

1. Open `docs/ghl-partner-application-embed.html`.
2. Copy the complete block into a GHL Custom HTML/JS element.
3. Do not place it inside a native GHL Form element.
4. Preserve `ref=PARTNER_CODE` when a campaign should credit a referring Partner.

`docs/ghl-staff-form-for-ghl-v2.html` is the self-contained version to use if GHL must host the complete form code directly. The iframe method remains preferred because it stays synchronized with production automatically.

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
- Approved applicants receive a one-time activation link on `partners.mydripnurse.com`, create their own Partner Portal password, and begin with the guided Portal tour.
- LeadConnector access may still use separately provisioned credentials; the Partner Portal activation password is stored only as a secure hash.
- The final welcome webhook is held until the website has been reviewed and published from the Partner Admin profile.
