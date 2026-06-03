---
name: kommo-gac
description: >
  Especialista en la integración Kommo CRM para GAC Venezuela.
  Úsala siempre que el trabajo involucre: Kommo, leads, pipeline, etapas,
  webhooks, sincronización CRM-sistema, contactos, empresas en Kommo,
  kommo-api o kommo-webhook. También cuando se debugguen problemas de sync,
  leads duplicados, o stages que no se actualizan.
---

# Kommo GAC — Guía de Integración CRM

## Credenciales Kommo

La configuración dinámica (access_token, subdomain) está en la tabla `integration_configs`:
```sql
SELECT config FROM integration_configs WHERE integration_name = 'kommo' AND is_active = true;
```

URL base del API: `https://gacvenezuelait.kommo.com/api/v4`

---

## Pipelines

| Pipeline | ID | Propósito |
|---|---|---|
| Ventas/Prospectos | `13148719` | Leads de venta |
| Post Venta | `13151339` | Reservas de servicio |

---

## Stages — Pipeline Ventas

| Status GAC | Stage ID Kommo | Nombre |
|---|---|---|
| `por_contactar` | `101392711` | Por contactar |
| `en_conversacion` | `102420903` | En conversación |
| `negociacion` | `102420907` | Negociación |
| `cotizacion_enviada` | `102420911` | Cotización enviada |
| `demostracion` | `101392719` | **Demostración** ← AUTO-CREA prospecto |
| `seguimiento` | `105277992` | Seguimiento |
| `ganado` | `142` | Ganado |
| `perdido` | `143` | Perdido |

**Regla crítica**: Solo cuando un lead llega a `demostracion` (101392719) se crea automáticamente en el sistema. Otras etapas solo actualizan si el prospecto ya existe.

---

## Stages — Pipeline Post Venta

| Status Reserva | Stage ID Kommo |
|---|---|
| `pendiente` | `101411319` |
| `confirmada` | `101411323` |
| `en_proceso` | `101411327` |
| `completada` | `104022404` |
| `cancelada` | `104022408` |

---

## Custom Fields (CF) — Leads Ventas

| Campo | ID | Tipo |
|---|---|---|
| ID Supabase | `3192400` | text |
| ID dealership | `3192486` | text |
| Vendedor Asignado | `3193866` | text |
| Notas | `3192402` | text |
| Estado de Vnzla | `3204218` | text |
| Nombre del Evento | `3448828` | select |
| Fuente | `2988728` | select |
| Marca | `2988724` | select |
| Concesionario | `2988984` | select |
| Modelo GAC | `3436641` | select |
| Modelo DFSK | `3436639` | select |
| Modelo Shinerey | `2988850` | select |

## Custom Fields — Contactos

| Campo | ID | Tipo |
|---|---|---|
| Tipo de Persona | `2988986` | select |
| Género | `3451546` | text |
| Rango de Edad | `3451548` | text |

## Custom Fields — Post Venta (Reservas)

| Campo | ID | Descripción |
|---|---|---|
| `3192400` | supabase_id | ID de la reserva en Supabase |
| `3417651` | estado_cita | Estado de la cita (text) |
| `3417653` | fecha_cita | Fecha YYYY-MM-DD |
| `3417655` | hora_cita | Hora HH:MM:SS |
| `3417657` | servicio_cita | Tipo de servicio |
| `3417659` | vehiculo_cita | Marca y modelo |
| `3417661` | placa_vehiculo | Placa |
| `3417663` | concesionario_cita | Nombre del concesionario |
| `3417665` | km_vehiculo | Kilometraje |
| `2989050` | kilometraje | Numeric |
| `2989052` | vehiculo | Texto del vehículo |
| `2989054` | centro_servicio | Select |

---

## Fuentes (Source) — Enum IDs

| Fuente GAC | Enum ID Kommo | Label Kommo |
|---|---|---|
| `concesionario` | `7832230` | Vendedor |
| `evento` | `7832228` | Evento |
| `pagina_web` | `7832226` | Página web |
| `redes_sociales` | `7893992` | WhatsApp/Redes |
| `referido` | `7832232` | Referido |
| `visita` | `8164367` | Visita (**distinto de Vendedor**) |
| `tiktok` | `7893994` | TikTok |
| `qr` | `8158236` | QR |
| `ads` | `8162702` | Campaña ADS |

---

## Marcas — Enum IDs

| Marca | Enum ID |
|---|---|
| GAC | `7832208` |
| DFSK | `7832206` |
| SHINERAY | `7857650` |

---

## Acciones del kommo-api

