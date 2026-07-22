import { lazy, Suspense, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Car, Mail, Phone, Hash, Smile, ThumbsUp, MessageSquare } from 'lucide-react';
import { phoneMatchSuffix } from '@/lib/phone';
import { normalizeSoldPlate } from '@/lib/plate';
import { SATISFACTION_ASPECTS, getSatisfactionLevel, firstMeaningfulNameToken } from '@/lib/satisfaction';
import type { SurveyResponsePdfProps } from '@/components/satisfaction/SurveyResponsePdf';

// Code-split @react-pdf/renderer out of the main bundle — only loaded when the
// "Encuesta" tab is opened for a client with an answered survey.
const SurveyPdfDownloadButton = lazy(() => import('@/components/satisfaction/SurveyPdfDownloadButton'));

/** Minimal client shape needed to render the preview — a superset (the real
 * `AdminClientes` `Client` interface) can always be passed here. */
export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cedula: string | null;
}

interface DialogVehicle {
  id: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number;
  vehicle_models: { brand: string; name: string } | null;
}

// `satisfaction_surveys` / `satisfaction_responses` are not in the generated
// `types.ts` yet (new tables, no regen) — matches this project's established
// `as any` convention for un-typed tables (see SatisfactionOverview.tsx).
interface SurveyResponseRow {
  q_atencion_digital: number;
  q_bienvenida_presencial: number;
  q_negociacion_asesoria: number;
  q_financiamiento_tramites: number;
  q_experiencia_entrega: number;
  nps_recomienda: boolean | null;
  comment: string | null;
  overall_score: number | string;
  has_low_score: boolean;
}

interface SurveyRow {
  id: string;
  salesperson: string | null;
  sold_plate: string | null;
  status: string;
  responded_at: string | null;
  dealerships: { name: string } | null;
  // PostgREST returns this as a single object (or null), not an array — the
  // relationship is to-one because satisfaction_responses.survey_id is UNIQUE.
  response: SurveyResponseRow | null;
}

