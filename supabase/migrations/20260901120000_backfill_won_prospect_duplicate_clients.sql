-- Backfill de datos: corrige los duplicados HISTORICOS creados por el bug arreglado en
-- 20260831160000_won_prospect_plate_identity.sql (marcar "Ganado" y vincular una placa ya
-- facturada creaba un cliente nuevo en vez de enganchar al dueno real). Esa migracion arregla
-- el flujo hacia adelante; esta migracion es el backfill unico sobre lo que ya quedo mal.
--
-- Mismo criterio de seguridad que register_won_prospect Case 2 (nunca borrar un cliente con
-- CUALQUIER dato propio), pero generalizado a las 8 tablas que de verdad tienen FK a
-- clients.id (confirmado via information_schema.table_constraints), no solo las 7 que el
-- fix de la transaccion en vivo revisaba -- agrega survey_send_decisions.
--
-- Verificado en produccion antes de este archivo con BEGIN; ... ROLLBACK;: 29 candidatos, 29
-- prospectos re-enganchados, 7 encuestas reasignadas (las otras 22 no tenian fila de encuesta
-- bajo el cliente duplicado), 29 clientes duplicados borrados -- numero identico al
-- diagnostico previo (45 ventas ganadas con placa / 36 clientes duplicados distintos / 29
-- candidatos limpios). Los 7 clientes duplicados restantes tienen datos propios (otro
-- prospecto, vehiculo, reserva, etc.) y quedan SIN TOCAR a proposito -- requieren revision
-- manual, no automatizable sin riesgo de perder historial real.
DO $$
DECLARE
  v_candidates int;
  v_prospects  int;
  v_surveys    int;
  v_deleted    int;
BEGIN
  CREATE TEMP TABLE _dup_cleanup_cand ON COMMIT DROP AS
  SELECT p.id AS prospect_id, p.client_id AS dup_client_id, v.client_id AS real_client_id
  FROM public.prospects p
  JOIN public.vehicles v ON upper(trim(v.plate)) = upper(trim(p.sold_plate))
  WHERE p.status = 'ganado'
    AND p.sold_plate IS NOT NULL
    AND p.client_id IS NOT NULL
    AND p.client_id <> v.client_id
    AND NOT EXISTS (SELECT 1 FROM public.prospects p2 WHERE p2.client_id = p.client_id AND p2.id <> p.id)
    AND NOT EXISTS (SELECT 1 FROM public.vehicles v2 WHERE v2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.reservations r2 WHERE r2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.client_users cu2 WHERE cu2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.drivers dr2 WHERE dr2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.external_portal_sessions eps2 WHERE eps2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.survey_send_decisions sd2 WHERE sd2.client_id = p.client_id)
    AND NOT EXISTS (SELECT 1 FROM public.satisfaction_surveys ss2 WHERE ss2.client_id = p.client_id AND ss2.prospect_id <> p.id);

  SELECT count(*) INTO v_candidates FROM _dup_cleanup_cand;

  UPDATE public.prospects p SET client_id = c.real_client_id
    FROM _dup_cleanup_cand c WHERE p.id = c.prospect_id;
  GET DIAGNOSTICS v_prospects = ROW_COUNT;

  UPDATE public.satisfaction_surveys s SET client_id = c.real_client_id
    FROM _dup_cleanup_cand c
   WHERE s.prospect_id = c.prospect_id AND s.client_id = c.dup_client_id;
  GET DIAGNOSTICS v_surveys = ROW_COUNT;

  DELETE FROM public.clients cl USING _dup_cleanup_cand c WHERE cl.id = c.dup_client_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'backfill duplicados ganado: % candidatos, % prospectos re-enganchados, % encuestas reasignadas, % clientes duplicados borrados', v_candidates, v_prospects, v_surveys, v_deleted;
END $$;
