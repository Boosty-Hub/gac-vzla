# Design: Satisfaction Survey — won-prospect to client, Kommo delivery, dashboard

Phase: `sdd-design` | Contract: `proposal.md` (8 forks, approved) + `requirements.md` (R1-R12)

> Size note: the skill's 800-word budget is deliberately exceeded. The orchestrator requires exact
> migration SQL and seven concrete subsystem contracts; compressing them would push load-bearing
> detail (the `ON CONFLICT` breakage, the buffer-stage selection rule) into `sdd-apply` guesswork.

## Technical Approach

One write path per concern, enforced in the database. Identity resolution and the 24h gate live in
two `SECURITY DEFINER` functions that every caller — the `ganado` trigger, both RPCs, the Kommo
webhook — must pass through. Kommo I/O stays in `kommo-api` because Postgres has no `pg_net`.
The UI never composes these steps itself: it calls one RPC (atomic) then one edge action.

Delivery order per `requirements-gac`: DB → edge → capture UX → dashboard, sliced 1-4 as forecast.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D1 | Two shared functions: `fn_resolve_or_create_client_for_prospect` (identity) and `fn_claim_survey_slot` (24h gate, holds the row lock) | One mega-function | Repurchase has no prospect but still needs the gate. Splitting keeps each concern single-implementation without forcing a fake prospect id. |
| D2 | `client_id` is set by a **new BEFORE trigger**, not by an UPDATE inside the existing AFTER trigger | AFTER trigger issuing a second `UPDATE prospects` | A self-UPDATE from an AFTER trigger re-enters the prospect trigger stack. `BEFORE UPDATE OF status` assigns `NEW.client_id` in place, so the AFTER survey trigger already sees it in the same statement. Zero recursion surface. |
| D3 | Rate-limit suppression is recorded via `suppressed_reason IS NOT NULL`; the `status` CHECK is **not** touched | Adding `status='suppressed'` | `computeFunnel` (`src/lib/satisfactionStats.ts:85-93`) counts `pending/sent/responded`; a new status silently corrupts the response rate. A nullable column adds no constraint churn and no frontend break. |
| D4 | Delivery writes **only** CF `3456839`; it does NOT write empty strings to clear other fields | Mirroring `notify_dealership_reservation` byte-for-byte | The clear-on-empty behavior at `kommo-api:1815-1827` is correct there because the notification lead is disposable and per-dealership. The client conversation lead is shared with reservations, broadcasts and real chat history. Clearing it would destroy live CRM data. This is the one intentional divergence from the mirrored pattern. |
| D5 | Webhook `ganado` does not block on a missing plate; it creates client + survey and delivers, and the prospect surfaces in a derived "Falta placa" state | Block the transition; push a required field into Kommo | Kommo is already the source of truth for that stage — blocking creates permanent CRM/DB divergence. R12 invariant 1 admits no exceptions. The survey measures the sales experience, not the vehicle, so gating it on a plate would kill the survey on the majority path. |
| D6 | Satisfaction client list derived from `satisfaction_surveys`; `clients` is never queried for the list | `from('clients')` + client-side filter | `clients` has no `dealership_id` and no scoping policy for staff; a dealership user would enumerate all 1367 rows. `satisfaction_surveys` RLS (`20260720120000:89-92`) already scopes by `dealership_id`/`salesperson`, and `client_phone` is on the row, so no `clients` read is needed at all. |
| D7 | Brand/model filters resolve through `satisfaction_surveys.vehicle_id → vehicles.model_id → vehicle_models`, filtered **client-side** | PostgREST nested filter on the embedded join | A 2-level embedded filter requires `!inner`, which silently drops every survey with no vehicle — exactly the legacy rows. Set size is tiny (14 today) and in-memory filtering is this project's dominant pattern (`AdminVehiculos.tsx:159`). |
| D8 | `SatisfactionOverview` gains an **optional** `surveys` prop; it keeps its own fetch when the prop is absent | Rewrite it to be fully controlled | `AdminClientes.tsx:1364-1366` renders it uncontrolled today. An optional prop makes the dashboard filter-driven with a near-zero-risk diff to the existing tab. |

## Data Flow

