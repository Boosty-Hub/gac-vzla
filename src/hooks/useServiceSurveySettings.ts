import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Las dos condiciones que deciden si una cita PUEDE recibir la encuesta de postventa, leídas
 * una sola vez para toda la pantalla.
 *
 *   1. El interruptor global de la encuesta de postventa (Configuración → Automatizaciones).
 *   2. Si ese tipo de servicio manda encuesta (`service_types.sends_postventa_survey`, que se
 *      administra desde Configuración → Servicios). Hoy la tienen apagada "Falla o
 *      Desperfecto" y "Solicitud de Repuestos".
 *
 * Vive acá y no adentro de cada fila porque el Historial muestra hasta 1000 citas por página:
 * preguntarlo por fila serían mil consultas para pintar una columna de iconos.
 *
 * Las dos salen de la BASE, nunca de una lista de nombres en el código. Con una lista aparte,
 * apagarle la encuesta a un servicio desde el panel seguiría ofreciendo el botón.
 */

export interface ServiceSurveySettings {
  /** El interruptor global. `true` mientras no se sepa: la base corta igual. */
  enabled: boolean;
  /** Si este tipo de servicio manda encuesta. Tipo desconocido -> sí, igual que el trigger. */
  sendsSurvey: (serviceType: string | null | undefined) => boolean;
  loading: boolean;
}

export function useServiceSurveySettings(): ServiceSurveySettings {
  const [enabled, setEnabled] = useState(true);
  // Sólo los que NO mandan: son dos contra veintitantos, y así un tipo nuevo arranca mandando,
  // que es el default del trigger.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [configRes, typesRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)('get_survey_delivery_config'),
        supabase.from('service_types').select('name, sends_postventa_survey'),
      ]);
      if (cancelled) return;

      const row = (Array.isArray(configRes?.data) ? configRes.data[0] : configRes?.data) as
        | { service_enabled?: boolean }
        | undefined;
      setEnabled(row?.service_enabled ?? true);

      const rows = (typesRes.data || []) as { name: string; sends_postventa_survey: boolean | null }[];
      setExcluded(new Set(rows.filter(r => r.sends_postventa_survey === false).map(r => r.name)));
      setLoading(false);
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return {
    enabled,
    sendsSurvey: (serviceType) => !excluded.has(serviceType ?? ''),
    loading,
  };
}
