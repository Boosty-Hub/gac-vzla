# 🛡️ Plan de Remediación y Blindaje de Seguridad — GAC Venezuela

> Documento vivo. Ejecutamos **fase por fase**. Cada tarea tiene estado: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho · `[!]` bloqueado.
> Origen: auditoría de seguridad del 2026-07-03 (ver hallazgos C1–C4, A1–A4, M1–M4).

---

## Principios rectores

1. **Defensa en profundidad**: nunca confiar en el frontend. Toda regla de acceso vive en RLS o en el servidor.
2. **Mínimo privilegio**: cada rol ve y hace solo lo estrictamente necesario.
3. **Secretos fuera del código**: nada de tokens/keys en el repo.
4. **Verificar rompiendo**: cada fase se cierra re-ejecutando el ataque correspondiente y confirmando que ahora falla.
5. **Sin downtime del negocio**: validar cambios de RLS contra flujos legítimos antes de producción.

---

## Resumen de fases

| Fase | Nombre | Objetivo | Hallazgos que cierra | Riesgo si no se hace |
|------|--------|----------|----------------------|----------------------|
| 0 | Contención de secretos | Rotar y sacar credenciales del repo | C4, M2 | Control total del proyecto robado |
| 1 | Blindaje de autenticación | Que nadie entre como otro usuario | C1, C2, A4, M3 | Apropiación masiva de cuentas |
| 2 | RLS — aislamiento de datos | Cerrar lectura/escritura cruzada | C1(fuga), C3, A1, A2, M4 | Fuga y manipulación de toda la DB |
| 3 | Autorización en Edge Functions | Validar quién llama y sobre qué | A3, M1 | Manipulación de datos vía funciones |
| 4 | Hardening general | Rate limiting, captcha, headers, logs | Transversales | Fuerza bruta, spam, XSS futuro |
| 5 | Verificación y regresión | Re-pentest + tests automáticos | Todos | Regresiones silenciosas |
| 6 | Operación continua | Monitoreo, rotación, revisión periódica | Prevención | Deriva de seguridad en el tiempo |

---

## FASE 0 — Contención de secretos 🔥 (INMEDIATA)

**Objetivo:** ninguna credencial válida sigue expuesta en el repo o su historial.

- [x] **0.1** Rotar el Management API token `sbp_b715...` — **REVOCADO por el usuario** (2026-07-03). El token expuesto ya está muerto.
- [ ] **0.2** Revocar el token temporal `sbp_72f8...` usado en la auditoría (pendiente: hacerlo al cerrar el trabajo con Supabase).
- [x] **0.3** Token quitado de `CLAUDE.md`, `.claude/skills/supabase-gac/SKILL.md`, `.claude/skills/context-manager/SKILL.md` → reemplazado por `SUPABASE_ACCESS_TOKEN` (env). Verificado: 0 ocurrencias del token en el repo.
- [x] **0.4** `.env` y `.env.*` añadidos al `.gitignore`; `.env` destrackeado (`git rm --cached`); creado `.env.example`.
- [ ] **0.5** Purgar `.env` y el token del **historial de git** (`git filter-repo` o BFG) y forzar push. **Baja prioridad ahora** (el token está revocado y la anon key es pública), pero recomendable como higiene. Comando preparado abajo.
- [ ] **0.6** Migrar a las nuevas API keys de Supabase (`sb_publishable_...` para frontend, `sb_secret_...` para servidor). Requiere generarlas en el dashboard.
- [x] **0.7** `client.ts` ahora lee `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` del entorno (con fallback al valor actual). Al generar la nueva key en 0.6, basta ponerla en `.env`/host sin tocar código. Build verificado ✓.

**Validación:** el token viejo devuelve 401 en la Management API ✓ (revocado); `git grep` del token → 0 ocurrencias ✓; build en verde ✓. Pendiente: `git log -S` limpio tras purga de historial (0.5).

