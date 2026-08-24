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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Mail, Phone, Hash, Smile, ThumbsUp, MessageSquare, MessageCircle, Send, Plus, User } from 'lucide-react';
import { phoneMatchSuffix } from '@/lib/phone';
import { normalizeSoldPlate } from '@/lib/plate';
import {
  getAspectsForOrigin, getSatisfactionLevel, firstMeaningfulNameToken, SURVEY_ORIGIN_LABEL,
  isServiceSurvey, SERVICE_SURVEY_QUESTIONS, getServiceSurveyOption,
} from '@/lib/satisfaction';
import { driverLabel, type DriverOption } from '@/lib/drivers';
import DriversManager from './DriversManager';
import type { SurveyResponsePdfProps } from '@/components/satisfaction/SurveyResponsePdf';
import RepurchaseDialog, { type RepurchaseVehicleModelOption } from './RepurchaseDialog';
import { deliverSatisfactionSurvey, describeSkippedDelivery } from './surveyDelivery';
import { sendSalesSurveyNow } from './manualSurveySend';

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
  /** Optional (R8) — absent on callers that haven't been updated to select it, in which
   *  case the driver features simply stay hidden rather than breaking. */
  is_fleet?: boolean | null;
}

interface DialogVehicle {
  id: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number;
  driver_id: string | null;
  vehicle_models: { brand: string; name: string } | null;
}

// `satisfaction_surveys` / `satisfaction_responses` are not in the generated
// `types.ts` yet (new tables, no regen) — matches this project's established
// `as any` convention for un-typed tables (see SatisfactionOverview.tsx).
/**
 * A survey's answers, keyed by the DB column base name (`q_${column}`). Sale and service
 * surveys have DIFFERENT column sets, living in different tables, so this is indexed
 * rather than a fixed shape — the aspect list for the row's origin says which keys to read.
 */
type SurveyResponseRow = Record<string, unknown> & {
  nps_recomienda: boolean | null;
  comment: string | null;
  overall_score: number | string;
  has_low_score: boolean;
};

interface SurveyRow {
  id: string;
  salesperson: string | null;
  sold_plate: string | null;
  status: string;
  // 'won' | 'repurchase' | 'service' — see satisfaction_surveys.origin.
  origin: string;
  suppressed_reason: string | null;
  created_at: string;
  responded_at: string | null;
  dealerships: { name: string } | null;
  // PostgREST returns each as a single object (or null), not an array — both
  // *_responses tables have a UNIQUE survey_id.
  //
  // A survey has answers in EXACTLY ONE of these: sale answers in `satisfaction_responses`,
  // postventa answers in `service_survey_responses`. Both are selected because a client's
  // history mixes the two kinds, and `resolveResponse` picks whichever is present.
  response: SurveyResponseRow | null;
  service_response: SurveyResponseRow | null;
}