```
 Admin/Dealership UI ─ rpc register_won_prospect(prospect, vehicles[], is_fleet)
   │                        │  (one txn)
   │                        ├─ UPDATE prospects SET status/sold_plate/is_fleet
   │                        │    ├─ BEFORE trg_link_client_on_won ─→ fn_resolve_or_create_client_for_prospect
   │                        │    │                                     (cedula → phone → email → INSERT)
   │                        │    └─ AFTER  trg_create_satisfaction_survey_on_won ─→ fn_claim_survey_slot
   │                        │                                           (SELECT clients FOR UPDATE + 24h window)
   │                        └─ INSERT vehicles × N (fleet)
   └─ invoke kommo-api { action:'deliver_satisfaction_survey', prospect_id }
                              │
 Kommo webhook (ganado) ──────┤
   (kommo-webhook:518-519)    │
                              ▼
              kill switch → stage-id guard → shared-lead guard
                → syncOneClientToConversation (dedup, self-skips)
                → PATCH lead CF 3456839 = {base}/encuesta/{token}
                → PATCH status_id = buffer → PATCH status_id = survey_stage_id
                → mark_survey_sent + integration_logs
                                       │
                                  SalesBot (user-owned) ─ 24h ─→ customer
                                       │
                     /encuesta/:token ─→ submit_survey_response ─→ satisfaction_responses
                                       │
                     Dashboard ▸ Satisfacción ◂ (RLS-scoped read)
```

## 1. Migration SQL

Two files. Slice 1 ships alone (it holds the only non-additive step).

### `supabase/migrations/20260729120000_satisfaction_prospect_to_client.sql`

```sql
-- Defensive: `prospects.cedula` is read by kommo-api:517 but predates this migrations
-- folder. No-op when present; makes the dedup function safe either way.
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS cedula text;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_client_id ON public.prospects(client_id);

ALTER TABLE public.satisfaction_surveys
  ADD COLUMN IF NOT EXISTS client_id         uuid REFERENCES public.clients(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id        uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin            text NOT NULL DEFAULT 'won',
  ADD COLUMN IF NOT EXISTS suppressed_reason text,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz;

ALTER TABLE public.satisfaction_surveys DROP CONSTRAINT IF EXISTS satisfaction_surveys_origin_check;
ALTER TABLE public.satisfaction_surveys ADD CONSTRAINT satisfaction_surveys_origin_check
  CHECK (origin IN ('won','repurchase'));

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_client
  ON public.satisfaction_surveys(client_id, created_at DESC);

-- ── THE ONE NON-ADDITIVE STEP ────────────────────────────────────────────────
ALTER TABLE public.satisfaction_surveys ALTER COLUMN prospect_id DROP NOT NULL;
ALTER TABLE public.satisfaction_surveys DROP CONSTRAINT IF EXISTS satisfaction_surveys_prospect_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_satisfaction_surveys_prospect
  ON public.satisfaction_surveys(prospect_id) WHERE prospect_id IS NOT NULL;
```

> **Load-bearing consequence — must not be missed.** Dropping the UNIQUE *constraint* for a
> *partial* unique index breaks every `ON CONFLICT (prospect_id) DO NOTHING` in the codebase:
> `create_satisfaction_survey_on_won` (`20260720120000:124`) and `backfill_satisfaction_surveys`
> (`:238`). Both MUST be recreated **in this same migration** with the predicate spelled out:
> `ON CONFLICT (prospect_id) WHERE prospect_id IS NOT NULL DO NOTHING`. Omitting it produces a
> runtime `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification`
> on the very next win.

### Rollback block (paired, same file, commented `-- ROLLBACK`)

```sql
DO $$
DECLARE v_orphans int; v_responded int;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.satisfaction_surveys WHERE prospect_id IS NULL;
  SELECT count(*) INTO v_responded
    FROM public.satisfaction_surveys s
    WHERE s.prospect_id IS NULL
      AND (s.status = 'responded'
           OR EXISTS (SELECT 1 FROM public.satisfaction_responses r WHERE r.survey_id = s.id));
  IF v_responded > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK ABORTED: % of % prospect_id IS NULL surveys carry customer responses. Escalate; do not delete.',
      v_responded, v_orphans;
  END IF;
  DELETE FROM public.satisfaction_surveys WHERE prospect_id IS NULL;
END $$;

DROP INDEX IF EXISTS public.uq_satisfaction_surveys_prospect;
ALTER TABLE public.satisfaction_surveys ADD CONSTRAINT satisfaction_surveys_prospect_id_key UNIQUE (prospect_id);
ALTER TABLE public.satisfaction_surveys ALTER COLUMN prospect_id SET NOT NULL;
DROP TRIGGER IF EXISTS trg_link_client_on_won ON public.prospects;
-- then restore create_satisfaction_survey_on_won verbatim from 20260720120000:114-134
```

