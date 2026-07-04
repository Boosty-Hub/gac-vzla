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

- [ ] **2.1** Trigger `BEFORE UPDATE` en `profiles` que fuerce `NEW.role_id = OLD.role_id` y `NEW.is_active = OLD.is_active` salvo `is_admin_user()`. Cierra C3.
- [ ] **2.2** Reescribir políticas de `prospects` (hoy `ALL` = authenticated): SELECT/UPDATE/DELETE/INSERT con scope por `is_admin_user()` / `dealership_users` / `salesperson = full_name`. Cierra A1.
- [ ] **2.3** Reescribir `clients_select` con scope (admin, staff del dealership, o vínculo `client_users`). Cierra A2.
- [ ] **2.4** Reescribir `vehicles_select` con el mismo scope. Cierra A2.
- [ ] **2.5** Reescribir `reservations` SELECT/UPDATE/DELETE con scope por dealership/cliente. Cierra A2.
- [ ] **2.6** Eliminar la política amplia `anon_read_vehicles_by_plate`; sustituir por RPC `SECURITY DEFINER` que reciba placa y devuelva solo esa fila. Cierra la fuga de C1.
- [ ] **2.7** Revisar `anon_read_dealerships` — dejar solo campos públicos necesarios.
- [ ] **2.8** Auditar TODAS las políticas restantes con `qual = auth.role()='authenticated'` o `true` y aplicar scope real donde haya PII (`prospect_updates`, `prospect_vehicles`, `notifications`, etc.). Cierra M4.
- [ ] **2.9** Añadir `WITH CHECK` a políticas INSERT `anon` de `prospects`/`prospect_vehicles` (validar formato/campos) + captcha (ver Fase 4).

**Validación:** repetir cada ataque probado en la auditoría con un JWT de `vendedor`/`cliente` y confirmar `[]` o 403 donde antes había datos; confirmar que los flujos legítimos (portal cliente, portal vendedor) siguen funcionando.

---

## FASE 3 — Autorización en Edge Functions 🟠 (ALTA)

**Objetivo:** las funciones con service role validan quién llama y sobre qué recurso.

- [ ] **3.1** `kommo-webhook`: validar firma/secreto de Kommo en cada request; rechazar 401 las no firmadas. Cierra A3.
- [ ] **3.2** `kommo-webhook`: validar que `pipeline_id` e IDs pertenecen a leads reales antes de mutar; no responder siempre 200.
- [ ] **3.3** `kommo-api`: resolver el perfil del llamante y exigir rol adecuado por acción (patrón de `generate-magic-link`). Cierra M1.
- [ ] **3.4** `kommo-api`: validar ownership de `prospect_id`/`reservation_id`/`dealership_id` contra el concesionario del usuario.
- [ ] **3.5** `kommo-api`: restringir acciones batch/migrate/precreate a `superadmin`.
- [ ] **3.6** Revisar que ninguna función loguee PII sensible en `integration_logs`.

**Validación:** POST sin firma al webhook → 401; un `cliente` autenticado invocando `migrate_clients` en kommo-api → 403.

---

## FASE 4 — Hardening general 🟡

**Objetivo:** reducir la superficie de abuso y prepararse para amenazas futuras.

- [ ] **4.1** Rate limiting global en el borde (por IP + por identidad) para todos los endpoints de funciones.
- [ ] **4.2** Captcha (hCaptcha/Turnstile) en el landing público de prospectos y en los logins.
- [ ] **4.3** Security headers en el frontend (CSP, X-Frame-Options, HSTS, Referrer-Policy).
- [ ] **4.4** Revisar almacenamiento de sesión: evaluar riesgo de JWT en localStorage vs cookies httpOnly.
- [ ] **4.5** Sanitización/escape consistente de datos de usuario renderizados (revisión XSS preventiva).
- [ ] **4.6** Storage buckets de Supabase: revisar políticas de acceso a archivos (reportes técnicos, imágenes).
- [ ] **4.7** Auditoría de dependencias: resolver los `npm audit` de severidad alta/crítica.
- [ ] **4.8** Tabla/registro de auditoría de accesos sensibles (quién leyó/editó qué).

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

- [ ] **6.1** Escaneo de secretos en cada commit (gitleaks/trufflehog en pre-commit + CI).
- [ ] **6.2** Rotación periódica de keys y tokens (calendario).
- [ ] **6.3** Alertas de Supabase (logs de auth fallida, picos de tráfico anómalo).
- [ ] **6.4** Revisión de seguridad trimestral (re-correr esta auditoría).
- [ ] **6.5** Documentar el modelo de amenazas y las decisiones de RLS para el equipo.

---

## Registro de avance

| Fecha | Fase | Acción | Resultado |
|-------|------|--------|-----------|
| 2026-07-03 | — | Auditoría inicial | 12 hallazgos (4 críticos) |

