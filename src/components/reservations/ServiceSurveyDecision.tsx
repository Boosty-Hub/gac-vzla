import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Star, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Decisión OBLIGATORIA sobre una encuesta, en el momento en que se decide (2026-08-24).
 *
 * Desde ese día las encuestas no salen solas: las decide una persona, acá. Son dos momentos y
 * el mismo bloque:
 *   - postventa -> al completar el servicio (Reservas).
 *   - venta     -> al marcar el prospecto como ganado, junto con la placa (Prospectos).
 *
 * Arranca SIN elegir a propósito. Un default — cualquiera de los dos — se convierte en la
 * respuesta real de casi todo el mundo, y esto es justamente lo que no puede decidirse por
 * inercia: de un lado se le manda un mensaje a un cliente que quizás se fue enojado, del otro
 * se pierde para siempre la medición de ese servicio.
 *
 * Vive fuera de las pantallas que lo usan porque las cuatro tienen que preguntar EXACTAMENTE
 * lo mismo: si el admin y el concesionario preguntaran distinto, los datos no serían
 * comparables entre sedes.
 *
 * Lo que se elija acá queda escrito en `survey_send_decisions` — quién, cuándo y qué eligió.
 * Ver `src/lib/surveyDecision.ts`.
 */

export type ServiceSurveyChoice = 'si' | 'no' | null;

interface ServiceSurveyDecisionProps {
  value: ServiceSurveyChoice;
  onChange: (next: ServiceSurveyChoice) => void;
  /** Se muestra cuando la encuesta está apagada, para que "Sí" no sorprenda con un error. */
  disabledNotice?: boolean;
  /** La pregunta. Por defecto la de postventa; la de venta pregunta por la suya. */
  question?: string;
  /** Nombre de la encuesta que hay que activar, para el aviso de arriba. */
  disabledLabel?: string;
}

const ServiceSurveyDecision = ({
  value,
  onChange,
  disabledNotice,
  question = '¿Enviar encuesta de satisfacción postservicio al cliente? *',
  disabledLabel = 'La encuesta de postventa / servicio',
}: ServiceSurveyDecisionProps) => (
  <div className="space-y-2 rounded-md border p-3">
    <Label className="text-sm flex items-center gap-1.5">
      <Star className="w-3.5 h-3.5" />
      {question}
    </Label>
    <p className="text-xs text-muted-foreground">
      Hay que elegir una de las dos, y queda registrado quién eligió qué.
    </p>
    <div className="flex gap-2 pt-1">
      <Button
        type="button"
        size="sm"
        variant={value === 'si' ? 'default' : 'outline'}
        className={cn('flex-1 text-xs', value === 'si' && 'gac-gradient')}
        onClick={() => onChange('si')}
      >
        <Check className="w-3.5 h-3.5 mr-1" /> Sí, enviar
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'no' ? 'secondary' : 'outline'}
        className="flex-1 text-xs"
        onClick={() => onChange('no')}
      >
        <X className="w-3.5 h-3.5 mr-1" /> No enviar
      </Button>
    </div>
    {disabledNotice && (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
        {disabledLabel} está desactivada. Para poder enviarla hay que activarla primero en
        Configuración → Automatizaciones.
      </p>
    )}
  </div>
);

export default ServiceSurveyDecision;
