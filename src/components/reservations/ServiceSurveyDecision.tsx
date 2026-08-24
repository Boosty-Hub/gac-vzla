import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Star, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Decisión OBLIGATORIA sobre la encuesta de postventa al cerrar una cita (2026-08-24).
 *
 * Desde este día la encuesta de postventa / servicio no sale sola: la decide una persona,
 * acá, en el momento de completar el servicio. Es el único lugar donde se sabe si el cliente
 * quedó en condiciones de recibir la pregunta.
 *
 * Arranca SIN elegir a propósito. Un default — cualquiera de los dos — se convierte en la
 * respuesta real de casi todo el mundo, y esto es justamente lo que no puede decidirse por
 * inercia: de un lado se le manda un mensaje a un cliente que quizás se fue enojado, del otro
 * se pierde para siempre la medición de ese servicio.
 *
 * Vive fuera de las dos pantallas de reservas porque las dos tienen que preguntar EXACTAMENTE
 * lo mismo: si el admin y el concesionario preguntaran distinto, los datos no serían
 * comparables entre sedes.
 */

export type ServiceSurveyChoice = 'si' | 'no' | null;

interface ServiceSurveyDecisionProps {
  value: ServiceSurveyChoice;
  onChange: (next: ServiceSurveyChoice) => void;
  /** Se muestra cuando la encuesta está apagada, para que "Sí" no sorprenda con un error. */
  disabledNotice?: boolean;
}

const ServiceSurveyDecision = ({ value, onChange, disabledNotice }: ServiceSurveyDecisionProps) => (
  <div className="space-y-2 rounded-md border p-3">
    <Label className="text-sm flex items-center gap-1.5">
      <Star className="w-3.5 h-3.5" />
      ¿Enviar encuesta de satisfacción postservicio al cliente? *
    </Label>
    <p className="text-xs text-muted-foreground">
      Hay que elegir una de las dos para poder cerrar el servicio.
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
        La encuesta de postventa / servicio está desactivada. Para poder enviarla hay que
        activarla primero en Configuración → Automatizaciones.
      </p>
    )}
  </div>
);

export default ServiceSurveyDecision;
