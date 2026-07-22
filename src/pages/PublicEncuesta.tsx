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
import { SATISFACTION_ASPECTS, getSatisfactionLevel } from '@/lib/satisfaction';

// Public, unauthenticated post-purchase satisfaction survey (/encuesta/:token).
// Anon client + the two RPCs below only — no direct table access (mirrors the
// login-by-plate / lookup_vehicle_by_plate pattern used by /reservar).
// Backend: supabase/migrations/20260720120000_satisfaction_surveys.sql (already applied).

type Screen = 'loading' | 'invalid' | 'already-responded' | 'survey' | 'thanks';

interface SurveyInfo {
  survey_id: string;
  client_name: string;
  dealership_name: string | null;
  status: string;
  already_responded: boolean;
}

// Steps: 0 = intro, 1..5 = one per SATISFACTION_ASPECTS entry, 6 = NPS, 7 = optional comment.
const LAST_ASPECT_STEP = SATISFACTION_ASPECTS.length; // 5
const NPS_STEP = LAST_ASPECT_STEP + 1; // 6
const COMMENT_STEP = NPS_STEP + 1; // 7
const TOTAL_QUESTIONS = NPS_STEP; // "Pregunta X de 6" — 5 aspects + NPS; the comment step is optional and not counted.

// Neutral/unselected slider accent, matches --imb-silver (src/index.css) so an
// untouched aspect never hints at a "default" rating before the user interacts.
const NEUTRAL_ACCENT_HSL = '220 10% 72%';

const PublicEncuesta = () => {
  const { token } = useParams<{ token: string }>();
  const [screen, setScreen] = useState<Screen>('loading');
  const [clientName, setClientName] = useState('');
  const [dealershipName, setDealershipName] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  // Presence of a key in `ratings` doubles as the per-aspect "touched" flag —
  // an aspect the user hasn't dragged yet is simply absent, never pre-filled.
  const [ratings, setRatings] = useState<Record<string, number>>({});
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
      setScreen('survey');
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  const currentAspect = step >= 1 && step <= LAST_ASPECT_STEP ? SATISFACTION_ASPECTS[step - 1] : null;
  const currentRating = currentAspect ? ratings[currentAspect.key] : undefined;
  const aspectTouched = currentRating !== undefined;
  const currentLevel = getSatisfactionLevel(currentRating ?? 3);

  const handleAspectChange = (values: number[]) => {
    if (!currentAspect) return;
    setRatings(prev => ({ ...prev, [currentAspect.key]: values[0] }));
  };

  const goNext = () => setStep(s => Math.min(s + 1, COMMENT_STEP));
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const canAdvance = currentAspect ? aspectTouched : step === NPS_STEP ? nps !== null : true;

  const handleSubmit = async () => {
    const allRatingsSet = SATISFACTION_ASPECTS.every(a => ratings[a.key] !== undefined);
    if (!allRatingsSet || nps === null) {
      toast.error('Faltan respuestas. Vuelve atrás y completa la encuesta.');
      return;
    }

    setSubmitting(true);
    const payload: Record<string, unknown> = { p_token: token };
    SATISFACTION_ASPECTS.forEach(a => {
      payload[`p_${a.column}`] = ratings[a.key];
    });
    payload.p_nps = nps;
    payload.p_comment = comment.trim() || null;

    const { error } = await (supabase.rpc as any)('submit_survey_response', payload);
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
      <Card className="w-full max-w-md gac-shadow">
        <CardContent className="p-6">
          <div className="flex justify-center mb-5">
            <img src="/gac-logo.png" alt="GAC Motor Venezuela" className="h-8" />
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
                    {step <= NPS_STEP ? `Pregunta ${step} de ${TOTAL_QUESTIONS}` : 'Último paso'}
                  </p>
                  <Progress value={step <= NPS_STEP ? (step / TOTAL_QUESTIONS) * 100 : 100} className="h-1.5" />
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
                        Tu opinión es el motor que nos mueve a mejorar. Te toma menos de 2 minutos.
                      </p>
                      {dealershipName && <p className="text-xs text-muted-foreground/70">{dealershipName}</p>}
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
                  <Button onClick={goNext} className="w-full h-12 gac-gradient text-base font-semibold">
                    Comenzar
                  </Button>
                )}

                {step >= 1 && step <= NPS_STEP && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} className="flex-1 h-11">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Atrás
                    </Button>
                    <Button onClick={goNext} disabled={!canAdvance} className="flex-1 h-11 gac-gradient">
                      Siguiente <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}

                {step === COMMENT_STEP && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} disabled={submitting} className="flex-1 h-11">
                      <ArrowLeft className="w-4 h-4 mr-1" /> Atrás
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-11 gac-gradient">
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
