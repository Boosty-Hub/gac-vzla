-- REQUERIMIENTO: "en el widget solo me aparece fuente de datos prospectos cuando tenemos
-- muchos mas".
--
-- Cierto: `source_table` estaba limitado a 'prospects' tanto en el CHECK como en el
-- catalogo del front. Se abren las tres tablas que ya alimentan los tableros del panel y
-- que tienen una columna de fecha para el filtro global de rango:
--
--   reservations  fecha `created_at`, con `dealership_id`  -> respeta el filtro global de concesionario
--   clients       fecha `created_at`, SIN concesionario    -> el filtro global de concesionario no aplica
--   vehicles      fecha `created_at`, SIN concesionario    -> idem
--
-- Que clients y vehicles no tengan concesionario no es un olvido: un cliente puede
-- atenderse en varios. El front lo declara por fuente (`dealershipColumn`) y omite ese
-- filtro donde no corresponde, en vez de mandar un `eq` sobre una columna inexistente —
-- eso devolvia error y el widget quedaba en cero sin decir por que.

ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_source_table_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_source_table_check
  CHECK (source_table IN ('prospects', 'reservations', 'clients', 'vehicles'));
