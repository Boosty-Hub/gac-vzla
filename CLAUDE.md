# GAC Venezuela — Instrucciones del Proyecto

## Stack técnico

- **Frontend**: React + TypeScript, Vite (puerto 8080), Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **Librería de hojas de cálculo**: `xlsx` (importar/exportar prospectos)
- **Routing**: React Router DOM
- **Alias de paths**: `@/` apunta a `src/`

## Comandos

```bash
npm run dev       # servidor de desarrollo en http://localhost:8080
npm run build     # build de producción
npm run lint      # ESLint
npm run test      # Vitest (pruebas unitarias)
```

## Acceso a Supabase — SIEMPRE por API directa

**Nunca usar el MCP de Supabase de claude.ai.** Todo acceso a base de datos debe hacerse directamente con la Management API de Supabase usando `curl`.

| Campo | Valor |
|---|---|
| Project ID / ref | `wsbuqiznddvxcwvpnbxm` |
| URL del proyecto | `https://wsbuqiznddvxcwvpnbxm.supabase.co` |
| Management API token | `sbp_b715f486726674624577159f19c827fc1a9d7d4c` |
| Región | `us-east-2` |

### Ejemplos de uso

```bash
# Ejecutar SQL
curl -s "https://api.supabase.com/v1/projects/wsbuqiznddvxcwvpnbxm/database/query" \
  -H "Authorization: Bearer sbp_b715f486726674624577159f19c827fc1a9d7d4c" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM public.dealerships LIMIT 5;"}'

# Aplicar migración SQL (archivo local)
curl -s "https://api.supabase.com/v1/projects/wsbuqiznddvxcwvpnbxm/database/query" \
  -H "Authorization: Bearer sbp_b715f486726674624577159f19c827fc1a9d7d4c" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(cat supabase/migrations/archivo.sql | tr '\n' ' ')\"}"

# Listar proyectos
curl -s "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer sbp_b715f486726674624577159f19c827fc1a9d7d4c"
```

> Para queries con comillas o caracteres especiales, usar `$'...'` o archivos temporales para evitar problemas de escapado. Dollar-quoting en SQL (`$$...$$`) para funciones PL/pgSQL.

---

## Estructura del proyecto

```
src/
├── pages/
│   ├── admin/              # Módulos del portal administrador
│   │   ├── AdminDashboard.tsx
│   │   ├── AdminReservas.tsx
│   │   ├── AdminClientes.tsx
│   │   ├── AdminVehiculos.tsx
│   │   ├── AdminModelos.tsx
│   │   ├── AdminConcesionarios.tsx
│   │   ├── AdminProspectos.tsx
│   │   ├── AdminGarantias.tsx
│   │   ├── AdminHistorial.tsx
│   │   ├── AdminUsuarios.tsx
│   │   └── AdminConfiguracion.tsx
│   ├── dealership/         # Módulos del portal concesionario/vendedor
│   │   ├── DealershipDashboard.tsx
│   │   ├── DealershipReservas.tsx
│   │   └── DealershipProspectos.tsx
│   ├── UserPortal.tsx      # Portal del cliente (citas, vehículos, perfil)
│   ├── AdminPanel.tsx      # Shell del panel admin (layout + nav)
│   ├── DealershipPanel.tsx # Shell del panel concesionario
│   ├── Login.tsx / MagicLogin.tsx
│   ├── PublicProspectos.tsx  # Landing pública para captura de prospectos
│   └── PublicReserva.tsx
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── ProspectUpdatesSidebar.tsx
│   ├── TechnicalReportUploader.tsx
│   ├── NotificationCenter.tsx
│   └── ...
├── hooks/
│   ├── useDealershipAccess.ts   # Resuelve concesionario(s) disponibles según rol
│   ├── useCurrentSalesperson.ts # Resuelve vendedor ligado al usuario
│   ├── useProspectStatuses.ts
│   ├── useProspectSources.ts
│   ├── useProspectModels.ts
│   └── useSalespersons.ts
├── contexts/
│   └── AuthContext.tsx     # user, profile, role, hasPermission()
├── integrations/supabase/
│   ├── client.ts           # supabase client (anon key)
│   └── types.ts            # tipos generados de la DB
└── lib/
    ├── whatsapp.ts         # buildWhatsAppReservationUrl()
    └── utils.ts
```

