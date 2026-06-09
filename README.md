# GAC Venezuela — Sistema de Gestión

Plataforma web para la gestión integral de la operación automotriz de **GAC Venezuela** (marcas GAC, DFSK y Shineray): reservas de servicio, clientes y vehículos, garantías, e ingreso/captación de prospectos de ventas integrada con el CRM **Kommo**.

## Portales

- **Cliente** — ingreso por placa o PIN; agenda citas de servicio, consulta sus vehículos, el estado de su garantía y su historial de servicios.
- **Concesionario / Vendedor** — gestión de reservas y prospectos de su concesionario.
- **Administrador** — panel completo: reservas, clientes, vehículos, modelos, concesionarios, prospectos, garantías, historial, usuarios y configuración, con roles y permisos granulares.

## Stack

- **Frontend:** React + TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions)
- **Integración CRM:** Kommo (sincronización bidireccional de prospectos y reservas)

## Desarrollo

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo (http://localhost:8080)
npm run build    # build de producción
npm run lint     # ESLint
npm run test     # Vitest (pruebas unitarias)
```

## Estructura

| Ruta | Descripción |
|---|---|
| `src/pages/admin/` | Módulos del portal administrador |
| `src/pages/dealership/` | Portal de concesionario / vendedor |
| `src/pages/UserPortal.tsx` | Portal del cliente |
| `src/integrations/supabase/` | Cliente y tipos generados de Supabase |
| `supabase/functions/` | Edge Functions (webhook e integración Kommo) |
| `supabase/migrations/` | Migraciones SQL |
