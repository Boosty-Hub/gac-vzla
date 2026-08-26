/**
 * El estado con el que ENTRA un prospecto al embudo.
 *
 * Antes cada pantalla escribía `'nuevo'` a mano. `'nuevo'` nunca estuvo en el catálogo
 * `prospect_statuses`, así que la pantalla lo mostraba como "Desconocido" — eran 50 prospectos
 * en ese limbo, y el selector de Estado del formulario de alta arrancaba en blanco porque el
 * valor elegido no era ninguna de las opciones.
 *
 * Ahora sale del catálogo, que es el mismo que se administra desde Prospectos → "Gestionar
 * estados". Si mañana reordenan el embudo, la entrada los sigue sin tocar código. Es la misma
 * regla que aplica `public.default_prospect_status()` del lado de la base, y a propósito: la
 * base es la que garantiza el resultado, esto es para que la pantalla muestre lo mismo desde
 * el primer instante en vez de mostrar una cosa y guardar otra.
 */

/** Sólo para el rato en que el catálogo todavía no cargó. La base decide igual. */
export const ENTRY_STATUS_FALLBACK = 'por_contactar';

export const entryStatus = (
  statuses: ReadonlyArray<{ name: string; sort_order?: number | null; is_active?: boolean | null }>
    | null | undefined,
): string => {
  const active = (statuses ?? []).filter(s => s.is_active !== false);
  if (active.length === 0) return ENTRY_STATUS_FALLBACK;
  return [...active].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  )[0].name;
};
