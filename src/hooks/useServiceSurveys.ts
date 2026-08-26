import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Loads the postventa (origin = 'service') survey for a set of reservations, keyed by
 * `reservation_id` (R7).
 *
 * One query for the whole history list, not one per row — a vehicle with 30 services would
 * otherwise fire 30 requests to render a single dialog.
 *
 * REACTIVADA el 2026-08-13. Estuvo en pausa desde el 2026-08-04 por el ruteo incorrecto que
 * mandaba la postventa al bot de ventas; eso lo resuelve
 * 20260813130000_postventa_survey_dispatch.sql, que ademas exige la config de Kommo propia
 * antes de despachar.
 */

/** Respuestas al cuestionario de opcion cerrada. Las claves son las columnas `q_*`. */
export interface ServiceSurveyAnswers {
  q_recepcion_imagen: string | null;
  q_explicacion_tecnica: string | null;
  q_informe_tecnico: string | null;
  q_garantia_repuestos: string | null;
  q_presentacion_equipo: string | null;
  q_limpieza_entrega: string | null;
  q_precio_mano_obra: string | null;
  q_conclusion_tecnica: string | null;
  comment: string | null;
  overall_score: number | string | null;
  has_low_score: boolean | null;
  /**
   * Respuestas al cuestionario 1..5 anterior al 2026-08-13, archivadas al cambiar de
   * cuestionario. Se conservan porque son respuestas reales de clientes, pero no se agregan
   * en ningun promedio: las preguntas no son comparables.
   */
  legacy_answers: Record<string, unknown> | null;
}

export interface ServiceSurveySummary {
  id: string;
  reservation_id: string;
  status: string;
  responded_at: string | null;
  /** Null until the customer answers. */
  response: ServiceSurveyAnswers | null;
}

export function useServiceSurveys(reservationIds: string[]) {
  const [surveys, setSurveys] = useState<Map<string, ServiceSurveySummary>>(new Map());
  const [loading, setLoading] = useState(false);
  // Se incrementa para volver a pedir las mismas encuestas. Hace falta desde que se puede
  // ENVIAR una desde el listado: sin esto el icono de esa fila seguiría diciendo "sin
  // enviar" hasta recargar la página.
  const [reloadToken, setReloadToken] = useState(0);

  // Join the ids into a stable primitive so the effect doesn't re-run on every render just
  // because the caller passed a freshly-built array with identical contents.
  const key = reservationIds.slice().sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setSurveys(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      // Los ids viajan DENTRO DE LA URL (`?reservation_id=in.(...)`). Un uuid ocupa 37
      // caracteres, así que el Historial con 1000 filas por página armaría una URL de ~37 KB
      // y el servidor la rechaza con 414 antes de mirarla. Cortado en lotes, cada pedido
      // queda en unos 5 KB y los lotes van en paralelo.
      const CHUNK = 120;
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

      const results = await Promise.all(chunks.map(chunk =>
        // `satisfaction_surveys` / `service_survey_responses` are not in the generated
        // types.ts yet — `as any` matches this project's convention for new DB objects.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('satisfaction_surveys')
          .select('id, reservation_id, status, responded_at, response:service_survey_responses(*)')
          .eq('origin', 'service')
          // A suppressed survey must never render. It was withdrawn on purpose — showing it
          // as "enviada, sin responder" would blame the customer for silence we caused.
          .is('suppressed_reason', null)
          .in('reservation_id', chunk),
      ));

      if (cancelled) return;

      const failed = results.find(r => r.error);
      if (failed) {
        // A history list must still render if this side lookup fails — the survey is
        // supplementary information, not the point of the dialog. Se descarta TODO y no lo
        // que llegó: un mapa a medias pintaría "sin enviar" sobre encuestas ya enviadas,
        // que es peor que no pintar nada.
        console.error('Error loading service surveys:', failed.error);
        setSurveys(new Map());
      } else {
        const map = new Map<string, ServiceSurveySummary>();
        for (const result of results) {
          for (const row of (result.data || []) as ServiceSurveySummary[]) {
            if (row.reservation_id) map.set(row.reservation_id, row);
          }
        }
        setSurveys(map);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key, reloadToken]);

  return { surveys, loading, reload: () => setReloadToken(t => t + 1) };
}
