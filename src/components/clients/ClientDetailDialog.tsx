import { lazy, Suspense, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Car, Mail, Phone, Hash, Smile, ThumbsUp, MessageSquare, MessageCircle, Send, Plus } from 'lucide-react';
import { phoneMatchSuffix } from '@/lib/phone';
import { normalizeSoldPlate } from '@/lib/plate';
import { SATISFACTION_ASPECTS, getSatisfactionLevel, firstMeaningfulNameToken } from '@/lib/satisfaction';
import type { SurveyResponsePdfProps } from '@/components/satisfaction/SurveyResponsePdf';
import RepurchaseDialog, { type RepurchaseVehicleModelOption } from './RepurchaseDialog';
import { deliverSatisfactionSurvey, describeSkippedDelivery } from './surveyDelivery';

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
  // 'won' | 'repurchase' — see satisfaction_surveys.origin (design.md D3).
  origin: string;
  suppressed_reason: string | null;
  created_at: string;
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
  /** vehicle_models options for the repurchase "Agregar vehículo" flow — passed down
   *  from the caller (AdminClientes already fetches this list) instead of duplicating
   *  the fetch here. */
  models: RepurchaseVehicleModelOption[];
  /** Opens the dialog directly on a given tab (deep link from the Satisfacción
   *  dashboard: `?client=<id>&tab=encuestas`). Undefined = default "Info" tab. */
  defaultTab?: 'info' | 'vehiculos' | 'encuesta';
}

const ORIGIN_LABEL: Record<string, string> = {
  won: 'Compra',
  repurchase: 'Recompra',
};

/** Builds a wa.me link from a local-format Venezuelan phone, mirroring the
 *  normalization used elsewhere in this module (AdminClientes.tsx's own
 *  buildClientWaUrl) — kept local per this component's existing convention of
 *  building WhatsApp URLs directly where they're used. */
function buildWaHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  let normalized: string;
  if (digits.startsWith('58')) normalized = digits;
  else if (digits.startsWith('0')) normalized = `58${digits.slice(1)}`;
  else normalized = `58${digits}`;
  return `https://wa.me/${normalized}`;
}

