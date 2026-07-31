# Requirements — satisfaction-survey (revision 2)

Source: user, voice-transcribed, 2026-07-29. Supersedes the original 7-point requirement.
Captured verbatim in intent; ambiguities from transcription are resolved and flagged below.

## Delivery channel decision (RESOLVED — no longer an open question)

The 24h send will NOT use a new messaging vendor and will NOT use the manual
`wa.me` deep link. It goes through **Kommo SalesBot**.

Division of labour:

- **User owns**: the SalesBot itself and the API template in Kommo. The bot fires and
  reads the survey link from a Kommo custom field.
- **System owns**: writing the per-client unique survey link into that Kommo custom field,
  mirroring the structure already used for dealership notifications.

This removes the "no scheduler exists" blocker entirely — the 24h delay becomes SalesBot's
responsibility, not the system's.

## Kommo configuration slots

Verified live against the Kommo API and `integration_configs.config`:

| Key | Value | State |
|---|---|---|
| `survey_link_field_id` | `3456839` | RESOLVED — verified as lead custom field "Link Encuesta", type `url` |
| `survey_base_url` | `https://imbmobility.netlify.app` | RESOLVED — survey URL is `{base}/encuesta/{token}` |
| `survey_stage_id` | `104023216` | RESOLVED — "En conversación Cliente/Empresa", pipeline `13151339`, where all 1367 client conversation leads already live. User-confirmed: reuse the existing stage rather than create a new one. |

**Verification status of the live write:** these values were set in `integration_configs.config`
during the 2026-07-29 session, but that write has NOT been re-verified since — the Supabase
Management API token the user supplied expired after one day and now returns `Unauthorized`.
Re-confirm all three against the live row before the first real send. `deliver_satisfaction_survey`
hard-fails with `400 survey_stage_id_not_configured` if the key is absent, so a missing value
surfaces loudly rather than silently skipping the SalesBot trigger.

## Delivery mechanism — mirror the dealership-notification pattern

The user asked to "copy the same structure we have for dealership notifications".
That structure is implemented in `supabase/functions/kommo-api/index.ts:1702-1911`
(`notify_dealership_reservation`) and works as follows:

1. One PERMANENT lead per dealership, tracked in `dealerships.kommo_notification_lead_id`.
2. Find or create the Kommo contact, tracked in `dealerships.kommo_contact_id`.
3. PATCH all payload data onto that lead's custom fields. Empty values are written as
   empty strings rather than skipped, so stale data from the previous notification is
   cleared instead of lingering.
4. **Re-trigger the SalesBot by toggling the stage**: PATCH the lead to a buffer stage
   (`pendiente`), then PATCH it back to `107696308` ("Notificaciones Concesionarios").
   The "entered stage" event is what wakes the bot. This is the key mechanism.

The client-side equivalent already exists and is fully populated:

- Every client has `clients.kommo_conversation_lead_id` and `clients."IdContactKommo"` —
  all 1367 rows.
- Those leads live in pipeline `13151339` ("Servicio"), stage `104023216`
  ("En conversación Cliente/Empresa"). Verified by resolving a sample against Kommo.
- Link integrity verified on a random sample of 40: the lead's attached contact matches
  `clients."IdContactKommo"` in 40/40 cases. Leads named after a company with a person as
  contact are correct, not mis-linked.

So the survey design is: write the survey URL into lead custom field `3456839` on the
client's conversation lead, then toggle its stage to fire the SalesBot.

"Link Encuesta" is currently empty on all 250 sampled leads — nothing has ever written it.

## Requirements

### R1 — Won prospect must become a client

When a prospect moves to `ganado`:

1. The salesperson is required to register the vehicle plate (already implemented).
2. The prospect MUST be automatically created in the system's `clients` module.
3. That client MUST also exist in Kommo.

This link does not exist today: `prospects` has no `client_id` column and there is no
prospect-to-client creation path.

### R2 — Idempotency (critical, already violated in production)

No duplicate contacts and no duplicate clients. Current live state:

- 62 duplicate `clients.phone` values
- 60 duplicate `clients."IdContactKommo"` values (two client rows pointing at one Kommo contact)
- 7 duplicate `clients.full_name` values

Any prospect-to-client creation path MUST be idempotent against existing rows, and the
pre-existing duplicates need a decision (merge, or leave and prevent new ones).

### R3 — Survey link written to Kommo