### `v_duplicate_clients`

```sql
CREATE OR REPLACE VIEW public.v_duplicate_clients AS
WITH k AS (
  SELECT 'IdContactKommo'::text AS dup_key, nullif(trim(c."IdContactKommo"),'') AS dup_value,
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE nullif(trim(c."IdContactKommo"),'') IS NOT NULL
  UNION ALL
  SELECT 'phone', right(regexp_replace(coalesce(c.phone,''),'\D','','g'),10),
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE length(regexp_replace(coalesce(c.phone,''),'\D','','g')) >= 10
  UNION ALL
  SELECT 'kommo_conversation_lead_id', c.kommo_conversation_lead_id::text,
         c.id, c.full_name, c.phone, c.cedula, c.kommo_conversation_lead_id, c.created_at
    FROM public.clients c WHERE c.kommo_conversation_lead_id IS NOT NULL
)
SELECT * FROM (
  SELECT k.*, count(*) OVER (PARTITION BY k.dup_key, k.dup_value) AS dup_count FROM k
) x WHERE x.dup_count > 1
ORDER BY dup_key, dup_value, created_at;

ALTER VIEW public.v_duplicate_clients SET (security_invoker = on);
REVOKE ALL ON public.v_duplicate_clients FROM anon, authenticated;
```

No `GRANT` to `authenticated`: this is a maintainer worklist for the follow-up merge change, read via
the Management API / service role. Least privilege, zero cost. Expected today: 60 + 62 + 5 groups.

### `supabase/migrations/20260729120100_satisfaction_delivery_config.sql` (slice 2, data only)

```sql
UPDATE public.integration_configs
   SET config = config
     || jsonb_build_object('survey_delivery_enabled', false)
     || jsonb_build_object('survey_stage_id', coalesce(nullif(config->>'survey_stage_id',''), '104023216'))
 WHERE integration_name = 'kommo';
-- ROLLBACK: UPDATE ... SET config = config || '{"survey_delivery_enabled": false}'::jsonb;
```

## 2. `fn_resolve_or_create_client_for_prospect` + `fn_claim_survey_slot`

```sql
CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_client_for_prospect(p_prospect_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE p record; v_client_id uuid; v_phone10 text;
BEGIN
  SELECT * INTO p FROM public.prospects WHERE id = p_prospect_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'prospect_not_found'; END IF;
  IF p.client_id IS NOT NULL THEN RETURN p.client_id; END IF;      -- 0) idempotent fast path

  v_phone10 := right(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), 10);

  -- 1) cedula  2) phone (last 10 digits)  3) email — MIRRORS findExistingContact
  --    (kommo-api:593-604, CI-RIF -> phone -> email) so DB and Kommo agree on identity.
  --    ORDER BY created_at: when the 62/60 existing duplicates match, always bind to the
  --    OLDEST row so this path is deterministic and never mints a third duplicate.
  SELECT c.id INTO v_client_id FROM public.clients c
   WHERE nullif(trim(p.cedula),'') IS NOT NULL
     AND upper(trim(c.cedula)) = upper(trim(p.cedula))
   ORDER BY c.created_at LIMIT 1;

  IF v_client_id IS NULL AND length(v_phone10) = 10 THEN
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 10) = v_phone10
     ORDER BY c.created_at LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND nullif(trim(p.email),'') IS NOT NULL THEN
    SELECT c.id INTO v_client_id FROM public.clients c
     WHERE lower(trim(c.email)) = lower(trim(p.email))
     ORDER BY c.created_at LIMIT 1;
  END IF;

  -- Name is DELIBERATELY NOT a dedup key: 7 duplicate full_names, free text, unsafe.
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, cedula, phone, email, state, is_active)
    VALUES (coalesce(nullif(trim(p.name),''), 'Cliente'), nullif(trim(p.cedula),''),
            nullif(trim(p.phone),''), nullif(trim(p.email),''),
            nullif(trim(p."Estado de Vnzla"),''), true)
    RETURNING id INTO v_client_id;
  END IF;

  RETURN v_client_id;
END; $$;
```

