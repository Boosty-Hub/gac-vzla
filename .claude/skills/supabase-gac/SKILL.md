---
name: supabase-gac
description: >
  Especialista en todas las operaciones de Supabase para el proyecto GAC Venezuela.
  Úsala siempre que necesites: ejecutar SQL, crear migraciones, modificar tablas,
  configurar RLS, hacer deploy de edge functions, o consultar la DB.
  También aplica cuando el usuario mencione: base de datos, tabla, columna,
  trigger, función SQL, política RLS, migración, Supabase, o edge function.
---

# Supabase GAC — Guía de Operaciones

## Credenciales del proyecto

| Campo | Valor |
|---|---|
| Project ref | `wsbuqiznddvxcwvpnbxm` |
| URL | `https://wsbuqiznddvxcwvpnbxm.supabase.co` |
| Management API token | `sbp_b715f486726674624577159f19c827fc1a9d7d4c` |
| Anon key | En `src/integrations/supabase/client.ts` |

> **NUNCA usar el MCP de Supabase de claude.ai.** Siempre usar la Management API directamente.

---

## Ejecutar SQL (método canónico — PowerShell)

```powershell
$sql = "SELECT * FROM public.profiles LIMIT 5;"
$body = ConvertTo-Json @{ query = $sql } -Depth 3
$resp = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/wsbuqiznddvxcwvpnbxm/database/query" `
  -Method POST `
  -Headers @{ "Authorization" = "Bearer sbp_b715f486726674624577159f19c827fc1a9d7d4c" } `
  -Body $body -ContentType "application/json"
$resp | ConvertTo-Json
```

Para SQL con `$body$` (funciones PL/pgSQL):
```powershell
$sql = @'
CREATE OR REPLACE FUNCTION my_func()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  -- lógica aquí
  RETURN NEW;
END;
$body$
'@
```

---

## Tablas principales

| Tabla | Descripción | Columnas clave |
|---|---|---|
| `profiles` | Usuarios del sistema | `id`, `email`, `full_name`, `role_id`, `is_active` |
| `roles` | Roles del sistema | `id`, `name`, `redirect_portal`, `description` |
| `permissions` | Permisos granulares | `id`, `name` (ej: `reservas.view`), `module` |
| `role_permissions` | Permisos asignados a roles | `role_id`, `permission_id` |
| `user_permissions` | Overrides por usuario | `profile_id`, `permission_id`, `granted` (bool) |
| `dealerships` | Concesionarios | `id`, `name`, `city`, `state` |
| `salespersons` | Vendedores | `id`, `name`, `profile_id`, `phone`, `is_active` |
| `clients` | Clientes | `id`, `full_name`, `cedula`, `phone`, `email` |
| `vehicles` | Vehículos de clientes | `id`, `plate`, `vin`, `year`, `mileage`, `warranty_active`, `client_id`, `model_id` |
| `vehicle_models` | Modelos de vehículos | `id`, `name`, `brand`, `warranty_km`, `warranty_months`, `warranty_service_interval_km` |
| `reservations` | Reservas de servicio | `id`, `client_id`, `vehicle_id`, `dealership_id`, `status`, `kommo_lead_id`, `created_by_name`, `created_by_role` |
| `service_types` | Tipos de servicio | `id`, `name`, `duration_minutes`, `is_active` |
| `prospects` | Prospectos/leads | `id`, `name`, `phone`, `email`, `company_name`, `dealership_id`, `salesperson`, `status`, `source`, `kommo_lead_id` |
| `notifications` | Notificaciones | `id`, `type`, `recipient_profile_id`, `recipient_dealership_id`, `is_read`, `metadata` |
| `integration_configs` | Config de integraciones (Kommo) | `integration_name`, `config` (JSONB), `is_active` |
| `integration_logs` | Logs de Kommo | `event_type`, `prospect_id`, `kommo_lead_id`, `status`, `details` |
| `warranty_conditions` | Condiciones globales de garantía | `max_km`, `max_months`, `service_interval_km`, `name` |

### Columnas especiales
- `prospects."Estado de Vnzla"` — columna con espacio, usar comillas en SQL, bracket notation en JS: `p['Estado de Vnzla']`

---

## Funciones SQL del sistema

```sql
is_admin_user()           -- true si rol es superadmin o admin
has_permission(perm text) -- true si el usuario tiene ese permiso granular
```

---

## Migraciones

**Formato**: `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`

Aplicar migración:
```powershell
$sql = Get-Content "supabase/migrations/mi_migracion.sql" -Raw
$body = ConvertTo-Json @{ query = $sql } -Depth 3
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/wsbuqiznddvxcwvpnbxm/database/query" `
  -Method POST -Headers @{ "Authorization" = "Bearer sbp_b715f486726674624577159f19c827fc1a9d7d4c" } `
  -Body $body -ContentType "application/json"
```

