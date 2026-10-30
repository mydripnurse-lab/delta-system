# Checklist de implementación y pruebas GHL

No pegues URLs completas en documentación compartida. Guarda sólo los últimos seis caracteres o el ID interno.

## Routers

| Router | Nombre exacto en GHL | URL guardada | Safe test | Mapping | Gate `test=false` | Idempotencia | Contacto normalizado | Admin interno | Operator/fallback | Responsable | Fecha |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | `MDN \| Partner \| Application Received` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | n/a |  |  |
| A02 | `MDN \| Partner \| Account-ready Welcome` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |
| R02 | `MDN \| Router 02 \| Booking & Appointments` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |
| R03 | `MDN \| Router 03 \| Care Rewards` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |  |  |

## Ramas reales

| Evento | Router | `primaryRecipientRole` correcto | 1 matrícula | SMS | Email | Internal Notification | Evidencia |
|---|---|---|---|---|---|---|---|
| `partner_application_received` | A01 | applicant | ☐ | ☐ | ☐ | Admin ☐ |  |
| `partner_account_ready` | A02 | partner | ☐ | ☐ | ☐ | Operator/fallback ☐ |  |
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

## Referidos: activación verificada — 2026-10-30

Esta activación usa **tres workflows independientes**, no el router R03 propuesto arriba. Están publicados en la subcuenta My Drip Nurse, carpeta **Portal Notifications**, y conectados como ACTIVE en Communications del portal.

| Evento | Workflow | ID de GHL | Destinatario | Prueba (EDT) |
|---|---|---|---|---|
| `client.referral.invite.created` | MDN \| Rewards \| Invitation | `6f942aba-0e7f-4308-8572-951fee950d60` | Invitee | 15:32; email y SMS ejecutados, recorrido Finished |
| `client.referral.registered` | MDN \| Rewards \| Referral Registered | `e37415c5-6ecb-4d7e-831b-5fb9b855c9b2` | Inviter | 15:33; email y SMS ejecutados, recorrido Finished |
| `client.referral.reward.earned` | MDN \| Rewards \| Reward Earned | `f4edb262-019a-42a2-be6d-d9fb2c8af1fb` | Inviter | 15:30; email y SMS ejecutados |

- Las tres pruebas autorizadas usaron únicamente el contacto existente de Keishla, con datos ficticios. No crearon cuentas Care, invitaciones, reservas ni recompensas reales. Se enviaron directamente a los webhooks; no se usó el Safe Test genérico del admin.
- Se revisó el contenido de los tres emails y SMS en Conversations: marca My Drip Nurse, variables sustituidas y enlaces correctos. La invitación conservó el parámetro `referral`; progreso y recompensa enlazan a `/rewards/invitations`. GHL registró la ejecución de los envíos; esto no certifica lectura ni llegada a la bandeja principal.
- Cada workflow valida su `event` y `success = true` antes de crear/actualizar el contacto. El contacto usa `primaryRecipientEmail`, `primaryRecipientPhone` y `primaryRecipientFullName`; el backend existente determina invitee/inviter. Solo intenta email/teléfono cuando el campo existe. No se modificaron preferencias DND.
- Se conservaron el reingreso y los filtros por canal; no se añadieron esperas, recordatorios periódicos, webhooks de retransmisión ni avisos internos.
- Plantillas independientes: `10-client-referral-invitation.html`, `11-client-referral-progress.html`, `12-client-referral-reward-earned.html`. Se verificó la vista persistida después de guardar para evitar el contenido de ejemplo del editor. Click tracking y UTM tracking están desactivados.
- Share Care requiere 10 registros verificados y concede una exención de depósito para una próxima cita elegible. No es una visita completamente gratis: el saldo del servicio lo cobra directamente la profesional; la propina es voluntaria. No cambia la excepción de visitas de recompensas financiadas por MDN.
- La protección existente frente a duplicados permanece en `client_referral_webhook_deliveries.idempotency_key`. No se ejecutó una segunda prueba de duplicado para evitar cargos adicionales. Un POST directo a GHL no pasa por esa protección del backend.
- No hubo cambios de código de aplicación, cron, consultas, esquema ni despliegue Vercel. Se guardaron tres URLs en la configuración ya existente. Aplican los cargos de GHL por trigger y email/SMS autorizados por el usuario.
- No se guardan URLs completas ni datos personales de prueba en este documento.