/** The answers for this survey, whichever table they landed in. */
function resolveResponse(survey: SurveyRow): SurveyResponseRow | null {
  return survey.origin === 'service' ? survey.service_response : survey.response;
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

// Radix Select cannot hold an empty-string value, so "no driver" needs a sentinel that can
// never collide with a real driver id (those are UUIDs).
const UNASSIGNED_DRIVER = '__none__';

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
  /** Id de la encuesta puntual que se está reenviando desde su propia tarjeta. */
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Postventa sólo tiene ruteo propio cuando su campo está cargado. Sin eso, reenviar una
  // encuesta de servicio la manda por el camino de ventas y despierta al bot equivocado.
  const [postventaReady, setPostventaReady] = useState(true);
  // Y además puede estar apagada a propósito desde Configuración → Automatizaciones. Se
  // guarda aparte de `postventaReady` sólo para poder decir cuál de los dos motivos es: un
  // "falta configurar" sobre algo configurado y apagado manda a buscar un problema que no
  // existe.
  const [postventaEnabled, setPostventaEnabled] = useState(true);
  // Y la de entrega de vehículo tiene su propio interruptor desde 2026-08-20. Apagada, el
  // reenvío de una encuesta de venta tampoco sale: kommo-api la rechaza. Se bloquea acá para
  // no ofrecer un botón que no va a hacer nada.
  const [salesEnabled, setSalesEnabled] = useState(true);
  const [repurchaseOpen, setRepurchaseOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [assigningVehicleId, setAssigningVehicleId] = useState<string | null>(null);

  // R5 is scoped to fleet clients: a single-vehicle owner drives their own car, so showing
  // a driver picker there is noise. `is_fleet` is optional on the Client interface, so a
  // caller that hasn't been updated simply never shows these controls.
  const isFleet = !!client?.is_fleet;

  useEffect(() => {
    if (!open || !client) return;

    let cancelled = false;
    const SURVEY_SELECT = 'id, salesperson, sold_plate, status, origin, suppressed_reason, created_at, responded_at, dealerships(name), response:satisfaction_responses(*), service_response:service_survey_responses(*)';

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
      const { data: vehiclesData, error: vehiclesError } = await (supabase as any)
        .from('vehicles')
        .select('id, year, plate, vin, color, mileage, driver_id, vehicle_models(brand, name)')
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

  // Driver roster for the per-vehicle picker. Deliberately a separate effect from
  // `fetchDetail`: adding a driver must refresh the dropdown without refetching vehicles
  // and re-running the survey match cascade.
  const [driversKey, setDriversKey] = useState(0);
  useEffect(() => {
    if (!open || !client || !isFleet) {
      setDrivers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('drivers')
        .select('id, full_name, cedula, phone')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('full_name');
      if (cancelled) return;
      if (error) console.error('Error loading drivers:', error);
      setDrivers((data || []) as DriverOption[]);
    })();
    return () => { cancelled = true; };
  }, [open, client, isFleet, driversKey]);

  // Estado del ruteo de postventa. Se consulta acá y no se asume, porque el botón de reenvío
  // entrega la encuesta MÁS RECIENTE del cliente: si esa es de servicio y postventa todavía
  // comparte la etapa de ventas, el reenvío le manda el mensaje de compra a alguien que sólo
  // vino al taller.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.rpc as any)('get_survey_delivery_config');
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as
        | { service_ready?: boolean; service_enabled?: boolean; sales_enabled?: boolean }
        | undefined;
      setPostventaReady(row?.service_ready ?? false);
      setPostventaEnabled(row?.service_enabled ?? true);
      setSalesEnabled(row?.sales_enabled ?? true);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleAssignDriver = async (vehicleId: string, value: string) => {
    const nextDriverId = value === UNASSIGNED_DRIVER ? null : value;
    setAssigningVehicleId(vehicleId);
    // Goes through `assign_vehicle_driver` rather than a direct UPDATE on `vehicles`. RLS is
    // row-level, not column-level: granting UPDATE would also open mileage, plate, warranty
    // and model. This RPC only ever writes `driver_id`, and it is the SAME entry point the
    // client portal uses, so authorization lives in one place.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('assign_vehicle_driver', {
      p_vehicle_id: vehicleId,
      p_driver_id: nextDriverId,
    });
    setAssigningVehicleId(null);

    if (error) {
      console.error(error);
      toast.error(
        (error.message || '').includes('not_authorized')
          ? 'No se pudo asignar el chofer: tu usuario no tiene permisos sobre este vehículo.'
          : 'Error al asignar el chofer',
      );
      return;
    }

    setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, driver_id: nextDriverId } : v)));
    toast.success(nextDriverId ? 'Chofer asignado' : 'Chofer removido');
  };

  const buildPdfProps = (survey: SurveyRow): SurveyResponsePdfProps | null => {
    const response = resolveResponse(survey);
    if (!client || !response) return null;
    return {
      clientName: client.full_name,
      dealershipName: survey.dealerships?.name ?? null,
      salesperson: survey.salesperson,
      soldPlate: survey.sold_plate,
      respondedAt: survey.responded_at ? format(new Date(survey.responded_at), 'dd/MM/yyyy') : '-',
      responses: getAspectsForOrigin(survey.origin).map(aspect => ({
        key: aspect.key,
        score: Number(response[`q_${aspect.column}`]),
      })),
      // Postventa: respuestas de opción cerrada. Van por su propia vía porque no hay escala.
      serviceAnswers: isServiceSurvey(survey.origin)
        ? SERVICE_SURVEY_QUESTIONS.map(question => {
            const option = getServiceSurveyOption(
              question.column,
              response[`q_${question.column}`] as string | null,
            );
            return { title: question.title, label: option?.label ?? '—', score: option?.score ?? 3 };
          })
        : undefined,
      npsRecomienda: response.nps_recomienda,
      comment: response.comment,
      overallScore: Number(response.overall_score),
      origin: survey.origin,
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

  const canSendSurvey = hasPermission('encuestas.send');

  // ENVÍO MANUAL (2026-08-24). Este botón es el disparador de la encuesta de ENTREGA DE
  // VEHÍCULO, y sólo de ésa. La de postventa / servicio se decide al cerrar la cita, en
  // "Completar Servicio".
  //
  // Antes entregaba "la encuesta más reciente del cliente", fuera del tipo que fuera. Eso
  // volvía impredecible qué mensaje salía: en un cliente que compró y después vino al taller,
  // el mismo botón mandaba una cosa u otra según la fecha. Ahora el botón dice qué manda, y
  // cada encuesta ya respondida o pendiente tiene su propio "Reenviar" en su tarjeta.
  //
  // Ya no exige que la encuesta exista: `ensure_sales_survey` la crea a partir del prospecto
  // ganado del cliente si hace falta. Sin eso el botón quedaba muerto para toda venta
  // registrada mientras el interruptor estuvo apagado — es decir, todas las de hoy.
  const sendBlocked = !canSendSurvey || !salesEnabled;

  const sendBlockedReason = !canSendSurvey
    ? 'Tu usuario no tiene permiso para enviar encuestas. Se otorga en Configuración → Roles.'
    : !salesEnabled
      ? 'La encuesta de entrega de vehículo está desactivada. Actívala en Configuración → Automatizaciones para poder usar este botón.'
      : undefined;

  const handleSend = async () => {
    if (!client) return;
    if (sendBlocked) {
      toast.warning(sendBlockedReason!);
      return;
    }
    setResending(true);
    const result = await sendSalesSurveyNow(client.id);
    setResending(false);
    if (result.ok) {
      toast.success(result.message);
      setReloadKey(k => k + 1);
    } else {
      toast.warning(result.message);
    }
  };

  // Reenvío de UNA encuesta puntual, la de esta tarjeta. Es el reemplazo exacto de lo que
  // hacía el botón de arriba, pero sin adivinar cuál: acá el usuario ya eligió.
  const handleResendOne = async (survey: SurveyRow) => {
    if (!canSendSurvey) {
      toast.warning('Tu usuario no tiene permiso para enviar encuestas. Se otorga en Configuración → Roles.');
      return;
    }
    if (survey.origin === 'service' && !postventaEnabled) {
      toast.warning('La encuesta de postventa / servicio está desactivada. Actívala en Configuración → Automatizaciones para poder reenviarla.');
      return;
    }
    if (survey.origin === 'service' && !postventaReady) {
      toast.warning('La postventa todavía no tiene su campo propio en Kommo. Reenviarla mandaría el mensaje de compra.');
      return;
    }
    if (survey.origin !== 'service' && !salesEnabled) {
      toast.warning('La encuesta de entrega de vehículo está desactivada. Actívala en Configuración → Automatizaciones para poder reenviarla.');
      return;
    }

    setResendingId(survey.id);
    const outcome = await deliverSatisfactionSurvey({ survey_id: survey.id }, 'resend');
    setResendingId(null);

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
              {isFleet && <TabsTrigger value="choferes">Choferes</TabsTrigger>}
              <TabsTrigger value="encuesta">Encuestas</TabsTrigger>
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
              {isFleet && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <User className="w-3 h-3" /> Cliente de flota
                </Badge>
              )}
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
                    <div key={v.id} className="bg-muted/50 rounded-md p-2 border space-y-2">
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

                      {/* R5 — assigned driver. A Select, never a text input: free text is
                          exactly what produced "Moisés" / "moisés" / "Moisés López" as three
                          separate people. New drivers are added from the Choferes tab. */}
                      {isFleet && (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <Select
                            value={v.driver_id ?? UNASSIGNED_DRIVER}
                            onValueChange={val => handleAssignDriver(v.id, val)}
                            disabled={assigningVehicleId === v.id || drivers.length === 0}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue
                                placeholder={drivers.length === 0 ? 'Sin choferes registrados' : 'Sin chofer asignado'}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNASSIGNED_DRIVER} className="text-xs">Sin chofer asignado</SelectItem>
                              {drivers.map(d => (
                                <SelectItem key={d.id} value={d.id} className="text-xs">
                                  {driverLabel(d)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Choferes tab — fleet clients only (R5 / R9) */}
            {isFleet && (
              <TabsContent value="choferes" className="space-y-2">
                <DriversManager
                  clientId={client.id}
                  canEdit={canAddVehicle}
                  onDriversChanged={() => setDriversKey(k => k + 1)}
                />
              </TabsContent>
            )}

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
                  // A propósito NO se deshabilita cuando la encuesta está apagada: apretarlo
                  // tiene que EXPLICAR que hay que prenderla en Configuración →
                  // Automatizaciones. Un botón gris no explica nada y manda a adivinar.
                  disabled={resending || loading}
                  onClick={handleSend}
                  title={sendBlockedReason ?? 'Envía ahora la encuesta de entrega de vehículo a este cliente'}
                >
                  {resending ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1" />
                  )}
                  Enviar encuesta
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
                  const response = resolveResponse(survey);
                  const surveyAspects = getAspectsForOrigin(survey.origin);
                  const overallScore = response ? Number(response.overall_score) : null;
                  const overallLevel = overallScore != null ? getSatisfactionLevel(Math.round(overallScore)) : null;
                  const pdfProps = buildPdfProps(survey);

                  return (
                    <Card key={survey.id} className="gac-shadow">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {SURVEY_ORIGIN_LABEL[survey.origin] || survey.origin}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(survey.created_at), 'dd/MM/yyyy')}
                              {survey.sold_plate ? ` · ${survey.sold_plate}` : ''}
                            </span>
                            {/* Reenvío de ESTA encuesta. Es lo que antes hacía el botón de
                                arriba adivinando cuál era "la más reciente"; acá el usuario
                                ya eligió, así que no hay forma de mandar la equivocada. */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px]"
                              disabled={resendingId === survey.id}
                              onClick={() => handleResendOne(survey)}
                              title="Volver a enviarle esta encuesta al cliente"
                            >
                              {resendingId === survey.id ? (
                                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Send className="w-3 h-3 mr-1" /> Reenviar
                                </>
                              )}
                            </Button>
                          </div>
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
                            {/* POSTVENTA: preguntas cerradas, sin escala. `surveyAspects` es
                                una lista vacía para este origen, así que el bloque de barras
                                de abajo no renderiza nada y los dos no se pisan. */}
                            {isServiceSurvey(survey.origin) && SERVICE_SURVEY_QUESTIONS.map(question => {
                              const raw = response[`q_${question.column}`] as string | null;
                              const option = getServiceSurveyOption(question.column, raw);
                              const level = getSatisfactionLevel(option?.score ?? 3);
                              return (
                                <div key={question.column} className="flex items-start justify-between gap-3 text-xs">
                                  <span className="text-muted-foreground">{question.title}</span>
                                  <span
                                    className="font-semibold shrink-0 text-right"
                                    style={{ color: `hsl(${level.color})` }}
                                  >
                                    {option?.label ?? '—'}
                                  </span>
                                </div>
                              );
                            })}

                            {surveyAspects.map(aspect => {
                              const score = Number(response[`q_${aspect.column}`]);
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