```typescript
// Crear lead de prospecto en Kommo (pipeline Ventas)
supabase.functions.invoke('kommo-api', {
  body: { action: 'create_lead', prospect_id: 'uuid' }
})

// Actualizar etapa de lead de prospecto
supabase.functions.invoke('kommo-api', {
  body: { action: 'update_stage', prospect_id, kommo_lead_id, new_status: 'demostracion' }
})

// Actualizar todos los campos de un lead (overwrite completo)
supabase.functions.invoke('kommo-api', {
  body: { action: 'update_fields', prospect_id, kommo_lead_id }
})

// Crear lead de reserva en Post Venta
supabase.functions.invoke('kommo-api', {
  body: { action: 'create_reservation', reservation_id: 'uuid' }
})

// Actualizar etapa de reserva en Post Venta
supabase.functions.invoke('kommo-api', {
  body: { action: 'update_reservation_stage', reservation_id, kommo_lead_id, new_status: 'confirmada' }
})
```

Wrapper en `src/lib/kommo.ts`:
```typescript
createKommoLead(prospectId)
updateKommoLeadStage(prospectId, kommoLeadId, newStatus)
updateKommoLeadFields(prospectId, kommoLeadId)
createKommoReservation(reservationId)
updateKommoReservationStage(reservationId, kommoLeadId, newStatus)
```

---

## Flujo bidireccional

### Sistema → Kommo
- **Al crear prospecto**: `createKommoLead()` (fire-and-forget)
- **Al cambiar estado**: `updateKommoLeadStage()` o `createKommoLead()` si no tiene ID
- **Al editar prospecto**: `updateKommoLeadFields()` (overwrite de campos)
- **Al crear reserva**: `createKommoReservation()`
- **Al cambiar estado reserva**: `updateKommoReservationStage()` o `createKommoReservation()` si no tiene ID

### Kommo → Sistema (webhook)
- **Lead a Demostración**: auto-crea prospecto en sistema
- **Cambio de stage Ventas**: actualiza `prospects.status`
- **Cambio de stage Post Venta**: actualiza `reservations.status`
- **Actualización de campos**: sincroniza nombre, teléfono, email, empresa, tipo persona, etc.

---

## Company (empresa) — Patrón correcto

La API de Kommo devuelve `_embedded.companies: [{id, _links}]` — **sin el nombre**.
Para obtener el nombre hay que hacer una llamada extra:

```typescript
const companies = lead._embedded?.companies || []
if (companies[0]?.id) {
  const res = await fetch(`${baseUrl}/companies/${companies[0].id}`, { headers: authHeaders })
  if (res.ok) {
    const data = await res.json()
    companyName = data.name  // ← el nombre real
  }
}
```

Al crear un lead con empresa:
```typescript
_embedded: {
  contacts: [{ name: contactName, company_name: companyName, custom_fields_values: [...] }],
  companies: [{ name: companyName }],  // crea entidad empresa en Kommo
}
```

---

## Debugging de webhooks

Ver logs en la tabla `integration_logs`:
```sql
SELECT event_type, status, details, created_at
FROM integration_logs
WHERE integration_name = 'kommo'
ORDER BY created_at DESC LIMIT 20;
```

Tipos de eventos frecuentes:
- `webhook_lead_not_found` — lead no existe en sistema (correcto si no está en demostración)
- `webhook_auto_created` — prospecto auto-creado desde Kommo
- `webhook_auto_create_failed` — error al crear
- `create_lead` / `update_stage` / `update_fields` — acciones desde sistema
- `create_reservation` / `update_reservation_stage` — acciones de Post Venta

---

## Mapeo Concesionario → Enum Kommo

Búsqueda por keyword:
```
harbin, garzas/anzoátegui, hobby, meta car/zulia, palma/falcón,
rosal/street boutique, valencia, barquisimeto, florida,
castellana, guarenas, lecher/lechería, cerro verde
```

---

## Troubleshooting común

| Problema | Causa | Solución |
|---|---|---|
| Webhooks dan 401 | JWT verification activado | Redeploy con `--no-verify-jwt` |
| Lead duplicado en Post Venta | Race condition al cambiar status | Guard en `create_reservation`: verifica `kommo_lead_id` antes de crear |
| Company no se sincroniza | `_embedded.companies` no trae `name` | Hacer fetch a `/companies/{id}` |
| Stage no se actualiza | `kommo_lead_id` es null | Llamar `createKommoReservation/Lead` primero |
| Contacto duplicado | `create_reservation` crea contacto nuevo | Buscar por phone en prospects → obtener contactId del lead Ventas |
