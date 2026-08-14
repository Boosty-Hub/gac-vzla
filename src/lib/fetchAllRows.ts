/**
 * Trae TODAS las filas de una consulta de PostgREST, paginando.
 *
 * Existe porque una consulta sin paginar tiene dos techos, y los dos truncan en silencio:
 *
 *  - `.limit(N)` puesto a mano. Las listas de citas usaban 200 y 300 cuando la tabla ya
 *    tiene 637 filas: el asesor y el concesionario veían sólo las más recientes, sin
 *    ningún aviso, y los contadores de esas pantallas contaban sobre lo truncado.
 *  - Sin `.limit()`, PostgREST igual corta en 1000 filas por pedido. Eso no avisa nada:
 *    la pantalla simplemente muestra de menos.
 *
 * Devolver menos filas de las que hay es peor que fallar, porque nadie se entera. Acá se
 * pide de a `pageSize` hasta que una página vuelve incompleta, que es la señal de fin.
 *
 * Uso:
 *
 *   const rows = await fetchAllRows<Reservation>((from, to) =>
 *     supabase.from('reservations').select('*').order('created_at').range(from, to)
 *   );
 *
 * OJO: la consulta tiene que traer un `.order()` estable. Sin orden, PostgREST no garantiza
 * que las páginas sean consistentes entre sí y se pueden repetir o perder filas.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const acc: T[] = [];
  // Tope de seguridad: 100 páginas = 100.000 filas. Si alguna vez se alcanza, es un bug
  // (una consulta sin filtrar o un `.order()` inestable), no un caso legítimo — y es mejor
  // cortar que dejar el navegador pidiendo para siempre.
  for (let page = 0; page < 100; page++) {
    const { data } = await build(page * pageSize, page * pageSize + pageSize - 1);
    const rows = data || [];
    acc.push(...rows);
    if (rows.length < pageSize) break;
  }
  return acc;
}
