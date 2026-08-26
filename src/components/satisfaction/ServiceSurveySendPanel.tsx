import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Star, Send, Check, X, Clock } from 'lucide-react';
import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';
import {
  fetchLatestSurveyDecision,
  describeSurveyDecision,
  type SurveyDecisionRecord,
} from '@/lib/surveyDecision';

/**
 * Estado de la encuesta de POSTVENTA de un servicio, dentro del detalle de la cita.
 *
 * Muestra: si ya se envió, si el cliente respondió, y quién decidió mandarla o no. El botón NO
 * envía desde acá — abre el mismo diálogo de confirmación que el icono del listado
 * (`ServiceSurveySendDialog`), para que el envío se haga en un solo lugar y pregunte siempre lo
 * mismo. Dos caminos de envío que preguntan distinto terminan siendo dos comportamientos.
 *
 * ES LA DE SERVICIO, NO LA DE VENTA. La entrega escribe el campo «Link Encuesta / Servicio»
 * sobre el lead DE LA CITA — el que ya está en la columna "Completada", donde vive el bot de
 * postventa — y no mueve ninguna etapa. La de venta usa otro campo, otro lead y sí mueve etapa.
 * Mezclarlas fue lo que el 2026-08-14 le mandó el mensaje de compra de vehículo a 30 clientes
 * de taller, así que acá no se comparte ni una constante.
 */

interface ServiceSurveySendPanelProps {
  reservationId: string;
  status: string;
  serviceType: string | null;
  /** `encuestas.send`. Sin el permiso se muestra el estado, pero no el botón. */
  canSend: boolean;
  /** La encuesta de postventa de esta cita, si ya existe. */
  survey: ServiceSurveySummary | undefined;
  /** Si el tipo de servicio de esta cita manda encuesta (Configuración → Servicios). */
  sendsSurvey: boolean;
  /** El interruptor global (Configuración → Automatizaciones). */
  surveyEnabled: boolean;
  /** Abre el diálogo de confirmación para esta cita. */
  onSend: () => void;
}

const fmt = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

const ServiceSurveySendPanel = ({
  reservationId,
  status,
  serviceType,
  canSend,
  survey,
  sendsSurvey,
  surveyEnabled,
  onSend,
}: ServiceSurveySendPanelProps) => {
  const [decision, setDecision] = useState<SurveyDecisionRecord | null>(null);

  const reloadDecision = useCallback(async () => {
    setDecision(await fetchLatestSurveyDecision({ reservationId }));
  }, [reservationId]);

  useEffect(() => { reloadDecision(); }, [reloadDecision]);

  if (status !== 'completada') return null;

  const answered = !!survey?.responded_at;
  const alreadySent = !answered && (survey?.status === 'sent' || !!decision?.decision);

  return (
    <div className="rounded-md border p-3 space-y-2">
      <p className="text-xs font-semibold flex items-center gap-1">
        <Star className="w-3.5 h-3.5" /> Encuesta de postventa
      </p>

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

      {!canSend ? (
        <p className="text-[11px] text-muted-foreground">
          Tu usuario no tiene el permiso para enviar encuestas. Se otorga en Configuración → Roles.
        </p>
      ) : sendsSurvey ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={!surveyEnabled}
          onClick={onSend}
        >
          <Send className="w-3 h-3 mr-1" />
          {alreadySent || answered ? 'Reenviar encuesta' : 'Enviar encuesta de postventa'}
        </Button>
      ) : null}
    </div>
  );
};

export default ServiceSurveySendPanel;