### Comando de purga de historial (0.5) — ejecutar coordinado con el equipo
```bash
# Reescribe TODA la historia. Avisar al equipo: todos deben re-clonar después.
# Opción A (recomendada): git-filter-repo
pip install git-filter-repo
git filter-repo --path .env --invert-paths
git filter-repo --replace-text <(echo 'sbp_b715f486726674624577159f19c827fc1a9d7d4c==>REDACTED')
git remote add origin https://github.com/Boosty-Hub/gac-vzla.git
git push origin --force --all
git push origin --force --tags
```

---

## FASE 1 — Blindaje de autenticación 🔥 (CRÍTICA)

**Objetivo:** es imposible obtener una sesión de otro usuario sin un factor secreto verificado.

**Infra base (hecha):** migración `20260703120000` → tabla `login_attempts` (rate limiting, solo service role) + columna `magic_links.revoked_at`. Módulos compartidos `_shared/cors.ts` y `_shared/rateLimit.ts` (rate limit **falla en abierto**, identificador **hasheado SHA-256** — nunca PIN/placa en claro).

### 1A — login-by-pin (C2) — ✅ DESPLEGADO Y VERIFICADO
- [x] **1.1** Rate limiting server-side (IP: 15/15min; identificador: 6/15min). **Probado en vivo**: intentos 1-6 → 404, 7+ → 429.
- [~] **1.2** Regex relajado a `\d{4,8}` (soporta PIN largo sin tocar código). **Pendiente operativo**: re-emitir PINs de 6+ dígitos a los 34 usuarios (recomendado).
- [x] **1.3** Lockout por identificador (PIN) tras 6 fallos. Verificado.
- [ ] **1.4** Segundo factor para `concesionario`/`admin` (opcional, evaluar).

### 1B — login-by-plate (C1) — ⏳ CÓDIGO LISTO, DEPLOY COORDINADO PENDIENTE
- [x] **1.5** Exige **placa + cédula del titular** (cobertura 100% en la DB). Frontend (`Login.tsx`) actualizado con campo de cédula.
- [x] **1.6** Matching de cédula genérico (mensaje "Placa o cédula incorrecta" anti-oráculo). Se optó por cédula (no OTP) por cobertura total sin infra de envío.
- [x] **1.7** Auto-creación de cuenta ahora **protegida tras validar cédula** (solo el titular legítimo la dispara).
- [x] **1.8** Rate limiting por IP y placa (igual que 1A).
- [ ] **DEPLOY**: `login-by-plate` NO desplegada aún — rompe compatibilidad con el frontend viejo. Debe subirse **junto con el nuevo frontend**. Comando abajo.

### 1C — Magic links (A4) — ✅ DESPLEGADO
- [x] **1.9** Se optó por **reutilizable + revocable** (no romper links de portal ya entregados) en vez de un-solo-uso.
- [x] **1.10** Expiración reducida de **360 → 30 días** en `generate-magic-link`. `verify-magic-link` ahora rechaza links con `revoked_at`. Rate limiting por IP (30/15min).
- [ ] **1.11** Botón de revocación en el panel admin (backend listo vía `revoked_at`; falta la UI en `AdminUsuarios`).

### 1D — CORS (M3) — ✅ MECANISMO DESPLEGADO
- [x] **1.12** `_shared/cors.ts` con allowlist por env `ALLOWED_ORIGINS`.
- [x] **CERRADO**: `ALLOWED_ORIGINS` seteado con `https://imbmobility.netlify.app,http://localhost:8080,http://localhost:5173`. **Verificado en vivo**: origen atacante (evil.com) NO recibe reflejo de su origen → navegador lo bloquea.

**Validación:** barrido de login-by-pin bloqueado por rate limit ✓ (probado); login-by-plate exige cédula ✓ (código); token de magic link revocado → 404 ✓; build en verde ✓.

### Deploy pendiente (coordinado con frontend)
```bash
export SUPABASE_ACCESS_TOKEN="<token>"
# Desplegar JUNTO con el nuevo frontend (Login.tsx con campo de cédula):
npx supabase functions deploy login-by-plate --project-ref wsbuqiznddvxcwvpnbxm --use-api
# Cerrar CORS cuando se tenga el dominio (no requiere redeploy de código):
npx supabase secrets set ALLOWED_ORIGINS="https://TU-DOMINIO,http://localhost:8080" --project-ref wsbuqiznddvxcwvpnbxm
```