const ClientDetailDialog = ({ client, open, onOpenChange, models, defaultTab }: ClientDetailDialogProps) => {
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<DialogVehicle[]>([]);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [resending, setResending] = useState(false);
  const [repurchaseOpen, setRepurchaseOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !client) return;

    let cancelled = false;
    const SURVEY_SELECT = 'id, salesperson, sold_plate, status, origin, suppressed_reason, created_at, responded_at, dealerships(name), response:satisfaction_responses(*)';

    // Every survey linked to this client (repurchases can add more than one over
    // time), newest first. Falls back to the legacy best-effort match cascade only
    // for surveys created before `client_id` existed on this row (see the migration
    // header) — that cascade can only ever surface a single row.
    const findSurveys = async (vehiclePlates: (string | null)[]): Promise<SurveyRow[]> => {
      const { data: byClient } = await (supabase as any)
        .from('satisfaction_surveys')
        .select(SURVEY_SELECT)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });
      if (byClient && byClient.length > 0) return byClient as SurveyRow[];

      // Legacy fallback cascade — there is no FK between `clients` and
      // `satisfaction_surveys` on these older rows (surveys anchor to the WON
      // PROSPECT, not the client). Try the most reliable signal first, stopping at
      // the first hit. Each step is independently resilient: a query error/empty
      // result just falls through to the next step instead of surfacing an error,
      // since this is a best-effort match.

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
        if (data?.[0]) return [data[0] as SurveyRow];
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
        if (data?.[0]) return [data[0] as SurveyRow];
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
        if (data?.[0]) return [data[0] as SurveyRow];
      }

      return [];
    };

    const fetchDetail = async () => {
      setLoading(true);
      setVehicles([]);
      setSurveys([]);

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
        const found = await findSurveys(((vehiclesData || []) as DialogVehicle[]).map(v => v.plate));
        if (!cancelled) setSurveys(found);
      } catch (err) {
        // Best-effort match — a failure here shouldn't block the rest of the dialog.
        console.error('Error matching client surveys:', err);
      }

      if (!cancelled) setLoading(false);
    };

    fetchDetail();
    return () => { cancelled = true; };
  }, [open, client, reloadKey]);

  const buildPdfProps = (survey: SurveyRow): SurveyResponsePdfProps | null => {
    if (!client || !survey.response) return null;
    const response = survey.response;
    return {
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
    };
  };

  const waHref = buildWaHref(client?.phone ?? null);
  // `vehiculos.create` is the semantically correct permission and it does exist in
  // `public.permissions` (seeded 2026-02-12). It was previously assigned only to
  // admin/superadmin, which is why this used to fall back to `vehiculos.edit`;
  // migration 20260730130000 grants it to `vendedor` and `concesionario` so sales staff
  // can register the vehicle they just sold without also gaining edit/delete rights
  // over the client's existing fleet.
  const canAddVehicle = hasPermission('vehiculos.create');

  const handleResend = async () => {
    if (!client) return;
    setResending(true);
    const outcome = await deliverSatisfactionSurvey({ client_id: client.id }, 'resend');
    setResending(false);

    if (outcome.kind === 'delivered') {
      toast.success('Encuesta reenviada correctamente.');
    } else if (outcome.kind === 'skipped') {
      toast.warning(describeSkippedDelivery(outcome.reason));
    } else if (outcome.kind === 'config_error') {
      toast.error(`No se pudo reenviar: configuración de Kommo incompleta (${outcome.message}).`);
    } else {
      toast.error(`Error al reenviar la encuesta: ${outcome.message}`);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{client?.full_name}</DialogTitle>
        </DialogHeader>

        {client && (
          <Tabs key={`${client.id}-${defaultTab ?? 'info'}`} defaultValue={defaultTab ?? 'info'} className="space-y-3">
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
              {canAddVehicle && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRepurchaseOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar vehículo
                  </Button>
                </div>
              )}
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
              {/* Phone + resend header — the client's number must always be visible
                  here for quick contact (requirements.md R7). */}
              <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-md p-2">
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{client.phone || 'Sin teléfono registrado'}</span>
                  {waHref && (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" className="text-green-600 shrink-0">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  disabled={resending || loading || surveys.length === 0}
                  onClick={handleResend}
                  title={surveys.length === 0 ? 'Este cliente no tiene ninguna encuesta para reenviar' : undefined}
                >
                  {resending ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1" />
                  )}
                  Reenviar encuesta
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Cargando encuesta...</p>
                </div>
              ) : surveys.length === 0 ? (
                <div className="text-center py-6">
                  <Smile className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Este cliente no tiene encuestas asociadas.</p>
                </div>
              ) : (
                surveys.map(survey => {
                  const response = survey.response;
                  const overallScore = response ? Number(response.overall_score) : null;
                  const overallLevel = overallScore != null ? getSatisfactionLevel(Math.round(overallScore)) : null;
                  const pdfProps = buildPdfProps(survey);

                  return (
                    <Card key={survey.id} className="gac-shadow">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {ORIGIN_LABEL[survey.origin] || survey.origin}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(survey.created_at), 'dd/MM/yyyy')}
                            {survey.sold_plate ? ` · ${survey.sold_plate}` : ''}
                          </span>
                        </div>

                        {!response ? (
                          <div className="text-center py-3">
                            <p className="text-xs text-muted-foreground">
                              {survey.suppressed_reason
                                ? describeSkippedDelivery(survey.suppressed_reason)
                                : 'Encuesta enviada — aún sin responder.'}
                            </p>
                            <Badge variant="outline" className="text-[10px] mt-2">{survey.status}</Badge>
                          </div>
                        ) : (
                          <>
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

                            {pdfProps && (
                              <div className="flex justify-end">
                                <Suspense fallback={<Button size="sm" variant="outline" disabled>Preparando PDF…</Button>}>
                                  <SurveyPdfDownloadButton {...pdfProps} />
                                </Suspense>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>

    <RepurchaseDialog
      client={client}
      open={repurchaseOpen}
      onOpenChange={setRepurchaseOpen}
      models={models}
      onSuccess={() => setReloadKey(k => k + 1)}
    />
    </>
  );
};

export default ClientDetailDialog;
