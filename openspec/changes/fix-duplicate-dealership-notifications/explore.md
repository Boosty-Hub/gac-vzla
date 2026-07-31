# Exploration — fix-duplicate-dealership-notifications

Phase: `sdd-explore`
Date: 2026-07-29 (confirmation SQL run 2026-07-31)
Status: **done — root cause CONFIRMED against production. See "Confirmed verdict" below.**
Engram topic key: `sdd/fix-duplicate-dealership-notifications/explore`

> **The reported bug does not exist as reported.** The notifications are not duplicated.
> Every ranked candidate below was ruled out by live data. The real defect is a status
> ping-pong that produces two *legitimate, distinct* notifications seconds apart.
> Read the "Confirmed verdict" section before acting on anything above it.

## Bug report (source: user, Spanish)

"Las notificaciones de concesionario se están duplicando. Verificar. Me pasó con GAC EL TIGRE."

Dealership notifications are duplicating; observed with the dealership **GAC EL TIGRE**.
That is the entire reproduction detail available.

## Ranked root causes

| Rank | Mechanism | Verdict | Key evidence |
|---|---|---|---|
| 1 | Kommo webhook redelivery race; no unique constraint on `kommo_lead_id` | LIKELY | `supabase/functions/kommo-webhook/index.ts:1050-1068` (prospects), `:833-852` (reservations) |
| 2 | Missing id-dedup in realtime INSERT handler, aggravated by AuthContext churn | LIKELY | `src/hooks/useNotifications.ts:102`, `src/contexts/AuthContext.tsx:233-244` |
| 3 | Duplicate `dealerships` rows for "GAC EL TIGRE" + multi-linked `dealership_users` | POSSIBLE (needs live DB) | `kommo-webhook/index.ts:316-374`, `src/hooks/useDealershipAccess.ts:59-73` |
| 4 | Admin fan-out — one row per admin/superadmin | NOTED, not this bug | `20260703140000_2b_part1_rpcs_and_helpers.sql:182-191` |
| 5 | `salespersons` join fan-out multiplying trigger inserts | RULED OUT | triggers use `SELECT ... INTO ... LIMIT 1` |
| 6 | React 18 StrictMode double-invoke | RULED OUT | `src/main.tsx` has no `<StrictMode>` |
| 7 | Duplicate trigger definitions | RULED OUT | each `CREATE TRIGGER` appears exactly once |
| 8 | `NotificationCenter` double-mounted | RULED OUT | one instance each in `AdminLayout.tsx:205`, `DealershipLayout.tsx:188`, never simultaneous |

## Candidate 1 — Kommo webhook redelivery race (most likely)

`autoCreateProspectFromKommo` and `autoCreateReservationFromKommo` perform a
check-then-insert: they look up whether a row with this `kommo_lead_id` already exists,
then insert if not. There is **no unique constraint anywhere** on
`prospects.kommo_lead_id` or `reservations.kommo_lead_id` — confirmed by grepping every
migration for `UNIQUE` and `CREATE UNIQUE INDEX`.
`supabase/migrations/20260420000001_kommo_integration.sql:2` adds the column as a plain
`ADD COLUMN`.

The webhook acknowledges only **after** full processing — fetch lead, fetch contact, fetch
company, insert, PATCH back to Kommo, all sequential and awaited before
`return new Response('OK', {status:200})` (`kommo-webhook/index.ts:407-571`). There is no
processed-event ledger keyed by a Kommo event id. So a slow ack invites a Kommo retry, and
two overlapping deliveries can both pass the existence check and both insert. Each insert
independently fires the `AFTER INSERT` notify trigger
(`supabase/migrations/20260314054951_*.sql:104-118`), producing two near-identical
notification rows for the same `recipient_dealership_id`.

Telling detail: **this exact race class is already patched in the outbound direction** —
`supabase/functions/kommo-api/index.ts:1288-1330` guards `create_reservation` with
`if (res.kommo_lead_id) return already_existed`. No equivalent guard exists on the inbound
webhook path.

Not verifiable from this repo: Kommo's actual retry and timeout behavior is an external
service fact.

## Candidate 2 — display-layer duplication (independently confirmed code gap)

`src/hooks/useNotifications.ts:102` prepends every realtime `INSERT` event to state with
**no check for an existing `id`**.

`src/contexts/AuthContext.tsx:233-244` assigns a fresh `user` object reference on every
`TOKEN_REFRESHED` event — which per its own inline comment happens "periodically and on tab
focus" — before its early return. That churns the `useNotifications` effect dependencies
and repeatedly unsubscribes and resubscribes the realtime channel.