---

## FASE 2 — RLS: aislamiento de datos 🔥 (CRÍTICA)

**Objetivo:** cada rol lee y escribe solo lo que le corresponde, verificado en la base de datos (no en la UI).

**Análisis:** workflow multi-agente (`phase2-rls-design`) mapeó el modelo de datos en vivo, las dependencias del frontend y las políticas actuales; 3 revisores adversariales atacaron el diseño. Hallazgos clave verificados contra la DB:
- **Falsos positivos** (ya cerrado): escalada vía `roles`/`role_permissions` (escrituras ya solo-superadmin), auto-insert en `dealership_users`/`client_users` (ya read-own + admin-manage). No requieren cambios.
- **Vector real de escalada**: solo `profiles` (WITH CHECK nulo en `profiles_update_own`).
- **La parte de aislamiento entre concesionarios ROMPE flujos de producción** (PublicReserva, calendario del cliente, dedupe de teléfono) → requiere **cambios coordinados en el frontend + RPCs** desplegados junto con la RLS.

### FASE 2A — Bloqueo de escalada de privilegios ✅ APLICADO Y VERIFICADO (cierra C3)
Migración `20260703130000`: trigger `prevent_profile_privilege_escalation` en `profiles` (BEFORE INSERT OR UPDATE) que congela `role_id`/`is_active` para usuarios finales autenticados no-admin. + hardening de `has_permission()` (search_path).
- [x] Trigger cubre UPDATE **y** INSERT (evita el bypass por re-insert).
- [x] Carve-out por `auth.role()='authenticated'` (no por `auth.uid() IS NULL`) → anón/backend/admin no afectados.
- [x] **Probado con simulación de rol**: vendedor→admin CONGELADO ✓; is_active CONGELADO ✓; admin sigue gestionando roles ✓; update propio (nombre/pin) sigue funcionando ✓.

### FASE 2B — Aislamiento entre concesionarios/vendedores/clientes ⏳ DB LISTA Y VERIFICADA, FRONTEND EN CURSO
Migraciones: `20260703140000` (part1 RPCs+helpers, **APLICADA**), `20260703160000` (part1b staff lookup, **APLICADA**), `20260703150000` (part2 políticas, **escrita+verificada, NO aplicada**).

**Aislamiento verificado con simulación de rol (predicados evaluados con identidades reales):**
| Tabla | Total | Vendedor | Concesionario | Cliente | Admin |
|---|---|---|---|---|---|
| prospects | 2370 | **90** | **41** | — | 2370 |
| vehicles | 2571 | 83 | — | **1** | — |
| clients | 1326 | — | 42 | **1** | — |
| reservations | 272 | 0 (creó 0) | 47 | — | — |

- [x] **2B.1** `prospects`: scope por rol. Vendedor por `salespersons.name ∪ full_name` (ambos **congelados**, no editables). Concesionario por dealership. Asesor NO ve prospects. (A1)
- [x] **2B.2** `clients`/`vehicles` SELECT acotado: cliente lo suyo; staff los ligados a reservas de su concesionario; +RPC `staff_lookup_vehicle_by_plate` para buscar al crear reserva. (A2)
- [x] **2B.3** `reservations`: vendedor por `created_by_profile_id`, concesionario/asesor por dealership, cliente por `client_users`. (A2)
- [x] **2B.4** `anon_read_vehicles_by_plate` eliminada; RPC `lookup_vehicle_by_plate` devuelve nombre **enmascarado**, SIN teléfono/email. Verificado como anón. (C1-fuga)
- [x] **2B.5** RPC `get_taken_reservation_times` (calendario) + `create_public_reservation` (alta pública server-side, status forzado). Verificadas.
- [x] **2B.6** RPC `prospect_phone_exists` (anón, boolean) / `find_prospects_by_phone` (staff, acotada). Verificadas.
- [x] **2B.7** `notify_reservation_cancellation` RPC (fan-out server-side, verifica ownership).
- [x] **2B.8** `prospect_updates`/`prospect_vehicles` acotadas por `can_access_prospect()`. `prospect_events` = catálogo (sin PII), se deja. (M4)
- [x] **2B.9** INSERT anón `prospects` acotado a `status='nuevo'`; INSERT anón `reservations` eliminado (→ RPC). Captcha/rate-limit → Fase 4.
- [~] **Frontend correlativo**: PublicReserva, PublicProspectos, UserPortal, DealershipReservas, DealershipPanel, DealershipProspectos → usar RPCs (en curso).

