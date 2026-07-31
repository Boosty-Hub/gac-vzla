# Prospect-to-Client Specification

## Purpose

A prospect that reaches `ganado` MUST become (or be linked to) a `clients` row, idempotently, regardless of which path drove the win — admin UI, dealership UI, or the Kommo webhook. Fleet purchases register multiple vehicles under one client from one prospect. Repurchases extend an existing client without re-triggering the original won-transition.

## Requirements

### Requirement: Client Resolved or Created on Win

The system MUST resolve an existing `clients` row or create a new one whenever a prospect transitions to `ganado`, on every path that can produce that transition. Resolution MUST match an existing client by cedula, then phone, then email, in that order, before creating a new row. On success, `prospects.client_id` MUST be set to the resolved/created client.

#### Scenario: Win via UI with a new customer
- GIVEN a prospect with no cedula/phone/email match in `clients`
- WHEN it is moved to `ganado` through the admin or dealership UI, plate captured
- THEN a new `clients` row is created and `prospects.client_id` is set to it

#### Scenario: Win via Kommo webhook, plate dialog bypassed
- GIVEN a prospect's status changes to `ganado` because Kommo pushed a stage-mapped update
- WHEN the webhook applies the status change directly (no plate dialog on this path)
- THEN the client is still resolved-or-created and `prospects.client_id` is set
- AND `prospects.sold_plate` MAY remain NULL here — this MUST NOT block client creation

#### Scenario: Existing customer identified by phone
- GIVEN a prospect's cedula matches no client but its phone matches an existing `clients.phone`
- WHEN the prospect wins
- THEN the existing client is linked; no new row is created

### Requirement: Idempotent Re-processing

Re-running win resolution for a prospect that already has `client_id` set MUST NOT create a second client row or change the existing link.

#### Scenario: Duplicate webhook delivery
- GIVEN a prospect already has `client_id` set from a prior win
- WHEN a duplicate `ganado` webhook event is processed for it
- THEN no second `clients` row is created and `client_id` is unchanged

### Requirement: Fleet Purchase — Multiple Vehicles, One Client, One Survey

When "is fleet" is selected on a win, the system MUST accept multiple plates in one transaction and MUST create one `vehicles` row per plate under a single resolved client, while creating exactly one survey for the whole purchase.

#### Scenario: Fleet of N vehicles
- GIVEN a prospect wins with "is fleet" checked and N distinct plates entered
- WHEN the win is processed
- THEN exactly N `vehicles` rows are created under one `clients` row
- AND exactly one `satisfaction_surveys` row exists for the transaction, not N

#### Scenario: Fleet win requires at least one plate
- GIVEN "is fleet" is checked
- WHEN the operator attempts to confirm with zero plates entered
- THEN the win MUST be blocked until at least one plate is provided

### Requirement: Repurchase Registration for an Existing Client

Adding a vehicle to a client whose prospect is already `ganado` (won-trigger will not fire again) MUST present a dialog with three outcomes before writing anything.

#### Scenario: Register with survey
- GIVEN staff choose "add vehicle" on an existing client and confirm "Register" (send survey)
- WHEN registration completes
- THEN a new `vehicles` row is created for the client AND a new survey is created for delivery under the survey-delivery capability's rules

#### Scenario: Register without survey
- GIVEN staff choose "Register without sending survey"
- WHEN registration completes
- THEN a new `vehicles` row is created AND no survey is created or delivered

#### Scenario: Dismiss
- GIVEN staff click the dialog's close ("X")
- WHEN the dialog closes
- THEN no `vehicles` row, client change, or survey is written

### Requirement: Plate Capture Remains Mandatory on UI-Driven Wins

The admin and dealership UIs MUST continue to require at least one non-empty plate before a win transition commits, for both single and fleet purchases.

#### Scenario: Blocked without a plate
- GIVEN an operator sets a prospect's status to `ganado` through the UI
- WHEN no plate has been entered
- THEN the status change MUST NOT commit until a plate is provided

### Requirement: New Duplicate Clients Prevented; Existing Duplicates Not Merged

Client resolution MUST NOT increase the count of duplicate `clients.phone` or `clients."IdContactKommo"` values. Pre-existing duplicates MUST remain visible to admins read-only; this change MUST NOT merge them (forward-only scope).

#### Scenario: Resolution avoids creating a duplicate
- GIVEN a client with a matching cedula already exists
- WHEN a different prospect with the same cedula wins
- THEN the existing client is reused, not duplicated

#### Scenario: Duplicate visibility without a merge action
- GIVEN pre-existing duplicate client rows
- WHEN an admin reviews the duplicate worklist
- THEN duplicates are listed read-only; no merge action is offered by this change

## Role & Permission Notes

| Role | Access |
|---|---|
| superadmin / admin | Triggers win/repurchase from the admin UI; resolution always runs |
| concesionario | Triggers win/repurchase from the dealership UI, own dealership's prospects/clients |
| vendedor | Same as concesionario, scoped to their own prospects |
| client | No direct access — is the entity created, never initiates this capability |
| System (Kommo webhook) | Triggers resolution server-to-server; no interactive user, no plate dialog |
