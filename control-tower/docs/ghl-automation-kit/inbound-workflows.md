# GHL — Guía para construir los tres inbound routers

## Bloques comunes

Cada workflow sigue este orden:

1. **Inbound Webhook**.
2. If `body.test = true` → mapping/log y terminar.
3. If `body.workflowRouter` no coincide → alerta interna y terminar.
4. Comprobar `body.idempotencyKey` o `body.eventId`.
5. If/Else por `body.communicationEvent`.
6. Si `body.primaryRecipientReady = true`, buscar/crear el contacto con `body.primaryRecipientEmail` y `body.primaryRecipientPhone`.
7. Enviar SMS/email de esa rama.
8. Si `body.notifyAdmin = true`, Internal Notification a Admin.
9. Si `body.stateOperatorDeliveryRoute = ghl_internal_user`, Internal Notification al usuario `body.stateOperatorGhlUserId`.
10. Si `body.stateOperatorDeliveryRoute = admin_fallback`, Internal Notification a Admin: operador no configurado para `body.stateOperatorResolutionKey`.

## R01 — Partner Applications

Nombre exacto: `MDN | Router 01 | Partner Applications`

Verificación inicial: `body.workflowRouter = partner_applications`.

### `partner_application_received`

- Contacto: `primaryRecipient*` del Applicant.
- Condición: `notifyApplicant = true`.
- [SMS](./sms-library.md#sms-partner-application-received)
- [Email HTML](./emails/01-partner-application-received.html)
- Si `notifyAdmin = true`: [SMS interno](./sms-library.md#sms-admin-new-application) o [email interno](./emails/02-admin-new-partner-application.html).

### `partner_account_ready`

- Contacto: `primaryRecipient*` del Partner.
- Condición: `notifyPartner = true`.
- [SMS](./sms-library.md#sms-partner-account-ready)
- [Email HTML](./emails/03-partner-account-ready.html)
- Link obligatorio: `body.welcomeLandingPageUrl`.
- Ejecutar la decisión del State Operator.

## R02 — Booking & Appointments

Nombre exacto: `MDN | Router 02 | Booking & Appointments`

Verificación inicial: `body.workflowRouter = booking_appointments`.

| Evento | Contacto/acción | SMS | Email |
|---|---|---|---|
| `booking.lead.created` | Upsert del lead; oportunidad; Admin/operador interno | — | — |
| `new_booking` | Partner offer | [SMS](./sms-library.md#sms-partner-new-appointment) | [Email](./emails/04-partner-new-appointment.html) |
| `customer.appointment.confirmed` | Customer confirmation | [SMS](./sms-library.md#sms-customer-appointment-confirmed) | [Email](./emails/05-customer-appointment-confirmed.html) |
| `customer.appointment.patient_invited` | Upsert del paciente adicional e invitación transaccional | [SMS](./sms-library.md#sms-additional-patient-invitation) | [Email](./emails/17-additional-patient-invitation.html) |
| `partner_confirmation_required` | Monitoreo interno | — | — |
| `appointment_accepted` | Customer: profesional asignado | [SMS](./sms-library.md#sms-customer-partner-assigned) | [Email](./emails/06-customer-partner-assigned.html) |
| `appointment_declined` | Admin/operador interno | [SMS](./sms-library.md#sms-admin-appointment-declined) | [Email](./emails/14-admin-appointment-declined.html) |
| `appointment_reassigned` | Nuevo Partner offer | [SMS](./sms-library.md#sms-partner-appointment-reassigned) | [Email](./emails/04-partner-new-appointment.html) |
| `partner_rescheduled` | Admin/operador interno | [Operator SMS](./sms-library.md#sms-state-operator-action-required) | [Operator email](./emails/16-state-operator-action-required.html) |
| `customer.appointment.rescheduled` | Customer reprogramado | [SMS](./sms-library.md#sms-customer-appointment-rescheduled) | [Email](./emails/07-customer-appointment-rescheduled.html) |
| `appointment_completed` | Customer cierre | [SMS](./sms-library.md#sms-customer-appointment-completed) | [Email](./emails/08-customer-appointment-completed.html) |
| `appointment_refunded` | Admin/Finanzas/operador interno | [SMS](./sms-library.md#sms-admin-appointment-refunded) | [Email](./emails/15-admin-appointment-refunded.html) |
| `customer.appointment.deposit_refunded` | Customer refund | [SMS](./sms-library.md#sms-customer-deposit-refunded) | [Email](./emails/09-customer-refund-confirmed.html) |

### Nueva cita: dos contactos, mismo router

`new_booking` y `customer.appointment.confirmed` se reciben por R02, pero son matrículas separadas. No combines el SMS/email del Partner y del cliente en una sola matrícula.

### Pacientes adicionales

Cada paciente adicional genera una matrícula compacta `customer.appointment.patient_invited` en el mismo R02. En esta rama:

1. Si `test = true`, mapea los campos y termina sin crear contacto ni enviar mensajes.
2. Busca el contacto por `email`; si no existe email, utiliza `phone`.
3. Crea o actualiza el contacto con `firstName`, `lastName`, `email` y `phone`.
4. Aplica `contactTags` y conserva `appointmentId` e `idempotencyKey` para auditoría.
5. Envía SMS solamente cuando `sendSms = true`.
6. Envía email solamente cuando `sendEmail = true`.
7. No agregues el contacto a marketing cuando `allowMarketingAutomation = false` o `marketingConsentStatus = not_captured`.

El backend no usa Resend para esta invitación. GHL controla ambos canales.

### Visita financiada

Si `appointment_accepted` lleva `requiresSecondaryContactWorkflow = true` y `secondaryRecipientRole = partner`, sólo comunica al cliente en esta rama. El SMS/email del Partner queda desactivado hasta implementar `partner.appointment.platform_funded`.

## R03 — Care Rewards

Nombre exacto: `MDN | Router 03 | Care Rewards`

Verificación inicial: `body.workflowRouter = care_rewards`.

| Evento | Contacto | SMS | Email |
|---|---|---|---|
| `client.referral.invite.created` | Invitee | [SMS](./sms-library.md#sms-client-referral-invitation) | [Email](./emails/10-client-referral-invitation.html) |
| `client.referral.registered` | Inviter | [SMS](./sms-library.md#sms-client-referral-progress) | [Email](./emails/11-client-referral-progress.html) |
| `client.referral.reward.earned` | Inviter | [SMS](./sms-library.md#sms-client-referral-reward-earned) | [Email](./emails/12-client-referral-reward-earned.html) |

## State Operator como Internal Notification

Condición:

```text
stateOperatorDeliveryRoute = ghl_internal_user
AND notifyStateOperator = true
```

Destinatario interno: usuario de GHL cuyo ID sea `stateOperatorGhlUserId`.

- [SMS interno](./sms-library.md#sms-state-operator-action-required)
- [Email interno](./emails/16-state-operator-action-required.html)

Fallback:

```text
stateOperatorDeliveryRoute = admin_fallback
```

Enviar a Admin una alerta con `stateOperatorResolutionKey`, `stateOperatorNotificationReason`, `marketCounty` y `marketState`.

## Publicación segura

Antes de activar:

- Safe test recibido y mapeado.
- `test = false` requerido para mensajes reales.
- Router y evento exactos validados.
- Contacto actual coincide con `primaryRecipientRole`.
- Idempotencia probada.
- State Operator configurado como usuario interno o Admin fallback confirmado.
