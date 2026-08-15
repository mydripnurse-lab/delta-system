# My Drip Nurse — Plan maestro de pruebas E2E

Estado permitido: `PENDING`, `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`.

Regla de trabajo: probar un solo ID a la vez. No avanzar hasta registrar evidencia y resultado del flujo actual.

## Los tres webhooks de GHL

| Código | Nombre exacto del workflow en GHL | `workflowRouter` | Uso |
|---|---|---|---|
| R01 | `MDN \| Router 01 \| Partner Applications` | `partner_applications` | Solicitudes y activación de Partners |
| R02 | `MDN \| Router 02 \| Booking & Appointments` | `booking_appointments` | Leads, pagos y ciclo de citas |
| R03 | `MDN \| Router 03 \| Care Rewards` | `care_rewards` | Invitaciones, progreso y Rewards |

`—` significa que la prueba no debe generar una llamada a GHL. **Internal** significa una acción `Internal Notification` dentro de la matrícula actual, no otro webhook.

## Cómo decide GHL a quién notificar

Cada payload lleva el contrato de ruteo en propiedades planas. Los tres routers deben decidir únicamente con estas propiedades:

| Propiedad | Decisión |
|---|---|
| `communicationEvent` | Rama exacta del router. |
| `workflowRouter` | Confirma que el evento llegó a R01, R02 o R03. |
| `primaryRecipientRole` | `applicant`, `partner`, `customer`, `invitee`, `inviter` o `admin`. |
| `primaryRecipientFirstName`, `primaryRecipientLastName`, `primaryRecipientEmail`, `primaryRecipientPhone` | Contacto actual que GHL debe buscar/crear y comunicar. |
| `primaryRecipientReady` | Permite comunicación externa sólo cuando es `true`. |
| `notifyApplicant`, `notifyPartner`, `notifyCustomer`, `notifyInvitee`, `notifyInviter` | Autoriza SMS/email al contacto actual. |
| `notifyAdmin` | Autoriza Internal Notification a Admin. |
| `externalDeliveryMode` | `single_contact`, `multi_contact` o `internal_only`. |
| `requiresSecondaryContactWorkflow` | Si es `true`, nunca enviar al segundo teléfono desde esta matrícula; requiere su evento de contacto separado. |
| `eventId` / `idempotencyKey` | Evita matrículas y mensajes duplicados. |
| `test` | Si es `true`, mapear y terminar sin comunicación real. |

### Decisión del State Operator

El sistema intenta resolver el operador con `stateOperatorResolutionKey`, formado como `país|estado`, por ejemplo `us|florida`.

| Propiedad | Uso en GHL |
|---|---|
| `stateOperatorNotificationRequired` | El evento amerita visibilidad/intervención estatal. |
| `stateOperatorNotificationReason` | Razón exacta: aprobación, falta de cobertura/disponibilidad, decline, reprogramación o refund. |
| `stateOperatorMatchStatus` | `matched`, `contact_only`, `not_configured` o `not_required`. |
| `stateOperatorGhlUserConfigured` | Confirma que el operador es usuario interno de GHL. |
| `stateOperatorGhlUserId` | Usuario interno que recibe la notificación. |
| `stateOperatorDeliveryRoute` | `ghl_internal_user`, `admin_fallback` o `none`. |
| `notifyStateOperator` | Es `true` sólo cuando el evento lo requiere y existe `stateOperatorGhlUserId`. |
| `marketState`, `marketCounty`, `marketCity` | Mercado afectado que aparecerá en el aviso. |
| `marketCoverageStatus`, `marketAvailabilityStatus`, `eligiblePartnerCount` | Permiten distinguir falta de cobertura, falta de horarios o falta genérica de Partner elegible. |

Decisión obligatoria dentro del router:

