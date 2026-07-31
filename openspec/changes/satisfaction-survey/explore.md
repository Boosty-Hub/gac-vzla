# Exploration — satisfaction-survey

Phase: `sdd-explore`
Date: 2026-07-29
Status: partial (live DB verification blocked — `SUPABASE_ACCESS_TOKEN` not set)
Engram topic key: `sdd/satisfaction-survey/explore`

## Purpose

Gap analysis of an existing partial implementation against a 7-point requirement.
This is **not** a greenfield design: significant prior work already exists and must be
extended, not replaced.

## Requirement (source: user, Spanish — translated faithfully)

Implement satisfaction-survey delivery and response collection in the reservation system.

1. The survey is triggered when a lead moves to status "ganado" (won).
2. The survey must be sent 24 hours after being marked "ganado".
3. Provide an own form (outside the CRM) that captures responses and returns them to the reservation system.
4. Generate a unique link per lead/client so the respondent can be identified.
5. Create a new dashboard module/section for customer satisfaction, separate from what already exists.
6. Show results broken down per question/aspect, not only an overall score (e.g. digital attention, delivery times).
7. When moving to "ganado", the salesperson must be required to enter the plate of the sold vehicle.

Note: verify that all data actually lands in a Supabase table.

## Per-requirement status

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Trigger on "ganado" | DONE | `supabase/migrations/20260720120000_satisfaction_surveys.sql:129-134` |
| 2 | Send 24h after "ganado" | PARTIAL | `eligible_at` stored but never read; send is manual and ungated |
| 3 | Public form writing to Supabase | DONE | `src/pages/PublicEncuesta.tsx`, route `/encuesta/:token` |
| 4 | Unique link/token per lead | DONE | `satisfaction_surveys.token` UNIQUE, ~122-bit random |
| 5 | Standalone dashboard module | PARTIAL | No route, no nav entry; embedded as widget + tab |
| 6 | Per-aspect breakdown | DONE | 5 discrete `smallint` columns + `computeAspectAverages` |
| 7 | Plate capture on "ganado" | PARTIAL | Done in UI paths; Kommo webhook path bypasses it |
| 8 | Data lands in Supabase | PARTIAL / BLOCKED | Second migration self-marked "do not apply yet" |

## Detailed findings

### 1. Trigger — DONE

`trg_create_satisfaction_survey_on_won` is an `AFTER UPDATE OF status ON prospects`
trigger with `WHEN (NEW.status = 'ganado' ...)`
(`supabase/migrations/20260720120000_satisfaction_surveys.sql:129-134`).

Because it is a database trigger it fires on **every** write path — the in-system admin
and dealership UIs, and the Kommo webhook alike. This is the correct level to have
placed it.

### 2. The 24-hour delay — PARTIAL, and this is the largest gap

`eligible_at` is computed and stored as `status_updated_at + 24h`
(migration lines 36 and 122), but **no code anywhere reads it**.

There is no scheduling mechanism in the project at all: no `pg_cron`, no `pg_net`, no
Supabase scheduled function, no queue table, no external cron. Confirmed by grepping
every file under `supabase/migrations/` and the 11-function `supabase/functions/` tree.

The only send mechanism is `handleSendSurvey` in
`src/pages/admin/AdminProspectos.tsx:778-839`, which marks the survey `sent` and opens a
`wa.me` deep link **immediately on click**, with zero `eligible_at` gating.
`DealershipProspectos.tsx` has no send UI at all.

Architectural consequence: `window.open('wa.me/...')` requires a human click. A cron job
cannot drive it. Automating the 24h send therefore requires a **new outbound-messaging
dependency** — WhatsApp Business API, Twilio, or email. That is a genuine scope addition,
not wiring, and the proposal must make it an explicit decision.

### 3. Public form — DONE

`src/pages/PublicEncuesta.tsx`, served unauthenticated at `/encuesta/:token`
(`src/App.tsx:71`). It uses `SECURITY DEFINER` RPCs `get_survey_by_token` and
`submit_survey_response`. Responses land in `satisfaction_responses` and flip
`satisfaction_surveys.status`.

### 4. Unique link — DONE, and secure

`satisfaction_surveys.token` is UNIQUE and built from two concatenated
`gen_random_uuid()` values, roughly 122 bits of randomness
(migration lines 31-33). `prospect_id` is a UNIQUE FK, so exactly one survey exists per
prospect. Not guessable — no security concern here.

### 5. Dashboard module — PARTIAL

`SatisfactionOverview.tsx` today renders in two places:

- Embedded compact inside `AdminDashboard.tsx:698-706` — a section, not a route.
- As `TabsTrigger value="satisfaccion"` inside `AdminClientes.tsx:535-539,1364-1366`.

