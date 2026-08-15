# GHL Custom Values Reference

Todos los ejemplos asumen que GHL expone el JSON bajo `inboundWebhookRequest.body`.

## Routing envelope — usar en los cuatro workflows

Estas propiedades deciden el workflow, contacto y notificaciones. No construyas la decisión en GHL a partir del nombre del evento o de un estado escrito manualmente.

```text
{{inboundWebhookRequest.body.routingVersion}}
{{inboundWebhookRequest.body.communicationEvent}}
{{inboundWebhookRequest.body.workflowRouter}}
{{inboundWebhookRequest.body.primaryAudience}}
{{inboundWebhookRequest.body.primaryRecipientRole}}
{{inboundWebhookRequest.body.primaryRecipientId}}
{{inboundWebhookRequest.body.primaryRecipientFirstName}}
{{inboundWebhookRequest.body.primaryRecipientLastName}}
{{inboundWebhookRequest.body.primaryRecipientFullName}}
{{inboundWebhookRequest.body.primaryRecipientEmail}}
{{inboundWebhookRequest.body.primaryRecipientPhone}}
{{inboundWebhookRequest.body.primaryRecipientReady}}
{{inboundWebhookRequest.body.externalRecipientCount}}
{{inboundWebhookRequest.body.externalDeliveryMode}}
{{inboundWebhookRequest.body.requiresSecondaryContactWorkflow}}
{{inboundWebhookRequest.body.secondaryRecipientRole}}
{{inboundWebhookRequest.body.secondaryRecipientFullName}}
{{inboundWebhookRequest.body.secondaryRecipientEmail}}
{{inboundWebhookRequest.body.secondaryRecipientPhone}}
{{inboundWebhookRequest.body.notifyApplicant}}
{{inboundWebhookRequest.body.notifyPartner}}
{{inboundWebhookRequest.body.notifyCustomer}}
{{inboundWebhookRequest.body.notifyAdmin}}
{{inboundWebhookRequest.body.notifyInvitee}}
{{inboundWebhookRequest.body.notifyInviter}}
```

### Regla de contacto

- Usa `primaryRecipientEmail`, `primaryRecipientPhone`, `primaryRecipientFirstName` y `primaryRecipientLastName` para crear/mapear el contacto actual.
- Si `externalDeliveryMode = internal_only`, no crees un contacto; ejecuta Internal Notification.
- Si `requiresSecondaryContactWorkflow = true`, no envíes SMS/email al segundo teléfono dentro de la misma matrícula. Debe existir un segundo evento de contacto.

## State Operator routing

```text
{{inboundWebhookRequest.body.marketCountryCode}}
{{inboundWebhookRequest.body.marketState}}
{{inboundWebhookRequest.body.marketCounty}}
{{inboundWebhookRequest.body.marketCity}}
{{inboundWebhookRequest.body.marketCoverageStatus}}
{{inboundWebhookRequest.body.marketAvailabilityStatus}}
{{inboundWebhookRequest.body.eligiblePartnerCount}}
{{inboundWebhookRequest.body.stateOperatorResolutionKey}}
{{inboundWebhookRequest.body.stateOperatorNotificationRequired}}
{{inboundWebhookRequest.body.stateOperatorNotificationReason}}
{{inboundWebhookRequest.body.stateOperatorContactAvailable}}
{{inboundWebhookRequest.body.stateOperatorGhlUserConfigured}}
{{inboundWebhookRequest.body.stateOperatorMatchStatus}}
{{inboundWebhookRequest.body.stateOperatorDeliveryRoute}}
{{inboundWebhookRequest.body.stateOperatorId}}
{{inboundWebhookRequest.body.stateOperatorGhlUserId}}
{{inboundWebhookRequest.body.stateOperatorFullName}}
{{inboundWebhookRequest.body.stateOperatorEmail}}
{{inboundWebhookRequest.body.stateOperatorPhone}}
{{inboundWebhookRequest.body.notifyStateOperator}}
```

Decisión:

- `stateOperatorDeliveryRoute = ghl_internal_user`: Internal Notification al usuario `stateOperatorGhlUserId`.
- `stateOperatorDeliveryRoute = admin_fallback`: Internal Notification a Admin indicando `stateOperatorResolutionKey` y `stateOperatorNotificationReason`.
- `stateOperatorDeliveryRoute = none`: no ejecutar ninguna acción del operador.

