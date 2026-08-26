import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Star, Send, Check, X, Clock, Phone, Car, User, Wrench } from 'lucide-react';
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
 * Confirmación antes de mandarle la encuesta de POSTVENTA a un cliente.
 *
 * Existe porque el envío es un mensaje de WhatsApp a una persona real y no se puede deshacer.
 * Desde el listado del Historial el icono queda a un clic de distancia de cualquier fila, y sin
 * este paso el error de mano manda la encuesta del servicio de otro cliente.
 *
 * Muestra TODO antes de preguntar: a quién, a qué teléfono, por qué servicio, si ya se le mandó
 * y quién lo decidió la última vez. Un "¿Confirmás?" sin esos datos no es una confirmación, es
 * un trámite que la gente aprende a saltear.
 *
 * Los cortes que la base aplica igual (interruptor apagado, tipo de servicio excluido, cliente
 * sin teléfono) se muestran ACÁ como motivo, con el botón deshabilitado. Dejar apretar para que
 * después falle enseña a desconfiar del botón.
 *
 * Es la encuesta de SERVICIO, no la de venta: va por `ensure_service_survey` y se entrega
 * escribiendo el campo «Link Encuesta / Servicio» sobre el lead de la cita.
 */

export interface ServiceSurveyTarget {
  reservationId: string;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  plate: string | null;
  serviceType: string | null;
  date: string | null;
}

interface ServiceSurveySendDialogProps {
  target: ServiceSurveyTarget | null;
  /** La encuesta de esta cita, si ya existe. */
  survey: ServiceSurveySummary | undefined;
  /** El interruptor global de la encuesta de postventa. */
  surveyEnabled: boolean;
  /** Si el tipo de servicio de esta cita manda encuesta. */
  sendsSurvey: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama después de un envío exitoso, para refrescar el listado. */
  onSent: () => void;
}

const fmt = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

const Row = ({ icon: Icon, label, value }: {
  icon: typeof User; label: string; value: string;
}) => (
  <div className="flex items-start gap-2">
    <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium break-words">{value}</p>
    </div>
  </div>
);

const ServiceSurveySendDialog = ({
  target,
  survey,
  surveyEnabled,
  sendsSurvey,
  onOpenChange,
  onSent,
}: ServiceSurveySendDialogProps) => {
  const [decision, setDecision] = useState<SurveyDecisionRecord | null>(null);
  const [sending, setSending] = useState(false);

  const reservationId = target?.reservationId ?? null;

  const reloadDecision = useCallback(async () => {
    if (!reservationId) { setDecision(null); return; }
    setDecision(await fetchLatestSurveyDecision({ reservationId }));
  }, [reservationId]);

  useEffect(() => { reloadDecision(); }, [reloadDecision]);

  const answered = !!survey?.responded_at;
  const alreadySent = !answered && (survey?.status === 'sent' || !!decision?.decision);
  const hasPhone = !!target?.clientPhone?.trim();
  const hasClient = !!target?.clientId;

  // Un solo motivo, el primero que corresponda. Listar los tres a la vez confunde: lo que hace
  // falta saber es qué destrabar primero.
  const blocker: string | null =
    !sendsSurvey
      ? `«${target?.serviceType}» está configurado para no enviar encuesta de postventa. Se cambia en Configuración → Servicios.`
      : !surveyEnabled
        ? 'La encuesta de postventa / servicio está desactivada. Hay que activarla en Configuración → Automatizaciones antes de poder enviarla.'
        : !hasClient
          ? 'Esta cita no está asociada a un cliente registrado, así que no hay a quién enviársela.'
          : !hasPhone
            ? 'Este cliente no tiene teléfono cargado, y la encuesta se envía por WhatsApp.'
            : null;

  const handleSend = async () => {
    if (!target || sending) return;
    setSending(true);
    try {
      // El acta primero: si el envío falla o se cierra la pestaña, igual queda quién lo pidió.
      const decisionId = await recordSurveyDecision('postventa', true, {
        reservationId: target.reservationId,
        clientId: target.clientId,
      });
      const result = await sendServiceSurveyNow(target.reservationId);
      await closeSurveyDecision(decisionId, result.ok ? 'Enviada' : result.message);
      if (result.ok) {
        toast.success(result.message);
        onSent();
        onOpenChange(false);
      } else {
        // Se queda abierto a propósito: el motivo aparece en el diálogo y desde acá se puede
        // reintentar sin volver a buscar la fila.
        toast.warning(result.message);
        await reloadDecision();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={open => { if (!open && !sending) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-sm flex items-center gap-2">
            <Star className="w-4 h-4" /> Enviar encuesta de postventa
          </DialogTitle>
          <DialogDescription className="text-xs">
            Se le envía por WhatsApp la encuesta del servicio que se le realizó. Revisá a quién
            va antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
              <Row icon={User} label="Cliente" value={target.clientName || 'Sin cliente'} />
              <Row icon={Phone} label="Teléfono" value={target.clientPhone?.trim() || 'Sin teléfono'} />
              <Row icon={Car} label="Placa" value={target.plate || '-'} />
              <Row icon={Wrench} label="Servicio" value={target.serviceType || '-'} />
            </div>

            {target.date && (
              <p className="text-[11px] text-muted-foreground">
                Cita del {target.date}.
              </p>
            )}

            <Separator />

            {/* Estado de la encuesta, para no mandar dos veces sin querer. */}
            {answered ? (
              <p className="text-xs text-green-700 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                El cliente ya respondió esta encuesta el {fmt(survey!.responded_at)}.
              </p>
            ) : alreadySent ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Ya se le envió esta encuesta y todavía no respondió. Confirmar se la
                  vuelve a mandar.</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 shrink-0" />
                Todavía no se le envió la encuesta de este servicio.
              </p>
            )}

            {decision && (
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                {decision.decision
                  ? <Check className="w-3 h-3 mt-0.5 text-green-600 shrink-0" />
                  : <X className="w-3 h-3 mt-0.5 shrink-0" />}
                <span>Última decisión: {describeSurveyDecision(decision)}</span>
              </p>
            )}

            {blocker && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                {blocker}
              </p>
            )}

            {answered && !blocker && (
              <p className="text-[11px] text-muted-foreground">
                Igual se puede volver a enviar, pero lo normal es que ya no haga falta.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Queda registrado que la enviaste vos, con fecha y hora.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="gac-gradient"
            disabled={sending || !!blocker}
            onClick={handleSend}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Send className="w-3.5 h-3.5 mr-1" /> {alreadySent || answered ? 'Reenviar' : 'Enviar encuesta'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceSurveySendDialog;