interface ClientDetailDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ClientDetailDialog = ({ client, open, onOpenChange }: ClientDetailDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<DialogVehicle[]>([]);
  const [survey, setSurvey] = useState<SurveyRow | null>(null);

  useEffect(() => {
    if (!open || !client) return;

    let cancelled = false;
    const SURVEY_SELECT = 'id, salesperson, sold_plate, status, responded_at, dealerships(name), response:satisfaction_responses(*)';

    // There is no FK between `clients` and `satisfaction_surveys` (surveys
    // anchor to the WON PROSPECT, not the client — see the migration header).
    // Try the most reliable signal first, stopping at the first hit. Each
    // step is independently resilient: a query error/empty result just falls
    // through to the next step instead of surfacing an error, since this is
    // a best-effort match.
    const findSurvey = async (vehiclePlates: (string | null)[]): Promise<SurveyRow | null> => {
      // 1) Plate — prospects.sold_plate is written already normalized
      // (see AdminProspectos confirmSoldPlate / normalizeSoldPlate), so
      // normalizing the client's vehicle plates the same way lets a plain
      // `.in()` match without needing per-plate ILIKE.
      const plateCandidates = Array.from(
        new Set(vehiclePlates.map(p => normalizeSoldPlate(p || '')).filter(Boolean)),
      );
      if (plateCandidates.length > 0) {
        const { data } = await (supabase as any)
          .from('satisfaction_surveys')
          .select(SURVEY_SELECT)
          .in('sold_plate', plateCandidates)
          .limit(1);
        if (data?.[0]) return data[0] as SurveyRow;
      }

      // 2) Phone — match on the last 10 digits shared between the client's
      // local-format phone and the survey's international-format `client_phone`.
      const suffix = phoneMatchSuffix(client.phone);
      if (suffix) {
        const { data } = await (supabase as any)
          .from('satisfaction_surveys')
          .select(SURVEY_SELECT)
          .ilike('client_phone', `%${suffix}`)
          .limit(1);
        if (data?.[0]) return data[0] as SurveyRow;
      }

      // 3) Email — SKIPPED. `satisfaction_surveys` has no email column (see
      // the migration); matching by email would require an extra join
      // through `prospects` (which this dialog doesn't otherwise load) for a
      // fallback signal that's already covered by phone/name. Not worth the
      // added query for this last-resort cascade.

      // 4) Name — fuzzy, last resort: both `clients.full_name` and
      // `satisfaction_surveys.client_name` are free text.
      const nameToken = firstMeaningfulNameToken(client.full_name);
      if (nameToken) {
        const { data } = await (supabase as any)
          .from('satisfaction_surveys')
          .select(SURVEY_SELECT)
          .ilike('client_name', `%${nameToken}%`)
          .limit(1);
        if (data?.[0]) return data[0] as SurveyRow;
      }

      return null;
    };

    const fetchDetail = async () => {
      setLoading(true);
      setVehicles([]);
      setSurvey(null);

      // Vehicles must resolve first — the plate-match step (cascade step 1)
      // needs the client's vehicle plates before it can query.
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('id, year, plate, vin, color, mileage, vehicle_models(brand, name)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;

      if (vehiclesError) {
        toast.error('Error al cargar los vehículos del cliente');
      } else {
        setVehicles((vehiclesData || []) as DialogVehicle[]);
      }

      try {
        const found = await findSurvey(((vehiclesData || []) as DialogVehicle[]).map(v => v.plate));
        if (!cancelled) setSurvey(found);
      } catch (err) {
        // Best-effort match — a failure here shouldn't block the rest of the dialog.
        console.error('Error matching client survey:', err);
      }

      if (!cancelled) setLoading(false);
    };

    fetchDetail();
    return () => { cancelled = true; };
  }, [open, client]);

  const response = survey?.response ?? null;
  const overallScore = response ? Number(response.overall_score) : null;
  const overallLevel = overallScore != null ? getSatisfactionLevel(Math.round(overallScore)) : null;

  const pdfProps: SurveyResponsePdfProps | null = client && survey && response ? {
    clientName: client.full_name,
    dealershipName: survey.dealerships?.name ?? null,
    salesperson: survey.salesperson,
    soldPlate: survey.sold_plate,
    respondedAt: survey.responded_at ? format(new Date(survey.responded_at), 'dd/MM/yyyy') : '-',
    responses: SATISFACTION_ASPECTS.map(aspect => ({
      key: aspect.key,
      score: Number(response[`q_${aspect.column}` as keyof SurveyResponseRow]),
    })),
    npsRecomienda: response.nps_recomienda,
    comment: response.comment,
    overallScore: Number(response.overall_score),
  } : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{client?.full_name}</DialogTitle>
        </DialogHeader>

        {client && (
          <Tabs defaultValue="info" className="space-y-3">
            <TabsList>
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="vehiculos">Vehículos</TabsTrigger>
              <TabsTrigger value="encuesta">Encuesta</TabsTrigger>
            </TabsList>

            {/* Info tab */}
            <TabsContent value="info" className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 text-xs">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Cédula</p>
                    <p className="font-medium">{client.cedula || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 text-xs">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Teléfono</p>
                    <p className="font-medium">{client.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 text-xs sm:col-span-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Correo</p>
                    <p className="font-medium">{client.email || '—'}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Vehículos tab */}
            <TabsContent value="vehiculos" className="space-y-2">
              {loading ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Cargando vehículos...</p>
                </div>
              ) : vehicles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin vehículos registrados</p>
              ) : (
                <div className="space-y-1.5">
                  {vehicles.map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2 border">
                      <div className="flex items-center gap-2 min-w-0">
                        <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {v.plate && `${v.plate} · `}{v.color && `${v.color} · `}{v.mileage.toLocaleString()} km
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Encuesta tab */}
            <TabsContent value="encuesta" className="space-y-3">
              {loading ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Cargando encuesta...</p>
                </div>
              ) : !survey ? (
                <div className="text-center py-6">
                  <Smile className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Este cliente no tiene una encuesta asociada.</p>
                </div>
              ) : !response ? (
                <div className="text-center py-6">
                  <Smile className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Encuesta enviada — aún sin responder.
                  </p>
                  <Badge variant="outline" className="text-[10px] mt-2">{survey.status}</Badge>
                </div>
              ) : (
                <>
                  <Card className="gac-shadow">
                    <CardContent className="p-3 space-y-3">
                      {SATISFACTION_ASPECTS.map(aspect => {
                        const field = `q_${aspect.column}` as keyof SurveyResponseRow;
                        const score = Number(response[field]);
                        const level = getSatisfactionLevel(score);
                        const widthPct = Math.max(0, Math.min(100, (score / 5) * 100));
                        return (
                          <div key={aspect.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">{aspect.title}</span>
                              <span className="flex items-center gap-1 font-semibold">
                                {score} <span>{level.emoji}</span>
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${widthPct}%`, backgroundColor: `hsl(${level.color})` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-1.5 text-xs pt-1">
                        <ThumbsUp className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">¿Recomienda?</span>
                        <span className="font-semibold">
                          {response.nps_recomienda === null ? '—' : response.nps_recomienda ? 'Sí' : 'No'}
                        </span>
                      </div>

                      {response.comment && (
                        <div className="flex items-start gap-1.5 text-xs bg-muted/50 rounded-md p-2">
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="whitespace-pre-wrap">{response.comment}</p>
                        </div>
                      )}

                      {overallScore != null && overallLevel && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">Puntaje general</span>
                          <Badge
                            className="text-[11px] gap-1"
                            style={{ backgroundColor: `hsl(${overallLevel.color} / 0.15)`, color: `hsl(${overallLevel.color})` }}
                          >
                            {overallScore.toFixed(1)} {overallLevel.emoji} {overallLevel.label}
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {pdfProps && (
                    <div className="flex justify-end">
                      <Suspense fallback={<Button size="sm" variant="outline" disabled>Preparando PDF…</Button>}>
                        <SurveyPdfDownloadButton {...pdfProps} />
                      </Suspense>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClientDetailDialog;
