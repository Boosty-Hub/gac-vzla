# Survey-Delivery Specification

## Purpose

Delivering a client's satisfaction survey through Kommo: writing the survey link into the client's conversation lead, re-triggering the SalesBot with a stage toggle, and guarding against unsafe, misdirected, or duplicate sends. Invoked after a win, a repurchase, a resend, or webhook-driven wins alike.

## Requirements

### Requirement: Survey Link Written to the Client's Conversation Lead

On a successful delivery attempt, the system MUST write `{survey_base_url}/encuesta/{token}` into Kommo custom field `3456839` on the client's `kommo_conversation_lead_id`.

#### Scenario: Standard delivery
- GIVEN a client has an eligible, undelivered survey and a `kommo_conversation_lead_id`
- WHEN delivery runs
- THEN Kommo custom field `3456839` on that lead is set to the survey's public URL

### Requirement: Stage Toggle Re-triggers the SalesBot

After the field write, the system MUST toggle the lead's stage (buffer stage, then `survey_stage_id`) so the "entered stage" event fires the SalesBot, mirroring the existing dealership-notification pattern.

#### Scenario: Toggle follows the field write
- GIVEN the CF write above succeeded
- WHEN the toggle runs
- THEN the lead ends in `survey_stage_id`, having passed through the buffer stage

### Requirement: Hard Failure When the Target Stage Is Not Configured

If `integration_configs.config.survey_stage_id` is empty or unset, the system MUST refuse the stage toggle and MUST fail loudly — logged and surfaced to the operator — rather than completing as if delivery succeeded.

#### Scenario: Unconfigured stage
- GIVEN `survey_stage_id` is `""`
- WHEN a delivery is attempted
- THEN the attempt fails with a visible, logged error and no survey is marked delivered

### Requirement: Shared Conversation Lead Refused

The system MUST refuse to deliver — no CF write, no stage toggle — when a client's `kommo_conversation_lead_id` is also referenced by any other `clients` row. The refusal MUST be logged to `integration_logs` and surfaced to the operator.

#### Scenario: Two clients share one conversation lead
- GIVEN client A and client B both reference the same `kommo_conversation_lead_id`
- WHEN delivery is attempted for either client
- THEN nothing is written to that lead, the refusal is logged, and the operator sees a warning

### Requirement: One Delivered Survey Per Client Per Rolling 24 Hours

The system MUST NOT deliver a second survey to the same client within 24 hours of that client's most recent survey. A second triggering event inside the window MUST be recorded as suppressed — distinguishable from "no event occurred" — never silently dropped.

#### Scenario: Two events within 24 hours
- GIVEN a client already has a survey created or delivered within the last 24 hours
- WHEN a second triggering event occurs (repurchase, resend, duplicate webhook win) for the same client
- THEN no second delivery is sent, and the suppression is recorded

#### Scenario: Events more than 24 hours apart
- GIVEN a client's last survey was created more than 24 hours ago
- WHEN a new triggering event occurs
- THEN a new survey is created and delivery proceeds normally

### Requirement: Kill Switch

Delivery MUST be gated by `integration_configs.config.survey_delivery_enabled` (default `false`). When disabled, the system MUST still create/track survey state internally but MUST NOT call Kommo.

#### Scenario: Switch off
- GIVEN `survey_delivery_enabled` is `false`
- WHEN a delivery is triggered
- THEN no Kommo request is made and the survey is not marked delivered

### Requirement: Resend Reuses the Existing Token

Resend MUST reuse the client's existing open survey token and MUST NOT mint a new one. Resend MUST obey the same 24-hour rate limit with no override, including for admins.

#### Scenario: Resend within the window
- GIVEN a client's survey was delivered less than 24 hours ago
- WHEN any role clicks "resend"
- THEN the resend is suppressed by the same rate limit, with no admin override

#### Scenario: Resend after the window
- GIVEN a client's survey was delivered more than 24 hours ago and is unanswered
- WHEN resend is triggered
- THEN the same token is delivered again; no new token is minted

## Role & Permission Notes

| Role | Access |
|---|---|
| superadmin / admin | Views delivery status and triggers resend for any client |
| concesionario | Triggers resend only for clients within their dealership's surveys |
| vendedor | Triggers resend only for their own assigned surveys |
| client | Receives the delivered link passively via Kommo/SalesBot; no system access |
| System (kommo-webhook, kommo-api) | Executes delivery server-to-server on win, repurchase, and resend |
