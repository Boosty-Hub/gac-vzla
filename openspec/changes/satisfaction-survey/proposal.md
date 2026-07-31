# Proposal: Satisfaction Survey — won-prospect to client, Kommo delivery, dashboard

Phase: `sdd-propose` | Date: 2026-07-29 | Contract: `requirements.md` (R1-R12)

## Intent

A won prospect never becomes a client, so the satisfaction survey has no recipient. 191
prospects are `ganado`, only 14 surveys exist, 1 was answered, 3 have a plate. The pieces that
exist (tables, trigger, token, public form, per-aspect stats) are wired to nothing: no
prospect-to-client path, no delivery, and the dashboard shows a chart the business rejected.

This change closes the loop: won prospect → idempotent client → survey link written into Kommo
CF `3456839` on the client's conversation lead → SalesBot delivers it 24h later → responses
land in a dedicated, filterable Satisfacción tab.

## Decisions (the 8 design forks)

| # | Fork | Decision | Rationale |
|---|---|---|---|
| 1 | Prospect → client | **Two layers.** DB `fn_resolve_or_create_client_for_prospect()` (SECURITY DEFINER, one place) called by a new RPC `register_won_prospect()` AND by the existing won-trigger. Kommo side handled by a new `kommo-api` action. **Add `prospects.client_id`** (nullable FK, indexed). | The trigger already fires on every write path including the Kommo webhook, which bypasses the plate dialog — frontend-only would miss it. DB cannot call Kommo (no `pg_net`), so Kommo stays in the edge function. Dedup order **cedula → phone → email** deliberately mirrors `findExistingContact` in `kommo-api:596-604` so DB and Kommo agree on identity. `client_id` is required by R12 invariant 1 and by dashboard navigation. |
| 2 | Fleet multi-plate | **Use `vehicles`.** No plates array, no join table. `sold_plate` stays single text = first/primary plate (display only). `is_fleet` checked → dialog collects N plates → N `vehicles` rows under one `client_id`. | `vehicles` already has `client_id`, `plate`, `model_id` and 2645 rows; a parallel plate array would be a second, divergent vehicle registry. One survey per fleet is free: one prospect row = one survey row. Zero breaking change to the 3 existing `sold_plate` rows or to `SatisfactionOverview` / `ClientDetailDialog`. |
| 3 | 1 survey / client / day | **DB, inside the one shared function**, serialized by `SELECT ... FOR UPDATE` on the client row, checking a rolling 24h window on `satisfaction_surveys.client_id`. Not a unique index. | Postgres cannot express a rolling window as a constraint; a calendar-day unique index is both too strict and too loose (23:00 + 01:00 = 2 surveys in 2h). Row-lock + check is race-proof and holds across all three paths (won, repurchase, resend) because all three go through the same function. Suppressions recorded in a new `suppressed_reason` column instead of raising. |
| 4 | Repurchase | Dialog on "add vehicle" in `ClientDetailDialog`, three outcomes, backed by RPC `register_client_repurchase(client_id, plates[], model_id, send_survey)`. | `src/lib/recompra.ts` is **not** a repurchase flow — it exports only `isRecurrentClient({cedula, vehicleCount})`, a >1-vehicle flag. Reuse it for the "cliente recurrente" badge and extend the file with the dialog's pure decision logic so it stays unit-testable per project convention. |
| 5 | Dashboard | Delete `AdminDashboard.tsx:698-706`. Dashboard becomes tabbed: `Resumen` \| `Satisfacción`. Client row → `/admin/clientes?client={id}&tab=satisfaccion` deep link opens `ClientDetailDialog` on the surveys tab with PDF preview. **No new permission** — reuse the existing `satisfaction_surveys` RLS. | RLS already scopes correctly (`20260720120000:89-92`): `concesionario` → own `dealership_id`, `vendedor` → own `salesperson`. A new `satisfaccion.view` permission would need seeding + per-role assignment for zero security gain. **Critical**: `clients` has NO `dealership_id`, so the tab's client list MUST be derived from `satisfaction_surveys`, never queried from `clients` — otherwise a dealership user enumerates all 1367 clients. |
| 6 | Brand-agnostic form | Replace the `gac-logo.png` `<img>` (`PublicEncuesta.tsx:141`) with a typographic header. `get_survey_by_token` extended to return brand as **text**, shown when known. No per-brand logo assets. | R10 asks for one shared form, not three branded ones. A text brand needs no new asset and no build-time asset verification. |
| 7 | Resend | Button per client in the surveys tab and the satisfaction client row → `deliver_satisfaction_survey({client_id})`. Reuses the existing open survey token; only creates a row if none exists. Same 24h gate, no admin override. | Resending must not mint a second token or the earlier link silently dies in the customer's chat. |
| 8 | Existing duplicates | **Prevent new, do NOT merge, defer merge to its own change.** Ship a read-only `v_duplicate_clients` view so the follow-up has a verified worklist. Add a hard guard: `deliver_satisfaction_survey` refuses to write when a `kommo_conversation_lead_id` is shared by >1 client row. | Merging 60 duplicate `IdContactKommo` + 62 duplicate phones rewrites `vehicles`, `reservations`, `client_users` and live Kommo leads — a data migration with its own rollback, un-reviewable folded into a feature. The 5 shared conversation leads are the only way this change can actively harm a customer (survey link sent to the wrong person); the guard closes that in ~10 lines. |

