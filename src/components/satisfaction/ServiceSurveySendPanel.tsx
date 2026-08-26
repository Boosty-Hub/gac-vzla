import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Star, Send, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { sendServiceSurveyNow } from '@/components/clients/manualSurveySend';
import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';
import {
  recordSurveyDecision,
  closeSurveyDecision,
  fetchLatestSurveyDecision,
  describeSurveyDecision,
  type SurveyDecisionRecord,
} from '@/lib/surveyDecision';

/**
 * Enviar la encuesta de POSTVENTA (la del servicio) desde el Historial de Servicios.
 *
 * Hasta ahora la única puerta era el diálogo "Completar Servicio", y esa puerta se cierra una
 * sola vez: pasado ese momento no había forma de mandarle la encuesta a un servicio ya cerrado
 * sin volver a abrirlo y cerrarlo. El Historial es donde vive el registro del servicio, así que
 * es donde tiene que estar el botón.
 *
 * ES LA DE SERVICIO, NO LA DE VENTA. Van por `ensure_service_survey`, que crea la fila con
 * `origin = 'service'`, y la edge function la entrega escribiendo el campo `Link Encuesta /
 * Servicio` sobre el lead DE LA CITA — el que ya está parado en la columna "Completada", donde
 * vive el bot de postventa. La de venta usa otro campo, otro lead y además mueve la etapa.
 * Mezclarlas fue lo que el 2026-08-14 le mandó el mensaje de compra de vehículo a 30 clientes
 * de taller, así que acá no se comparte ni una constante.
 *
 * LO QUE ESTA PANTALLA NO DECIDE. Hay tres cortes por encima, y los tres se muestran antes de
 * ofrecer el botón para que nadie apriete contra una pared:
 *   1. El interruptor de la encuesta de postventa (Configuración → Automatizaciones).
 *   2. Si el tipo de servicio manda encuesta (`service_types.sends_postventa_survey`).
 *   3. Si el cliente ya respondió.
 *
 * Y muestra el acta: quién decidió enviarla o no, cuándo, y qué pasó después.
 */

interface ServiceSurveySendPanelProps {
  reservationId: string;
  clientId: string | null;
  status: string;
  serviceType: string | null;
  /** `encuestas.send`. Sin el permiso se muestra el estado, pero no el botón. */
  canSend: boolean;
  /** La encuesta de postventa de esta cita, si ya existe. */
  survey: ServiceSurveySummary | undefined;
}

const fmt = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

const ServiceSurveySendPanel = ({
  reservationId,
  clientId,
  status,
  serviceType,
  canSend,
  survey,
}: ServiceSurveySendPanelProps) => {
  const [decision, setDecision] = useState<SurveyDecisionRecord | null>(null);
  const [sending, setSending] = useState(false);
  // Si este tipo de servicio lleva encuesta. Sale de `service_types.sends_postventa_survey`,
  // la MISMA columna que corta del lado de la base y que se administra desde Configuración →
  // Servicios. Con una lista de nombres acá, apagarle la encuesta a un servicio desde el panel
  // seguiría mostrando el botón. Hoy la tienen apagada "Falla o Desperfecto" y "Solicitud de
  // Repuestos".
  const [sendsSurvey, setSendsSurvey] = useState(true);
  // El interruptor global de la encuesta de postventa. Se lee para AVISAR antes, no para
  // decidir: la base corta igual. Hoy está apagado.
  const [surveyEnabled, setSurveyEnabled] = useState(true);

  const reloadDecision = useCallback(async () => {
    setDecision(await fetchLatestSurveyDecision({ reservationId }));
  }, [reservationId]);

  useEffect(() => { reloadDecision(); }, [reloadDecision]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_survey_delivery_config')
      .then(({ data }: { data: unknown }) => {
        const row = (Array.isArray(data) ? data[0] : data) as { service_enabled?: boolean } | undefined;
        if (!cancelled) setSurveyEnabled(row?.service_enabled ?? true);
      })
      .catch(() => { if (!cancelled) setSurveyEnabled(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!serviceType) { setSendsSurvey(true); return; }
    supabase
      .from('service_types')
      .select('sends_postventa_survey')
      .eq('name', serviceType)
      .maybeSingle()
      .then(({ data }) => {
        // Tipo desconocido -> lleva encuesta. Es el mismo default que usa el trigger.
        if (!cancelled) {
          setSendsSurvey((data as { sends_postventa_survey?: boolean } | null)?.sends_postventa_survey ?? true);
        }
      });
    return () => { cancelled = true; };
  }, [serviceType]);

  if (status !== 'completada') return null;

  const answered = !!survey?.responded_at;
  const alreadySent = !answered && (survey?.status === 'sent' || !!decision?.decision);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      // El acta primero: si el envío falla o la pestaña se cierra, igual queda quién lo pidió.
      const decisionId = await recordSurveyDecision('postventa', true, { reservationId, clientId });
      const result = await sendServiceSurveyNow(reservationId);
      await closeSurveyDecision(decisionId, result.ok ? 'Enviada' : result.message);
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      await reloadDecision();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1">
        <Star className="w-3.5 h-3.5" /> Encuesta de postventa
      </p>

      {/* Estado real de la encuesta, antes que cualquier botón. */}
      {answered ? (
        <p className="text-[11px] text-green-700 flex items-center gap-1.5">
          <Check className="w-3 h-3 shrink-0" />
          El cliente respondió el {fmt(survey!.responded_at)}.
        </p>
      ) : alreadySent ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" />
          Enviada, sin responder todavía.
        </p>
      ) : null}

      {decision ? (
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          {decision.decision
            ? <Check className="w-3 h-3 mt-0.5 text-green-600 shrink-0" />
            : <X className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />}
          <span>{describeSurveyDecision(decision)}</span>
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nadie decidió todavía si se le envía la encuesta de este servicio.
        </p>
      )}

      {!sendsSurvey && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          «{serviceType}» está configurado para no enviar encuesta de postventa. Se cambia en
          Configuración → Servicios.
        </p>
      )}

      {sendsSurvey && !surveyEnabled && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          La encuesta de postventa / servicio está desactivada. Para poder enviarla hay que
          activarla primero en Configuración → Automatizaciones.
        </p>
      )}

      {answered ? null : !canSend ? (
        <p className="text-[11px] text-muted-foreground">
          Tu usuario no tiene el permiso para enviar encuestas. Se otorga en Configuración → Roles.
        </p>
      ) : sendsSurvey ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={sending || !surveyEnabled}
          onClick={handleSend}
        >
          {sending
            ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
            : <Send className="w-3 h-3 mr-1" />}
          {alreadySent ? 'Reenviar encuesta' : 'Enviar encuesta de postventa'}
        </Button>
      ) : null}
    </div>
  );
};

export default ServiceSurveySendPanel;
