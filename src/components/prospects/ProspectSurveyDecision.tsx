import { useEffect, useState } from 'react';
import { Check, X, Star } from 'lucide-react';
import {
  fetchLatestSurveyDecision,
  describeSurveyDecision,
  type SurveyDecisionRecord,
} from '@/lib/surveyDecision';

/**
 * Quién decidió enviar (o no) la encuesta de venta de este prospecto.
 *
 * Sin esto, la decisión que se toma al marcar el prospecto como ganado queda escrita en la base
 * y no la ve nadie — que es lo mismo que no registrarla. Acá es donde alguien la busca: la
 * ficha del prospecto.
 *
 * Sólo se muestra para prospectos GANADOS: es el único estado en que existe una encuesta de
 * venta que decidir.
 */

interface ProspectSurveyDecisionProps {
  prospectId: string;
  status: string;
}

const ProspectSurveyDecision = ({ prospectId, status }: ProspectSurveyDecisionProps) => {
  const [record, setRecord] = useState<SurveyDecisionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (status !== 'ganado') { setLoading(false); return; }
    setLoading(true);
    fetchLatestSurveyDecision({ prospectId }).then(found => {
      if (!cancelled) { setRecord(found); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [prospectId, status]);

  if (status !== 'ganado' || loading) return null;

  return (
    <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Star className="w-3 h-3" /> Encuesta de venta
      </p>
      {record ? (
        <p className="flex items-start gap-1.5 leading-relaxed">
          {record.decision
            ? <Check className="w-3 h-3 mt-0.5 text-green-600 shrink-0" />
            : <X className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />}
          <span>{describeSurveyDecision(record)}</span>
        </p>
      ) : (
        // Ventas anteriores al 26/08/2026: la decisión no era obligatoria y no se guardaba.
        <p className="text-muted-foreground">
          Sin registro de decisión. Las ventas marcadas antes del 26/08/2026 no lo pedían.
        </p>
      )}
    </div>
  );
};

export default ProspectSurveyDecision;
