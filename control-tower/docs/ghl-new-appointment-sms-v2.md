# GHL new appointment SMS · v2

Webhook event: `new_booking` (also available on `partner_confirmation_required`)

Recommended GHL SMS body: create the message in GHL with the flat fields below, or map the generated `smsMessage` directly.

Copy/paste GHL template:

```text
My Drip Nurse: Hi {{inboundWebhookRequest.body.partnerFirstName}}, a new appointment is available. Earn {{inboundWebhookRequest.body.earningsDisplay}}. {{inboundWebhookRequest.body.serviceName}} · {{inboundWebhookRequest.body.appointmentDateTimeFormatted}}. Review and accept or decline: {{inboundWebhookRequest.body.appointmentOfferUrl}}
```

Map the receiving contact phone to:

```text
{{inboundWebhookRequest.body.partnerPhone}}
```

Example safe-test message:

> My Drip Nurse: Hi Fabian, a new appointment is available. Earn $142.35 + tips. Hydration · tomorrow at 10:00 AM EDT. Review and accept or decline: https://partners.mydripnurse.com/partner-portal/appointments?appointment=test-appointment-id&offer=1

The action link opens the specific appointment offer in the Partner Portal. The Partner can calculate the route and then accept or decline.

Primary mapping fields:

- `smsMessage`
- `partnerFirstName`
- `partnerLastName`
- `partnerFullName`
- `partnerEmail`
- `partnerPhone`
- `serviceName`
- `appointmentDateTimeFormatted`
- `estimatedEarnings`
- `estimatedEarningsFormatted`
- `earningsDisplay`
- `tipsEligible`
- `tipsIncluded`
- `appointmentOfferUrl`
- `actionUrl`
- `actionRequired`
- `offer.*`

Use **Send safe test** under **New booking** after saving the webhook URL. Safe tests use sample data and never create an appointment.
