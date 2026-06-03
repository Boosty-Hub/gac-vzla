---
name: requirements-gac
description: >
  Proceso estándar para implementar requerimientos en el proyecto GAC Venezuela.
  Úsala cuando el usuario pida nuevas funcionalidades, correcciones de bugs,
  mejoras de UI, cambios en la base de datos, o cualquier modificación al sistema.
  También aplica cuando haya una lista de requerimientos mezclados (nuevos y ya
  implementados) que necesiten evaluación y priorización.
---

# Requirements GAC — Proceso de Implementación

## Regla fundamental

> **Local first, siempre.** Nunca hacer commit ni push sin autorización explícita del usuario.
> El usuario dice cuándo subir los cambios.

---

## Workflow estándar

### 1. Recibir y clasificar

Cuando llega un requerimiento:

**a) Verificar si ya está implementado** — leer los archivos relevantes antes de asumir:
```bash
grep -n "company_name\|empresa" src/pages/admin/AdminProspectos.tsx | head -10
```

**b) Clasificar el trabajo**:
- `DB` — cambio en schema, triggers, RLS → requiere migración SQL
- `Edge Function` — kommo-api, kommo-webhook → requiere deploy Supabase
- `Frontend` — UI, formularios, rutas → solo cambio de código
- `Config` — kommo pipeline/stages en DB → UPDATE a integration_configs

### 2. Planificar (para 3+ requerimientos)

Comunicar el plan antes de implementar:
```
Reqs recibidos:
1. [✅ Ya implementado] req X
2. [🆕 Nuevo] req Y — afecta AdminProspectos + DealershipProspectos + DB
3. [🔄 Parcialmente] req Z — frontend OK pero falta sincronización Kommo

Orden de implementación: DB primero → frontend → edge functions
```

### 3. Implementar

**Orden de dependencias**:
1. Migraciones DB (ALTER TABLE, CREATE TABLE)
2. Aplicar migración a Supabase
3. Código frontend (componentes, páginas)
4. Edge functions si aplica
5. Deploy edge functions

### 4. Verificar

```bash
npm run build 2>&1 | grep -E "✓ built|error TS|Error\b"
```

Si el build pasa, el código es correcto. Verificar también en el dev server si hay cambios de UI.

### 5. Reportar al usuario

Resumen conciso de lo hecho:
- Qué archivos se modificaron
- Qué SQL se aplicó en la DB
- Qué edge functions se desplegaron
- Qué está en local (pendiente de push)

---

## Checklist por tipo de requerimiento

### UI/Columna nueva en tabla
- [ ] Agregar al `type ColKey`
- [ ] Agregar a `COL_LABELS`
- [ ] Agregar `<TableHead>` con la nueva columna
- [ ] Agregar `<TableCell>` con el valor
- [ ] Verificar que aplique en Admin Y Dealership si corresponde

### Campo nuevo en formulario
- [ ] Agregar estado (`useState`)
- [ ] Agregar al `resetForm()`
- [ ] Agregar al `openEdit()` (pre-rellenar al editar)
- [ ] Agregar al `buildPayload()` / payload de guardado
- [ ] Agregar campo UI en el dialog
- [ ] Agregar a la persistencia (localStorage/sessionStorage)
- [ ] Si hay sync con Kommo: actualizar kommo-api y kommo-webhook

### Campo nuevo en DB
- [ ] Crear migración: `ALTER TABLE prospects ADD COLUMN IF NOT EXISTS campo text;`
- [ ] Aplicar migración via Management API (PowerShell)
- [ ] Agregar a las interfaces TypeScript de los componentes
- [ ] Actualizar el `.select('...')` en las queries que lo necesiten

### Nuevo rol/permiso
- [ ] Verificar que el rol tiene redirect_portal correcto
- [ ] Verificar que los permisos aplican a módulos que existen en ese portal
- [ ] Si es portal concesionario: permisos válidos son `{dashboard,reservas,prospectos,garantias,historial,vehiculos,modelos,clientes,concesionarios,usuarios,roles}.{view,create,edit,delete}`

### Sync Kommo
- [ ] Modificar `kommo-api/index.ts` — acción que crea/actualiza
- [ ] Modificar `kommo-webhook/index.ts` — recepción de eventos
- [ ] Deploy kommo-api: `npx supabase functions deploy kommo-api --use-api`
- [ ] Deploy kommo-webhook: `npx supabase functions deploy kommo-webhook --use-api --no-verify-jwt`
- [ ] Verificar en `integration_logs` que funciona

---

## Requerimientos frecuentes y su ubicación

| Requerimiento | Archivos afectados |
|---|---|
| Campo en prospectos | `AdminProspectos.tsx`, `DealershipProspectos.tsx`, migration SQL |
| Campo en reservas | `AdminReservas.tsx`, `DealershipReservas.tsx` |
| Nuevo estado de prospecto | `prospect_statuses` tabla (via UI de AdminConfiguracion) |
| Nueva columna en tabla | El componente de esa página + ColKey/COL_LABELS |
| Nuevo módulo en sidebar | `DealershipLayout.tsx` menuGroups + `App.tsx` routes |
| Nuevo módulo en admin | `AdminLayout.tsx` menuItems + `App.tsx` routes |
| Notificación nueva | Trigger SQL en DB + tipo en `NotificationCenter.tsx` |
| Nuevo permiso | `permissions` tabla + asignar a rol via `AdminRoles` |
| Sync estado → Kommo | `src/lib/kommo.ts` + llamar desde el componente |
| Webhook Kommo → estado | `kommo-webhook/index.ts` |

---

## Errores comunes y solución rápida

| Error | Causa | Fix |
|---|---|---|
| Blank page | Import duplicado o error TS | `npm run build` para ver error exacto |
| `PORTAL_BASE_PERMS is not defined` | Constante eliminada pero referencia quedó | `grep -n "PORTAL_BASE_PERMS" src/` y eliminar |
| Webhook 401 | Edge function con JWT verification | Redeploy con `--no-verify-jwt` |
| Tipo TS faltante | Tabla nueva no tiene tipos generados | Usar `as any` temporalmente |
| Supabase query sin resultado | RLS bloqueando | Verificar políticas con service role |

---

## Comunicación con el usuario

**Al recibir una lista de requerimientos mezclados**:
Hacer primero el análisis, luego implementar, luego reportar. No pedir confirmación para cada pequeño paso.

**Al terminar un bloque de trabajo**:
- "Cambios en local listos. ¿Subo los cambios?"
- Listar solo lo relevante (no repetir todo el diff)

**Si hay dudas técnicas**:
Preguntar UNA sola cosa específica antes de implementar, no un cuestionario.

**Si algo ya está implementado**:
Decirlo directamente: "Este req ya estaba — lo verifiqué en [archivo:línea]"