```sql
-- Rolling 24h gate. Serialized by a row lock on `clients`: concurrent triggering events for
-- the same client queue behind each other, so the second one sees the first's committed row.
-- Postgres cannot express a rolling window as a constraint, and a calendar-day unique index
-- is both too strict and too loose (23:00 + 01:00 = 2 surveys in 2h).
CREATE OR REPLACE FUNCTION public.fn_claim_survey_slot(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_lock uuid; v_recent int;
BEGIN
  IF p_client_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_lock FROM public.clients WHERE id = p_client_id FOR UPDATE;  -- serialize
  IF v_lock IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_recent
    FROM public.satisfaction_surveys s
   WHERE s.client_id = p_client_id
     AND s.suppressed_reason IS NULL
     AND s.created_at > now() - interval '24 hours';
  IF v_recent > 0 THEN RETURN 'rate_limited_24h'; END IF;
  RETURN NULL;
END; $$;
```

Callers: the AFTER trigger, `register_won_prospect`, `register_client_repurchase`. `deliver_…`
(resend) does not re-claim — it reuses the existing token and refuses when the row is suppressed.

`register_won_prospect(p_prospect_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_is_fleet boolean DEFAULT false)`
→ `TABLE(client_id uuid, survey_id uuid, survey_token text, suppressed_reason text, vehicles_created int)`.
It performs the `UPDATE prospects SET status='ganado', sold_plate=<first plate>, is_fleet=…` so both
triggers fire inside the same transaction, then inserts the remaining `vehicles` rows and stamps
`satisfaction_surveys.vehicle_id`. Authorization mirrors `mark_survey_sent` (`20260720120000:206-210`).

**REVISED — supersedes the earlier `p_plates text[] … p_model_id uuid` signature.** That version was
unusable: it applied ONE `model_id` to every plate in the batch and had no source for `year` at all,
while `public.vehicles.model_id` and `public.vehicles.year` are both **NOT NULL**. Prospects carry
neither — only free-text `model_interest`, which exact-matches `vehicle_models.name` in **0 of 2929**
rows (79.1% after normalization). Fuzzy mapping was refused because `vehicles` feeds the warranty
module. The salesperson now supplies model and year explicitly, per vehicle, in the plate dialog.

`p_vehicles` is a jsonb array of `{"plate": text, "model_id": uuid, "year": int}`. Validation is a
single all-or-nothing pass over the whole array before any write: rejects a missing/blank `plate`,
`model_id` or `year`, a malformed uuid/int, a `model_id` absent from `public.vehicle_models`, and a
`year` outside `[1980, extract(year from now())::int + 2]`.

`register_client_repurchase(p_client_id uuid, p_vehicles jsonb DEFAULT '[]'::jsonb, p_send_survey boolean DEFAULT true, p_dealership_id uuid DEFAULT NULL)`
→ `TABLE(vehicles_created int, survey_id uuid, survey_token text, suppressed_reason text)`.
Same element shape and same validation pass, for symmetry — its earlier `p_plates text[]` +
shared `p_model_id`/`p_year` form had the identical NOT NULL exposure.

## 3. `kommo-api` action `deliver_satisfaction_survey`

Request: `{ action:'deliver_satisfaction_survey', client_id? , prospect_id?, survey_id?, reason?:'won'|'repurchase'|'resend' }` — exactly one identifier required.
Response `200`: `{ delivered:boolean, skipped?:string, survey_id, client_id, lead_id, token }`.

Authorization: falls through to the existing staff gate (`kommo-api:972-977`). **Not** added to
`SUPERADMIN_ACTIONS`. `kommo-webhook` calls it with the service key → `isServiceCall` → trusted
(`kommo-api:918-926`); no new auth surface.

Ordered steps:

1. Read `survey_delivery_enabled`, `survey_link_field_id`, `survey_base_url`, `survey_stage_id`
   from `config` (already loaded at `:992`). Never hardcode; the `kommo-gac` skill file is stale.
