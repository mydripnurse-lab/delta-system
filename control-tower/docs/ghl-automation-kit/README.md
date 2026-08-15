# My Drip Nurse — GHL Automation Playbook

Kit operativo para configurar, probar y mantener las comunicaciones de Admin, Partner Portal, Care y el booking engine.

## Diseño aprobado

Sólo se crean tres inbound workflows en GHL:

| Código | Nombre exacto | Eventos |
|---|---|---|
| R01 | `MDN \| Router 01 \| Partner Applications` | Solicitudes y activación de Partners |
| R02 | `MDN \| Router 02 \| Booking & Appointments` | Leads, pagos y lifecycle de citas |
| R03 | `MDN \| Router 03 \| Care Rewards` | Invitaciones, registros y Rewards |

Cada payload incluye `workflowRouter`, `communicationEvent`, `primaryRecipient*`, flags `notify*` y la decisión del State Operator. La definición completa está en [Arquitectura GHL optimizada](./optimized-ghl-router-architecture.md).

## Regla de costo

- Una llamada por evento real.
- Admin y State Operator reciben Internal Notifications dentro de esa matrícula.
- Dos personas externas distintas requieren dos eventos/contactos separados, aunque ambos usen la misma URL router.
- Safe tests llevan `test = true` y nunca deben enviar comunicaciones reales.

## Configuración de URLs en Admin

### URL R01

Guardar la misma URL en:

- Application received
- Account-ready welcome

Dejar Administrator alert vacío; la alerta sale como Internal Notification desde `partner_application_received`.

### URL R02

Guardar la misma URL en:

- Booking lead capture
- New booking
- Appointment accepted
- Appointment declined
- Appointment reassigned
- Partner rescheduled
- Appointment completed
- Appointment refunded
- Appointment lifecycle + refunds, para eventos `customer.appointment.*`

Appointment created for GHL queda vacío cuando New booking está configurado. Partner confirmation required se usa sólo para monitoreo, sin repetir la oferta inicial.

### URL R03

Guardar en:

- Client referral invitations

## Flujos disponibles

| Evento | Router | Contacto actual | Comunicación |
|---|---|---|---|
| `partner_application_received` | R01 | Applicant | Recepción SMS/email + Admin interno |
| `partner_account_ready` | R01 | Partner | Activación SMS/email + operador interno cuando corresponda |
| `booking.lead.created` | R02 | Customer/lead | CRM + Admin; operador si no hay Partner elegible |
| `new_booking` | R02 | Partner | Oferta SMS/email |
| `customer.appointment.confirmed` | R02 | Customer | Confirmación SMS/email |
| `partner_confirmation_required` | R02 | Interno | Monitoreo sin comunicación duplicada |
| `appointment_accepted` | R02 | Customer | Profesional asignado SMS/email |
| `appointment_declined` | R02 | Interno | Admin/operador |
| `appointment_reassigned` | R02 | Partner | Nueva oferta SMS/email |
| `partner_rescheduled` | R02 | Interno | Admin/operador |
| `customer.appointment.rescheduled` | R02 | Customer | Reprogramación SMS/email |
| `appointment_completed` | R02 | Customer | Cierre SMS/email |
| `appointment_refunded` | R02 | Interno | Admin/Finanzas/operador |
| `customer.appointment.deposit_refunded` | R02 | Customer | Refund SMS/email |
| `client.referral.invite.created` | R03 | Invitee | Invitación SMS/email |
| `client.referral.registered` | R03 | Inviter | Progreso SMS/email |
| `client.referral.reward.earned` | R03 | Inviter | Reward SMS/email |

## Pendientes de contrato GHL

No deben activarse como si fueran operativos:

1. `partner.appointment.platform_funded`: contacto Partner después de aceptar una visita financiada.
2. `client.visit.reward.earned`: reward recurrente por 10 citas.
3. `client.reward.redeemed`: reward aplicado a un booking.
4. Pago fallido/checkout abandonado.
5. Cancelación sin refund.
6. Recordatorios 24 h, 2 h y profesional en camino.
7. Welcome de una nueva cuenta Care.
8. Website/Directorio publicado u ocultado.
9. Paciente adicional aceptó su invitación.

## Proceso de prueba

1. Crear los tres routers usando la [guía inbound](./inbound-workflows.md).
2. Copiar sus URLs a los campos indicados y guardar.
3. Ejecutar Safe send test y confirmar una matrícula con `test = true`.
4. Mapear [Custom Values](./custom-values.md).
5. Activar la rama real sólo con `test = false`.
6. Probar un ID del [plan maestro E2E](./end-to-end-system-test-plan.md) a la vez.
7. Confirmar un solo mensaje por destinatario y registrar evidencia.

## Archivos

- [Arquitectura y decisiones](./optimized-ghl-router-architecture.md)
- [Guía para construir los tres routers](./inbound-workflows.md)
- [Custom Values y State Operator](./custom-values.md)
- [Checklist de routers](./workflow-test-checklist.md)
- [Plan maestro E2E](./end-to-end-system-test-plan.md)
- [Biblioteca SMS](./sms-library.md)
- [Emails HTML](./emails/README.md)