## Scope

### In Scope

- Schema: `prospects.client_id`; `satisfaction_surveys` gains `client_id`, `vehicle_id`, `origin`, `suppressed_reason`; `prospect_id` becomes nullable with a partial unique index (repurchase surveys have no prospect).
- `fn_resolve_or_create_client_for_prospect()` + RPCs `register_won_prospect()`, `register_client_repurchase()`; existing won-trigger rewired to call the shared function.
- `kommo-api` action `deliver_satisfaction_survey` — reuses `syncOneClientToConversation` (already dedup-safe, self-skips when `kommo_conversation_lead_id` is set), PATCHes CF `3456839` with `{survey_base_url}/encuesta/{token}`, then toggles the stage buffer → `survey_stage_id` exactly as `notify_dealership_reservation` does (`kommo-api:1877-1885`). Invoked by both UIs and by `kommo-webhook`.
- Kill switch `integration_configs.config.survey_delivery_enabled` (default `false`).
- Fleet multi-plate dialog in `AdminProspectos` + `DealershipProspectos`; repurchase dialog; resend button.
- Dashboard restructure with brand / model / month filters; deep-linked client detail; PDF preview.
- Brand-agnostic public form.
- `v_duplicate_clients` detection view.
- Unit tests in `src/lib/` for all new pure logic; regenerate `src/integrations/supabase/types.ts`.

### Out of Scope

- Any scheduler or 24h timer. SalesBot owns the delay (R11 / delivery decision).
- Backfilling the 191 existing won prospects. `backfill_satisfaction_surveys()` is left in place, `is_admin_user()`-gated, and never invoked; it creates rows but does not deliver, so it stays inert.
- Merging existing duplicate clients (fork 8) — separate change.
- New messaging vendor, per-brand logo assets, Kommo pipeline `13988420` handling.
- Component/E2E test layer (none exists; not created here).

## Capabilities

### New Capabilities

- `prospect-to-client`: idempotent client resolution/creation on win, `prospects.client_id` link, fleet vehicle registration, repurchase registration.
- `survey-delivery`: Kommo CF write + stage-toggle trigger, 24h per-client rate limit, shared-lead guard, kill switch, resend.
- `satisfaction-dashboard`: Satisfacción tab, dealership-scoped client list, brand/model/month filters, client deep link, PDF preview.
- `survey-form`: brand-agnostic public survey at `/encuesta/:token`.

### Modified Capabilities

- None. `openspec/specs/` is empty — there are no existing specs to delta.

## Approach

Order per `requirements-gac`: DB → frontend → edge functions, with delivery moved ahead of UI so the UI has something to call.