2. Kill switch off → `200 { delivered:false, skipped:'disabled' }`. Not an error; UI stays quiet.
3. **Hard fail** when `survey_stage_id` is `""`/absent, or `survey_link_field_id`/`survey_base_url`
   are empty: `throw new Error('survey_stage_id_not_configured')` → `400` with that message, logged
   to `integration_logs`. Silently no-oping would make the SalesBot never fire with a green UI.
4. Resolve the survey by **reading the `satisfaction_surveys` row directly**: `survey_id` → direct;
   `prospect_id` → the survey already anchored to that prospect; `client_id` → newest survey with
   `suppressed_reason IS NULL`. Priority `survey_id` > `prospect_id` > `client_id`.

   **CORRECTED.** This step previously read `prospect_id` → `rpc('register_won_prospect')`
   (idempotent). That is a design error and was correctly refused at implementation time. Two
   independent reasons: (a) `register_won_prospect` validates a **non-empty** `p_vehicles` and raises
   `at_least_one_vehicle_required`, but this action has no vehicle array — so the Kommo webhook path
   would fail every time, violating **D5** ("must not block on a missing plate"); (b) on the UI path
   the caller has already invoked it with real vehicles moments earlier, so re-invoking is redundant.
   No RPC call is needed at all: the survey row already exists, created by the trigger pair inside the
   same transaction that flipped `prospects.status`.
5. `suppressed_reason IS NOT NULL` → `200 { delivered:false, skipped:'rate_limited_24h' }`.
6. **Shared-lead guard** — the only way this change can harm a real customer:
   ```ts
   const { data: sharers } = await supabase.from('clients')
     .select('id').eq('kommo_conversation_lead_id', leadId)
   if ((sharers?.length ?? 0) > 1) {            // 5 such leads exist today
     await log('survey_delivery_shared_lead', 'warning', { client_id, lead_id: leadId,
                                                           client_ids: sharers.map(s => s.id) })
     return json({ delivered:false, skipped:'shared_conversation_lead' })   // writes NOTHING
   }
   ```
7. No `kommo_conversation_lead_id` → `syncOneClientToConversation(supabase, baseUrl, authHeaders, cl)`
   (`kommo-api:653`) — reused verbatim: it self-skips when set, dedups CI-RIF→phone→email, and links
   an existing pipeline lead instead of creating a second. Re-read; still null → throw. Then re-run
   step 6 against the freshly linked lead.
8. `const url = \`${String(survey_base_url).replace(/\/+$/,'')}/encuesta/${survey.token}\``
9. `PATCH /leads/{leadId}` with **only** `custom_fields_values:[{ field_id: Number(survey_link_field_id), values:[{ value: url }] }]`. Per D4: no clear-on-empty sweep, no name patch, no other CF.
10. Stage toggle (the mechanism that wakes the bot — `kommo-api:1877-1885`):
    ```ts
    const target = Number(survey_stage_id)
    const buffer = target === CONVERSATION_STAGE ? POSTVENTA_STATUS_TO_STAGE.pendiente : CONVERSATION_STAGE
    await patch({ status_id: buffer }); await patch({ status_id: target })
    ```
    The buffer must differ from the target or the "entered stage" event never fires. With the
    recommended `survey_stage_id = 104023216` the lead ends exactly where it started — the reason
    that value is recommended over inventing a new stage.
11. `rpc('mark_survey_sent', { p_survey_id })` + `update satisfaction_surveys set delivered_at = now()`;
    `integration_logs` row `survey_delivery` with `{ client_id, survey_id, lead_id, reason }`.

Steps 9-11 are not transactional across Kommo and Postgres. Retry is safe: the CF write is
idempotent, the toggle is idempotent, `mark_survey_sent` refuses to downgrade a responded survey.

## 4. Kommo-webhook `ganado` path (`kommo-webhook/index.ts:518-519`)

That UPDATE writes only `status`, so the new BEFORE and existing AFTER triggers both fire — the
client and the survey row are created without any webhook change. Two additions (~30 lines), placed
immediately after the existing `integration_logs` insert at `:520-525`:

