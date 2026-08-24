# GHL SMS Library

Mensajes listos para copiar. Mantén la identificación “My Drip Nurse” y conserva los enlaces completos.

<a id="sms-partner-application-received"></a>
## 1. Partner application received

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.firstName}}, we received your Partner application for {{inboundWebhookRequest.countyStateNames}}. Our team is reviewing it and will contact you with the next step.
```

<a id="sms-partner-account-ready"></a>
## 2. Account-ready welcome

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.firstName}}, your Partner account is ready. Create your secure password and activate your account within {{inboundWebhookRequest.activationLinkExpiresInDays}} days: {{inboundWebhookRequest.welcomeLandingPageUrl}}
```

<a id="sms-market-manager-account-ready"></a>
## 2A. Market Manager account ready

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.firstName}}, your Market Manager account for {{inboundWebhookRequest.marketStateNames}} is ready. Sign in securely: {{inboundWebhookRequest.actionUrl}}
```

Nunca incluyas la contraseña inicial en SMS, email, notas ni campos personalizados de GHL.

<a id="sms-partner-new-appointment"></a>
## 3. New appointment offer

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

Opción recomendada: usa directamente el mensaje preparado por el sistema.

```text
{{inboundWebhookRequest.smsMessage}}
```

Equivalente editable:

```text
My Drip Nurse: Hi {{inboundWebhookRequest.partnerFirstName}}, a new appointment is available. Earn {{inboundWebhookRequest.earningsDisplay}}. {{inboundWebhookRequest.serviceName}} · {{inboundWebhookRequest.appointmentDateTimeFormatted}}. Review and accept or decline: {{inboundWebhookRequest.appointmentOfferUrl}}
```

<a id="sms-customer-appointment-confirmed"></a>
## 4. Customer appointment confirmed

Evento: `customer.appointment.confirmed`

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.primaryRecipientFirstName}}, your {{inboundWebhookRequest.appointment.service}} appointment is confirmed for {{inboundWebhookRequest.appointment.startsAt}} ({{inboundWebhookRequest.appointment.timezone}}). Reference: {{inboundWebhookRequest.appointment.publicReference}}. View your care: https://care.mydripnurse.com/appointments
```

Este mensaje usa el mismo router R02 que `new_booking`, pero llega mediante un evento separado porque el cliente y el Partner son contactos externos distintos.

<a id="sms-additional-patient-invitation"></a>
## 4A. Additional patient invitation

Evento: `customer.appointment.patient_invited`

Destinatario: `{{inboundWebhookRequest.phone}}`

Usa el texto compacto preparado por el sistema:

```text
{{inboundWebhookRequest.smsMessage}}
```

Equivalente editable:

```text
My Drip Nurse: {{inboundWebhookRequest.primaryPatientFullName}} included you in a {{inboundWebhookRequest.serviceName}} appointment on {{inboundWebhookRequest.appointmentDateTimeFormatted}}. View your appointment: {{inboundWebhookRequest.careAccessUrl}}
```

GHL debe crear o actualizar el contacto antes del envío. Este evento es transaccional: no lo agregues a campañas de marketing mientras `allowMarketingAutomation = false`.

<a id="sms-customer-partner-assigned"></a>
## 5. Partner assigned after acceptance

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.patientFirstName}}, {{inboundWebhookRequest.partnerFullName}} has accepted your {{inboundWebhookRequest.serviceName}} appointment. View the appointment and your care professional: https://care.mydripnurse.com/appointments
```

<a id="sms-partner-appointment-reassigned"></a>
## 6. Appointment reassigned — new Partner

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
{{inboundWebhookRequest.smsMessage}}
```

<a id="sms-partner-platform-funded"></a>
## 6A. Partner accepted a platform-funded reward visit

Destinatario del futuro evento dedicado: `{{inboundWebhookRequest.primaryRecipientPhone}}`

Condición obligatoria: `{{inboundWebhookRequest.platformFunded}}` es `true`.

