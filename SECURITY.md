# Seguridad — GAC Venezuela

Resumen del modelo de seguridad y las prácticas del proyecto. El detalle de la
auditoría y remediación está en `SECURITY_REMEDIATION_PLAN.md`.

## Reportar una vulnerabilidad
No abras un issue público. Contacta al equipo por un canal privado.

## Principios (no regresar en esto)

1. **La seguridad vive en el servidor, nunca en el frontend.** Toda regla de
   acceso está en RLS (Postgres) o en las edge functions. Filtrar en el `.eq()`
   del cliente es cosmético: cualquiera con la anon key consulta la API directo.

2. **La anon/publishable key es pública** (va en el frontend, por diseño). La
   defensa es RLS. **El service_role key y el token de Management API NUNCA van
   al repo ni al frontend** — solo en variables de entorno del servidor.

3. **Aislamiento por RLS** (schema `public`):
   - `is_admin_user()` → superadmin/admin ven todo.
   - Vendedor → solo `prospects` donde `salesperson` ∈ sus nombres
     (`current_user_salesperson_names()`, no editables por el usuario).
   - Concesionario → por `dealership_users` (`current_user_dealership_ids()`).
   - Cliente → por `client_users` (`current_user_client_ids()`).
   - `profiles`: trigger `prevent_profile_privilege_escalation` congela
     `role_id`/`is_active`/`full_name` para usuarios finales (anti-escalada).

4. **Flujos públicos/anon van por RPCs `SECURITY DEFINER`**, nunca por lectura
   directa de tablas con PII. Ej.: `lookup_vehicle_by_plate` (sin teléfono/email),
   `create_public_reservation`, `get_taken_reservation_times`.

5. **Storage**: `technical-reports` y `prospect-updates` son **privados**; se
   acceden con URLs firmadas (`src/lib/storage.ts`). Solo `vehicle-models` y
   `branding` son públicos (catálogo/logos, sin PII).

6. **Login**: por placa exige placa **+ cédula**; por PIN con rate limit +
   lockout. Las edge functions de login tienen CORS restringido (`ALLOWED_ORIGINS`).

## Regla de oro para cambios de RLS / storage

Endurecer una política que el frontend consume **rompe producción** si el
frontend aún hace la query vieja. Orden obligatorio (ver runbook en el plan):

1. Aplicar la parte **aditiva** (RPCs/funciones) — no rompe nada.
2. Desplegar el **frontend** que usa las RPCs (merge a `main` → Netlify).
3. Aplicar la parte **restrictiva** (políticas/buckets privados).

Verificar el aislamiento simulando roles:
`SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims TO '{"sub":"<uuid>","role":"authenticated"}';`
dentro de una transacción con `ROLLBACK`.

## Secretos

- `.env` está en `.gitignore` (nunca commitear). Usar `.env.example` como plantilla.
- El token de Management API se pasa por variable de entorno `SUPABASE_ACCESS_TOKEN`.
- CI corre **gitleaks** (`.github/workflows/gitleaks.yml`) en cada push/PR.
- Rotar keys/tokens periódicamente y ante cualquier sospecha de exposición.
