# Tasks: Satisfaction Survey — won-prospect to client, Kommo delivery, dashboard

> Size note (mirrors design.md's own precedent, which already exceeded its 800-word budget for
> the same reason): this file exceeds the skill's 530-word budget. The contract requires exact
> per-migration rollback text, explicit blocked/unblocked marking, a unit-test task per new
> `src/lib/` file, and a 4-slice review-workload forecast for a ~1,800–2,400 line change spanning
> DB + edge + two portals. Compressing this would strip detail `sdd-apply` needs to not re-derive
> line numbers from scratch or silently miss the corrections below.

## Corrections folded in from live verification (read before Phase 1)

1. **`prospects.cedula` has zero writers anywhere in the frontend** — confirmed absent from
   `AdminProspectos.tsx`, `DealershipProspectos.tsx`, `PublicProspectos.tsx` (not just the 3023
   existing rows). Design's migration still adds the column (task 1.1); the cedula step of
   `fn_resolve_or_create_client_for_prospect` is real code but is **dead on the prospect→client
   path** until a future change adds capture — the effective order there is phone → email. It
   still works for the repurchase/direct-client path where `clients.cedula` is populated.
2. **Gap found in design.md**: proposal.md fork 6 requires `get_survey_by_token` to return brand
   as text, but no SQL for it exists in design.md's migration section or File Changes table.
   Filled in as task 4.1 (new migration, Phase 4, since only `PublicEncuesta.tsx` needs it).
3. **`npm run build`/`npm run lint` do not cover `supabase/functions/**`** — `tsconfig.app.json`
   `include` is `["src"]` only. The only compile-time signal for edge-function correctness in
   this project is the deploy step itself failing loudly; there is no configured Deno type-check.
4. **`DealershipProspectos.tsx` has no `handleSendSurvey`/wa.me survey path today** (verified —
   its only `wa.me` use, `:397`, is the unrelated generic prospect-greeting message). Design's
   File Changes table implied a mirrored deletion; there is nothing to delete there.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,800–2,400 total (Slice 1 ~400 / Slice 2 ~250 / Slice 3 ~450 / Slice 4 ~700), per proposal.md |
| Session budget override | `review_budget_lines: 2000` (preflight) — every individual slice fits under it; only the aggregate sits at/above it |
| Per-slice risk vs. 2,000 | Slice 1 Low · Slice 2 Low · Slice 3 Low · Slice 4 Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB) → PR 2 (Kommo delivery) → PR 3 (Capture UX) → PR 4 (Dashboard + form) |
| Delivery strategy | exception-ok (pre-accepted) |
| Chain strategy | stacked-to-main — each slice merges to main independently, in order |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | DB: identity resolution, 24h gate, both RPCs, `ON CONFLICT` fix, dup view | PR 1 | N/A — no SQL test runner (project.md); `sdd-verify` runs task 1.12's script instead | Manual Management API script, scratch prospect won twice — 1 client + 1 survey, no `42P10`, delete after (task 1.12) | Paired `-- ROLLBACK` block in the migration file; independently revertible without touching PR 2-4 |
| 2 | Kommo delivery action + webhook hook + kill switch | PR 2 | N/A — no local Deno check; deploy (2.3) is the compile signal | One manual end-to-end send, kill switch ON, real `survey_stage_id` — **BLOCKED**, see 2.4 | `git checkout <sha> -- supabase/functions/{kommo-api,kommo-webhook}` (baselines v53/v40) + redeploy |
| 3 | Fleet + repurchase capture UX, `src/lib` pure logic + tests | PR 3 | `npm run test -- plate recompra` | Manual: fleet win with 3 plates; each repurchase outcome | `git revert`; new storage keys are namespaced, safe to leave |
| 4 | Dashboard tab, filters, deep link, PDF preview, debranded form | PR 4 | `npm run test -- satisfactionFilters` | Manual: admin/concesionario/vendedor scoped views; DFSK + SHINERAY token render | `git revert`; new `20260729120200_survey_token_brand.sql` has its own paired rollback |

## Phase 1 — DB Foundation (PR 1, ships alone). Not blocked on `survey_stage_id`.