### Ejemplo de payload con operador configurado

```json
{
  "communicationEvent": "appointment_declined",
  "workflowRouter": "booking_appointments",
  "primaryRecipientRole": "admin",
  "primaryRecipientReady": false,
  "externalDeliveryMode": "internal_only",
  "notifyAdmin": true,
  "notifyStateOperator": true,
  "marketCountryCode": "US",
  "marketState": "Florida",
  "marketCounty": "Brevard County",
  "marketCity": "Palm Bay",
  "stateOperatorResolutionKey": "us|florida",
  "stateOperatorNotificationRequired": true,
  "stateOperatorNotificationReason": "appointment_declined",
  "stateOperatorGhlUserConfigured": true,
  "stateOperatorMatchStatus": "matched",
  "stateOperatorDeliveryRoute": "ghl_internal_user",
  "stateOperatorId": "operator-internal-id",
  "stateOperatorGhlUserId": "ghl-internal-user-id",
  "stateOperatorFullName": "Florida State Operator"
}
```

Si falta `stateOperatorGhlUserId`, el sistema debe enviar:

```json
{
  "notifyStateOperator": false,
  "stateOperatorMatchStatus": "contact_only",
  "stateOperatorDeliveryRoute": "admin_fallback"
}
```

Esto evita tratar el teléfono personal del operador como el contacto actual del cliente o Partner y conserva una sola llamada a GHL.

## Application received

Evento real: `partner_application_received`

```text
{{inboundWebhookRequest.body.firstName}}
{{inboundWebhookRequest.body.lastName}}
{{inboundWebhookRequest.body.fullName}}
{{inboundWebhookRequest.body.email}}
{{inboundWebhookRequest.body.phone}}
{{inboundWebhookRequest.body.company}}
{{inboundWebhookRequest.body.publicTitle}}
{{inboundWebhookRequest.body.professionalCredentials}}
{{inboundWebhookRequest.body.countyNames}}
{{inboundWebhookRequest.body.countyStateNames}}
{{inboundWebhookRequest.body.totalCounties}}
{{inboundWebhookRequest.body.submittedAt}}
{{inboundWebhookRequest.body.adminProfileUrl}}
```

## Account-ready welcome

Evento real: `partner_account_ready`

```text
{{inboundWebhookRequest.body.firstName}}
{{inboundWebhookRequest.body.lastName}}
{{inboundWebhookRequest.body.fullName}}
{{inboundWebhookRequest.body.email}}
{{inboundWebhookRequest.body.phone}}
{{inboundWebhookRequest.body.company}}
{{inboundWebhookRequest.body.welcomeLandingPageUrl}}
{{inboundWebhookRequest.body.partnerPortalUrl}}
{{inboundWebhookRequest.body.activationLinkExpiresInDays}}
{{inboundWebhookRequest.body.partnerWebsiteUrl}}
{{inboundWebhookRequest.body.partnerWebsiteStatus}}
{{inboundWebhookRequest.body.countyStateNames}}
{{inboundWebhookRequest.body.availabilityConfigured}}
```

## Booking lead capture

Evento real: `booking.lead.created`

```text
{{inboundWebhookRequest.body.firstName}}
{{inboundWebhookRequest.body.lastName}}
{{inboundWebhookRequest.body.lead.primaryPatient.email}}
{{inboundWebhookRequest.body.patientPhone}}
{{inboundWebhookRequest.body.service.name}}
{{inboundWebhookRequest.body.service.price}}
{{inboundWebhookRequest.body.service.currency}}
{{inboundWebhookRequest.body.coverage.addressLine1}}
{{inboundWebhookRequest.body.coverage.city}}
{{inboundWebhookRequest.body.coverage.county}}
{{inboundWebhookRequest.body.coverage.state}}
{{inboundWebhookRequest.body.coverage.postalCode}}
{{inboundWebhookRequest.body.appointmentRequest.requestedDate}}
{{inboundWebhookRequest.body.appointmentRequest.timezone}}
{{inboundWebhookRequest.body.hasAdditionalPatients}}
{{inboundWebhookRequest.body.additionalPatientsCount}}
{{inboundWebhookRequest.body.capturedAt}}
```

## Appointment lifecycle específico