**Patrón de migración segura**:
```sql
-- Tabla nueva
CREATE TABLE IF NOT EXISTS public.nueva_tabla (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nueva_tabla REPLICA IDENTITY FULL;  -- Para realtime

-- Columna nueva
ALTER TABLE public.tabla ADD COLUMN IF NOT EXISTS columna text;
```

---

## Edge Functions

### Deploy
```bash
# Con verificación JWT (funciones internas)
SUPABASE_ACCESS_TOKEN=sbp_b715f486726674624577159f19c827fc1a9d7d4c \
npx supabase functions deploy NOMBRE_FUNCION --project-ref wsbuqiznddvxcwvpnbxm --use-api

# Sin verificación JWT (webhooks externos como Kommo)
SUPABASE_ACCESS_TOKEN=sbp_b715f486726674624577159f19c827fc1a9d7d4c \
npx supabase functions deploy kommo-webhook --project-ref wsbuqiznddvxcwvpnbxm --use-api --no-verify-jwt
```

### Funciones existentes
| Función | JWT | Propósito |
|---|---|---|
| `kommo-api` | Sí | Crear/actualizar leads en Kommo |
| `kommo-webhook` | **No** | Recibir webhooks de Kommo |
| `generate-magic-link` | Sí | Crear magic links de acceso |
| `verify-magic-link` | No | Verificar tokens de acceso |
| `login-by-pin` | No | Login por PIN |
| `login-by-plate` | No | Login por placa de vehículo |

### Variables de entorno en edge functions
```typescript
Deno.env.get('SUPABASE_URL')!               // URL del proyecto
Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Service role key (admin)
Deno.env.get('SUPABASE_ANON_KEY')!          // Anon key
```

---

## Realtime

Para que las suscripciones realtime con filtros funcionen, las tablas deben tener:
```sql
ALTER TABLE public.mi_tabla REPLICA IDENTITY FULL;
```

Las tablas clave ya configuradas: `role_permissions`, `user_permissions`, `notifications`, `prospects`.

---

## RLS — Patrones comunes

```sql
-- Admins ven todo
CREATE POLICY admin_all ON public.tabla FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Usuarios ven lo propio (por profile_id)
CREATE POLICY users_own ON public.tabla FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Por concesionario (via dealership_users join)
CREATE POLICY dealership_access ON public.tabla FOR SELECT TO authenticated
  USING (
    is_admin_user() OR
    dealership_id IN (
      SELECT dealership_id FROM public.dealership_users WHERE user_id = auth.uid()
    )
  );
```

---

## Consultas frecuentes

```sql
-- Ver permisos de un usuario
SELECT p.name, rp.permission_id IS NOT NULL as from_role, up.granted as user_override
FROM public.permissions p
LEFT JOIN public.role_permissions rp ON rp.permission_id = p.id
  AND rp.role_id = (SELECT role_id FROM profiles WHERE id = 'USER_ID')
LEFT JOIN public.user_permissions up ON up.permission_id = p.id
  AND up.profile_id = 'USER_ID';

-- Prospectos sin kommo_lead_id
SELECT id, name, phone FROM prospects WHERE kommo_lead_id IS NULL AND status != 'perdido';

-- Reservas recientes con info completa
SELECT r.id, c.full_name, r.status, r.reservation_date, d.name as dealership
FROM reservations r
JOIN clients c ON c.id = r.client_id
JOIN dealerships d ON d.id = r.dealership_id
ORDER BY r.created_at DESC LIMIT 20;
```
