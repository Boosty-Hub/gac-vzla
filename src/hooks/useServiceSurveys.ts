import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Loads the postventa (origin = 'service') survey for a set of reservations, keyed by
 * `reservation_id` (R7).
 *
 * One query for the whole history list, not one per row — a vehicle with 30 services would
 * otherwise fire 30 requests to render a single dialog.
 *
 * EN PAUSA (2026-08-04). La postventa pertenece a un proyecto mayor que aun no arranca, asi
 * que el trigger que crea estas encuestas esta desactivado
 * (migracion 20260804140000_pause_postventa_survey.sql). Este hook queda intacto y devuelve
 * un Map vacio; `ServiceSurveyInline` no renderiza nada sin encuesta, de modo que el
 * historial del vehiculo se ve exactamente igual que antes de la funcion. Al reactivar el
 * trigger, esto vuelve a poblarse solo.
 */

export interface ServiceSurveySummary {
  id: string;
  reservation_id: string;
  status: string;
  responded_at: string | null;
  /** Null until the customer answers. */
  response: {
    q_agendamiento: number;
    q_recepcion_asesor: number;
    q_tiempo_entrega: number;
    q_calidad_servicio: number;
    q_instalaciones: number;
    nps_recomienda: boolean | null;
    comment: string | null;
    overall_score: number | string;
    has_low_score: boolean;
  } | null;
}

export function useServiceSurveys(reservationIds: string[]) {
  const [surveys, setSurveys] = useState<Map<string, ServiceSurveySummary>>(new Map());
  const [loading, setLoading] = useState(false);

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
      // `satisfaction_surveys` / `service_survey_responses` are not in the generated
      // types.ts yet — `as any` matches this project's convention for new DB objects.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('satisfaction_surveys')
        .select('id, reservation_id, status, responded_at, response:service_survey_responses(*)')
        .eq('origin', 'service')
        // A suppressed survey must never render. It was withdrawn on purpose — showing it as
        // "enviada, sin responder" would blame the customer for silence we caused.
        .is('suppressed_reason', null)
        .in('reservation_id', ids);

      if (cancelled) return;
      if (error) {
        // A history list must still render if this side lookup fails — the survey is
        // supplementary information, not the point of the dialog.
        console.error('Error loading service surveys:', error);
        setSurveys(new Map());
      } else {
        const map = new Map<string, ServiceSurveySummary>();
        for (const row of (data || []) as ServiceSurveySummary[]) {
          if (row.reservation_id) map.set(row.reservation_id, row);
        }
        setSurveys(map);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  return { surveys, loading };
}
