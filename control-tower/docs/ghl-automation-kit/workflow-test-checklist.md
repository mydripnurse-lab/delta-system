# Checklist de implementación y pruebas GHL

No pegues URLs completas en documentación compartida. Guarda sólo los últimos seis caracteres o el ID interno.

## Routers

| Router | Nombre exacto en GHL | URL guardada | Safe test | Mapping | Gate `test=false` | Idempotencia | Contacto normalizado | Admin interno | Operator/fallback | Responsable | Fecha |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R01 | `MDN \| Router 01 \| Partner Applications` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |
| R02 | `MDN \| Router 02 \| Booking & Appointments` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |
| R03 | `MDN \| Router 03 \| Care Rewards` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |

## Ramas reales

| Evento | Router | `primaryRecipientRole` correcto | 1 matrícula | SMS | Email | Internal Notification | Evidencia |
|---|---|---|---|---|---|---|---|
| `partner_application_received` | R01 | applicant | ☐ | ☐ | ☐ | Admin ☐ |  |
| `partner_account_ready` | R01 | partner | ☐ | ☐ | ☐ | Operator/fallback ☐ |  |
| `booking.lead.created` | R02 | customer | ☐ | n/a | n/a | Admin/Operator ☐ |  |
| `new_booking` | R02 | partner | ☐ | ☐ | ☐ | — |  |
| `customer.appointment.confirmed` | R02 | customer | ☐ | ☐ | ☐ | — |  |
| `customer.appointment.patient_invited` | R02 | additional patient | ☐ | ☐ | ☐ | GHL contact upsert ☐; no marketing enrollment ☐ |  |
| `partner_confirmation_required` | R02 | admin | ☐ | n/a | n/a | Admin ☐ |  |
| `appointment_accepted` | R02 | customer | ☐ | ☐ | ☐ | — |  |
| `appointment_declined` | R02 | admin | ☐ | n/a | n/a | Admin/Operator ☐ |  |
| `appointment_reassigned` | R02 | partner | ☐ | ☐ | ☐ | — |  |
| `partner_rescheduled` | R02 | admin | ☐ | n/a | n/a | Admin/Operator ☐ |  |
| `customer.appointment.rescheduled` | R02 | customer | ☐ | ☐ | ☐ | — |  |
| `appointment_completed` | R02 | customer | ☐ | ☐ | ☐ | — |  |
| `appointment_refunded` | R02 | admin | ☐ | n/a | n/a | Admin/Finance/Operator ☐ |  |
| `customer.appointment.deposit_refunded` | R02 | customer | ☐ | ☐ | ☐ | — |  |
| `client.referral.invite.created` | R03 | invitee | ☐ | ☐ | ☐ | — |  |
| `client.referral.registered` | R03 | inviter | ☐ | ☐ | ☐ | — |  |
| `client.referral.reward.earned` | R03 | inviter | ☐ | ☐ | ☐ | — |  |

## Evidencia mínima

- `communicationEvent`, `workflowRouter` y `routingVersion`.
- `eventId`/`idempotencyKey`.
- `primaryRecipientRole` y contacto de prueba.
- Captura de Enrollment History.
- Safe test sin comunicaciones reales.
- Prueba real con exactamente un SMS/email por contacto.
- Resultado de `stateOperatorDeliveryRoute` cuando aplique.
- Enlace principal del mensaje funcionando.

Un flujo queda terminado sólo con contrato, destinatario, plantilla, gates, evidencia real, control de duplicados y responsable.
