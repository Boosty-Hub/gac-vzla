import { MessageSquare, Star, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  SERVICE_SURVEY_QUESTIONS,
  getServiceSurveyOption,
  getSatisfactionLevel,
} from '@/lib/satisfaction';
import type { ServiceSurveySummary } from '@/hooks/useServiceSurveys';

/**
 * Compact postventa survey result, rendered inside a vehicle's service history.
 *
 * Four states, all meaningful to a service manager reading the history:
 *   - no survey at all        -> renders nothing (visit predates the feature, or had no phone)
 *   - survey not answered yet -> says so, so silence is not mistaken for a bad score
 *   - answered                -> per-question answer, because an average of 4.0 hides a
 *                                "No fue lavado/aspirado"
 *   - answered on the OLD 1..5 questionnaire -> labelled as such instead of rendering eight
 *                                empty rows, which is what reading the new columns off an
 *                                old row would produce
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

  // Una respuesta del cuestionario viejo no tiene ninguna de las columnas nuevas.
  const answeredNewForm = SERVICE_SURVEY_QUESTIONS.some(
    q => response[`q_${q.column}` as keyof typeof response],
  );

  if (!answeredNewForm) {
    return (
      <div className="rounded border border-dashed p-1.5">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Archive className="w-3 h-3" />
          Respondida con el cuestionario anterior a agosto 2026.
        </p>
      </div>
    );
  }

  const overall = Number(response.overall_score ?? 0);
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
        {SERVICE_SURVEY_QUESTIONS.map(question => {
          const raw = response[`q_${question.column}` as keyof typeof response] as string | null;
          const option = getServiceSurveyOption(question.column, raw);
          const optionLevel = getSatisfactionLevel(option?.score ?? 3);
          return (
            <div key={question.column} className="flex items-start justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground truncate">{question.title}</span>
              <span
                className="font-semibold shrink-0 text-right"
                style={{ color: `hsl(${optionLevel.color})` }}
              >
                {option?.label ?? '—'}
              </span>
            </div>
          );
        })}
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
