import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Heart, Loader2, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAspectsForOrigin, getSubmitRpcForOrigin, getSatisfactionLevel,
  isServiceSurvey, SERVICE_SURVEY_SECTIONS, SERVICE_SURVEY_QUESTIONS,
} from '@/lib/satisfaction';

// Public, unauthenticated satisfaction survey (/encuesta/:token).
// Anon client + the two RPCs below only — no direct table access (mirrors the
// login-by-plate / lookup_vehicle_by_plate pattern used by /reservar).
// Backend: supabase/migrations/20260720120000_satisfaction_surveys.sql (sale) and
// 20260803130000_service_satisfaction_survey.sql (postventa).
//
// The SAME url serves both kinds. `get_survey_by_token` returns `origin`, which selects
// the question set and the submit RPC — the customer never picks anything.

type Screen = 'loading' | 'invalid' | 'already-responded' | 'survey' | 'thanks';

interface SurveyInfo {
  survey_id: string;
  client_name: string;
  dealership_name: string | null;
  status: string;
  already_responded: boolean;
  /**
   * Plain-text brand (GAC / DFSK / SHINERAY), nullable — shown as text, never
   * as a logo. Optional here on purpose: `get_survey_by_token` does not
   * return it yet (that RPC change belongs to a different work unit); this
   * stays forward-compatible with no code change once it does.
   */
  brand?: string | null;
  /** 'won' | 'repurchase' | 'service'. Absent on responses from an older RPC build,
   *  in which case the sale question set is the correct fallback. */
  origin?: string | null;
  /** Postventa only — shown on the intro so the customer knows WHICH visit is being asked about. */
  plate?: string | null;
  service_type?: string | null;
}

// Neutral/unselected slider accent, matches --imb-silver (src/index.css) so an
// untouched aspect never hints at a "default" rating before the user interacts.
const NEUTRAL_ACCENT_HSL = '220 10% 72%';

