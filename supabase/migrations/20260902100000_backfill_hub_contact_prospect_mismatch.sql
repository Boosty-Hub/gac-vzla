-- Backfill de datos: segunda tanda de duplicados historicos del mismo bug que
-- 20260901120000_backfill_won_prospect_duplicate_clients.sql, pero con una causa distinta.
--
-- CAUSA RAIZ (nueva, no cubierta por el backfill anterior): fn_resolve_or_create_client_for_
-- prospect (ver 20260831160000_won_prospect_plate_identity.sql) resuelve cliente por telefono
-- como fallback. Varios "clientes" en produccion (Elio Vincent, Clarence Lamus, REDES ELIAS
-- C.A, Tobias Lefrenz, SARAH VANESSA ZAMBRANO LUDOVIC, VICENTE CROCCO, INVERSIONES ROSOVIC CA)
-- son en realidad CONTACTOS/INTERMEDIARIOS que gestionan compras para VARIAS empresas
-- distintas con el MISMO telefono. Cada vez que uno de esos numeros se reusaba en un prospecto
-- nuevo, el sistema los enganchaba al mismo cliente ya existente (el contacto) en vez de crear
-- o encontrar el cliente real (la empresa que factura el vehiculo) -- exactamente el reporte
-- del admin: "Elio Vincent es el contacto de la empresa, pero los vehiculos son facturados a
-- nombre de la empresa".
--
-- Este backfill corrige SOLO los casos comprobables por placa: el prospecto quedo apuntando
-- al contacto (hub), pero el vehiculo de esa placa ya esta correctamente en un cliente real y
-- DISTINTO (no otro hub). Repuntamos prospects.client_id y satisfaction_surveys.client_id al
-- dueno real. NUNCA se mueve ni se borra un vehiculo, y NUNCA se borra un cliente -- los
-- clientes-hub conservan su propia historia (otros prospectos/vehiculos genuinamente
-- irresueltos) y quedan intactos para revision manual.
--
-- El filtro "target no es el mismo un hub" (NOT EXISTS ... p2.client_id = v.client_id) excluye
-- automaticamente re-enganchar un prospecto A a un cliente que resulta ser OTRO contacto-hub
-- (ej. Clarence Lamus -> Elio Vincent): mover un problema a otro no es una correccion.
--
-- Verificado en produccion antes de este archivo con el mismo WITH ... RETURNING: 15
-- prospectos re-enganchados, 5 encuestas reasignadas (las otras 10 no tenian fila de encuesta
-- bajo el cliente-hub). Quedan sin tocar, a proposito, los casos donde el VEHICULO MISMO esta
-- registrado directamente bajo el hub (no solo el prospecto) -- ahi no hay ninguna placa
-- previa que pruebe quien es el dueno real, y adivinar recrearia el mismo problema. Requieren
-- que el admin identifique la empresa real caso por caso.
WITH cand AS (
  SELECT p.id AS prospect_id, p.client_id AS dup_client_id, v.client_id AS real_client_id
  FROM public.prospects p
  JOIN public.vehicles v ON upper(trim(v.plate)) = upper(trim(p.sold_plate))
  WHERE p.status = 'ganado'
    AND p.sold_plate IS NOT NULL
    AND p.client_id IS NOT NULL
    AND p.client_id <> v.client_id
    AND NOT EXISTS (
      SELECT 1 FROM public.prospects p2
      JOIN public.vehicles v2 ON upper(trim(v2.plate)) = upper(trim(p2.sold_plate))
      WHERE p2.status = 'ganado' AND p2.sold_plate IS NOT NULL
        AND p2.client_id = v.client_id AND p2.client_id <> v2.client_id
    )
),
upd_p AS (
  UPDATE public.prospects p SET client_id = c.real_client_id
  FROM cand c WHERE p.id = c.prospect_id
  RETURNING p.id AS prospect_id, c.dup_client_id, c.real_client_id
),
upd_s AS (
  UPDATE public.satisfaction_surveys s SET client_id = up.real_client_id
  FROM upd_p up WHERE s.prospect_id = up.prospect_id AND s.client_id = up.dup_client_id
  RETURNING s.id
)
SELECT (SELECT count(*) FROM upd_p) AS prospects_fixed, (SELECT count(*) FROM upd_s) AS surveys_fixed;
