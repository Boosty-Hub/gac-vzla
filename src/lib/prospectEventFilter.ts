/**
 * Opciones del filtro "Evento" de Prospectos.
 *
 * ANTES la lista se armaba con los eventos que YA tenían prospectos:
 *
 *     [...new Set(prospects.filter(p => p.event_name).map(p => p.event_name!))]
 *
 * O sea que un evento recién creado no aparecía hasta que entrara el primer lead — justo el
 * momento en que uno va a filtrar, para ver si ya llegó alguno. Y la ausencia no distingue
 * entre "el evento no existe", "el filtro está roto" y "todavía no hay leads", que son tres
 * conclusiones muy distintas. Fue el reporte de "Expo Zulia no me aparece": el evento existía,
 * creado ese mismo día, con cero leads.
 *
 * Ahora la lista sale del CATÁLOGO (`prospect_events`, el mismo que usa el formulario al
 * crear un prospecto) más cualquier nombre que aparezca en los prospectos y no esté en el
 * catálogo. Ese segundo grupo no es teórico: un evento cerrado sale del catálogo activo pero
 * sus leads siguen ahí, y sin él dejarían de poder filtrarse. Kommo también puede escribir un
 * nombre libre.
 *
 * Cada opción lleva su cantidad de leads, que es la respuesta a la pregunta que trae a
 * cualquiera hasta este filtro.
 */

export interface EventFilterOption {
  name: string;
  /** Leads con este evento. `0` es un dato, no un error. */
  count: number;
  /** Si sigue en el catálogo activo. Un evento cerrado con leads llega acá en `false`. */
  inCatalog: boolean;
}

export const buildEventFilterOptions = (
  catalog: ReadonlyArray<{ name: string }> | null | undefined,
  prospects: ReadonlyArray<{ event_name?: string | null }> | null | undefined,
): EventFilterOption[] => {
  const counts = new Map<string, number>();
  for (const p of prospects ?? []) {
    const name = (p.event_name ?? '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const catalogNames = new Set(
    (catalog ?? []).map(e => e.name.trim()).filter(Boolean),
  );

  // Catálogo primero, después lo que exista en los prospectos y no esté en él.
  const names = new Set<string>([...catalogNames, ...counts.keys()]);

  return [...names]
    .map(name => ({
      name,
      count: counts.get(name) ?? 0,
      inCatalog: catalogNames.has(name),
    }))
    // Alfabético: se viene a buscar un nombre concreto, no el más grande.
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
};