Aplica a `new_booking`, `appointment_accepted`, `appointment_declined`, `appointment_reassigned`, `partner_rescheduled`, `appointment_completed` y `appointment_refunded`.

```text
{{inboundWebhookRequest.body.event}}
{{inboundWebhookRequest.body.idempotencyKey}}
{{inboundWebhookRequest.body.appointment.publicReference}}
{{inboundWebhookRequest.body.appointment.status}}
{{inboundWebhookRequest.body.serviceName}}
{{inboundWebhookRequest.body.appointmentDateTimeFormatted}}
{{inboundWebhookRequest.body.appointment.startsAt}}
{{inboundWebhookRequest.body.appointment.timezone}}
{{inboundWebhookRequest.body.appointment.serviceAddress.addressLine1}}
{{inboundWebhookRequest.body.appointment.serviceAddress.city}}
{{inboundWebhookRequest.body.appointment.serviceAddress.county}}
{{inboundWebhookRequest.body.appointment.serviceAddress.state}}
{{inboundWebhookRequest.body.patientFirstName}}
{{inboundWebhookRequest.body.patientLastName}}
{{inboundWebhookRequest.body.patientPhone}}
{{inboundWebhookRequest.body.patient.email}}
{{inboundWebhookRequest.body.partnerFirstName}}
{{inboundWebhookRequest.body.partnerLastName}}
{{inboundWebhookRequest.body.partnerFullName}}
{{inboundWebhookRequest.body.partnerEmail}}
{{inboundWebhookRequest.body.partnerPhone}}
{{inboundWebhookRequest.body.partnerProfilePhotoUrl}}
{{inboundWebhookRequest.body.partnerWebsiteUrl}}
{{inboundWebhookRequest.body.estimatedEarningsFormatted}}
{{inboundWebhookRequest.body.earningsDisplay}}
{{inboundWebhookRequest.body.platformFunded}}
{{inboundWebhookRequest.body.platformFundedPartnerAmount}}
{{inboundWebhookRequest.body.clientAmountDueAtVisit}}
{{inboundWebhookRequest.body.appointmentOfferUrl}}
{{inboundWebhookRequest.body.smsMessage}}
{{inboundWebhookRequest.body.hasAdditionalPatients}}
{{inboundWebhookRequest.body.additionalPatientsCount}}
```

## Customer appointment aggregate

Eventos: `customer.appointment.confirmed`, `customer.appointment.rescheduled`.

```text
{{inboundWebhookRequest.body.event}}
{{inboundWebhookRequest.body.customer.firstName}}
{{inboundWebhookRequest.body.customer.lastName}}
{{inboundWebhookRequest.body.customer.email}}
{{inboundWebhookRequest.body.customer.phone}}
{{inboundWebhookRequest.body.appointment.reference}}
{{inboundWebhookRequest.body.appointment.service}}
{{inboundWebhookRequest.body.appointment.startsAt}}
{{inboundWebhookRequest.body.appointment.endsAt}}
{{inboundWebhookRequest.body.appointment.timezone}}
{{inboundWebhookRequest.body.appointment.location.addressLine1}}
{{inboundWebhookRequest.body.appointment.location.addressLine2}}
{{inboundWebhookRequest.body.appointment.location.city}}
{{inboundWebhookRequest.body.appointment.location.state}}
{{inboundWebhookRequest.body.appointment.location.postalCode}}
{{inboundWebhookRequest.body.appointment.depositAmount}}
{{inboundWebhookRequest.body.appointment.servicePrice}}
{{inboundWebhookRequest.body.appointment.rescheduledFrom.startsAt}}
{{inboundWebhookRequest.body.appointment.changeReason}}
```

## Additional patient invitation

Evento: `customer.appointment.patient_invited`

Cada request representa un solo contacto. No intentes iterar `additionalPatients` dentro de GHL.

