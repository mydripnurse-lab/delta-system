# Clinic partners — implementation and rollout

Status: implemented locally behind `CLINIC_PARTNERS_ENABLED=true`. Migration 048 applied to production; application code not yet deployed and clinic entry points not activated. No real clinics, patients, payments, emails, or SMS were created during verification.

## Rules implemented

- Shared entry at partners.mydripnurse.com. Clinic workspace: `/portal/clinics`; registration: `/clinics/register`; directory: `/clinics`.
- MDN approves clinics. An approved clinic invites nurses/managers. Invitation acceptance links an existing nurse profile rather than creating another one. Clinic authorization is required after acceptance.
- Clinic-managed new nurses are excluded from independent automatic booking assignment. Existing independent nurses retain their existing profile, availability, history, and independent work.
- Clinic coverage and nurse coverage must both match the verified service address. Nurses retain their existing appointment accept/decline and availability controls.
- MDN alone enables clinic services and controls prices. Precedence: clinic city → clinic county/parish → clinic state → clinic default → ordinary regional/default price. Existing lower-level exceptions remain unless the admin explicitly elects to replace descendants in the regional editor.
- Availability displays clinic pricing. Checkout reads and locks current clinic pricing/membership, checks the displayed price again, calculates the deposit, and records clinic/price/collector information on the appointment.
- MDN collects the booking deposit. The clinic collects the remaining balance and voluntary tips. The remaining balance is not treated as the nurse's personal earnings. MDN-funded reward exceptions retain their existing behavior.
- Reassignment of clinic appointments remains within that clinic. Suspension or no eligible replacement does not send the appointment to an unrelated independent provider; the existing cancellation/refund path remains applicable.
- Branding includes a logo, primary/accent colors, and a public clinic page/team view. Professional profile data is shared; clinic team pages are noindex to avoid competing copies of independent professional websites.

## Cost controls and privacy

Public clinic, service, and team reads use the existing Next cache (300 seconds) and tag invalidation. Pricing geography uses the existing compressed catalog. Admin and clinic lists are bounded. There are no added polling loops, scheduled jobs, paid integrations, or automatic invitation emails. Invitation URLs can be copied by the authorized clinic owner/manager.

New routes use session checks, role checks, same-host Origin validation on writes, hashed invitation/session tokens, expiration and single-use invitation acceptance, and request-size limits. Clinic registration/write/login have a bounded per-instance request guard. This is not a substitute for a distributed platform firewall rate limit.

Logo uploads use the existing Blob integration, maximum 2 MB, PNG/JPEG/WebP with signature checks. Existing storage/bandwidth billing still applies. New booking and management activity necessarily uses some database work; zero incremental hosting cost is not guaranteed. Local tests did not access Neon.

Clinic appointment views expose only that clinic's appointment and customer contact details. They do not expose other clinic appointments or medical screening payloads.

## Verification performed

- `tools/test-clinic-partners.cjs`: real, isolated local PostgreSQL; migration repeatability, approval gates, unauthorized workspace access, invitation owner validation/replay, existing nurse reuse, nurse authorization, service assignment, geographic boundaries, pricing hierarchy, cache reuse, suspension, safe reassignment scope, and request budget.
- `tools/test-regional-pricing.cjs`: clinic checkout uses the current clinic price and deposit, rejects stale prices and removed membership, and preserves existing regional pricing behavior.
- Appointment notification regressions passed for decline, refund, rescheduling and clinic/independent collection responsibility, with unchanged query counts in the mocked webhook flows.
- `tools/verify-partner-webhooks.mjs`: existing webhook regression passed.
- TypeScript no-emit check, scoped ESLint, and full optimized Next.js production build with clinic entry points disabled passed.
- Chrome local flow: clinic list → workspace → team → website editor → save via actual API → public clinic page → Orlando price $239. No browser page errors; no horizontal overflow at 390 px. All data fictitious and all browser requests outside localhost blocked.

This does not constitute a live Stripe, GHL, Blob upload, or production DNS verification.

## Before enabling production

1. Review the changes, apply migration `db/migrations/048_clinic_partners.sql` once through the normal migration process, and keep the feature disabled until rollout checks pass. No runtime migration is performed by clinic requests.
2. Update the existing GHL partner email templates from the checked-in versions: new appointment, accepted, rescheduled, completed. They now use `{{inboundWebhookRequest.collectionInstructions}}` rather than hardcoded independent-nurse collection instructions. Inspect live SMS templates for hardcoded collection wording too. No new paid triggers have been created or authorized by this implementation.
3. Verify account ownership during MDN clinic approval. Clinic-owner password recovery now uses the existing Partner Portal reset link and security-email provider; verify email delivery in preview with a controlled recipient before launch. No recovery email was sent during these local tests.
4. Verify registration/login firewall limits for the production project. The local in-memory guard is best effort across server instances, not a global spending limit.
5. Verify the whole clinic checkout in an isolated preview with Stripe test credentials: correct address price/deposit, concurrent bookings/reschedules, acceptance/rejection/reassignment, reward exception, and matching portal/email/SMS collection responsibility. No live payment should be used for this test.
6. Verify public directory/profile behavior with an existing independent nurse and a new clinic-only nurse; check logo upload with the existing Blob configuration. Check admin clinic selector pagination when there are more than 50 clinics.
7. Enable `CLINIC_PARTNERS_ENABLED=true` for the chosen deployment only after these checks, then verify partners.mydripnurse.com routes. Turning the flag off hides clinic entry points and blocks new clinic requests, but keep processing existing appointments and preserve the additive data.

## Current operational limits

- Invitation delivery is manual copy-link, not automatic email/SMS.
- Existing clinic-owner accounts without a professional profile cannot self-convert into nurses; the UI directs them to MDN for linking rather than creating duplicate identities.
- The clinic service selector currently lists the first 50 clinics; list screens paginate. Team/workspace snapshots cap at 100 members and 50 appointments. Add pagination before exceeding these thresholds.
- Clinic owners see appointment status in the portal on load; no new GHL owner-notification workflows or background polling were introduced.
- Historic independent appointments and prices are not reassigned to clinics retroactively.

## Production migration status

Migration `048_clinic_partners.sql` was applied successfully to the production Neon database on 2026-10-30 (America/New_York). The initial pre-existing local connection was rejected (28P01) before executing DDL. After explicit user authorization, only Vercel's production `DATABASE_URL` was retrieved into process memory, used for the migration, and neither displayed nor written to disk. No other secret was retrieved.

The migration and schema-history insert ran in one transaction with a 5-second lock timeout and 30-second statement timeout. Postconditions verified the clinics table, memberships table, and appointments.clinic_id column before commit. No existing appointment or payment records were changed. The clinic feature remains disabled pending application deployment and end-to-end communication/checkout validation.