1. **DB foundation** — additive migration (new nullable columns, new functions, new indexes). One shared SECURITY DEFINER function owns identity resolution AND the rate limit, so no caller can bypass either.
2. **Kommo delivery** — new `kommo-api` action reusing existing helpers; `kommo-webhook` calls it server-to-server rather than duplicating ~700 lines of Kommo plumbing or refactoring a 2000-line function into `_shared`.
3. **Capture UX** — fleet plates and repurchase dialogs; the frontend calls one RPC (atomic: client + link + vehicles + survey in one transaction, returns `client_id` + token) then one edge action.
4. **Dashboard + form** — remove the rejected chart, add the tab, wire filters through `vehicles → vehicle_models`, debrand the form.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` (new) | New | Schema, shared function, 2 RPCs, trigger rewire, RLS, `v_duplicate_clients` |
| `supabase/functions/kommo-api/index.ts` | Modified | New `deliver_satisfaction_survey` action (~180 lines) |
| `supabase/functions/kommo-webhook/index.ts` | Modified | Invoke delivery on webhook-driven `ganado` (~30 lines) |
| `src/pages/admin/AdminProspectos.tsx` | Modified | Fleet checkbox + multi-plate dialog, RPC call |
| `src/pages/dealership/DealershipProspectos.tsx` | Modified | Same, mirrored |
| `src/pages/admin/AdminDashboard.tsx` | Modified | Remove `:698-706`; add `Resumen`/`Satisfacción` tabs |
| `src/components/satisfaction/` | New/Modified | Satisfaction tab, filters, client list, resend |
| `src/components/clients/ClientDetailDialog.tsx` | Modified | Repurchase dialog, surveys tab deep link, resend |
| `src/pages/admin/AdminClientes.tsx` | Modified | Query-param deep link (also serves `/concesionario/clientes`) |
| `src/pages/PublicEncuesta.tsx` | Modified | Debrand header |
| `src/lib/recompra.ts` (+ `.test.ts`) | Modified | Repurchase decision logic |
| `src/lib/plate.ts` (+ `.test.ts`) | Modified | Multi-plate parse/validate |
| `src/integrations/supabase/types.ts` | Modified | Regenerate (still has zero satisfaction entries) |
| `integration_configs.config` | Config | Set `survey_stage_id`, add `survey_delivery_enabled` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Survey link sent to the wrong customer (5 conversation leads shared by >1 client) | Med | Delivery refuses when the lead is shared; logs to `integration_logs`; toast to the operator |
| Mass-send to real customers on a bad deploy | Low | `survey_delivery_enabled` defaults `false`; enable only after a single manual end-to-end test |
| `survey_stage_id` still `""` — SalesBot never fires | High | Blocking dependency; delivery hard-fails with a clear error rather than silently no-op |
| `prospect_id` NOT NULL drop is the one non-additive DB step | Med | Rollback script deletes `prospect_id IS NULL` rows first, or refuses; slice 1 ships alone so it can be reverted independently |
| Dealership user enumerating all clients via the new tab | Med | Client list derived from `satisfaction_surveys` (RLS-scoped), never from `clients` |
| No CI, no component tests — UI regressions invisible | High | Manual `npm run build` + `npm run test`; all new logic pushed into `src/lib/` where vitest can reach it |
| `kommo-gac` skill has wrong stage IDs | Med | Read `integration_configs.config.stage_mappings` at runtime; never hardcode from the skill file |

## Rollback Plan

Mandatory per project rules (DB migration + edge-function deploy).

- **Kill switch first.** Set `integration_configs.config.survey_delivery_enabled = false` — one `UPDATE`, no deploy, stops all outbound delivery instantly. Messaging real customers is the only irreversible action in this change.
- **DB**: each migration ships a paired `-- ROLLBACK` block. All changes are additive (nullable columns, new functions, new indexes) except `satisfaction_surveys.prospect_id DROP NOT NULL` + replacing its UNIQUE constraint. Rollback restores the original `trg_create_satisfaction_survey_on_won` body from `20260720120000_satisfaction_surveys.sql:115-134`, then `DELETE FROM satisfaction_surveys WHERE prospect_id IS NULL` before re-adding NOT NULL; if that DELETE would remove responded surveys, the script aborts and the state is escalated instead.
- **Edge functions**: no version pinning exists in this project — git is the only source. Rollback = `git checkout <sha> -- supabase/functions/kommo-api` then `npx supabase functions deploy kommo-api --project-ref wsbuqiznddvxcwvpnbxm --use-api` (add `--no-verify-jwt` for `kommo-webhook`). Current baselines: `kommo-api` v53, `kommo-webhook` v40.
- **Kommo data**: CF `3456839` is empty on all sampled leads today, so a bad write is reverted by PATCHing it back to `""`. Stage toggling is idempotent and leaves leads in their original stage.
- **Frontend**: `git revert`. New storage keys are namespaced (`admin_fleet_plates_dialog`) and safe to leave behind.

## Size Forecast and Delivery

Honest estimate of authored changed lines (`additions + deletions`, excluding generated `types.ts`):

| Slice | Content | Est. lines |
|---|---|---|
| 1 | DB foundation: schema, shared fn, 2 RPCs, trigger rewire, RLS, dup view | ~400 |
| 2 | Kommo delivery action, webhook hook, kill switch, config | ~250 |
| 3 | Fleet plate dialog (admin + dealership), repurchase dialog, `src/lib` + tests | ~450 |
| 4 | Dashboard restructure, filters, deep link, resend, debranding | ~700 |
| | **Total** | **~1,800-2,400** |

- `Decision needed before apply: Yes` (Kommo `survey_stage_id`)
- `Chained PRs recommended: Yes`
- `400-line budget risk: High`

`size:exception` is pre-accepted at 2000 lines, but the forecast sits at or above that ceiling and
spans DB + edge + two portals. **Recommend shipping the 4 slices as a chained PR stack** even so:
each slice has an autonomous scope, its own verification, and its own rollback (slice 1 is the only
non-additive DB step and benefits most from landing alone). Slice 2 is the customer-facing blast
radius and should be merged with the kill switch off.

## Dependencies

- **Blocking**: `integration_configs.config.survey_stage_id` is `""`. The user must confirm which
  Kommo stage fires the survey SalesBot. Recommendation: reuse `104023216` ("En conversación
  Cliente/Empresa", pipeline `13151339`) with the same buffer-toggle trick.
- **User-owned, outside this change**: the SalesBot itself and its API template in Kommo.
- `SUPABASE_ACCESS_TOKEN` in the local session for migrations and deploys.
- Set: `survey_link_field_id = "3456839"`, `survey_base_url = "https://imbmobility.netlify.app"`.

## Success Criteria

- [ ] Moving a prospect to `ganado` (admin, dealership, and Kommo-webhook paths) creates or links exactly one `clients` row and sets `prospects.client_id`; re-running produces no new row.
- [ ] Zero new duplicate `clients.phone` / `IdContactKommo` values after the change; `v_duplicate_clients` count does not grow.
- [ ] A fleet purchase with N plates creates N `vehicles` rows, one client, and exactly one survey.
- [ ] The survey URL appears in Kommo CF `3456839` on the client's conversation lead and the stage toggle fires the SalesBot.
- [ ] Two triggering events for one client within 24h produce one survey; the second records a `suppressed_reason`.
- [ ] Repurchase dialog: "register + survey" sends, "register without survey" does not, X writes nothing.
- [ ] Dashboard chart at `AdminDashboard.tsx:698-706` is gone; Satisfacción tab filters correctly by brand, model, and month.
- [ ] A `concesionario` user sees only their own dealership's surveys and cannot enumerate other clients.
- [ ] `/encuesta/:token` shows no GAC logo and renders correctly for a DFSK and a SHINERAY sale.
- [ ] `npm run build`, `npm run lint`, and `npm run test` all pass.

## Proposal question round

`execution_mode` is `auto`, so these were not asked interactively. Each is a product decision the
proposal assumed — flag any that is wrong before `sdd-spec`.

1. **Rate-limit semantics**: R4 says "one per day", assumed to mean a rolling 24h window keyed on the client, not a calendar day. Correct?
2. **Resend override**: assumed the resend button obeys the same 24h gate with no admin bypass. Should an admin be able to force a resend?
3. **Fleet survey subject**: assumed one survey per fleet purchase covers the whole purchase and the form asks nothing per-vehicle. Confirm the form needs no vehicle context.
4. **Dashboard shape**: R7 says "a new tab at the top of the Dashboard", read literally as making `AdminDashboard` tabbed (`Resumen` | `Satisfacción`) rather than adding a sidebar module. Confirm — a sidebar module is the alternative and changes the permission decision.
5. **Vendedor visibility**: assumed `vendedor` sees only their own surveys and `concesionario` sees their whole dealership, matching existing RLS. Confirm this is the business intent for the new tab.
