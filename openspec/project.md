# sdd-init/gac-vzla — Project Context

Detected: 2026-07-29
Artifact store: openspec (Engram unavailable in this session)

## Preflight (session-level, do not re-resolve in later phases)

| Field | Value |
|---|---|
| execution_mode | auto |
| artifact_store | openspec |
| engram_available | false |
| delivery_strategy | exception-ok (large changes ship complete; `size:exception` pre-accepted) |
| chain_strategy | not applicable (single-PR default) |
| review_budget_lines | 2000 |

## Stack

- **Frontend**: React 18 + TypeScript, Vite (dev port 8080), Tailwind CSS + shadcn/ui (Radix primitives)
- **Routing**: React Router DOM v6
- **Server state**: `@tanstack/react-query` (installed, lightly used — most data fetching is `useState` + direct Supabase calls)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Row Level Security)
- **CRM integration**: Kommo, via Supabase Edge Functions (`kommo-api`, `kommo-webhook`)
- **Spreadsheet import/export**: `xlsx` (prospects), `exceljs`
- **PDF generation**: `@react-pdf/renderer` (survey/encuesta PDFs)
- **Path alias**: `@/` → `src/`
- **Package manager**: npm (`package-lock.json` present) — `bun.lock`/`bun.lockb` also present but npm is canonical per CLAUDE.md commands

## Commands

```bash
npm run dev        # dev server, http://localhost:8080
npm run build       # production build (vite build)
npm run build:dev   # development-mode build
npm run lint         # ESLint (flat config, eslint.config.js)
npm run test         # vitest run
npm run test:watch   # vitest watch mode
npm run preview      # preview production build
```

No standalone `tsc --noEmit` script — type errors surface only via `npm run build`.

## Testing capabilities (honest assessment)

**Strict TDD Mode**: disabled (see `openspec/config.yaml` `strict_tdd_reason`)

### Test runner

- Command: `npm run test` → `vitest run`
- Framework: Vitest 3.2, environment `jsdom`, `globals: true`
- Config: `vitest.config.ts`, setup file `src/test/setup.ts`
- Test glob: `src/**/*.{test,spec}.{ts,tsx}`

### Test layers

| Layer | Available | Tool |
|---|---|---|
| Unit | Yes | Vitest — 12 spec files under `src/lib/` (phone, plate, recompra, reservationAssignment, reservationCapacity, satisfaction, satisfactionStats, vehicleSearch, vehicleSelection, venezuelaStates, warranty, whatsapp) + `src/test/example.test.ts` |
| Integration | No | `@testing-library/react` + `@testing-library/jest-dom` are installed devDependencies but no component/page test files exist yet |
| E2E | No | No Playwright/Cypress/Selenium detected |

### Coverage

- Available: No (`@vitest/coverage-v8`/`c8` not in devDependencies, no `--coverage` script)

### Quality tools

| Tool | Available | Command |
|---|---|---|
| Linter | Yes | `npm run lint` (ESLint 9 flat config, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) |
| Type checker | Partial | via `npm run build` only (no dedicated `tsc --noEmit` script) |
| Formatter | No | no Prettier config detected |

### CI

Only `.github/workflows/gitleaks.yml` (secret scanning via Gitleaks). No CI gate runs `npm run test`, `npm run build`, or `npm run lint` — build/lint/test verification is manual, per CLAUDE.md's "build check obligatorio" convention.

## Architecture

Multi-portal single-page application, role-gated, backed by Supabase with RLS. No server framework — Supabase is the entire backend (Postgres + Auth + Storage + Edge Functions for CRM sync and passwordless/PIN/plate login).

### Portals (`src/App.tsx` routing)

| Portal | Entry | Roles |
|---|---|---|
| Admin | `AdminPanel.tsx` → `AdminLayout` | `superadmin`, `admin` |
| Dealership/vendedor | `DealershipPanel.tsx` → `DealershipLayout` | `concesionario`, `vendedor` |
| Client | `UserPortal.tsx` | authenticated client |
| Public | `PublicReserva.tsx`, `PublicProspectos.tsx`, `PublicEncuesta.tsx` | unauthenticated |

Many admin pages are reused directly under `/concesionario/*` routes (AdminGarantias, AdminHistorial, AdminVehiculos, AdminModelos, AdminClientes, AdminConcesionarios, AdminUsuarios, AdminRoles) — the dealership portal is largely a filtered view over the same components rather than a parallel implementation.