It has **no entry** in `AdminLayout.tsx` `menuItems` (`src/components/layouts/AdminLayout.tsx:43-72`)
nor in `DealershipLayout.tsx` `menuGroups` (`:24-59`). So the requirement's "new
module/section separate from what already exists" is not met: it is currently a widget
and a tab inside existing modules.

Cross-portal note: `AdminClientes` is reused at `/concesionario/clientes`
(`App.tsx:88`), so dealership roles already reach the satisfaction tab, gated only by the
pre-existing `clientes.view` permission. A new dedicated module will need its own
permission decision.

### 6. Per-aspect breakdown — DONE

`satisfaction_responses` stores 5 discrete `smallint` aspect columns.
`src/lib/satisfactionStats.ts` exposes `computeAspectAverages` (unit-tested).
Rendered in `SatisfactionOverview.tsx:132-176`, per client in
`ClientDetailDialog.tsx:290-311`, and exported to PDF.

### 7. Plate capture — PARTIAL

`src/lib/plate.ts` is wired into `updateStatus` / `confirmSoldPlate` in **both**
`AdminProspectos.tsx:635-676` and `DealershipProspectos.tsx:~1090-1132`: a mandatory
dialog whose Confirm button stays disabled until a non-empty plate is entered, then a
single UPDATE writes `status` and `sold_plate` together.

Gap: `supabase/functions/kommo-webhook/index.ts:518-519` writes
`prospects.status = 'ganado'` directly from Kommo stage changes via `reverse_mappings`,
bypassing the dialog entirely. On that path `sold_plate` stays NULL. This needs an
explicit product decision — see Open questions.

### 8. Data landing in Supabase — PARTIAL / BLOCKED

RLS is correctly restrictive: `admin_all` plus a scoped `staff_select`, with all writes
going through `SECURITY DEFINER` RPCs or the trigger.

However `supabase/migrations/20260721130000_satisfaction_low_score_alert.sql:1-27` carries
a header comment stating it must **not** be applied yet, pending review. No later
migration (checked through `20260721140000`) revisits it. Additionally,
`src/integrations/supabase/types.ts` has zero entries for either new table, which
suggests generated types were never refreshed after these migrations.

## Test coverage

Covered by unit tests: `src/lib/satisfaction.test.ts`, `src/lib/satisfactionStats.test.ts`,
`src/lib/plate.test.ts` — solid coverage of the pure logic.

Zero coverage: the SQL trigger and RPC behavior, the manual send button's missing
`eligible_at` gate, the Kommo-webhook plate-capture bypass, and all dashboard wiring.
The project has no component or integration test layer and no CI gate, so all of the
above is manually verifiable only.

## Blocked — needs live DB verification

`SUPABASE_ACCESS_TOKEN` was not set during exploration. The following must be confirmed
against the live database before the proposal is finalized:

```sql
-- Do both satisfaction tables actually exist?
SELECT to_regclass('public.satisfaction_surveys'), to_regclass('public.satisfaction_responses');

-- Are the triggers present and enabled?
SELECT tgname, tgenabled, tgrelid::regclass
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.prospects'::regclass, 'public.satisfaction_responses'::regclass);

-- Backfill check: won prospects without a survey row
SELECT
  (SELECT count(*) FROM prospects WHERE status = 'ganado') AS won_prospects,
  (SELECT count(*) FROM satisfaction_surveys)              AS survey_rows;

-- Does Kommo stage 142 actually map to 'ganado'?
SELECT config->'reverse_mappings' FROM integration_configs;
```

## Risks

- The automated 24h send requires a new outbound-messaging integration not present in this
  codebase. Real scope addition — must be an explicit product decision, not an assumption.
- The low-score alert trigger is explicitly un-applied per its own migration header. If a
  later phase assumes it is live, those notifications silently never fire.
- Kommo-driven "ganado" transitions bypass plate capture, so `sold_plate` is NULL on that
  path. Product decision required.
- No CI gate and no component/integration tests: new scheduling and dashboard work will be
  manually verifiable only.

## Open questions for the proposal phase

1. **24h send channel** — WhatsApp Business API, Twilio, email, or keep it manual with an
   `eligible_at` gate plus a "pending to send" queue view for the salesperson? Cheapest
   correct option is the last one; it needs no new vendor.
2. **Kommo "ganado" without a plate** — block the transition, allow it and flag the
   prospect as needing a plate, or push a required-field back into Kommo?
3. **New module permission** — does the satisfaction module get its own
   `satisfaccion.view` permission, and do dealership roles see only their own dealership's
   responses?

## Next recommended

`sdd-propose` — but resolve the three open questions above first; each materially changes
the design.
