import { supabase } from '@/integrations/supabase/client';

/** Un convenio ya usado y cuántos clientes externos trajo. */
export interface ExternalSource {
  source: string;
  clientes: number;
}

/**
 * Firma real de la RPC `external_sources`, declarada una sola vez.
 *
 * La función es nueva y todavía no está en los tipos generados (`types.ts` no se regeneró),
 * así que sin esto cada call site tendría que castear a `any` — tres `any` sueltos en vez de
 * un tipo. Ver supabase/migrations/20260811130000_external_source.sql.
 */
type SourcesRpc = (fn: string) => Promise<{ data: ExternalSource[] | null; error: unknown }>;

/**
 * Devuelve las etiquetas de convenio ya cargadas, de la más usada a la menos.
 *
 * Se ofrecen como sugerencia en los tres formularios que pueden crear un cliente externo
 * (Clientes, Citas del admin y Citas del concesionario). Sin esa lista cada quien escribe la
 * suya —"Seguros Caracas", "seguros caracas", "S. Caracas"— y el filtro por convenio deja de
 * significar algo. La normalización en la DB arregla los espacios y las mayúsculas, pero no
 * puede adivinar que dos nombres distintos son la misma empresa.
 */
export async function listExternalSources(): Promise<ExternalSource[]> {
  const { data } = await (supabase.rpc as unknown as SourcesRpc)('external_sources');
  return data || [];
}