```ts
if (ourStatus === 'ganado') {
  // Plate is NOT capturable here (no plate CF on Ventas leads) and MUST NOT block:
  // Kommo already moved the lead, so refusing would permanently desync CRM and DB.
  await supabase.from('integration_logs').insert({
    integration_name: 'kommo', event_type: 'webhook_won_needs_plate',
    prospect_id: prospect.id, kommo_lead_id: parseInt(statusLeadId),
    status: 'warning', details: { reason: 'sold_plate not captured on webhook path' },
  })
  await supabase.functions.invoke('kommo-api', {
    body: { action: 'deliver_satisfaction_survey', prospect_id: prospect.id, reason: 'won' },
    headers: { Authorization: `Bearer ${serviceKey}` },   // sb_secret_* is not auto-attached
  }).catch(e => console.error('survey delivery', e))   // fire-and-forget, never 500 the webhook
}
```

**CORRECTED placement.** The snippet above reads as if the `if (ourStatus === 'ganado')` block sits
*after* the status-change guard closes. It must be **nested inside**
`if (ourStatus && prospect.status !== ourStatus)`. Unconditional placement would re-invoke delivery on
every Kommo webhook **retry** for a lead already at `ganado` — re-PATCHing the custom field, re-toggling
the stage and re-waking the SalesBot each time — because `deliver_satisfaction_survey` has no
"already delivered" gate beyond the 24h slot claimed once at survey creation, and resend deliberately
does not re-claim. Nesting it inside the status-CHANGE guard makes delivery fire exactly once per
genuine transition: a retry finds `prospect.status` already equal to `ourStatus` and never re-enters.

**Auth.** The call needs an explicit `Authorization: Bearer <service key>`; supabase-js does not put
`sb_secret_*` keys into the header on its own. This mirrors `kommo-api`'s own self-invocation pattern
(`:1509`, `:1676`, `:1978`) and satisfies its `isServiceCall` trusted-caller gate (`:918-926`).
Key resolution: `Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

The "needs plate" state is **derived, not stored**: `status='ganado' AND sold_plate IS NULL`. No new
column. Both Prospectos tables gain a "Falta placa" filter chip whose row action reopens the existing
plate dialog; confirming it calls `register_won_prospect` again (idempotent), which creates the
`vehicles` row and backfills `satisfaction_surveys.vehicle_id`. Until then `vehicle_id` stays NULL —
no `vehicles` row is created without a plate, because plate is that registry's identity key.

## 5. Satisfacción dashboard

```
AdminDashboard.tsx
└── Tabs defaultValue="resumen"                                    ← NEW wrapper
    ├── TabsContent "resumen"      → existing body, chart at :698-706 DELETED
    └── TabsContent "satisfaccion" → <SatisfactionDashboard />      ← NEW
         ├── <SatisfactionFilters brand|model|month />              ← NEW
         ├── <SatisfactionOverview compact surveys={filtered} />    ← REUSED, +optional prop (D8)
         └── <SatisfactionClientList rows={filtered} />             ← NEW: name, phone, plate,
                                                                       score, resend, deep link