---

## Base de datos — tablas principales

| Tabla | Descripción |
|---|---|
| `profiles` | Usuarios del sistema (ligado a `auth.users`) |
| `roles` / `role_permissions` / `permissions` | Sistema de roles y permisos granular |
| `dealerships` | Concesionarios / centros de servicio |
| `salespersons` | Vendedores (ligados a un concesionario) |
| `clients` | Clientes registrados |
| `client_users` | Relación cliente ↔ usuario de portal |
| `vehicles` | Vehículos de clientes |
| `vehicle_models` | Modelos de vehículos (marca, nombre, garantía por modelo) |
| `reservations` | Reservas de servicio |
| `service_types` | Tipos de servicio (nombre, duración en minutos) |
| `prospects` | Prospectos / leads de ventas |
| `warranty_conditions` | Condiciones globales de garantía (km, meses, intervalos) |
| `message_templates` | Plantillas de mensajes (WhatsApp, etc.) |

### Funciones SQL relevantes

```sql
is_admin_user()           -- true si rol es superadmin o admin
has_permission(perm text) -- true si el usuario tiene ese permiso granular
```

### Columnas con nombres especiales

- `prospects."Estado de Vnzla"` — columna con espacio, usar comillas en SQL y bracket notation en JS: `p['Estado de Vnzla']`

---

## Sistema de roles y acceso

| Rol | Acceso |
|---|---|
| `superadmin` | Todo, sin restricciones |
| `admin` | Panel admin completo (según permisos) |
| `concesionario` | Portal dealership — ve todos los prospectos/reservas de su concesionario |
| `vendedor` | Portal dealership — solo ve sus propios prospectos (filtrado por `salesperson = profile.full_name`) |
| Cliente | `UserPortal.tsx` — portal de citas, vehículos, perfil |

`useDealershipAccess()` resuelve automáticamente el concesionario disponible según el rol. Si el usuario tiene acceso a varios, muestra selector.

---

## Patrones importantes del código

### localStorage para persistencia de formularios
Los formularios de creación de reservas y prospectos persisten en `localStorage` para sobrevivir recargas de página:
- `admin_reservas_create_form` — AdminReservas (solo modo crear)
- `dealership_reservas_create_form` — DealershipReservas
- `userportal_reserva_flow` — UserPortal (flujo multi-paso)
- `dealership_prospectos_dialog` — DealershipProspectos (sessionStorage)

### Garantía por modelo con fallback global
`vehicle_models` tiene `warranty_km`, `warranty_months`, `warranty_service_interval_km` opcionales. Si son `null`, el sistema usa los valores de `warranty_conditions` (tabla global). Implementado en `AdminGarantias.tsx`, `AdminHistorial.tsx` y `UserPortal.tsx`.

### Importar/Exportar prospectos (XLSX)
Ambos portales (admin y concesionario) tienen importación y exportación. El concesionario solo exporta/importa su propia data (filtrado por `dealership_id` del `useDealershipAccess`). La columna `fecha` en la plantilla toma la fecha real del prospecto (no la fecha de carga).

### WhatsApp
`src/lib/whatsapp.ts` expone `buildWhatsAppReservationUrl()`. Para clientes y prospectos se construye la URL directamente en el componente. Siempre se normaliza el número con prefijo `+58` (Venezuela).

---

## Migraciones

Las migraciones SQL se guardan en `supabase/migrations/` con formato `YYYYMMDDHHMMSS_descripcion.sql`. Para aplicarlas, ejecutar directamente con la API de Supabase (ver sección arriba). No hay CLI de Supabase configurado localmente.
