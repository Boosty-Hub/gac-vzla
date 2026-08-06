-- REQUERIMIENTO: "Requiero que en los widgets haya un indicador tipo lista, ejemplo:
-- Vendedores: Julio 3, Nacarid 2, Elsy 1. No en grafico de barras, o de los que ya
-- aparecen." — pedido en reiteradas oportunidades.
--
-- El widget de lista usa exactamente el mismo conteo agrupado que ya alimenta a `bar` y
-- `pie`; lo unico que cambia es como se dibuja. Por eso alcanza con abrir el CHECK: no
-- hace falta ni columna nueva ni otra agregacion.

ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN ('kpi', 'bar', 'pie', 'list'));