```text
{{inboundWebhookRequest.smsMessage}}
```

El mensaje preparado por el sistema le informa al Partner que My Drip Nurse pagará la visita después de completarla y que debe cobrar `$0` al paciente. No debe activarse desde la matrícula de cliente `appointment_accepted`; requiere el evento Partner dedicado indicado en el plan maestro.

<a id="sms-customer-appointment-rescheduled"></a>
## 7. Customer appointment rescheduled

Evento: `customer.appointment.rescheduled`

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.primaryRecipientFirstName}}, your {{inboundWebhookRequest.appointment.service}} appointment has been rescheduled to {{inboundWebhookRequest.appointment.startsAt}} ({{inboundWebhookRequest.appointment.timezone}}). Review your visit: https://care.mydripnurse.com/appointments
```

<a id="sms-customer-appointment-completed"></a>
## 8. Appointment completed

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.patientFirstName}}, your {{inboundWebhookRequest.serviceName}} visit is complete. Your care history and Rewards progress are available here: https://care.mydripnurse.com/appointments
```

<a id="sms-customer-deposit-refunded"></a>
## 9. Customer deposit refunded

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`

```text
My Drip Nurse: Hi {{inboundWebhookRequest.primaryRecipientFirstName}}, your deposit refund of {{inboundWebhookRequest.refund.amount}} {{inboundWebhookRequest.refund.currency}} has been initiated for appointment {{inboundWebhookRequest.appointment.publicReference}}. Processing time depends on your bank.
```

<a id="sms-client-referral-invitation"></a>
## 10. Client referral invitation

Destinatario: `{{inboundWebhookRequest.phone}}`

Usa el texto preparado por el sistema:

```text
{{inboundWebhookRequest.smsMessage}}
```

<a id="sms-client-referral-progress"></a>
## 11. Referral registration progress

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}` (normalizado desde `inviter.phone`).

Texto:

```text
My Drip Nurse: Great news—{{inboundWebhookRequest.invitee.fullName}} joined Care through your invitation. You now have {{inboundWebhookRequest.registeredCount}} of {{inboundWebhookRequest.goal}} verified registrations.
```

<a id="sms-client-referral-reward-earned"></a>
## 12. Referral reward earned

Destinatario: `{{inboundWebhookRequest.primaryRecipientPhone}}`.

```text
My Drip Nurse: You unlocked your Share Care reward. Your one-time booking discount will be applied automatically to your next eligible appointment. Book: https://care.mydripnurse.com/book
```

## Alertas internas opcionales

<a id="sms-admin-new-application"></a>
### Nueva aplicación

```text
MDN Admin: New Partner application from {{inboundWebhookRequest.fullName}} for {{inboundWebhookRequest.countyStateNames}}. Review: {{inboundWebhookRequest.adminProfileUrl}}
```

<a id="sms-admin-appointment-declined"></a>
### Partner declined

```text
MDN Admin: {{inboundWebhookRequest.partnerFullName}} declined {{inboundWebhookRequest.appointment.publicReference}}. Reassignment may be required. Open Admin: https://admin.mydripnurse.com/appointments
```

<a id="sms-admin-appointment-refunded"></a>
### Refund

```text
MDN Admin: Appointment {{inboundWebhookRequest.appointment.publicReference}} was refunded. Review payment and customer communications in Admin.
```

<a id="sms-state-operator-action-required"></a>
### State Operator — acción requerida

Este texto se usa como **Internal Notification SMS** al usuario de GHL identificado por `stateOperatorGhlUserId`, no como `Send SMS` al contacto actual.

```text
MDN State Operations: {{inboundWebhookRequest.stateOperatorNotificationReason}} in {{inboundWebhookRequest.marketCounty}}, {{inboundWebhookRequest.marketState}}. Event: {{inboundWebhookRequest.communicationEvent}}. Review: https://admin.mydripnurse.com/appointments
```
