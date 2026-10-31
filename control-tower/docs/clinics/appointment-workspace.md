# Clinic appointment workspace

## Scope

Approved clinic owners and managers have a header notification inbox and a paged team calendar. Only appointments belonging to the selected clinic are visible; joining a clinic does not expose a nurse's independent appointments. Calendar views group by week or staff, with nurse search and status filters. Detailed client information is fetched only when an appointment is opened.

Internal events cover creation, status changes, rescheduling, reassignment, declines and failed refunds. Read state is private to each clinic manager. Notifications are refreshed when opening the inbox, refreshing the page, or completing a reassignment; there is no background polling or new cron job. The feed starts when migration 055 is applied, without historical backfill.

## Reassignment

Only future confirmed/accepted appointments can be reassigned. The server checks active authorized membership, clinic approval, service availability, clinic/nurse coverage, availability rules and exceptions, and overlapping appointments. Transaction locks and an appointment version check prevent competing assignments. The new nurse must accept or decline. Both nurses and the clinic receive internal notifications. The former nurse's inbox no longer exposes live appointment details.

The change preserves the service price, deposit, payments and existing referral records. The clinic collects the remaining balance and voluntary tip; MDN-funded rewards retain their existing exception.

## External communications remain pending

Admin Communications lists `clinic_assignment_offered` for clinic/nurse roles and `clinic_assignment_removed` for the former nurse. Reassignment records these events with `externalDeliveryPending: true`; dispatch skips them even when the broader clinic communications switch is enabled. No GHL workflow is activated and no email/SMS is sent by this feature. A later communications rollout must prepare the templates, decide whether historical held events should be discarded, and explicitly release only appropriate events.

## Cost and deployment

Reads are bounded: 100 calendar entries, 50 staff candidates, and 30 inbox entries per page. The workspace no longer eagerly loads its previous 50 patient appointments. Indexes support clinic/date/staff access; there are no new paid services or periodic requests. Normal database reads and notification writes still consume resources.

Apply `055_clinic_appointment_workspace.sql` before promoting the application. It is additive and idempotent; it adds internal notification tables, triggers and supporting indexes without rewriting existing appointments/payments. Production application requires its own explicitly scoped credential authorization. Do not enable clinic booking or external communications feature flags as part of this release.

## Validation

Local PostgreSQL integration tests cover approval and tenant isolation, a 55-nurse roster, 100-entry pagination, individual read states, coverage/availability/conflict checks, stale updates, simultaneous assignments, unchanged price/payment data, duplicate nurse offers and held external events. Browser validation covers desktop/mobile layouts, staff filtering, pagination, deep links and the full reassignment confirmation flow with synthetic records. TypeScript, focused ESLint and existing partner webhook regression checks pass.