The effect does clean up correctly (`return () => supabase.removeChannel(channel)`,
`useNotifications.ts:74-111`), but a straggler delivery from a closing channel landing
after the new channel and fetch are applied would render one row twice while only one row
exists in the database. Plausible for a dealership manager tabbing in and out all day.

**This produces the same symptom with a completely different fix.** Distinguishing the two
is the single most important next step.

## Write paths into `notifications` (complete enumeration)

- Five DB triggers: `trg_notify_prospect_insert`, `trg_notify_prospect_status`,
  `trg_notify_reservation_insert`, `trg_notify_reservation_status` (defined once in
  `20260314054951_*.sql:104-118`; function bodies later updated in place by
  `20260601000001` and `20260704000000` via `CREATE OR REPLACE FUNCTION`, never a second
  trigger), plus `trg_notify_low_satisfaction_score` (`20260721130000`).
- Two RPCs inserting directly: `notify_reservation_cancellation`, and the trigger behind
  `submit_survey_response`.
- No application code inserts into `notifications`. Grepping `src/` for
  `from('notifications')` finds only `useNotifications.ts`, which selects and updates only.

So there is no "two writers to one event" vector. The only genuine double-insert path is
the webhook race, which produces two legitimate trigger firings.

## How to confirm in 5 minutes

Requires `SUPABASE_ACCESS_TOKEN`.

```sql
-- 1. Duplicate dealership rows for GAC EL TIGRE?
SELECT id, name, created_at FROM dealerships WHERE name ILIKE '%tigre%';

-- 2. Concesionario profile linked to more than one dealership row?
SELECT du.* FROM dealership_users du
JOIN dealerships d ON d.id = du.dealership_id
WHERE d.name ILIKE '%tigre%';

-- 3. Real DB duplication: same event content inserted more than once
SELECT recipient_dealership_id, title, message,
       metadata->>'prospect_id' AS prospect_id, metadata->>'reservation_id' AS reservation_id,
       count(*), array_agg(id) AS ids, array_agg(created_at) AS times
FROM notifications
WHERE recipient_dealership_id IN (SELECT id FROM dealerships WHERE name ILIKE '%tigre%')
GROUP BY 1,2,3,4,5 HAVING count(*) > 1
ORDER BY 6 DESC;

-- 4. Webhook redelivery evidence for the same Kommo lead
SELECT kommo_lead_id, event_type, status, count(*), array_agg(created_at)
FROM integration_logs
WHERE event_type IN ('webhook_auto_created','webhook_auto_linked',
                     'webhook_reservation_auto_created','webhook_reservation_auto_linked')
GROUP BY 1,2,3 HAVING count(*) > 1;

-- 5. Duplicate prospects/reservations for the same Kommo lead
SELECT kommo_lead_id, count(*) FROM prospects    WHERE kommo_lead_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
SELECT kommo_lead_id, count(*) FROM reservations WHERE kommo_lead_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```

### Interpretation

- Query 5 returns rows → the webhook race (candidate 1) is confirmed. Fix belongs in the
  database and the edge function.
- Query 3 returns rows but query 5 does not → source is elsewhere; re-check queries 1-2 for
  duplicate dealership rows.
- Query 3 returns nothing at all, yet the user saw two entries → display-layer only
  (candidate 2). The fix belongs entirely in the frontend.

## Risks

- Root cause for the specific GAC EL TIGRE incident cannot be confirmed without live DB
  access. The fix differs substantially by candidate, so the SQL above must run before the
  proposal commits to a design.
- No unique constraint exists on `prospects.kommo_lead_id`, `reservations.kommo_lead_id`,
  or `dealerships.name` anywhere in the schema. This is a structural gap independent of
  which mechanism caused this particular report, and will keep producing intermittent
  duplicates under retries or load until it is closed.
- `resolveDealershipId()` auto-creates a new `dealerships` row on any fuzzy-match miss
  (`kommo-webhook/index.ts:344-356`) with no uniqueness on `dealerships.name` — a silent
  duplicate-dealership factory.

## Confirmed verdict (2026-07-31, live production data)

The SQL above was run against production. Results:

