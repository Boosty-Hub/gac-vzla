-- Point survey delivery at its own dedicated Kommo stage.
--
-- Until now `survey_stage_id` defaulted to 104023216 ("En conversación Cliente/Empresa"),
-- which is where every service client parks: 1367 of 1369 clients carry a
-- `kommo_conversation_lead_id` and land there. A SalesBot hung on that stage would fire for
-- any lead entering it for any reason — a newly synced client, the bulk migration action in
-- kommo-api — sending "please fill the survey" to people who have no survey link at all.
--
-- 109744268 ("ENCUESTA ENVIADA", pipeline 13151339 "Servicio") was created for this and
-- nothing else, so the bot on that stage can only ever be woken by
-- deliver_satisfaction_survey.
--
-- Buffer behaviour after this change (kommo-api:2228): since the target is no longer
-- CONVERSATION_STAGE, the buffer becomes CONVERSATION_STAGE, so the toggle is
-- "En conversación Cliente/Empresa" -> "ENCUESTA ENVIADA" — exactly one entry event on the
-- stage the bot listens to. Entering 104023216 is inert on the webhook side: it is not a key
-- in POSTVENTA_STAGE_TO_STATUS, so no reservation status is written and no reservation is
-- auto-created.
--
-- The kill switch is deliberately left untouched. `survey_delivery_enabled` stays false
-- until one manual end-to-end send has been confirmed against a real client.

UPDATE public.integration_configs
SET config = jsonb_set(config, '{survey_stage_id}', '"109744268"'::jsonb, true)
WHERE integration_name = 'kommo';