1. Si `stateOperatorDeliveryRoute = ghl_internal_user`, enviar Internal Notification al usuario `stateOperatorGhlUserId` usando [SMS](./sms-library.md#sms-state-operator-action-required) y/o [Email](./emails/16-state-operator-action-required.html).
2. Si `stateOperatorDeliveryRoute = admin_fallback`, avisar a Admin que falta asignar/configurar el operador para `stateOperatorResolutionKey`.
3. Si `stateOperatorDeliveryRoute = none`, no ejecutar acciones del operador.

El State Operator debe ser usuario interno de GHL para compartir la matrícula actual y no pagar otro webhook. Si más adelante se maneja como contacto externo, necesitará su propio evento y request.

## Evidencia requerida por prueba

- Fecha, hora, ambiente y dominio.
- Usuario/contacto de prueba.
- Resultado visible en el producto.
- `communicationEvent`, router y payload recibido, si aplica.
- Valores de `primaryRecipientRole`, `primaryRecipientEmail` y `primaryRecipientPhone`.
- Resultado de `stateOperatorDeliveryRoute`, si aplica.
- Una sola matrícula por `eventId`/`idempotencyKey`.
- SMS, email, push o Internal Notification recibida.
- Captura o texto exacto del error cuando falle.

## Fase 1 — Solicitud y aprobación del Partner

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| P01 | Enviar solicitud directa de Partner | `partner_application_received` | R01 | Applicant: [SMS](./sms-library.md#sms-partner-application-received) + [Email](./emails/01-partner-application-received.html); Admin Internal: [SMS](./sms-library.md#sms-admin-new-application) + [Email](./emails/02-admin-new-partner-application.html) | PENDING |
| P02 | Confirmar alerta administrativa | Mismo evento P01 | R01; misma matrícula | `notifyAdmin=true`; no emitir otro webhook | PENDING |
| P03 | Solicitud mediante referido de Partner | `partner_application_received` | R01 | Igual que P01; atribución guardada; una sola matrícula | PENDING |
| P04 | Abrir/evaluar Application profile | — | — | — | PENDING |
| P05 | Aceptar la solicitud | `partner_account_ready` | R01 | Partner: [SMS](./sms-library.md#sms-partner-account-ready) + [Email](./emails/03-partner-account-ready.html); Operator/Internal cuando corresponda: [SMS](./sms-library.md#sms-state-operator-action-required) + [Email](./emails/16-state-operator-action-required.html) | PENDING |
| P06 | Repetir/recargar aceptación completada | No debe emitir evento nuevo | R01 | Sin duplicar cuenta, matrícula ni mensajes | PENDING |

## Fase 2 — Activación y configuración del Partner

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| P07 | Abrir activación y crear contraseña | — | — | — | PENDING |
| P08 | Primer login desktop | — | — | — | PENDING |
| P09 | Login móvil | — | — | — | PENDING |
| P10 | Guardar perfil, foto, título y biografía | — | — | — | PENDING |
| P11 | Configurar disponibilidad/bloquear día | — | — | — | PENDING |
| P12 | Configurar disponibilidad desde Admin | — | — | — | PENDING |
| P13 | Publicar Website y Directorio | — | — | — | PENDING |
| P14 | Ocultar Website y/o Directorio | — | — | — | PENDING |

## Fase 3 — Cuenta Care y perfil del cliente

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| C01 | Crear cuenta/iniciar sesión con Google | — | — | — | PENDING |
| C02 | Crear cuenta/iniciar sesión por email | — | — | — | PENDING |
| C03 | Cerrar sesión | — | — | — | PENDING |
| C04 | Guardar personales, teléfono, peso y estatura | — | — | — | PENDING |
| C05 | Guardar dirección verificada desktop | — | — | — | PENDING |
| C06 | Guardar dirección verificada móvil | — | — | — | PENDING |
| C07 | Guardar/elegir varias direcciones | — | — | — | PENDING |
| C08 | Safety Profile y referencia corporal | — | — | — | PENDING |

## Fase 4 — Catálogo y preparación del booking

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| B01 | Ver catálogo y seleccionar servicio | — | — | — | PENDING |
| B02 | Servicio pausado | — | — | — | PENDING |
| B03 | Servicio Out of Stock | — | — | — | PENDING |
| B04 | Booking autenticado | — | — | — | PENDING |
| B05 | Booking como guest | — | — | — | PENDING |
| B06 | Login Google/email dentro del calendario | — | — | — | PENDING |
| B07 | Confirmar screening nuevamente | — | — | — | PENDING |
| B08 | Añadir pacientes adicionales | Se prepara `customer.appointment.patient_invited` después de confirmar el pago | R02 | Sin mensaje antes del pago; cada paciente válido queda listo para su propia matrícula compacta | PENDING |

## Fase 5 — Lead, cobertura, disponibilidad y pago

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| B09 | Capturar datos y abandonar antes de pagar | `booking.lead.created` | R02 | Upsert de contacto/oportunidad; Admin Internal. Sin SMS/email al cliente | PENDING |
| B10 | Dirección con cobertura y disponibilidad | — | — | — | PENDING |
| B11 | Cobertura sin disponibilidad | `booking.lead.created`; reason `booking_lead_without_availability` | R02 | Admin Internal; Operator/Internal si `stateOperatorNotificationRequired=true` | PENDING |
| B12 | Dirección sin cobertura | `booking.lead.created`; reason `booking_lead_without_coverage` | R02 | Admin Internal; Operator/Internal: [SMS](./sms-library.md#sms-state-operator-action-required) + [Email](./emails/16-state-operator-action-required.html) | PENDING |
| B13 | Pago Stripe exitoso test mode | `new_booking` + `customer.appointment.confirmed` + un `customer.appointment.patient_invited` por paciente adicional | R02; una matrícula por contacto externo | Partner: [SMS](./sms-library.md#sms-partner-new-appointment) + [Email](./emails/04-partner-new-appointment.html); Customer: [SMS](./sms-library.md#sms-customer-appointment-confirmed) + [Email](./emails/05-customer-appointment-confirmed.html); cada paciente adicional: [SMS](./sms-library.md#sms-additional-patient-invitation) + [Email](./emails/17-additional-patient-invitation.html) | PENDING |
| B14 | Pago fallido/cancelado | No debe emitir confirmación | — | Sin mensajes de cita confirmada | PENDING |
| B15 | Reintentar checkout/pago | Sólo eventos canónicos si finalmente paga | R02 | Sin duplicar cita, cobro ni comunicación | PENDING |

## Fase 6 — Oferta y ciclo de la cita

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| A01 | Cita pagada creada | `new_booking` + `customer.appointment.confirmed` | R02 | Comunicaciones de B13 | PENDING |
| A02 | Oferta llega al Partner | `new_booking` | R02 | [SMS](./sms-library.md#sms-partner-new-appointment) + [Email](./emails/04-partner-new-appointment.html) + push fuera de GHL | PENDING |
| A03 | Partner acepta | `appointment_accepted` | R02 | Customer: [SMS](./sms-library.md#sms-customer-partner-assigned) + [Email](./emails/06-customer-partner-assigned.html) | PENDING |
| A04 | Partner declina | `appointment_declined` | R02 | Admin Internal: [SMS](./sms-library.md#sms-admin-appointment-declined) + [Email](./emails/14-admin-appointment-declined.html); Operator/Internal si aplica | PENDING |
| A05 | Reasignar a otro Partner | `appointment_reassigned` | R02 | Nuevo Partner: [SMS](./sms-library.md#sms-partner-appointment-reassigned) + [Email](./emails/04-partner-new-appointment.html) | PENDING |
| A06 | Partner reprograma | `partner_rescheduled` + `customer.appointment.rescheduled` | R02; Internal + matrícula Customer | Admin/Operator Internal; Customer: [SMS](./sms-library.md#sms-customer-appointment-rescheduled) + [Email](./emails/07-customer-appointment-rescheduled.html) | PENDING |
| A07 | Iniciar cita | — | — | Push operacional fuera de GHL | PENDING |
| A08 | Completar cita | `appointment_completed` | R02 | Customer: [SMS](./sms-library.md#sms-customer-appointment-completed) + [Email](./emails/08-customer-appointment-completed.html) | PENDING |
| A09 | Reembolsar depósito | `appointment_refunded` + `customer.appointment.deposit_refunded` | R02; Internal + matrícula Customer | Admin/Finance Internal: [SMS](./sms-library.md#sms-admin-appointment-refunded) + [Email](./emails/15-admin-appointment-refunded.html); Customer: [SMS](./sms-library.md#sms-customer-deposit-refunded) + [Email](./emails/09-customer-refund-confirmed.html); Operator/Internal si aplica | PENDING |
| A10 | Notificación del header | — | — | Deeplink/push fuera de GHL | PENDING |

## Fase 7 — Rewards e invitaciones

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| R01 | Crear invitación personal | `client.referral.invite.created` | R03 | Invitee: [SMS](./sms-library.md#sms-client-referral-invitation) + [Email](./emails/10-client-referral-invitation.html) cuando tenga email | PENDING |
| R02 | Invitado se registra | `client.referral.registered` | R03 | Inviter: [SMS](./sms-library.md#sms-client-referral-progress) + [Email](./emails/11-client-referral-progress.html) | PENDING |
| R03 | Llegar a 10 registros verificados | `client.referral.reward.earned` | R03 | Inviter: [SMS](./sms-library.md#sms-client-referral-reward-earned) + [Email](./emails/12-client-referral-reward-earned.html) | PENDING |
| R04 | Usar reward de invitaciones | Evento de redención pendiente | R03 | NOT IMPLEMENTED | NOT IMPLEMENTED |
| R05 | Completar 10 citas | Evento de reward recurrente pendiente | R03 | NOT IMPLEMENTED | NOT IMPLEMENTED |
| R06 | Reservar cita gratis | Eventos normales de booking cuando se implemente | R02 | Cliente paga `$0` de depósito; Partner recibe oferta normal | NOT IMPLEMENTED |
| R07 | Partner acepta cita financiada | `partner.appointment.platform_funded` pendiente | R02 | Futuro Partner: [SMS](./sms-library.md#sms-partner-platform-funded) + [Email](./emails/13-partner-platform-funded-accepted.html) | NOT IMPLEMENTED |
| R08 | Completar cita financiada | Evento de liquidación pendiente | R02/R03 | NOT IMPLEMENTED | NOT IMPLEMENTED |

## Fase 8 — Directorio y atribución

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| D01 | Encontrar Partners cercanos | — | — | — | PENDING |
| D02 | Abrir perfil y comenzar booking | — | — | — | PENDING |
| D03 | Completar booking desde Directorio | Eventos normales de B13 | R02 | Comunicación de B13 con atribución de Directorio | PENDING |
| D04 | Analytics del Directorio en Admin | — | — | — | PENDING |
| D05 | Analytics del Directorio del Partner | — | — | — | PENDING |

## Fase 9 — Admin, contactos y Business Analytics

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| M01 | Contacto con varios intentos/citas/direcciones | — | — | — | PENDING |
| M02 | Pins por dirección exacta | — | — | — | PENDING |
| M03 | Abrir pin del mapa | — | — | — | PENDING |
| M04 | Capa de cobertura | — | — | — | PENDING |
| M05 | Razón de oportunidad perdida | `booking.lead.created` ya existente | R02 | Sin webhook analítico adicional | PENDING |
| M06 | Prospecting por county | — | — | — | PENDING |

## Fase 10 — Resiliencia, PWA y soporte

| ID | Prueba | Evento | Webhook/workflow | Comunicación GHL | Estado |
|---|---|---|---|---|---|
| X01 | Editar URL de Automation y recargar | — | R01/R02/R03 | La URL persiste y los eventos reales usan la guardada | PENDING |
| X02 | Safe send test | Evento seguro del router | R01/R02/R03 | `test=true`; mapear sin SMS/email/Internal Notification | PENDING |
| X03 | Repetir evento/idempotency key | Mismo evento | Router correspondiente | Una matrícula y una comunicación como máximo | PENDING |
| X04 | Instalar PWA desktop/móvil | — | — | — | PENDING |
| X05 | Push y badge | — | — | Push/deeplink fuera de GHL | PENDING |
| X06 | Support Inbox | — | — | — | PENDING |

## Flujos todavía no implementados completamente

Mantenerlos como `NOT IMPLEMENTED`, no como `FAIL`:

- Reward recurrente por 10 citas y redención del reward.
- Evento Partner de visita financiada `partner.appointment.platform_funded`.
- Recuperación de pago fallido/checkout abandonado.
- Cancelación sin reembolso como evento independiente.
- Recordatorios configurables 24 h, 2 h y profesional en camino.
- Welcome de cuenta Care nueva.
- Publicar/ocultar Website o Directorio como evento GHL.
- Paciente adicional acepta su invitación.

## Prueba actual

`P01 — Enviar solicitud directa de Partner`

Antes de probar: construir los tres workflows con [la arquitectura de routers](./optimized-ghl-router-architecture.md), copiar los valores desde [Custom Values](./custom-values.md) y completar [el checklist](./workflow-test-checklist.md).