- [x] 1.1 `supabase/migrations/20260729120000_satisfaction_prospect_to_client.sql`: defensive `ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cedula text` + comment documenting correction #1 above.
- [x] 1.2 Same file: `prospects.client_id` FK + index; `satisfaction_surveys` new columns (`client_id`, `vehicle_id`, `origin` + CHECK, `suppressed_reason`, `delivered_at`) + index.
- [x] 1.3 Same file, the one non-additive step: `prospect_id` → nullable; drop `satisfaction_surveys_prospect_id_key`; add partial unique index `uq_satisfaction_surveys_prospect ... WHERE prospect_id IS NOT NULL`.
- [x] 1.4 Same file: recreate `create_satisfaction_survey_on_won()` (`20260720120000:114-127`) and `backfill_satisfaction_surveys()` (`:224-243`) with `ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING` — omitting this raises `42P10` on the next win.
- [x] 1.5 Same file: `fn_resolve_or_create_client_for_prospect` (cedula→phone→email, `ORDER BY created_at LIMIT 1` = oldest row wins, name never a key) and `fn_claim_survey_slot` (`SELECT ... FOR UPDATE` + rolling 24h count).
- [x] 1.6 Same file: BEFORE trigger `trg_link_client_on_won` (D2 — sets `NEW.client_id` in place, no self-UPDATE/recursion).
- [x] 1.7 Same file: RPC `register_won_prospect(prospect_id, vehicles jsonb, is_fleet)`; RPC `register_client_repurchase(client_id, vehicles jsonb, send_survey, dealership_id)`; `v_duplicate_clients` view + `REVOKE ALL FROM anon, authenticated`; grants.
      **REVISED** — both RPCs now take a jsonb array of `{plate, model_id, year}` triples instead of `plates[]` with a single shared `model_id`/`year`. `vehicles.model_id` and `vehicles.year` are NOT NULL and prospects carry neither; `model_interest` exact-matches `vehicle_models.name` in 0 of 2929 rows, and fuzzy mapping was refused because `vehicles` feeds the warranty module. Validation is one all-or-nothing pass before any write.