Once a client is created from a won prospect, the system writes that client's unique
survey link into the Kommo custom field identified by `survey_link_field_id`.
The SalesBot reads that field and delivers the survey.

### R4 — Rate limit: one survey per client per day

A client MUST NOT receive more than one survey in a 24-hour window, regardless of how many
triggering events occur.

### R5 — Fleet purchases

The plate dialog shown when moving to `ganado` gains an "is fleet" checkbox.
`prospects.is_fleet` already exists as a column (currently unused — 0 rows set).

- Checked → allow entering MULTIPLE plates in the same dialog.
- Purpose: avoid creating one prospect per vehicle when a client buys e.g. 20 cars.
- A fleet purchase sends **exactly one** survey, not one per vehicle.

Schema implication: `prospects.sold_plate` and `satisfaction_surveys.sold_plate` are both
single `text` columns. Multiple plates require a schema change.

### R6 — Repurchase flow

When an existing client buys again (e.g. two months later), the prospect is already `ganado`,
so the won-transition trigger will not fire again.

Going to that client and choosing "add vehicle" MUST show a dialog stating that a new
vehicle is being registered for this client and that a survey will therefore be sent.

The dialog offers:
- **Register** (with survey)
- **Register without sending survey**
- An **X** in the top corner to dismiss

### R7 — Dashboard restructure

- **REMOVE** the current satisfaction chart at the bottom of the Dashboard. It is not the
  intended presentation and should not be kept.
- **ADD** a new tab at the top of the Dashboard named "Satisfacción" (or "Satisfacción Cliente").

That tab contains:
- Completed surveys
- A navigable client list — clicking a client navigates to that client and opens the
  surveys tab inside the client detail, showing the PDF preview
- The client's phone number, visible for quick contact
- General metrics

### R8 — Filters

The satisfaction dashboard MUST support filtering by:
- **Brand** (explicitly emphasized as very important)
- **Model**
- **Month**

Dashboard filtering is to be handled completely, not partially.

### R9 — Resend survey

Each client gets a "resend survey" button.

### R10 — Brand-agnostic survey form

Remove "GAC" branding from the survey form. Other brands will use the same form.

Resolved ambiguity: the transcribed "FSK" is **DFSK**. Per the Kommo skill, the three
brands are GAC (enum `7832208`), DFSK (enum `7832206`), SHINERAY (enum `7857650`).

### R11 — Scope is forward-only

Nothing is done for clients that already exist. This applies from implementation onward.
No backfill.

Supporting data: 191 prospects are already `ganado`, but only 14 surveys exist, only 1 has
been answered, and only 3 won prospects have a plate recorded. So there is no meaningful
historical set to backfill anyway.

### R12 — Invariants stated by the user

1. Every `ganado` prospect must be reflected in `clients` in parallel — a prospect who
   bought and has a vehicle automatically becomes a client.
2. Everything in the system must also be reflected in Kommo, in the clients section.

(The user referred to "three clear points" but stated two.)

## Open question for the user

The Kommo custom field ID for "link encuesta" — the `survey_link_field_id` config slot is
present and empty. The user offered to provide it.

Whether "clients in Kommo" means the **contacts** entity is likely already answered:
`clients."IdContactKommo"` exists and all 1367 client rows are populated, so clients are
already linked to Kommo contacts. Confirm rather than assume.

## Current implementation baseline (verified against the live database)

| Item | State |
|---|---|
| `satisfaction_surveys` / `satisfaction_responses` tables | EXIST |
| `trg_create_satisfaction_survey_on_won` | EXISTS, enabled |
| `trg_notify_low_satisfaction_score` | EXISTS, enabled (the "do not apply" migration WAS applied) |
| Survey token | UNIQUE, ~122-bit, not guessable |
| Public form `/encuesta/:token` | Working, writes via SECURITY DEFINER RPCs |
| Five per-aspect question columns | EXIST (`q_atencion_digital`, `q_bienvenida_presencial`, `q_negociacion_asesoria`, `q_financiamiento_tramites`, `q_experiencia_entrega`) plus `nps_recomienda`, `comment`, `overall_score`, `has_low_score` |
| Plate capture dialog | Implemented in admin + dealership UI |
| `prospects.is_fleet` | Column exists, 0 rows use it |
| Prospect → client link | DOES NOT EXIST |
| `satisfaction_surveys.client_id` | DOES NOT EXIST (links to `prospect_id` only) |
| Survey counts | 191 won / 14 surveys / 1 response / 3 with plate |
