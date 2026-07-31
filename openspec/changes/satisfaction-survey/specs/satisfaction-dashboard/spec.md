# Satisfaction Dashboard Specification

## Purpose

A dedicated, filterable "Satisfacción" view of surveys and responses, replacing the rejected embedded chart, scoped so no role can enumerate clients outside their access.

## Requirements

### Requirement: Satisfacción Tab Replaces the Embedded Chart

The Dashboard MUST present `Resumen` and `Satisfacción` as tabs. The chart previously embedded at the bottom of the dashboard MUST be removed entirely, not merely hidden.

#### Scenario: Chart removed
- GIVEN a user opens the admin Dashboard
- WHEN they view it
- THEN no satisfaction chart renders outside the `Satisfacción` tab

### Requirement: Client List Derived from Surveys, Never from `clients`

The tab's client list MUST be built from `satisfaction_surveys` (RLS-scoped), and MUST NOT query `clients` directly for listing purposes, because `clients` has no `dealership_id` and would let a scoped user see every client.

#### Scenario: Dealership user cannot enumerate all clients
- GIVEN a concesionario user whose dealership has surveys for a subset of the system's 1367 client rows
- WHEN they open the Satisfacción tab
- THEN only that scoped subset appears; no other client rows are reachable from the tab

### Requirement: Client Row Deep-Links to Detail with PDF Preview

Selecting a client MUST navigate to that client's detail view with the surveys sub-tab open, showing a PDF preview of the answered survey when one exists.

#### Scenario: Navigate from tab to detail
- GIVEN a client with a responded survey appears in the Satisfacción tab
- WHEN a user clicks that row
- THEN the client detail opens on its surveys tab, with the survey's PDF preview visible

### Requirement: Phone Number Visible in the List

Each row in the tab's client list MUST show the client's phone number without opening the detail view.

#### Scenario: Phone shown
- GIVEN a client row with a phone on file
- WHEN the list renders
- THEN the phone number is visible directly in the row

### Requirement: Complete Filtering by Brand, Model, and Month

The tab MUST support filtering by brand, vehicle model, and month, fully, deriving brand/model from each survey's linked vehicle. Filters MUST compose together (AND).

#### Scenario: Combined filter
- GIVEN surveys exist across multiple brands, models, and months
- WHEN a user filters by brand=DFSK, model=X, and month=June
- THEN only matching surveys/clients appear

### Requirement: General Metrics

The tab MUST show aggregate metrics (e.g., completed count, response rate, per-aspect averages) scoped to what the viewing role can see.

#### Scenario: Metrics reflect scope
- GIVEN a vendedor viewing only their own surveys
- WHEN metrics render
- THEN totals reflect only that vendedor's scoped surveys, not the whole system

### Requirement: No New Permission Introduced

Access to the tab MUST reuse existing `satisfaction_surveys` RLS scoping (admin: all; concesionario: own dealership; vendedor: own salesperson). This change MUST NOT introduce a new permission for it.

#### Scenario: Access follows existing RLS
- GIVEN a role with no dedicated satisfaction permission but valid RLS scope
- WHEN they open the tab
- THEN they see exactly the rows their existing RLS policy allows

### Requirement: Resend Action Available Per Client

Each client row in the tab MUST expose a resend action, fully governed by the survey-delivery capability's rate-limit and refusal rules — no separate gating logic here.

#### Scenario: Resend from the tab
- GIVEN a client row in the Satisfacción tab
- WHEN a user clicks "resend"
- THEN the request follows survey-delivery's resend requirement unchanged

## Role & Permission Notes

| Role | Access |
|---|---|
| superadmin / admin | Full visibility, all dealerships |
| concesionario | Own dealership's surveys/clients only |
| vendedor | Own assigned surveys/clients only |
| client | No access — this is a staff-facing dashboard |
