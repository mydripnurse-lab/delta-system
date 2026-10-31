# Clinic communications by role

Status: routing identifiers and template corrections prepared in code. The Clinic and Clinic Nurses folders now exist under Portal Notifications in the My Drip Nurse GHL subaccount. They are empty; clinic workflows have not been connected or activated. Existing published workflows have not been changed. Do not enable clinic bookings until the role-specific workflows are connected and verified.

Keep all workflows inside **Portal Notifications**. Naming convention: **MDN | ROLE | EVENT**. Use CUSTOMER, CLINIC NURSE, CLINIC, MDN ADMIN and INDEPENDENT PARTNER. Keep independent-partner workflows distinct from clinic-nurse workflows. A role is the intended recipient, not the person who triggered the event.

| Event | Customer | Clinic nurse | Clinic | MDN admin |
| --- | --- | --- | --- | --- |
| New booking | Reservation received; professional confirmation pending; Care Portal | Review and accept/decline in Partner Portal | New appointment, assigned nurse, clinic balance; Clinic Portal | Booking summary |
| Accepted | Confirmed appointment; Care Portal | Acceptance confirmation; appointment details | Accepted appointment and assigned nurse | Appointment status |
| Rescheduled | Updated date/time; Care Portal | Updated assignment; accept if confirmation is required | Updated schedule and current balance | Reschedule summary |
| Declined | Only outcome-specific notice; do not claim cancellation while reassignment is pending | Decline acknowledgement; no collection request | Reassignment or cancellation outcome | Reason and reassignment/cancellation outcome |
| Reassigned | Only where assignment notification is required | New offer to replacement nurse; accept/decline | Replacement nurse and status | Reassignment status |
| Completed | Thank you, review invitation and Care Portal | Completion acknowledgement; follow clinic collection policy | Appointment completed; balance collection is not verified | Completion status |
| Refunded | Confirmed refund amount/status; Care Portal | Refund/status notice; not a payout | Deposit refund status; no claim that clinic balance was refunded | Refund reference and confirmed status |

## Recipient and contact isolation

- Customer messages use patient contact fields and a customer workflow. Never replace the customer's GHL contact with the nurse or clinic email.
- Clinic-nurse messages use the assigned nurse's partner fields. `professionalRecipientRole=clinic_nurse` selects clinic-specific copy. Independent appointments retain `independent_partner`.
- Clinic messages need their own approved clinic-contact workflow. Do not infer a clinic recipient from the assigned nurse or customer. No clinic notification is sent by the new identifier fields alone.
- MDN ADMIN messages are internal notifications to the configured MDN users. The clinic must not receive internal MDN discussion or other clinics' data.
- Do not forward medical screening to a clinic administrative contact merely because it appears in the source webhook. Clinic notifications should contain appointment reference, status, service, schedule and a secured portal link; use a minimal payload for every role.
- Tests may reach only Keishla when explicitly authorized; no real appointment or payment is needed.

## Collection and pricing fields

- `collectionResponsibleRole`: `clinic`, `independent_partner`, or `my_drip_nurse` for the funded reward exception.
- `clinicBalanceAmount`: balance after the MDN deposit, never recorded as already collected.
- `nurseEarningsAmount`: null for clinic appointments; clinic compensation is not calculated by MDN.
- `clinicCollectionStatus=not_verified`: appointment completion does not prove balance collection.
- Nurse templates use `earningsDisplay` and `collectionInstructions`, not hardcoded "you collect" or payout claims.
- `clinicPortalUrl`: authenticated clinic workspace. `appointmentOfferUrl`: nurse acceptance page. Keep the client's existing Care Portal link.
- Use the real service image from `serviceImageUrl`, with centered image layout. Do not use illustrative/sample product images.
- Rewards funded by MDN retain the existing collect-$0 instructions.

## Activation checklist

1. Open the My Drip Nurse subaccount and inventory the existing published workflows by role.
2. Update four existing nurse email templates from the repository; inspect their SMS mapping too. Existing runtime routing and contact mappings must remain intact.
3. Prepare separate clinic and clinic-nurse recipient workflows with the names above. Keep them in draft until costs and recipient mappings are approved.
4. Connect only the missing role workflows. Additional webhook executions and email/SMS delivery may have GHL charges; no extra executions are authorized or incurred by adding metadata in code.
5. Verify guest/client portal links, nurse acceptance links, clinic authorization and minimal payloads before activation.
6. Verify one controlled synthetic event in each required role, using only the approved test recipient. Then enable clinic booking in the release.

## GHL organization verified

- Subaccount: My Drip Nurse (`vMfl1L5xb2wJfNFNW5fb`).
- Portal Notifications: `4b14b4d4-d7ca-444b-92bf-00a4efe04f4b`.
- Clinic folder: `43b2dab0-cc39-4578-a914-caafa25f98d1`.
- Clinic Nurses folder: `3b82bae5-c41b-4c74-b48b-631f732f549a`.
- Existing Admin, Client and Partners folders are preserved. Creating folders sent no messages or webhook executions.
