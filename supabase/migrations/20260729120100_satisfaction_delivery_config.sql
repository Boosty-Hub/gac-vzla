-- Satisfaction Survey — Part 3: Kommo delivery config defaults (data-only migration).
-- See openspec/changes/satisfaction-survey/design.md, "supabase/migrations/
-- 20260729120100_satisfaction_delivery_config.sql (slice 2, data only)".
--
-- ADDITIVE and safe to apply independently of 20260729120000: sets two keys inside
-- integration_configs.config (jsonb) for integration_name = 'kommo'. No code reads either
-- key yet (Phase 2's kommo-api action, not part of this slice), so this is inert on apply.
--
-- survey_delivery_enabled: forced to false — the kill switch. This is the real safety
-- lever for the whole delivery feature; it must stay false until a manual end-to-end send
-- is confirmed (tasks.md Phase 2, task 2.4 — currently BLOCKED pending survey_stage_id).
--
-- survey_stage_id: coalesced — set only if currently unset/empty, so re-running this
-- migration never clobbers a value someone has since configured through the UI. Recommended
-- value 104023216 (the pipeline's own "En conversación Cliente/Empresa" stage — see
-- requirements.md's "Kommo configuration slots" table) makes the stage-toggle buffer become
-- 'pendiente' and the lead end exactly where it started, per design.md section 3, step 10.
-- This value is a RECOMMENDATION pending explicit user confirmation, not yet verified live;
-- it is safe to ship regardless because delivery stays hard-disabled by the kill switch
-- above and, per design.md section 3 step 3, also hard-fails on an empty survey_stage_id
-- even if the kill switch were ever flipped on with this value still blank.
--
-- ROLLBACK (kill switch is the only safety-relevant part; re-affirms it explicitly rather
-- than touching survey_stage_id, which is inert while the switch is off):
--   UPDATE public.integration_configs
--      SET config = config || jsonb_build_object('survey_delivery_enabled', false)
--    WHERE integration_name = 'kommo';

UPDATE public.integration_configs
   SET config = config
     || jsonb_build_object('survey_delivery_enabled', false)
     || jsonb_build_object('survey_stage_id', coalesce(nullif(config->>'survey_stage_id',''), '104023216'))
 WHERE integration_name = 'kommo';