- [x] 1.8 Rollback (same file, paired `-- ROLLBACK` comment): abort-if-responded-else-delete `prospect_id IS NULL` rows → drop partial index → restore UNIQUE constraint → restore NOT NULL → drop `trg_link_client_on_won` → restore `create_satisfaction_survey_on_won` verbatim from `20260720120000:114-134`. Materialized as real (commented-out) SQL, not a pointer comment; also restores `backfill_satisfaction_surveys()` for symmetry (addition beyond this task's literal list — see file header, "ROLLBACK BLOCK").
- [x] 1.9 **BLOCKED — pending user approval** — Apply via Supabase Management API (PowerShell, `supabase-gac` skill). Not executed this run per hard constraint (no live-DB writes; constraint swap on `satisfaction_surveys` is non-additive and needs human sign-off first). File is ready at `supabase/migrations/20260729120000_satisfaction_prospect_to_client.sql`.
- [x] 1.10 `supabase/migrations/20260729120100_satisfaction_delivery_config.sql`: `survey_delivery_enabled=false`; `survey_stage_id` coalesce-default `104023216`. Rollback: `UPDATE integration_configs SET config = config || '{"survey_delivery_enabled": false}'::jsonb WHERE integration_name='kommo'` (kill switch is the real safety lever; leaving `survey_stage_id` set is inert while it's off). Not blocked — ships regardless of the final stage id; flag `104023216` to the user as a recommendation pending confirmation.
- [x] 1.11 **BLOCKED — pending user approval** — Apply 1.10. Same reason as 1.9 (no live-DB writes this run). File is ready at `supabase/migrations/20260729120100_satisfaction_delivery_config.sql`.
- [ ] 1.12 **BLOCKED — pending 1.9/1.11 approval** — Manual verification (Management API, scratch prospect, delete rows after): win twice → exactly 1 `clients` row + 1 survey; second attempt has `suppressed_reason='rate_limited_24h'`; no `42P10` on either win; confirm the function matches correctly on cedula when called against a cedula-bearing row directly (proves 1.1's comment, doesn't contradict it). Cannot run without live DB access; deferred to `sdd-verify` or a follow-up apply run after 1.9/1.11 are approved and applied.

## Phase 2 — Kommo Delivery (PR 2)

- [x] 2.1 `supabase/functions/kommo-api/index.ts`: add `deliver_satisfaction_survey` action after the `sync_client` action ends (`:2024`) — kill switch → hard-fail on empty `survey_stage_id`/link field/base url → resolve by `prospect_id`/`client_id`/`survey_id` → suppressed check → shared-lead guard (`kommo_conversation_lead_id` referenced by >1 client) → `syncOneClientToConversation` reuse (`:653`) when unlinked → CF `3456839` PATCH only, no clear-on-empty (D4) → buffer-toggle mirroring `:1877-1885` → `mark_survey_sent` + `delivered_at` + `integration_logs`.
- [x] 2.2 `supabase/functions/kommo-webhook/index.ts`: insert the `ganado` hook NESTED INSIDE the status-change guard `if (ourStatus && prospect.status !== ourStatus)`, right after the existing `integration_logs` insert — NOT unconditionally after that guard closes, which would re-deliver on every Kommo webhook retry for a lead already at `ganado`. Requires an explicit `Authorization: Bearer <service key>` header; supabase-js does not auto-attach `sb_secret_*`. — `webhook_won_needs_plate` warning log + fire-and-forget `invoke('kommo-api', {action:'deliver_satisfaction_survey', prospect_id, reason:'won'})`.`catch()` so a Kommo failure never 500s the webhook.
- [x] 2.3 Deploy: `npx supabase functions deploy kommo-api --project-ref wsbuqiznddvxcwvpnbxm --use-api`; `kommo-webhook ... --no-verify-jwt`. Rollback: `git checkout <sha> -- supabase/functions/{kommo-api,kommo-webhook}` (baselines v53/v40) + redeploy.
- [ ] 2.4 **BLOCKED on user** — one manual end-to-end send (kill switch ON, one real test client) proving the stage toggle wakes the SalesBot; cannot run until `survey_stage_id` is confirmed (currently `""`, `104023216` recommended). Tasks 2.1-2.3 and 2.5 are NOT blocked.
- [x] 2.5 Verify: code review only (correction #3 — `npm run build`/`lint` don't reach `supabase/functions/**`). Confirm the hard-fail path (`survey_stage_id_not_configured`) fires today by construction, since the config value is currently empty — that is the built-in proof this guard works ahead of 2.4.

## Phase 3 — Capture UX (PR 3, not blocked)

> **3.1-3.4 are OBSOLETE — superseded by the implemented design, not skipped.**
> 3.1/3.2 assumed a free-text plate field that needed comma/newline parsing. The shipped
> fleet UI uses **discrete rows** (one plate + model + year per row), so `parseSoldPlates`
> has no caller; `normalizeSoldPlate`/`isValidSoldPlate` in `src/lib/plate.ts` already cover
> the per-row need and are still tested by the existing `plate.test.ts` (10 tests, green).
> 3.3/3.4 assumed a `resolveRepurchaseOutcome` helper; `RepurchaseDialog.tsx` expresses the
> three outcomes directly as three handlers, so the helper would be indirection with no
> second caller. Delete these four from a future revision of this plan rather than
> implementing them to satisfy the checklist.

- [ ] 3.1 `src/lib/plate.ts`: add `parseSoldPlates(raw: string): string[]` (split comma/newline, `normalizeSoldPlate` each, dedupe) and `isValidPlateList(plates: string[]): boolean`.
- [ ] 3.2 `src/lib/plate.test.ts`: extend — dedupe, mixed separators, empty input → `[]`; `isValidPlateList([])` → false (spec: "Fleet win requires at least one plate").
- [ ] 3.3 `src/lib/recompra.ts`: add `resolveRepurchaseOutcome` + `describeRepurchase`; `isRecurrentClient` unchanged.
- [ ] 3.4 `src/lib/recompra.test.ts`: extend — the 3 dialog outcomes (register+survey / register-no-survey / dismiss-writes-nothing) per spec scenarios.
- [x] 3.5 `AdminProspectos.tsx`: fleet checkbox + multi-plate input in the sold-plate dialog (`:1995-2023`); `confirmSoldPlate` (`:657`) swaps its direct `.update()` for `rpc('register_won_prospect', {...})` + `invoke('kommo-api', {action:'deliver_satisfaction_survey', prospect_id, reason:'won'})`; delete `handleSendSurvey`'s wa.me path (`:778-839`), replace with the same delivery call; add a "Falta placa" filter chip (derived `status='ganado' AND sold_plate IS NULL`) that reopens the plate dialog.
- [x] 3.6 `DealershipProspectos.tsx`: same as 3.5 — `confirmSoldPlate` at `:1114`, plate dialog trigger at `:~2161`. Per correction #4: no `handleSendSurvey` exists here — only add the RPC + delivery call + fleet UI.
- [x] 3.7 `ClientDetailDialog.tsx`: add "Agregar vehículo" button to the Vehículos tab (`:237-264`, currently has none), gated `hasPermission('vehiculos.create')`, opens `RepurchaseDialog`.
- [x] 3.8 Create `src/components/clients/RepurchaseDialog.tsx`: 3 outcomes per R6 — confirm+survey (`p_send_survey:true` + delivery `reason:'repurchase'`), confirm-without-survey (`p_send_survey:false`, no edge call), `X` writes nothing.
- [ ] 3.9 Verify: `npm run build`, `npm run lint`, `npm run test` (plate + recompra suites green). Manual: 3-plate fleet win → 3 `vehicles` rows + 1 survey; each repurchase outcome writes exactly what's specified.

## Phase 4 — Dashboard + Form (PR 4, not blocked)

- [x] 4.1 New `supabase/migrations/20260729120200_survey_token_brand.sql` (correction #2): `CREATE OR REPLACE FUNCTION get_survey_by_token` adding one output column `brand` via `satisfaction_surveys.vehicle_id → vehicles.model_id → vehicle_models.brand` (LEFT JOINs, NULL when no vehicle). Grant unchanged (same signature). Rollback: restore the original 5-column definition verbatim from `20260720120000:142-150`.
- [x] 4.2 Apply 4.1.
- [x] 4.3 Create `src/lib/satisfactionFilters.ts`: `filterSurveys`, `deriveBrandFacets`, `deriveMonthOptions`, `groupSurveysByClient`, `surveyBrandModel` (vehicle → `model_interest` token fallback labeled "(estimada)" → unknown).
- [x] 4.4 `src/lib/satisfactionFilters.test.ts`: combined brand+model+month AND filter; `vehicle_id IS NULL` fallback; month keyed on `created_at`, not `responded_at`.
- [x] 4.5 `AdminDashboard.tsx`: delete the satisfaction chart block (`:698-706`); wrap the body in `<Tabs defaultValue="resumen">` (`resumen` = existing content, `satisfaccion` = new).
- [x] 4.6 Create `src/components/satisfaction/SatisfactionDashboard.tsx`: single RLS-scoped fetch, no `clients` read (D6); composes Filters + Overview + ClientList.
- [x] 4.7 Create `src/components/satisfaction/SatisfactionFilters.tsx` (brand/model/month; facets derived from fetched rows only, per D7).
- [x] 4.8 Create `src/components/satisfaction/SatisfactionClientList.tsx`: name, phone, plate, score, resend (→ delivery action `reason:'resend'`), deep link `…/clientes?client={id}&tab=satisfaccion`; `client_id IS NULL` rows render but are not clickable.
- [x] 4.9 `SatisfactionOverview.tsx`: add optional `surveys` prop (D8); default uncontrolled fetch stays, so `AdminClientes.tsx`'s **own, separate** existing "Satisfacción" tab (`:534-539` / `:1364-1366`) keeps working unchanged.
- [x] 4.10 `AdminClientes.tsx`: read `useSearchParams()` for `?client=&tab=satisfaccion`; on match, fetch that client and open `ClientDetailDialog` (`:1357-1361`, the modal) with new `defaultTab='encuesta'`. This is independent of AdminClientes' own outer "Satisfacción" `TabsTrigger` (`:534-539`) — do not conflate the two. Clear params via `setSearchParams({}, {replace:true})` on close.
- [x] 4.11 `ClientDetailDialog.tsx`: add `defaultTab` prop (default `'info'`); survey lookup gains `.eq('client_id', client.id)` as cascade step 0 before the existing plate/phone/name fallback (`:90-137`).
- [x] 4.12 `PublicEncuesta.tsx`: replace `<img src="/gac-logo.png">` (`:141`) with a typographic header; add `brand: string | null` to the `SurveyInfo` interface (`:22-28`) and the RPC read (`:65`), rendered as text when non-null (uses 4.1's new column).
- [ ] 4.13 Attempt `npx supabase gen types typescript` for `src/integrations/supabase/types.ts`; no Supabase CLI/token is configured locally for this (confirmed) — expected outcome is to keep `(supabase as any)` casts project-wide per the established pattern; do not block delivery on this.
- [ ] 4.14 Verify: `npm run build`, `npm run lint`, `npm run test`. Manual: concesionario/vendedor see only their scope; DFSK and SHINERAY tokens both render with no GAC logo.

## Phase 5 — Final Cross-Slice Verification

- [ ] 5.1 After all 4 slices land: `npm run build && npm run lint && npm run test` — the only gate this project has (`.github/workflows/gitleaks.yml` is secret-scanning only, no CI runs build/lint/test).
- [ ] 5.2 Walk `proposal.md`'s Success Criteria checklist item by item against the live system.
- [ ] 5.3 Keep `survey_delivery_enabled=false` until 2.4's blocked manual send is confirmed by the user; only then flip it to `true`.
