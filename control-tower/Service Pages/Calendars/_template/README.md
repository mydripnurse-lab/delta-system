# Calendar Template Contract

Each service has exactly one My Drip Nurse calendar identified by its immutable Admin `publicKey` (for example `mdn-alleviate`). The page must never infer the service from its GHL pathname.

Use the embed in `calendar-embed.html`, replacing:

- `{{BOOKING_APP_ORIGIN}}` with the deployed booking application origin.
- `{{SERVICE_CALENDAR_PUBLIC_KEY}}` with the read-only Admin calendar key.

The calendar page is not an indexable service landing page. It receives contact URL parameters from the GHL Survey redirect and sends availability/reservation requests to the My Drip Nurse booking APIs.
