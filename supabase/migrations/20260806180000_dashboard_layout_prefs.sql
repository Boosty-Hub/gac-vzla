-- REQUERIMIENTO: "deseo tener en cada filtro un boton para cambiar el grafico de barras
-- por [lista] ... y ademas que me permita en el dashboard tener un icono para mover
-- libremente mi grafico sea mas arriba o en la mitad o de ultimo ... y que se recuerde
-- como lo puse a menos que lo cambie: cambio hoy, asi lo tengo que seguir viendo."
--
-- Son tres cosas y las tres viven en esta tabla: tipo de vista, posicion y persistencia.
--
-- POR QUE POR USUARIO Y NO GLOBAL
-- El pedido dice "MI grafico" y "como lo puse YO". Si la preferencia fuera global, el
-- primero que reordena le cambia el tablero a todos los demas. Ademas `dashboard_widgets`
-- ya tiene un `sort_order` global que administra el admin: esto no lo reemplaza, lo pisa
-- solo para quien lo haya tocado. Un usuario que nunca reordeno sigue viendo el orden por
-- defecto.
--
-- POR QUE UNA FILA POR GRAFICO Y NO UN JSON POR USUARIO
-- Mover un grafico reescribe el `sort_order` de todos, pero cambiar el tipo de vista toca
-- uno solo. Con filas, dos pestañas abiertas que cambian graficos distintos no se pisan
-- entre si; con un JSON unico, la ultima en escribir gana y borra lo de la otra.
--
-- `chart_key` es texto libre a proposito: convive el grafico fijo del tablero
-- ('tipos_servicio', 'ranking_vendedores', ...) con el widget configurable, que usa
-- 'widget:<uuid>'. Una sola tabla ordena las dos cosas en la misma lista.

CREATE TABLE IF NOT EXISTS public.dashboard_layout_prefs (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chart_key  text NOT NULL,
  -- 'default' = como el grafico se dibujaba siempre (torta, linea, barras apiladas,
  -- ranking con medallas). No se pierde: es una opcion mas, y la inicial.
  view_type  text NOT NULL DEFAULT 'default' CHECK (view_type IN ('default', 'list', 'bar', 'pie')),
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, chart_key)
);

COMMENT ON TABLE public.dashboard_layout_prefs IS
  'Preferencias de tablero POR USUARIO: como se dibuja cada grafico y en que posicion. '
  'chart_key es la clave del grafico fijo, o "widget:<uuid>" para los configurables. '
  'Ver 20260806180000.';

ALTER TABLE public.dashboard_layout_prefs ENABLE ROW LEVEL SECURITY;

-- Cada quien administra las suyas y nada mas. No hay lectura cruzada ni siquiera para el
-- admin: no es informacion del negocio, es como acomodo su pantalla cada uno.
DROP POLICY IF EXISTS dashboard_layout_prefs_own ON public.dashboard_layout_prefs;
CREATE POLICY dashboard_layout_prefs_own ON public.dashboard_layout_prefs
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_layout_prefs TO authenticated;