### Directory layout

```
src/
├── pages/
│   ├── admin/          # 10 modules: Dashboard, Reservas, Clientes, Vehiculos, Modelos,
│   │                    Concesionarios, Prospectos, Garantias, Historial, Usuarios, Configuracion
│   ├── dealership/      # Dashboard, Reservas, Prospectos (rest reused from admin/)
│   ├── UserPortal.tsx, PublicReserva.tsx, PublicProspectos.tsx, PublicEncuesta.tsx
│   └── AdminPanel.tsx / DealershipPanel.tsx (shells)
├── components/ui/        # shadcn/ui primitives
├── components/            # ProspectUpdatesSidebar, TechnicalReportUploader, NotificationCenter, ...
├── hooks/                 # useDealershipAccess, useCurrentSalesperson, useProspectStatuses,
│                            useProspectSources, useProspectEvents, useSalespersons, useNotifications
├── contexts/AuthContext.tsx   # user, profile, role, hasPermission()
├── integrations/supabase/     # client.ts (anon key), types.ts (generated DB types)
└── lib/                        # whatsapp.ts, utils.ts, and most unit-tested pure logic

supabase/
├── functions/    # kommo-api, kommo-webhook, generate-magic-link, verify-magic-link,
│                    login-by-pin, login-by-plate, create-user, create-client-user, delete-user, _shared
└── migrations/    # 57 files, YYYYMMDDHHMMSS_description.sql — applied manually via Management API
```

### Domain boundaries

- **Auth/roles**: `profiles`, `roles`, `permissions`, `role_permissions`, `user_permissions` — granular `{module}.{action}` permission model, resolved by `useAuth().hasPermission()`
- **Sales/CRM**: `prospects` ↔ Kommo pipeline "Ventas/Prospectos" (bidirectional sync)
- **Service/warranty**: `reservations`, `vehicles`, `vehicle_models`, `warranty_conditions`, `service_types` ↔ Kommo pipeline "Post Venta"
- **Directory**: `dealerships`, `salespersons`, `clients`
- **Integration observability**: `integration_configs` (dynamic Kommo credentials), `integration_logs`

## Conventions (see also root `CLAUDE.md` and project skills)

- `@/` path alias for `src/`
- Toasts via Sonner (`toast.success()` / `toast.error()`)
- Form state persistence in `localStorage`/`sessionStorage` with established keys (`admin_reservas_create_form`, `dealership_reservas_create_form`, `userportal_reserva_flow`, `dealership_prospectos_dialog`)
- Column-toggle table pattern (`ColKey` union + `COL_LABELS` record + `visibleCols: Set<ColKey>`)
- Warranty fallback pattern: per-model `warranty_km`/`warranty_months` override `warranty_conditions` (global) when non-null
- `prospects."Estado de Vnzla"` — column name has a space; requires double quotes in SQL and bracket notation (`p['Estado de Vnzla']`) in JS/TS
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_descripcion.sql`, applied via Supabase Management API `curl`/`Invoke-RestMethod` (no local Supabase CLI configured) — token lives only in `$env:SUPABASE_ACCESS_TOKEN`/`SUPABASE_ACCESS_TOKEN`, never committed
- **Local-first workflow**: never commit or push without explicit user authorization (see `requirements-gac` skill and root `CLAUDE.md`)
- Build check before any push: `npm run build` must succeed (TypeScript errors fail silently in dev server)

## Persistence backend rationale

Engram MCP tools are unavailable in this session. All SDD context, skill registry, and future change artifacts (proposals, specs, designs, tasks, verify reports) are persisted as files under `openspec/` per `~/.claude/skills/_shared/openspec-convention.md`. If Engram becomes available in a later session, this file remains the durable source of truth and can be additionally mirrored into Engram without re-detection.

## Risks / gaps for later SDD phases

- No CI gate enforces build/lint/test — `sdd-verify` must run these manually and cannot rely on CI history as evidence.
- No component/integration or E2E test layer — behavioral changes to UI flows (forms, dialogs, tables) have no regression safety net beyond manual verification and the `src/lib/` unit suite.
- No coverage tooling configured — coverage-based gates are not available; `coverage_threshold: 0` in `openspec/config.yaml` reflects this honestly.
- `bun.lock`/`bun.lockb` coexist with `package-lock.json`; CLAUDE.md and this project standardize on `npm`, but a stray Bun install could desync lockfiles — worth flagging in review if either lockfile changes unexpectedly.