| Check | Result | Effect on the ranked table |
|---|---|---|
| Duplicate `prospects.kommo_lead_id` | **0** | Candidate 1 **RULED OUT** |
| Duplicate `reservations.kommo_lead_id` | **0** | Candidate 1 **RULED OUT** |
| Dealership rows matching `%tigre%` | **1** (`GAC - El Tigre`) | Candidate 3 **RULED OUT** |
| Dealership rows with a duplicated name | **0** | Candidate 3 **RULED OUT** |
| Rapid notification pairs (<10s apart) with an **identical message** | **0 of 78** | Not duplication |
| Rapid notification pairs with a **different message** | **78 of 78** | — |

**There are no duplicate notification rows.** Every pair a dealership manager perceives as
a duplicate is two genuinely different status changes on the same record, landing seconds
apart. They look identical because `NotificationCenter` renders the title and icon
prominently and the differing message in small grey text.

### The actual defect: a status ping-pong on the prospects path

Of 29 rapid prospect-status pairs, **17 are reverts** — `A -> B -> A` inside 3-10 seconds.
Nobody moves a lead to `perdido` and back to `negociacion` in 9 seconds by hand. Observed
paths include `demostracion -> seguimiento -> demostracion` and
`negociacion -> perdido -> negociacion`.

Traced end to end in `integration_logs` for prospect `8510f6df` on 2026-07-29:

```
14:41:22.970  webhook_status_update   demostracion -> seguimiento   kommo_status_id 105277992
14:41:23.714  sync_from_kommo         ["Estado de Vnzla"]
14:41:24.996  sync_from_kommo         ["Estado de Vnzla"]
14:41:25.842  webhook_status_update   seguimiento -> demostracion   kommo_status_id 101392719
```

Two separate Kommo webhook deliveries carrying two different `status_id` values, 2.9s
apart, each applied blindly. `kommo-webhook/index.ts:522` guards only against writing the
*same* value (`prospect.status !== ourStatus`); it has no notion of event ordering, so a
stale or out-of-order delivery silently overwrites a newer state. **This is a data-
correctness bug, not a notification bug** — the notification is the messenger.

Reservations are largely clean by comparison: 4 reverts out of 52 rapid pairs. The dominant
reservation pattern (`confirmada -> en_proceso`) is forward progress.

### Secondary finding: duplicate Kommo leads per reservation

2 of 524 reservations produced two successful `create_reservation` calls and therefore two
Kommo leads (e.g. reservation `5219e7e5` -> leads `66246197` and `66246199`, 5s apart).
Rare, real, and orthogonal to the notification report. The extra lead is orphaned — no
reservation points back at it.

### What was fixed now

Frontend only, because these are correct regardless of how the webhook fix lands:

- `src/hooks/useNotifications.ts` — realtime INSERT events are deduped by id via a `seenIds`
  ref, rebuilt from each fetch. Closes candidate 2's genuine code gap: `AuthContext` hands
  out a fresh `user` on every `TOKEN_REFRESHED`, tearing down and re-creating the channel,
  and a straggler delivery from the closing channel could render a row already applied.
- `src/lib/notificationText.ts` (+ tests) and `src/components/NotificationCenter.tsx` — each
  status notification now shows its transition (`Demostracion -> Seguimiento`), so two rapid
  rows are visibly distinct instead of reading as one event repeated.

### Still open

- **The ping-pong itself.** The fix is to reject stale status events instead of applying
  them blindly. The clean mechanism is Kommo's per-event `last_modified` timestamp, but
  `kommo-webhook` reads only `leads[status][0][id|status_id|pipeline_id]` and never logs the
  rest of the payload, so it is unproven from here whether Kommo sends it. Confirm before
  designing, or the fix rests on an assumption.
- **Batched events are dropped.** The handler reads index `[0]` only. If Kommo posts
  `leads[status][1]` in the same body, that event is silently discarded.
- **Dead auto-create branch.** `POSTVENTA_CREATE_STAGE = '104023216'` is not a key in
  `POSTVENTA_STAGE_TO_STATUS`, and the `else if` that uses it is nested inside
  `if (ourStatus)` (`kommo-webhook/index.ts:469-488`). `autoCreateReservationFromKommo` is
  therefore unreachable from the status path. Currently protective, still wrong.
- **`WebhookReservas` trigger is still live** on `reservations`, POSTing every INSERT and
  UPDATE to `automation.boosty.digital/webhook/webhookgacn8n`. The two make.com prospect
  triggers were dropped on 2026-07-30; this n8n one was not, and it is a candidate writer in
  any reservation-side loop. Needs an explicit decision.

## Next recommended

`sdd-propose`, scoped to the webhook ordering fix — no longer blocked on the SQL.