```text
{{inboundWebhookRequest.body.event}}
{{inboundWebhookRequest.body.eventId}}
{{inboundWebhookRequest.body.idempotencyKey}}
{{inboundWebhookRequest.body.notificationGroupId}}
{{inboundWebhookRequest.body.recipientSequence}}
{{inboundWebhookRequest.body.recipientCount}}
{{inboundWebhookRequest.body.recipientRole}}
{{inboundWebhookRequest.body.firstName}}
{{inboundWebhookRequest.body.lastName}}
{{inboundWebhookRequest.body.fullName}}
{{inboundWebhookRequest.body.email}}
{{inboundWebhookRequest.body.phone}}
{{inboundWebhookRequest.body.sendSms}}
{{inboundWebhookRequest.body.sendEmail}}
{{inboundWebhookRequest.body.contactAction}}
{{inboundWebhookRequest.body.createOrUpdateGhlContact}}
{{inboundWebhookRequest.body.marketingConsentStatus}}
{{inboundWebhookRequest.body.allowMarketingAutomation}}
{{inboundWebhookRequest.body.primaryPatientFullName}}
{{inboundWebhookRequest.body.serviceName}}
{{inboundWebhookRequest.body.appointmentReference}}
{{inboundWebhookRequest.body.appointmentStartsAt}}
{{inboundWebhookRequest.body.appointmentDateTimeFormatted}}
{{inboundWebhookRequest.body.appointmentTimezone}}
{{inboundWebhookRequest.body.careAccessUrl}}
{{inboundWebhookRequest.body.smsMessage}}
{{inboundWebhookRequest.body.emailSubject}}
```

Decisión del workflow:

- `test = true`: no upsert, SMS ni email.
- `createOrUpdateGhlContact = true`: Find Contact por email; fallback por phone; luego Create/Update Contact.
- `sendSms = true`: enviar [SMS de invitación](./sms-library.md#sms-additional-patient-invitation).
- `sendEmail = true`: enviar [email HTML](./emails/17-additional-patient-invitation.html).
- `allowMarketingAutomation = false`: no agregar a nurture, campañas ni broadcasts.

## Customer refund aggregate

Evento: `customer.appointment.deposit_refunded`

```text
{{inboundWebhookRequest.body.customer.firstName}}
{{inboundWebhookRequest.body.customer.lastName}}
{{inboundWebhookRequest.body.customer.email}}
{{inboundWebhookRequest.body.customer.phone}}
{{inboundWebhookRequest.body.appointment.reference}}
{{inboundWebhookRequest.body.appointment.service}}
{{inboundWebhookRequest.body.appointment.startsAt}}
{{inboundWebhookRequest.body.appointment.address}}
{{inboundWebhookRequest.body.refund.amount}}
{{inboundWebhookRequest.body.refund.currency}}
{{inboundWebhookRequest.body.reason}}
{{inboundWebhookRequest.body.replacementFound}}
```

## Client referrals

### Invitación creada

```text
{{inboundWebhookRequest.body.firstName}}
{{inboundWebhookRequest.body.lastName}}
{{inboundWebhookRequest.body.fullName}}
{{inboundWebhookRequest.body.phone}}
{{inboundWebhookRequest.body.email}}
{{inboundWebhookRequest.body.registrationUrl}}
{{inboundWebhookRequest.body.smsMessage}}
{{inboundWebhookRequest.body.inviter.firstName}}
{{inboundWebhookRequest.body.inviter.fullName}}
{{inboundWebhookRequest.body.inviter.email}}
{{inboundWebhookRequest.body.goal}}
{{inboundWebhookRequest.body.registeredCount}}
{{inboundWebhookRequest.body.remainingCount}}
```

### Registro y reward

```text
{{inboundWebhookRequest.body.event}}
{{inboundWebhookRequest.body.inviter.fullName}}
{{inboundWebhookRequest.body.inviter.email}}
{{inboundWebhookRequest.body.inviter.phone}}
{{inboundWebhookRequest.body.invitee.fullName}}
{{inboundWebhookRequest.body.invitee.email}}
{{inboundWebhookRequest.body.goal}}
{{inboundWebhookRequest.body.registeredCount}}
{{inboundWebhookRequest.body.remainingCount}}
{{inboundWebhookRequest.body.rewardEarned}}
{{inboundWebhookRequest.body.reward.status}}
{{inboundWebhookRequest.body.reward.type}}
```

## Campos que requieren transformación en GHL

- Fechas ISO (`startsAt`, `submittedAt`, `occurredAt`): usa una acción de formato de fecha y la zona horaria del payload.
- Importes numéricos: aplica formato monetario con `currency`.
- Arrays (`counties`, `additionalPatients`, `locations`): no los insertes directamente en SMS. Usa los campos escalares ya preparados cuando existan.
- Booleanos: crea ramas `true/false`; no imprimas el valor crudo al usuario.