```

Single fetch, owned by `SatisfactionDashboard`, RLS-scoped, no `clients` table read (D6):

```ts
(supabase as any).from('satisfaction_surveys').select(
  'id, client_id, client_name, client_phone, sold_plate, status, origin, suppressed_reason,' +
  'created_at, responded_at, dealership_id, salesperson, dealerships(name),' +
  'vehicles(plate, vehicle_models(brand, name)),' +
  'response:satisfaction_responses(*)'
).order('created_at', { ascending: false })
```

Deep-link contract (works for `/admin/clientes` and the reused `/concesionario/clientes`):
`…/clientes?client={client_id}&tab=satisfaccion`. `AdminClientes` reads `useSearchParams()`, fetches
that one client by id, opens `ClientDetailDialog` with a new `defaultTab='encuesta'` prop, and clears
the params with `setSearchParams({}, { replace: true })` on close so back-nav does not reopen it.
Rows with `client_id IS NULL` (the 14 legacy surveys) render normally but are not clickable.

`ClientDetailDialog`'s survey lookup gains `.eq('client_id', client.id)` as step 0; the existing
plate → phone → name cascade (`:90-137`) stays as the legacy fallback. Resend button →
`invoke('kommo-api', { action:'deliver_satisfaction_survey', client_id, reason:'resend' })`.

## 6. Filters — exact backing join per filter

| Filter | Source of truth | Fallback when `vehicle_id IS NULL` |
|---|---|---|
| **Brand** | `satisfaction_surveys.vehicle_id → vehicles.model_id → vehicle_models.brand` | `"Sin marca"` — a real, selectable facet |
| **Model** | same join, `vehicle_models.name` | `"Sin modelo"` — same treatment |
| **Month** | `to_char(satisfaction_surveys.created_at,'YYYY-MM')` | n/a |

**CHANGED from the `MARCA (estimada)` fallback originally specified here.** The shipped
implementation does **not** estimate brand or model from `prospects.model_interest`; vehicle-less
rows resolve to `"Sin marca"` / `"Sin modelo"` and stay filterable under those buckets.

Reasoning: `model_interest` is free text that exact-matches `vehicle_models.name` in **0 of 2929**
rows. The user called the brand filter "muy importante" — it is a number decisions get made from, so
a guess inside it is worse than an honest gap, even labelled "(estimada)". The same reasoning already
banned fuzzy model mapping on the write path; a read path feeding management metrics deserves it too.

Blast radius is near zero anyway: only pre-implementation surveys lack a vehicle (14 surveys, 1
answered), and R11 makes the change forward-only. Pinned by
`satisfactionDashboardUtils.test.ts`, which asserts a `model_interest`-shaped field on a vehicle-less
row is ignored rather than used as an estimate.

Brand and model come from the **sold** vehicle, never from `prospect_vehicles` or `model_interest`
as a primary source — those record *interest* at capture time and routinely differ from what was
bought. `vehicle_models` is not queried for the option lists either: facets are derived from the
fetched rows, so the dropdowns only ever offer values that have surveys behind them.

Month keys on `created_at` (≈ win date), not `responded_at`: 93% of surveys have no `responded_at`,
so keying on it would hide every pending survey and make the response-rate KPI meaningless.

All three filters are applied in memory (D7) by pure helpers in a new `src/lib/satisfactionFilters.ts`.

## 7. Repurchase dialog + `register_client_repurchase`

Entry point: `ClientDetailDialog` → Vehículos tab (`:237-264`, which has **no** add button today) →
new `Agregar vehículo`, gated by `hasPermission('vehiculos.create')`. Opens
`src/components/clients/RepurchaseDialog.tsx`, whose copy states verbatim that a new vehicle is being
registered for this client and that a survey will therefore be sent. Exactly three outcomes (R6):

| Control | Effect |
|---|---|
| `Registrar y enviar encuesta` | RPC with `p_send_survey := true`, then `deliver_satisfaction_survey({client_id, reason:'repurchase'})` |
| `Registrar sin enviar encuesta` | Same RPC, `p_send_survey := false`. No edge call, no survey row |
| `X` (DialogClose) | Writes nothing |

```sql
CREATE OR REPLACE FUNCTION public.register_client_repurchase(
  p_client_id     uuid,
  p_plates        text[],
  p_model_id      uuid    DEFAULT NULL,
  p_send_survey   boolean DEFAULT true,
  p_year          int     DEFAULT NULL,
  p_dealership_id uuid    DEFAULT NULL
) RETURNS TABLE (vehicles_created int, survey_id uuid, survey_token text, suppressed_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';
```

Body, one transaction: authorize (same predicate as `mark_survey_sent`) → normalize/dedupe plates,
skipping any already on that client → `INSERT INTO vehicles (client_id, model_id, plate, year)` per
new plate → if `p_send_survey`, `fn_claim_survey_slot(p_client_id)` then `INSERT satisfaction_surveys`
with `prospect_id = NULL`, `origin='repurchase'`, `client_id`, `vehicle_id` = first new vehicle,
`client_name`/`client_phone` snapshotted from `clients`, `eligible_at = now()`, `suppressed_reason`
from the claim. `prospect_id = NULL` is exactly why the partial unique index is required.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/20260729120000_satisfaction_prospect_to_client.sql` | Create | Schema, 2 shared fns, 2 RPCs, BEFORE trigger, AFTER trigger rewire (+`ON CONFLICT` predicate fix), `backfill_satisfaction_surveys` fix, `v_duplicate_clients`, grants |
| `supabase/migrations/20260729120100_satisfaction_delivery_config.sql` | Create | `survey_delivery_enabled=false`, `survey_stage_id` |
| `supabase/functions/kommo-api/index.ts` | Modify | `deliver_satisfaction_survey` action (~180 lines) after `sync_client` (`:2024`) |
| `supabase/functions/kommo-webhook/index.ts` | Modify | `ganado` hook after `:525` (~30 lines) |
| `src/pages/admin/AdminProspectos.tsx` | Modify | Fleet checkbox + multi-plate dialog; `confirmSoldPlate` → RPC + delivery; "Falta placa" chip; delete `handleSendSurvey`'s `wa.me` path (`:778-839`) in favor of the action |
| `src/pages/dealership/DealershipProspectos.tsx` | Modify | Same, mirrored (`:~1090-1132`) |
| `src/pages/admin/AdminDashboard.tsx` | Modify | Delete `:698-706`; wrap in `Tabs` |
| `src/components/satisfaction/SatisfactionDashboard.tsx` | Create | Fetch + compose |
| `src/components/satisfaction/SatisfactionFilters.tsx` | Create | Brand / model / month |
| `src/components/satisfaction/SatisfactionClientList.tsx` | Create | Client rows, phone, resend, deep link |
| `src/components/satisfaction/SatisfactionOverview.tsx` | Modify | Optional `surveys` prop (D8) |
| `src/components/clients/ClientDetailDialog.tsx` | Modify | `defaultTab` prop, `client_id` lookup step 0, add-vehicle button, resend |
| `src/components/clients/RepurchaseDialog.tsx` | Create | Three-outcome dialog |
| `src/pages/admin/AdminClientes.tsx` | Modify | `useSearchParams` deep link (`:535-539`) |
| `src/pages/PublicEncuesta.tsx` | Modify | Replace `gac-logo.png` `<img>` (`:141`) with typographic header + optional brand text |
| `src/lib/plate.ts` (+`.test.ts`) | Modify | `parseSoldPlates`, `isValidPlateList` |
| `src/lib/recompra.ts` (+`.test.ts`) | Modify | `resolveRepurchaseOutcome`, `describeRepurchase`; keep `isRecurrentClient` |
| `src/lib/satisfactionFilters.ts` (+`.test.ts`) | Create | `filterSurveys`, `deriveBrandFacets`, `deriveMonthOptions`, `groupSurveysByClient`, `surveyBrandModel` |
| `src/integrations/supabase/types.ts` | Modify | Regenerate (still has zero satisfaction entries) |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `parseSoldPlates` (dedupe, separators, empty), `resolveRepurchaseOutcome`, `filterSurveys` / `deriveBrandFacets` / `deriveMonthOptions` / `surveyBrandModel` (vehicle → fallback → unknown) | Vitest in `src/lib/`, the only layer this project has |
| SQL | Idempotency (2× win → 1 client), dedup order, 24h gate under concurrency, partial-index `ON CONFLICT` | No harness exists. `sdd-verify` runs a documented manual script against a scratch prospect via the Management API |
| Edge | Kill switch, empty `survey_stage_id` hard fail, shared-lead refusal | One manual end-to-end send against a single test client with the kill switch on |
| Integration / E2E | — | Not available (`openspec/project.md`); stated honestly, not faked |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. The genuine blast radius here is *outbound customer messaging*, which
is not a threat-matrix category; it is controlled by three explicit gates instead: the
`survey_delivery_enabled` kill switch (default `false`), the shared-conversation-lead refusal, and
the 24h claim.

## Migration / Rollout

1. Slice 1 alone (holds the non-additive step, independently revertible).
2. Slice 2 merged with `survey_delivery_enabled = false`. Enable only after one manual end-to-end send.
3. Slices 3-4 are additive UI.
4. Kill switch first in any incident: one `UPDATE`, no deploy. Edge rollback = `git checkout <sha> -- supabase/functions/kommo-api` + redeploy (baselines `kommo-api` v53, `kommo-webhook` v40).

## Open Questions

- [ ] **BLOCKING** — `survey_stage_id` is `""`. Recommend `104023216` (buffer becomes `pendiente`, lead ends where it started). Delivery hard-fails until set.
- [ ] `prospects.cedula` is read at `kommo-api:517` but is absent from `supabase/migrations/`. The `ADD COLUMN IF NOT EXISTS` guard makes the design safe either way; confirm during apply.
- [ ] Month filter keys on `created_at`, not `responded_at` (rationale above). Confirm this matches the business reading of "month".
- [ ] Fleet: `satisfaction_surveys.vehicle_id` points at the *first* plate only. Accepted — one survey per purchase (R5), vehicle context is display-only.