### 🚀 RUNBOOK DE DEPLOY 2B — ✅ COMPLETADO Y VERIFICADO (2026-07-04)
1. ✅ part1 + part1b (RPCs/helpers) aplicadas.
2. ✅ Frontend mergeado a `main` (PR #1) → Netlify desplegó (bundle `index-Vfg-LAAj.js`).
3. ✅ part2 aplicada (tras corregir `ANY((SELECT ...))` → `ANY(...)`). **Aislamiento ACTIVO.**
4. ✅ `login-by-plate` desplegado (exige cédula — probado: sin cédula → 400).
5. ✅ Re-ataque verificado: **anon vehicles 2571→0**, vendedor prospectos 2370→90, cliente flota→1, concesionario ve solo su dealership (47 reservas), admin ve todo (272). Staff reads intactos.

**Decisiones aplicadas** (usuario confirmó "con tu recomendación"): clients/vehicles staff = ligados a reservas del dealership + RPC lookup; Asesor de Servicio NO ve prospects; reserva pública = por placa sin cédula, sin fuga de PII.

---

## FASE 3 — Autorización en Edge Functions 🟠 (ALTA)

**Objetivo:** las funciones con service role validan quién llama y sobre qué recurso.

- [x] **3.1** `kommo-webhook`: secreto compartido **opt-in** (`KOMMO_WEBHOOK_SECRET` env + `?secret=` en la URL de Kommo). Sin secreto configurado sigue abierto (interino, no rompe la integración) pero con barrera de subdomain. **Desplegado.** (A3 — se cierra del todo al configurar el secreto, ver runbook)
- [x] **3.2** `kommo-webhook`: ignora (200) payloads cuyo `account[subdomain]` no coincide con el configurado. (validación de pipeline/IDs por lead real: pendiente menor)
- [x] **3.3** `kommo-api`: resuelve el llamante (getUser) y gatea por rol. Sin usuario válido → 401. **Desplegado y verificado** (anon → 401). Cierra M1.
- [x] **3.4** `kommo-api`: `create_reservation` por un cliente valida ownership de la reserva (client_users). (ownership per-record para staff: aceptado por scope de rol)
- [x] **3.5** `kommo-api`: `batch_sync_reservations`/`batch_update_reservations`/`migrate_clients`/`precreate_dealership_leads` restringidas a **superadmin** (ningún flujo de frontend las llama).
- [ ] **3.6** Revisar PII en `integration_logs` (pendiente menor — Fase 4).

**Validación:** anon/​sin-usuario → 401 en kommo-api ✓; webhook con subdomain ajeno → ignorado ✓; webhook sin secreto sigue vivo ✓.

**Pendiente para cerrar A3 del todo (runbook):** generar un secreto, setear `KOMMO_WEBHOOK_SECRET` en Supabase, y actualizar la URL del webhook en Kommo a `.../kommo-webhook?secret=<secreto>`. Hacerlo en ese orden (primero Kommo, luego el env) para no perder eventos.

---

## FASE 4 — Hardening general 🟡

**Objetivo:** reducir la superficie de abuso y prepararse para amenazas futuras.

- [ ] **4.1** Rate limiting global en el borde (por IP + por identidad) para todos los endpoints de funciones.
- [ ] **4.2** Captcha (hCaptcha/Turnstile) en el landing público de prospectos y en los logins.
- [x] **4.3** Security headers (`public/_headers`): X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy. **CSP** dejada como plantilla comentada (requiere probar contra la app antes de activar).
- [ ] **4.4** Revisar almacenamiento de sesión: JWT en localStorage vs cookies httpOnly.
- [ ] **4.5** Sanitización/escape consistente de datos de usuario renderizados (revisión XSS preventiva).
- [ ] **4.7** Auditoría de dependencias: `npm audit` reporta ~24 vulnerabilidades (mayormente transitivas de build). Revisar altas/críticas sin romper deps (no auto-fix).
- [ ] **4.8** Tabla/registro de auditoría de accesos sensibles (quién leyó/editó qué).

### 🔴 A6 (NUEVO HALLAZGO — CRÍTICO) — Buckets de Storage públicos con PII
Los 4 buckets son `public: true`. **`technical-reports` (88 archivos) y `prospect-updates` (10)** contienen datos sensibles de clientes (reportes de servicio, documentos, audios) y son **legibles por cualquiera con la URL, sin autenticación**. La app usa `getPublicUrl` (DealershipPanel:510, TechnicalReportUploader:154, ProspectUpdatesSidebar:199) y guarda esas URLs públicas en la DB (`reservations.technical_report_url`, `prospect_updates.file_url`).
- [x] **A6.1** Migración `20260703170000`: `technical-reports` y `prospect-updates` → `public: false`. (En deploy — se aplica tras Netlify.)
- [x] **A6.2** Frontend: `getPublicUrl` → URL firmada (`getSignedFileUrl` en `src/lib/storage.ts`) en TechnicalReportUploader, ProspectUpdatesSidebar, DealershipPanel. Build ok, sin residuales.
- [x] **A6.3** La subida guarda el **path**; el helper `extractStoragePath` acepta URLs públicas viejas Y paths → **sin migración de datos**.
- [ ] **A6.4** (residual, no bloqueante) La lectura de `storage.objects` es `authenticated`-wide (cualquier autenticado firma cualquier reporte si conoce el path). Gran mejora sobre el acceso anónimo público; el scoping por concesionario/cliente queda como refinamiento futuro (requiere codificar ownership en el path).
> ✅ **DEPLOYADO Y VERIFICADO (2026-07-04)**: frontend en Netlify (bundle `index-DUONhcRY.js`), buckets privados aplicados. **Re-ataque**: leer un reporte técnico por URL pública sin auth → **HTTP 400 "Bucket not found"** (antes servía el PDF). Fuga de PII cerrada.

**Validación:** `npm audit` sin críticas; headers presentes en respuesta; captcha bloquea envíos automatizados.

---

## FASE 5 — Verificación y regresión 🟢

**Objetivo:** demostrar que los ataques ya no funcionan y evitar regresiones.

- [ ] **5.1** Re-ejecutar TODOS los ataques de la auditoría (volcado anon de vehicles, brute-force PIN, plate takeover, escalada role_id, lectura cruzada de prospects/clients) y documentar que fallan.
- [ ] **5.2** Suite de tests de RLS automatizada (por rol: qué debe ver y qué no).
- [ ] **5.3** Tests de las edge functions (auth requerida, firma de webhook, ownership).
- [ ] **5.4** Checklist de seguridad en el flujo de PR/CI (lint de secretos, revisión de políticas).

**Validación:** todos los tests en verde; informe de re-pentest confirmando cierre de C1–C4, A1–A4, M1–M4.

---

## FASE 6 — Operación continua 🔵

**Objetivo:** que la seguridad no se degrade con el tiempo.

- [x] **6.1** Escaneo de secretos en CI: `.github/workflows/gitleaks.yml` + `.gitleaks.toml` (allowlist del token ya revocado). Corre en cada push/PR.
- [ ] **6.2** Rotación periódica de keys y tokens (calendario) — operativo, del equipo.
- [ ] **6.3** Alertas de Supabase (auth fallida, picos de tráfico) — requiere config en el dashboard.
- [ ] **6.4** Revisión de seguridad trimestral (re-correr esta auditoría).
- [x] **6.5** `SECURITY.md`: modelo de seguridad, principios de RLS, regla de deploy coordinado y manejo de secretos.

---

## Registro de avance

| Fecha | Fase | Acción | Resultado |
|-------|------|--------|-----------|
| 2026-07-03 | — | Auditoría inicial | 12 hallazgos (4 críticos) |

