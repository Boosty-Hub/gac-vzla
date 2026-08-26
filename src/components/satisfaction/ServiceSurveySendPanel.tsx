import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Star, Send, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { sendServiceSurveyNow } from '@/components/clients/manualSurveySend';
import {
  recordSurveyDecision,
  closeSurveyDecision,
  fetchLatestSurveyDecision,
  describeSurveyDecision,
  type SurveyDecisionRecord,
} from '@/lib/surveyDecision';

/**
 * Enviar la encuesta de postventa desde el Historial de Servicios (2026-08-26).
 *
 * Hasta ahora la única puerta era el diálogo "Completar Servicio", y esa puerta se cierra una
 * sola vez: pasado ese momento no había forma de mandar la encuesta de un servicio ya cerrado
 * sin volver a abrirlo y cerrarlo de nuevo. El Historial es donde vive el registro del
 * servicio, así que es donde tiene que estar el botón.
 *
 * Muestra además el acta: quién eligió enviarla o no, cuándo, y qué pasó después. Sin eso, el
 * botón invita a mandar por segunda vez una encuesta que alguien ya decidió no mandar.
 *
 * Sólo aparece para servicios COMPLETADOS. Una cita cancelada no tiene servicio que evaluar, y
 * ofrecer el botón ahí sería ofrecer un envío que la base rechaza igual.
 */

interface ServiceSurveySendPanelProps {
  reservationId: string;
  clientId: string | null;
  status: string;
  serviceType: string | null;
  /** `encuestas.send`. Sin el permiso no se muestra el botón, sólo el acta. */
  canSend: boolean;
  /** true cuando el cliente YA respondió: no tiene sentido volver a pedírsela. */
  hasResponse: boolean;
}

const ServiceSurveySendPanel = ({
  reservationId,
  clientId,
  status,
  serviceType,
  canSend,
  hasResponse,
}: ServiceSurveySendPanelProps) => {
  const [decision, setDecision] = useState<SurveyDecisionRecord | null>(null);
  const [sending, setSending] = useState(false);
  // Si este tipo de servicio lleva encuesta. Sale de `service_types.sends_postventa_survey`,
  // la MISMA columna que corta del lado de la base y que se administra desde Configuración →
  // Servicios. Con una lista de nombres acá, apagarle la encuesta a un servicio desde el panel
  // seguiría mostrando el botón.
  const [sendsSurvey, setSendsSurvey] = useState(true);

  const reloadDecision = useCallback(async () => {
    setDecision(await fetchLatestSurveyDecision({ reservationId }));
  }, [reservationId]);

  useEffect(() => { reloadDecision(); }, [reloadDecision]);

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
        if (!cancelled) setSendsSurvey((data as { sends_postventa_survey?: boolean } | null)?.sends_postventa_survey ?? true);
      });
    return () => { cancelled = true; };
  }, [serviceType]);

  if (status !== 'completada') return null;

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      // El acta primero: si el envío falla o la pestaña se cierra, igual queda quién lo pidió.
      const decisionId = await recordSurveyDecision('postventa', true, {
        reservationId,
        clientId,
      });
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
        <p className="text-[11px] text-amber-700">
          Este tipo de servicio está configurado para no enviar encuesta de postventa. Se cambia
          en Configuración → Servicios.
        </p>
      )}

      {hasResponse ? (
        <p className="text-[11px] text-green-700">El cliente ya respondió esta encuesta.</p>
      ) : canSend && sendsSurvey ? (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={sending} onClick={handleSend}>
          {sending
            ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
            : <Send className="w-3 h-3 mr-1" />}
          {decision?.decision ? 'Reenviar encuesta' : 'Enviar encuesta de postventa'}
        </Button>
      ) : !canSend ? (
        <p className="text-[11px] text-muted-foreground">
          Tu usuario no tiene el permiso para enviar encuestas. Se otorga en Configuración → Roles.
        </p>
      ) : null}
    </div>
  );
};

export default ServiceSurveySendPanel;
