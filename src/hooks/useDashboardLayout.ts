import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Cómo se dibuja un gráfico. `default` es como se dibujaba siempre — torta, línea, barras
 * apiladas, ranking con medallas —; no se pierde, es una opción más y la inicial.
 */
export type ChartView = 'default' | 'list' | 'bar' | 'pie';

/**
 * Clave con la que un widget configurable guarda su preferencia. Lleva prefijo para que no
 * pueda chocar nunca con la clave de un gráfico fijo del tablero.
 *
 * Vive acá y no en DynamicWidget porque exportar una función desde un archivo de componente
 * rompe el fast refresh de Vite.
 */
export const widgetPrefKey = (id: string) => `widget:${id}`;

interface PrefRow {
  chart_key: string;
  view_type: ChartView;
  sort_order: number;
}

/**
 * Preferencias de tablero por usuario: tipo de vista y posición de cada gráfico,
 * persistidas en `dashboard_layout_prefs`.
 *
 * Todo cambio es optimista: se aplica en pantalla al instante y recién después se guarda.
 * Un tablero que se congela medio segundo cada vez que movés una tarjeta no se usa, y si
 * la escritura falla el peor caso es que el orden vuelva en la próxima carga — no se
 * pierde ningún dato del negocio.
 */
export function useDashboardLayout() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;

  const [prefs, setPrefs] = useState<Record<string, PrefRow>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!profileId) { setPrefs({}); setReady(true); return; }

    (async () => {
      const { data, error } = await supabase
        .from('dashboard_layout_prefs' as never)
        .select('chart_key, view_type, sort_order')
        .eq('profile_id', profileId);
      if (cancelled) return;
      if (error) {
        // Sin preferencias el tablero funciona igual, con el orden y las vistas por
        // defecto. No se molesta al usuario con un toast por esto.
        console.error('No se pudieron cargar las preferencias del tablero', error);
        setPrefs({});
      } else {
        const map: Record<string, PrefRow> = {};
        ((data || []) as unknown as PrefRow[]).forEach(r => { map[r.chart_key] = r; });
        setPrefs(map);
      }
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [profileId]);

  const persist = useCallback(async (rows: PrefRow[]) => {
    if (!profileId || rows.length === 0) return;
    const { error } = await supabase
      .from('dashboard_layout_prefs' as never)
      .upsert(
        rows.map(r => ({ profile_id: profileId, ...r })) as never,
        { onConflict: 'profile_id,chart_key' },
      );
    if (error) console.error('No se pudo guardar la preferencia del tablero', error);
  }, [profileId]);

  const viewOf = useCallback(
    (key: string): ChartView => prefs[key]?.view_type ?? 'default',
    [prefs],
  );

  const setView = useCallback((key: string, view: ChartView) => {
    setPrefs(prev => {
      const row: PrefRow = {
        chart_key: key,
        view_type: view,
        sort_order: prev[key]?.sort_order ?? 0,
      };
      persist([row]);
      return { ...prev, [key]: row };
    });
  }, [persist]);

  /**
   * Ordena las claves según lo guardado, cayendo al orden en que vienen para las que el
   * usuario nunca tocó. El desempate por índice original es lo que hace que un gráfico
   * nuevo aparezca donde el código lo pone y no en un lugar al azar.
   */
  const order = useCallback((keys: string[]): string[] => {
    const idx = new Map(keys.map((k, i) => [k, i]));
    return [...keys].sort((a, b) => {
      const pa = prefs[a]?.sort_order;
      const pb = prefs[b]?.sort_order;
      const oa = pa === undefined ? 1000 + (idx.get(a) ?? 0) : pa;
      const ob = pb === undefined ? 1000 + (idx.get(b) ?? 0) : pb;
      if (oa !== ob) return oa - ob;
      return (idx.get(a) ?? 0) - (idx.get(b) ?? 0);
    });
  }, [prefs]);

  /**
   * Mueve una tarjeta un lugar arriba o abajo. Reescribe el `sort_order` de TODAS: dejar
   * huecos o índices repetidos hace que el próximo movimiento sea impredecible.
   */
  const move = useCallback((key: string, dir: -1 | 1, keys: string[]) => {
    const current = order(keys);
    const from = current.indexOf(key);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    [next[from], next[to]] = [next[to], next[from]];

    const rows: PrefRow[] = next.map((k, i) => ({
      chart_key: k,
      view_type: prefs[k]?.view_type ?? 'default',
      sort_order: i,
    }));
    setPrefs(prev => {
      const map = { ...prev };
      rows.forEach(r => { map[r.chart_key] = r; });
      return map;
    });
    persist(rows);
  }, [order, prefs, persist]);

  /** Deja todo como viene de fábrica: borra las preferencias de este usuario. */
  const reset = useCallback(async () => {
    setPrefs({});
    if (!profileId) return;
    const { error } = await supabase
      .from('dashboard_layout_prefs' as never)
      .delete()
      .eq('profile_id', profileId);
    if (error) console.error('No se pudo restablecer el tablero', error);
  }, [profileId]);

  const hasCustomLayout = useMemo(() => Object.keys(prefs).length > 0, [prefs]);

  return { ready, viewOf, setView, order, move, reset, hasCustomLayout };
}

export type DashboardLayoutApi = ReturnType<typeof useDashboardLayout>;
