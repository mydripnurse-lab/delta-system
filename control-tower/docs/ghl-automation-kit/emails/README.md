# Emails HTML para GHL

Cada archivo es un documento HTML independiente y listo para pegar en el editor de código de GHL.

| Archivo | Evento | Destinatario |
|---|---|---|
| `01-partner-application-received.html` | `partner_application_received` | Solicitante Partner |
| `02-admin-new-partner-application.html` | `partner_application_admin_notification` | Admin |
| `03-partner-account-ready.html` | `partner_account_ready` | Partner aprobado |
| `04-partner-new-appointment.html` | `new_booking` / `appointment_reassigned` | Partner |
| `05-customer-appointment-confirmed.html` | `customer.appointment.confirmed` | Cliente |
| `06-customer-partner-assigned.html` | `appointment_accepted` | Cliente |
| `07-customer-appointment-rescheduled.html` | `customer.appointment.rescheduled` | Cliente |
| `08-customer-appointment-completed.html` | `appointment_completed` | Cliente |
| `09-customer-refund-confirmed.html` | `customer.appointment.deposit_refunded` | Cliente |
| `10-client-referral-invitation.html` | `client.referral.invite.created` | Invitado |
| `11-client-referral-progress.html` | `client.referral.registered` | Cliente que invitó |
| `12-client-referral-reward-earned.html` | `client.referral.reward.earned` | Cliente que invitó |
| `13-partner-platform-funded-accepted.html` | `appointment_accepted` + `platformFunded = true` | Partner |
| `14-admin-appointment-declined.html` | `appointment_declined` | Admin/Operaciones |
| `15-admin-appointment-refunded.html` | `appointment_refunded` | Admin/Finanzas |
| `16-state-operator-action-required.html` | Eventos con `stateOperatorNotificationRequired = true` | State Operator interno de GHL |
| `17-additional-patient-invitation.html` | `customer.appointment.patient_invited` | Cada paciente adicional de una cita |
| `18-market-manager-account-ready.html` | `market_manager_account_ready` | Market Manager |

Antes de activar cada email:

1. Ejecuta el safe test del destino.
2. Confirma que GHL reconoce las variables `inboundWebhookRequest.body`.
3. Excluye `test = true` de las acciones de envío real.
4. Para fechas ISO, crea un Custom Value formateado en la zona horaria del payload.
5. Envía una prueba a una dirección interna antes de publicar el workflow.

Las invitaciones de pacientes adicionales se entregan exclusivamente desde GHL. El backend no usa Resend para este evento.