const PublicEncuesta = () => {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen] = useState<Screen>('loading');
  const [clientName, setClientName] = useState('');
  const [dealershipName, setDealershipName] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [plate, setPlate] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<string | null>(null);

  // Two different surveys share this page:
  //   VENTA     — 5 aspects rated 1..5 on a slider, then an NPS step, then a comment.
  //   POSTVENTA — 8 closed questions (Sí/No or three options), NO scale and NO NPS,
  //               then a comment. Defined in SERVICE_SURVEY_SECTIONS.
  // Every step boundary is derived from the resolved question list, so neither flow hardcodes
  // the other's arithmetic.
  const isService = isServiceSurvey(origin);
  const aspects = getAspectsForOrigin(origin);
  const serviceQuestions = isService ? SERVICE_SURVEY_QUESTIONS : [];

  // Steps: 0 = intro, 1..N = one question each, then (sale only) NPS, then the comment.
  const questionCount = isService ? serviceQuestions.length : aspects.length;
  const NPS_STEP = isService ? null : questionCount + 1;
  const COMMENT_STEP = (NPS_STEP ?? questionCount) + 1;
  // "Pregunta X de N". The optional comment step is not counted; NPS is, when it exists.
  const TOTAL_QUESTIONS = NPS_STEP ?? questionCount;

  const [step, setStep] = useState(0);
  // Presence of a key in `ratings` doubles as the per-aspect "touched" flag —
  // an aspect the user hasn't dragged yet is simply absent, never pre-filled.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  /** Postventa answers, keyed by question column. Absent = not answered yet. */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [nps, setNps] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) {
        setScreen('invalid');
        return;
      }
      // get_survey_by_token / submit_survey_response are brand-new RPCs (migration
      // 20260720120000) not yet in the generated types.ts — `as any` on the rpc
      // call, matching this project's established convention for untyped new DB
      // objects (see src/lib/plate.ts callers / prospect_models table casts).
      const { data, error } = await (supabase.rpc as any)('get_survey_by_token', { p_token: token });
      if (!active) return;
      if (error) {
        console.error(error);
        setScreen('invalid');
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as SurveyInfo | undefined;
      if (!row) {
        setScreen('invalid');
        return;
      }
      if (row.already_responded || row.status === 'responded') {
        setScreen('already-responded');
        return;
      }
      setClientName(row.client_name || '');
      setDealershipName(row.dealership_name || null);
      setBrandName(row.brand || null);
      setOrigin(row.origin || null);
      setPlate(row.plate || null);
      setServiceType(row.service_type || null);
      setScreen('survey');
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  const inQuestionRange = step >= 1 && step <= questionCount;
  const currentAspect = !isService && inQuestionRange ? aspects[step - 1] : null;
  const currentQuestion = isService && inQuestionRange ? serviceQuestions[step - 1] : null;

  const currentRating = currentAspect ? ratings[currentAspect.key] : undefined;
  const aspectTouched = currentRating !== undefined;
  const currentLevel = getSatisfactionLevel(currentRating ?? 3);
  const currentChoice = currentQuestion ? choices[currentQuestion.column] : undefined;

  const handleAspectChange = (values: number[]) => {
    if (!currentAspect) return;
    setRatings(prev => ({ ...prev, [currentAspect.key]: values[0] }));
  };

  const goNext = () => setStep(s => Math.min(s + 1, COMMENT_STEP));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const canAdvance = currentQuestion
    ? currentChoice !== undefined
    : currentAspect
      ? aspectTouched
      : step === NPS_STEP
        ? nps !== null
        : true;

  const handleSubmit = async () => {
    const complete = isService
      ? serviceQuestions.every(q => choices[q.column] !== undefined)
      : aspects.every(a => ratings[a.key] !== undefined) && nps !== null;
    if (!complete) {
      toast.error('Faltan respuestas. Vuelve atrás y completa la encuesta.');
      return;
    }

    setSubmitting(true);
    const payload: Record<string, unknown> = { p_token: token };
    if (isService) {
      // Postventa: one text argument per question, no NPS. `p_${column}` matches
      // submit_service_survey_response (migration 20260813120000).
      serviceQuestions.forEach(q => {
        payload[`p_${q.column}`] = choices[q.column];
      });
    } else {
      aspects.forEach(a => {
        payload[`p_${a.column}`] = ratings[a.key];
      });
      payload.p_nps = nps;
    }
    payload.p_comment = comment.trim() || null;

    const { error } = await (supabase.rpc as any)(getSubmitRpcForOrigin(origin), payload);
    setSubmitting(false);

    if (error) {
      console.error(error);
      if (error.message?.includes('already_responded')) {
        setScreen('already-responded');
        return;
      }
      toast.error('No se pudo enviar la encuesta. Intenta de nuevo.');
      return;
    }
    setScreen('thanks');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-start sm:items-center justify-center p-4 py-8">
      <Card className="w-full max-w-md imb-shadow">
        <CardContent className="p-6">
          {/* Brand-agnostic typographic header — no logo image, so the same
              form works identically across every brand (requirements.md R10). */}
          <div className="flex flex-col items-center gap-1 mb-5 text-center">
            <span className="text-lg font-display font-bold tracking-tight">
              {isService ? 'Encuesta de Postventa' : 'Encuesta de Satisfacción'}
            </span>
            {brandName && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{brandName}</span>
            )}
          </div>

          {screen === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Cargando tu encuesta...</p>
            </div>
          )}

          {screen === 'invalid' && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-bold">Este enlace no es válido</h2>
                <p className="text-sm text-muted-foreground">
                  Verifica que copiaste el enlace completo o contáctanos si crees que esto es un error.
                </p>
              </div>
            </div>
          )}

          {screen === 'already-responded' && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-bold text-green-700">¡Ya respondiste esta encuesta!</h2>
                <p className="text-sm text-muted-foreground">Gracias 🙌</p>
              </div>
            </div>
          )}

          {screen === 'thanks' && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-bold text-green-700">¡Gracias por tu tiempo! 🎉</h2>
                <p className="text-sm text-muted-foreground">Tu opinión nos ayuda a mejorar.</p>
              </div>
            </div>
          )}

          {screen === 'survey' && (
            <div className="space-y-6">
              {step >= 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground text-right">
                    {step <= TOTAL_QUESTIONS ? `Pregunta ${step} de ${TOTAL_QUESTIONS}` : 'Último paso'}
                  </p>
                  <Progress value={step <= TOTAL_QUESTIONS ? (step / TOTAL_QUESTIONS) * 100 : 100} className="h-1.5" />
                </div>
              )}

              <div key={step} className="animate-in fade-in-0 slide-in-from-right-2 duration-300 min-h-[220px]">
                {step === 0 && (
                  <div className="text-center space-y-5 py-2">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Heart className="w-8 h-8 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-display font-bold">¡Hola, {clientName}! 👋</h2>
                      <p className="text-sm text-muted-foreground">
                        {isService
                          ? 'Acabamos de atender tu vehículo y queremos saber cómo nos fue. Te toma menos de 2 minutos.'
                          : 'Tu opinión es el motor que nos mueve a mejorar. Te toma menos de 2 minutos.'}
                      </p>
                      {/* Postventa: name the visit being asked about. A fleet client can have
                          several vehicles serviced in the same week — without this they cannot
                          tell which one the survey refers to. */}
                      {isService && (plate || serviceType) && (
                        <p className="text-xs font-medium text-foreground/70">
                          {[serviceType, plate].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {dealershipName && <p className="text-xs text-muted-foreground/70">{dealershipName}</p>}
                    </div>
                  </div>
                )}

                {currentQuestion && (
                  <div className="space-y-5">
                    <div className="space-y-1.5 text-center">
                      {/* The section is shown because the questionnaire is grouped: knowing
                          you are in "Entrega y Acabado" frames what is being asked. */}
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">
                        {SERVICE_SURVEY_SECTIONS.find(s => s.questions.includes(currentQuestion))?.title}
                      </p>
                      <h2 className="text-lg font-display font-bold">{currentQuestion.title}</h2>
                      <p className="text-sm text-muted-foreground">{currentQuestion.question}</p>
                    </div>

                    <div className="space-y-2">
                      {currentQuestion.options.map(option => {
                        const selected = currentChoice === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setChoices(prev => ({ ...prev, [currentQuestion.column]: option.value }))
                            }
                            className={cn(
                              'w-full min-h-12 px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors',
                              selected
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border hover:border-primary/40 text-muted-foreground',
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {currentAspect && (
                  <div className="space-y-6">
                    <div className="space-y-1.5 text-center">
                      <h2 className="text-lg font-display font-bold">{currentAspect.title}</h2>
                      <p className="text-sm text-muted-foreground">{currentAspect.question}</p>
                    </div>

                    <div className="space-y-6 py-4">
                      <Slider
                        aria-label={currentAspect.title}
                        min={1}
                        max={5}
                        step={1}
                        value={[currentRating ?? 3]}
                        onValueChange={handleAspectChange}
                        // Register the touch on interaction start so a user who wants to
                        // rate exactly 3 (the resting position) still counts as answered —
                        // tapping the thumb where it already sits fires no onValueChange.
                        onPointerDown={() => {
                          if (currentAspect && ratings[currentAspect.key] === undefined) {
                            setRatings(prev => ({ ...prev, [currentAspect.key]: currentRating ?? 3 }));
                          }
                        }}
                        className={cn('transition-opacity', !aspectTouched && 'opacity-50')}
                        style={{ '--primary': aspectTouched ? currentLevel.color : NEUTRAL_ACCENT_HSL } as CSSProperties}
                      />
                      <div className="text-center space-y-1 min-h-[64px]">
                        {aspectTouched ? (
                          <>
                            <div className="text-5xl leading-none">{currentLevel.emoji}</div>
                            <p className="text-sm font-semibold" style={{ color: `hsl(${currentLevel.color})` }}>
                              {currentLevel.label}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground pt-4">Desliza para calificar</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {step === NPS_STEP && (
                  <div className="space-y-6">
                    <div className="space-y-1.5 text-center">
                      <h2 className="text-lg font-display font-bold">Recomendación</h2>
                      <p className="text-sm text-muted-foreground">
                        En general, ¿nos recomendarías con un familiar o amigo?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setNps(true)}
                        className={cn(
                          'h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-2 font-semibold text-base transition-colors',
                          nps === true
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-border hover:border-green-300 text-muted-foreground',
                        )}
                      >
                        <ThumbsUp className="w-7 h-7" /> Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setNps(false)}
                        className={cn(
                          'h-24 rounded-xl border-2 flex flex-col items-center justify-center gap-2 font-semibold text-base transition-colors',
                          nps === false
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-border hover:border-red-300 text-muted-foreground',
                        )}
                      >
                        <ThumbsDown className="w-7 h-7" /> No
                      </button>
                    </div>
                  </div>
                )}

                {step === COMMENT_STEP && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-display font-bold">
                      ¿Algo más que quieras contarnos?{' '}
                      <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
                    </h2>
                    <Textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Cuéntanos cualquier detalle, sugerencia, o si quieres felicitar a alguien del equipo..."
                      rows={5}
                    />
                  </div>
                )}
              </div>

              <div className="pt-1">
                {step === 0 && (
                  <Button onClick={goNext} className="w-full h-12 imb-gradient text-base font-semibold">
                    Comenzar
                  </Button>
                )}

                {step >= 1 && step <= TOTAL_QUESTIONS && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} className="flex-1 h-11">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Atrás
                    </Button>
                    <Button onClick={goNext} disabled={!canAdvance} className="flex-1 h-11 imb-gradient">
                      Siguiente <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}

                {step === COMMENT_STEP && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} disabled={submitting} className="flex-1 h-11">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Atrás
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-11 imb-gradient">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar encuesta'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicEncuesta;
