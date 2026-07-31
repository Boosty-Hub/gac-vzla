# Survey Form Specification

## Purpose

The public, unauthenticated, brand-agnostic satisfaction survey at `/encuesta/:token`, usable identically across GAC, DFSK, and SHINERAY sales.

## Requirements

### Requirement: Brand-Agnostic Header

The form MUST NOT render the GAC logo or any brand-specific image asset. It MUST show a typographic, brand-neutral header, optionally naming the client's actual brand as plain text when known.

#### Scenario: No GAC logo on any sale
- GIVEN a survey token belonging to a DFSK sale
- WHEN the form loads
- THEN no `gac-logo.png` or other brand image renders

#### Scenario: Brand shown as text when known
- GIVEN the survey's associated brand is known
- WHEN the form renders
- THEN the brand appears as text, not as a logo image

### Requirement: Token Lookup Returns Brand as Text

The public token-lookup RPC MUST return the associated brand as a plain text field (nullable), for display only.

#### Scenario: Brand present
- GIVEN a survey linked to a vehicle with a known brand
- WHEN the token is looked up
- THEN the response includes that brand as text

### Requirement: Renders Correctly for Any Supported Brand

The same form MUST render correctly for GAC, DFSK, and SHINERAY sales without brand-specific code paths or per-brand assets.

#### Scenario: DFSK and SHINERAY both work
- GIVEN one survey token from a DFSK sale and one from a SHINERAY sale
- WHEN each form loads
- THEN both render the full question flow identically, differing only in the displayed brand text

### Requirement: Unauthenticated Access Stays Restricted to RPCs

The form MUST remain reachable without login, and MUST continue to read and write exclusively through `SECURITY DEFINER` RPCs (token lookup, response submission) — never direct table access for the `anon` role.

#### Scenario: No direct table access
- GIVEN an unauthenticated visitor on `/encuesta/:token`
- WHEN the page loads and later submits
- THEN all data access goes through the existing RPCs, not direct reads/writes on `satisfaction_surveys` / `satisfaction_responses`

### Requirement: Existing Single-Use Response Flow Preserved

The already-implemented behavior — invalid-token screen, already-responded screen, one-time submission — MUST continue to work unchanged for all brands.

#### Scenario: Already-answered survey
- GIVEN a token whose survey status is `responded`
- WHEN the form loads
- THEN the visitor sees the "already responded" screen, not the question flow

## Role & Permission Notes

| Role | Access |
|---|---|
| superadmin / admin / concesionario / vendedor | No direct access to this route; outside this capability's flow |
| client (survey respondent) | Anonymous, token-based access only; no login, no system role |
