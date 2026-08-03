import { MessageSquare, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SERVICE_SATISFACTION_ASPECTS, getSatisfactionLevel } from '@/lib/satisfaction';
import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';

/**
 * Compact postventa survey result, rendered inside a vehicle's service history (R7).
 *
 * Three states, all meaningful to a service manager reading the history:
 *   - no survey at all  -> renders nothing (the visit predates the feature, or had no phone)
 *   - survey not answered yet -> says so, so silence is not mistaken for a bad score
 *   - answered -> per-aspect breakdown, because a 4.0 average hides a 1 on "tiempo de entrega"
 */

interface ServiceSurveyInlineProps {
  survey: ServiceSurveySummary | undefined;
}

const ServiceSurveyInline = ({ survey }: ServiceSurveyInlineProps) => {
  if (!survey) return null;

  const response = survey.response;

  if (!response) {
    return (
      <div className="rounded border border-dashed p-1.5">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Star className="w-3 h-3" />
          Encuesta de postventa enviada — sin responder.
        </p>
      </div>
    );
  }

  const overall = Number(response.overall_score);
  const level = getSatisfactionLevel(Math.round(overall));

  return (
    <div className="rounded border p-1.5 space-y-1.5" style={{ borderColor: `hsl(${level.color} / 0.4)` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium flex items-center gap-1">
          <Star className="w-3 h-3" /> Encuesta de postventa
        </p>
        <Badge
          className="text-[10px] gap-1 px-1.5 py-0"
          style={{ backgroundColor: `hsl(${level.color} / 0.15)`, color: `hsl(${level.color})` }}
        >
          {overall.toFixed(1)} {level.emoji}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-0.5">
        {SERVICE_SATISFACTION_ASPECTS.map(aspect => {
          const score = Number(response[`q_${aspect.column}` as keyof typeof response]);
          const aspectLevel = getSatisfactionLevel(score);
          return (
            <div key={aspect.key} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground truncate">{aspect.title}</span>
              <span className="font-semibold shrink-0" style={{ color: `hsl(${aspectLevel.color})` }}>
                {score}/5
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {response.nps_recomienda === null ? (
          <span>Recomendación: —</span>
        ) : response.nps_recomienda ? (
          <><ThumbsUp className="w-3 h-3 text-green-600" /> Recomienda</>
        ) : (
          <><ThumbsDown className="w-3 h-3 text-red-600" /> No recomienda</>
        )}
      </div>

      {response.comment && (
        <div className="flex items-start gap-1 text-[10px] bg-muted/50 rounded p-1">
          <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
          <p className="whitespace-pre-wrap">{response.comment}</p>
        </div>
      )}
    </div>
  );
};

export default ServiceSurveyInline;
