import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeSoldPlate, isValidSoldPlate } from '@/lib/plate';
import { translateRegisterWonProspectError } from '@/components/prospects/wonProspectMessages';
import { sendSalesSurveyNow, type ManualSendResult } from '@/components/clients/manualSurveySend';
import { deliverSatisfactionSurvey, describeSkippedDelivery } from '@/components/clients/surveyDelivery';
import ServiceSurveyDecision, { type ServiceSurveyChoice } from '@/components/reservations/ServiceSurveyDecision';
import { recordSurveyDecision, closeSurveyDecision } from '@/lib/surveyDecision';

/**
 * Shared "won prospect" dialog — moving a prospect to `ganado` in both the admin and
 * dealership portals. Requires plate + model + year for every sold vehicle (single or
 * fleet) and submits everything through the `register_won_prospect` RPC in one atomic
 * call, which creates/resolves the client, inserts the vehicle(s), and creates (or
 * suppresses, per the 24h rate limit) exactly one satisfaction survey per purchase.
 *
 * `survey_id` comes back NULL when the prospect was ALREADY `ganado` — the survey trigger
 * only fires on a real status transition, so a prospect imported as won, or one getting its
 * plate captured after the fact, never had a survey to begin with. That is a normal, silent
 * outcome: the win is still confirmed, no delivery is attempted, and no survey is created
 * retroactively (its `eligible_at` would already be in the past, so the sweep would fire a
 * "how was your purchase?" message about a sale closed weeks ago).
 *
 * `register_won_prospect` is brand new (not yet applied to the live DB by the sibling
 * migration slice) and therefore absent from the generated `src/integrations/supabase/
 * types.ts`. Follows the established `as any` convention used elsewhere in this codebase
 * for tables/RPCs ahead of a type regen (see `SatisfactionOverview.tsx:13-14`).
 *
 * ENCUESTA DE VENTA (2026-08-26). Antes salía sola cuando la RPC dejaba una encuesta
 * creada. Ya no: acá, con la placa recién cargada, hay que elegir SÍ o NO — es obligatorio
 * y no hay opción marcada por defecto. Este es el único momento en que alguien sabe si el
 * cliente quedó en condiciones de recibir la pregunta, y es el momento en que el pedido
 * dice que hay que preguntarlo.
 *
 * La elección se escribe en `survey_send_decisions` ANTES de intentar el envío: si Kommo
 * falla o el navegador se cierra, igual queda quién eligió qué.
 *
 * EL ENVÍO TIENE DOS CAMINOS, y el orden importa:
 *
 *   1. Con `survey_id` (el caso normal: la RPC acaba de crear la encuesta) se entrega
 *      directo por la edge function. Se manda con `reason: 'resend'` y no `'won'` porque
 *      esto es una persona pidiendo el envío ahora: `'won'` cae en la espera de 20 horas y,
 *      con el envío automático apagado como está hoy, esa encuesta no saldría nunca.
 *
 *   2. Sin `survey_id` (el prospecto YA estaba en ganado, así que el trigger no disparó, o
 *      la encuesta quedó suprimida) se usa `sendSalesSurveyNow`, que primero crea la fila
 *      con `ensure_sales_survey`. Antes este caso no hacía absolutamente nada, en silencio.
 *
 * El camino 1 va primero A PROPÓSITO: `ensure_sales_survey` exige que el concesionario del
 * prospecto sea uno de los del usuario, y hay 25 ventas ganadas cuyo concesionario NO es el
 * del vendedor que las trabaja. Usar siempre el camino 2 le habría roto el envío a ese
 * vendedor en el momento exacto de cerrar la venta.
 *
 * Un fallo de envío nunca deshace ni esconde la venta: la venta ya está escrita y se
 * reporta aparte.
 */

const MIN_YEAR = 1980;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 2;

/** Live plate search: wait this long after the last keystroke before hitting the network. */
const PLATE_LOOKUP_DEBOUNCE_MS = 350;
/** Matches the 3-character floor enforced inside `staff_search_vehicles_by_plate`. */
const MIN_PLATE_LOOKUP_LENGTH = 3;

interface VehicleModelOption {
  id: string;
  brand: string;
  name: string;
}

/** What a plate lookup found, per row. `null` = nothing found (a brand-new vehicle). */
interface PlateMatch {
  vehicleId: string;
  plate: string;
  modelId: string | null;
  modelLabel: string;
  year: number | null;
  ownerName: string | null;
}

/** Maps a row from either plate RPC — both expose the same field names. */
function toPlateMatch(row: Record<string, unknown>): PlateMatch {
  return {
    vehicleId: String(row.vehicle_id),
    plate: String(row.plate ?? ''),
    modelId: row.model_id ? String(row.model_id) : null,
    modelLabel: [row.model_brand, row.model_name].filter(Boolean).join(' ') || 'Modelo desconocido',
    year: row.year != null ? Number(row.year) : null,
    ownerName: row.client_full_name ? String(row.client_full_name) : null,
  };
}

interface VehicleRow {
  key: string;
  plate: string;
  modelId: string;
  year: string;
  /** undefined = not looked up yet, null = looked up and free. */
  match?: PlateMatch | null;
  lookingUp?: boolean;
  /** User confirmed the transfer of an existing vehicle to this buyer. */
  linkExisting?: boolean;
  /** Partial-plate hits, shown while typing so the user can pick without recalling the
   *  whole plate. Never includes the exact match — that gets its own card. */
  suggestions?: PlateMatch[];
}

export interface WonProspectResult {
  clientId: string;
  surveyId: string | null;
  surveyToken: string | null;
  suppressedReason: string | null;
  vehiclesCreated: number;
  /** Lo que la persona eligió sobre la encuesta de venta. Nunca es null: es obligatorio. */
  surveyChoice: 'si' | 'no';
  /** Resultado del envío cuando eligió "sí". `null` cuando eligió "no". */
  send: ManualSendResult | null;
}

interface WonProspectDialogProps {
  /** Id of the prospect being confirmed as "ganado", or null when the dialog is closed. */
  prospectId: string | null;
  /** Free-text "BRAND MODEL" mirror from `prospects.model_interest`, used only to offer an
   *  exact-match model pre-selection (never silent — see `preselectHint` below). */
  modelInterest?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirmed: (result: WonProspectResult) => void;
}

const makeEmptyRow = (): VehicleRow => ({
  key: crypto.randomUUID(),
  plate: '',
  modelId: '',
  year: '',
});

const isRowValid = (row: VehicleRow): boolean => {
  if (!isValidSoldPlate(row.plate)) return false;
  if (!row.modelId) return false;
  // A plate that already belongs to somebody else cannot be submitted until the user has
  // explicitly accepted the transfer — otherwise the RPC rejects it anyway, and a
  // disabled button explains the situation better than an error after the fact.
  if (row.match && !row.linkExisting) return false;
  const yearTrim = row.year.trim();
  if (!yearTrim) return false;
  const yearNum = Number(yearTrim);
  return Number.isInteger(yearNum) && yearNum >= MIN_YEAR && yearNum <= MAX_YEAR;
};

const hasDuplicatePlates = (rows: VehicleRow[]): boolean => {
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = normalizeSoldPlate(row.plate);
    if (!normalized) continue;
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
};

/**
 * Entrega la encuesta de venta por el camino que corresponda (ver el encabezado del
 * archivo). Devuelve el mismo tipo que el botón manual para que las dos pantallas que
 * consumen el resultado reporten igual.
 */
async function deliverSalesSurvey(
  surveyId: string | null,
  clientId: string | null,
): Promise<ManualSendResult> {
  if (surveyId) {
    const outcome = await deliverSatisfactionSurvey({ survey_id: surveyId }, 'resend');
    switch (outcome.kind) {
      case 'delivered':
        return { ok: true, message: 'Encuesta de satisfacción enviada al cliente.' };
      case 'skipped':
        return { ok: false, message: describeSkippedDelivery(outcome.reason) };
      case 'config_error':
        return { ok: false, message: `No se envió la encuesta: configuración de Kommo incompleta (${outcome.message}).` };
      default:
        return { ok: false, message: outcome.message };
    }
  }
  if (clientId) return sendSalesSurveyNow(clientId);
  return {
    ok: false,
    message: 'La venta quedó registrada, pero no se pudo identificar al cliente para enviarle la encuesta.',
  };
}

export default function WonProspectDialog({ prospectId, modelInterest, onOpenChange, onConfirmed }: WonProspectDialogProps) {
  const [models, setModels] = useState<VehicleModelOption[]>([]);
  const [isFleet, setIsFleet] = useState(false);
  const [rows, setRows] = useState<VehicleRow[]>([makeEmptyRow()]);
  const [preselectHint, setPreselectHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Decisión obligatoria sobre la encuesta de venta. `null` = todavía no eligió.
  const [surveyChoice, setSurveyChoice] = useState<ServiceSurveyChoice>(null);
  // Si la encuesta de venta está prendida. Se avisa apenas marca "sí" y no cuando ya
  // confirmó, porque enterarse después de cerrar la venta no sirve de nada.
  const [salesSurveyEnabled, setSalesSurveyEnabled] = useState(true);
  const attemptedPreselectRef = useRef<string | null>(null);
  /** One pending debounce timer per vehicle row, keyed by row key. */
  const lookupTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Drop any timer still pending when the dialog unmounts, so a lookup never fires against
  // a closed form.
  useEffect(() => () => {
    Object.values(lookupTimers.current).forEach(clearTimeout);
    lookupTimers.current = {};
  }, []);

  // vehicle_models (NOT the `prospect_models` table behind `useProspectModels`, which only
  // feeds the free-text "modelo de interés" suggestion list and has no relation to
  // `vehicles.model_id`). Fetched once; the list is small and rarely changes.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('vehicle_models')
        .select('id, brand, name')
        .eq('is_active', true)
        .order('brand')
        .order('name');
      if (active) setModels((data || []) as VehicleModelOption[]);
    })();
    return () => { active = false; };
  }, []);

  // Reset the form every time a different prospect is targeted.
  useEffect(() => {
    if (!prospectId) return;
    setIsFleet(false);
    setRows([makeEmptyRow()]);
    setPreselectHint(null);
    setFormError(null);
    // Sin elegir, en CADA apertura. Arrastrar la decisión del prospecto anterior es
    // exactamente cómo se manda una encuesta que nadie pidió.
    setSurveyChoice(null);
    attemptedPreselectRef.current = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('get_survey_delivery_config')
      .then(({ data }: { data: unknown }) => {
        const row = (Array.isArray(data) ? data[0] : data) as { sales_enabled?: boolean } | undefined;
        setSalesSurveyEnabled(row?.sales_enabled ?? true);
      })
      .catch(() => setSalesSurveyEnabled(true));
  }, [prospectId]);

  // Exact, unambiguous model_interest -> vehicle_models match: pre-selects but stays
  // editable, and the hint below the field always makes the pre-selection visible —
  // never silent, per requirements.md R5's "no fuzzy mapping" constraint.
  useEffect(() => {
    if (!prospectId || models.length === 0) return;
    if (attemptedPreselectRef.current === prospectId) return;
    attemptedPreselectRef.current = prospectId;
    const target = (modelInterest || '').trim().toLowerCase();
    if (!target) return;
    const matches = models.filter(m => `${m.brand} ${m.name}`.trim().toLowerCase() === target);
    if (matches.length === 1) {
      const match = matches[0];
      setRows(prev => prev.map((r, i) => (i === 0 ? { ...r, modelId: match.id } : r)));
      setPreselectHint(`${match.brand} ${match.name}`);
    }
  }, [prospectId, models, modelInterest]);

  const brands = Array.from(new Set(models.map(m => m.brand)));

  const handleOpenChange = (open: boolean) => {
    if (!open && saving) return; // block accidental close mid-submit
    if (!open) onOpenChange(false);
  };

  const handleFleetToggle = (checked: boolean) => {
    setIsFleet(checked);
    if (!checked) {
      // Unchecked -> back to exactly one vehicle, keeping whatever was in the first row.
      setRows(prev => [prev[0] ?? makeEmptyRow()]);
    }
  };

  const addRow = () => setRows(prev => [...prev, makeEmptyRow()]);
  const removeRow = (key: string) => setRows(prev => (prev.length > 1 ? prev.filter(r => r.key !== key) : prev));
  const updateRow = (key: string, patch: Partial<VehicleRow>) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  };

  /**
   * Looks the plate up as the user types.
   *
   * Goes through `staff_lookup_vehicle_by_plate`, a SECURITY DEFINER RPC, NOT a direct
   * `vehicles` read: RLS only lets a salesperson see vehicles tied to their own dealership's
   * reservations, so a direct query would report "free" for a plate that actually exists and
   * the win would still fail on submit.
   */
  const lookupPlate = async (key: string, rawPlate: string) => {
    const plate = normalizeSoldPlate(rawPlate);
    if (!plate) {
      updateRow(key, { lookingUp: false, match: undefined, linkExisting: false });
      return;
    }
    updateRow(key, { lookingUp: true });
    // Both run in one round trip: the exact hit decides whether the "vincular" card appears,
    // the partial hits become suggestions for a plate the user only half remembers.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [exact, partial] = await Promise.all([
      (supabase.rpc as any)('staff_lookup_vehicle_by_plate', { p_plate: plate }),
      (supabase.rpc as any)('staff_search_vehicles_by_plate', { p_query: plate }),
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const found = (Array.isArray(exact.data) ? exact.data[0] : exact.data) as Record<string, unknown> | undefined;
    // A lookup failure is treated as "not found": the RPC re-validates on submit anyway, so
    // the worst case is the user sees the explicit error there instead of here.
    if (exact.error) console.error('Error looking up plate:', exact.error);

    const match = (exact.error || !found) ? null : toPlateMatch(found);
    const suggestions = ((partial.data || []) as Record<string, unknown>[])
      .map(toPlateMatch)
      // The exact hit already has its own card; repeating it below would be noise.
      .filter(s => normalizeSoldPlate(s.plate) !== plate);

    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      // Typing races the network: a response for "AB12" can land AFTER the one for "AB123".
      // Applying it would show the wrong vehicle. Drop anything whose plate is no longer
      // what the field holds.
      if (normalizeSoldPlate(r.plate) !== plate) return r;
      return { ...r, lookingUp: false, linkExisting: false, match, suggestions };
    }));
  };

  /**
   * Debounced live search. Fires 350 ms after the last keystroke instead of on every one —
   * a 7-character plate would otherwise mean 7 round trips, and the intermediate prefixes
   * are never what the user means.
   */
  const handlePlateChange = (key: string, raw: string) => {
    const plate = raw.toUpperCase();
    // Any previous result is stale the moment the text changes.
    updateRow(key, { plate, match: undefined, suggestions: undefined, linkExisting: false, lookingUp: false });

    const pending = lookupTimers.current[key];
    if (pending) clearTimeout(pending);

    // Below 3 characters a plate is still being typed and would match half the fleet.
    if (normalizeSoldPlate(plate).length < MIN_PLATE_LOOKUP_LENGTH) return;

    lookupTimers.current[key] = setTimeout(() => {
      delete lookupTimers.current[key];
      lookupPlate(key, plate);
    }, PLATE_LOOKUP_DEBOUNCE_MS);
  };

  /** Fills model and year from the found vehicle so the user does not retype what we know. */
  const applyMatch = (row: VehicleRow) => {
    if (!row.match) return;
    updateRow(row.key, {
      linkExisting: true,
      modelId: row.match.modelId ?? row.modelId,
      year: row.match.year != null ? String(row.match.year) : row.year,
    });
  };

  const duplicatePlates = hasDuplicatePlates(rows);
  // `surveyChoice !== null` es la parte obligatoria: sin elegir no se puede confirmar.
  const canSubmit =
    !saving && rows.length > 0 && rows.every(isRowValid) && !duplicatePlates && surveyChoice !== null;

  const handleConfirm = async () => {
    if (!prospectId || !canSubmit) return;
    setFormError(null);
    setSaving(true);
    const payload = rows.map(r => ({
      plate: normalizeSoldPlate(r.plate),
      model_id: r.modelId,
      year: Number(r.year.trim()),
      // Only ever true after the user saw who owns the vehicle and accepted the transfer.
      link_existing: !!(r.match && r.linkExisting),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('register_won_prospect', {
      p_prospect_id: prospectId,
      p_vehicles: payload,
      p_is_fleet: isFleet,
    });
    if (error) {
      setSaving(false);
      setFormError(translateRegisterWonProspectError(error.message));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    // No error + no row means the RPC committed and returned nothing — the win IS written.
    // Telling the user to retry would be wrong twice over: it hides a sale that succeeded,
    // and re-confirming a linked plate drags the vehicle between clients on every attempt.
    // `register_won_prospect` now always returns exactly one row (migration
    // 20260805120000), so this is a last-resort guard, not an expected path.
    if (!row) {
      setSaving(false);
      setFormError(
        'La venta se registró, pero no se pudo leer la confirmación. Actualiza la página para verla — no vuelvas a confirmar.'
      );
      return;
    }

    // La venta ya está escrita (cliente + vehículos, en una sola transacción de la RPC).
    // Todo lo que sigue es la encuesta, y nada de esto puede deshacerla ni esconderla.
    const wantsSurvey = surveyChoice === 'si';

    // El acta se escribe ANTES de intentar el envío, a propósito: si Kommo tarda, falla, o
    // alguien cierra la pestaña, igual queda registrado quién decidió qué.
    const decisionId = await recordSurveyDecision(
      'venta',
      wantsSurvey,
      { prospectId, clientId: row.client_id ?? null, surveyId: row.survey_id ?? null },
      wantsSurvey ? undefined : 'No se envió: decisión de quien registró la venta',
    );

    let send: ManualSendResult | null = null;
    if (wantsSurvey) {
      send = await deliverSalesSurvey(row.survey_id ?? null, row.client_id ?? null);
      await closeSurveyDecision(decisionId, send.ok ? 'Enviada' : send.message);
    }

    setSaving(false);
    onConfirmed({
      clientId: row.client_id,
      surveyId: row.survey_id ?? null,
      surveyToken: row.survey_token ?? null,
      suppressedReason: row.suppressed_reason ?? null,
      vehiclesCreated: row.vehicles_created ?? 0,
      surveyChoice: wantsSurvey ? 'si' : 'no',
      send,
    });
  };

  return (
    <Dialog open={prospectId !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-display">Vehículo vendido</DialogTitle>
        </DialogHeader>
        <div className="py-1 space-y-3">
          <p className="text-xs text-muted-foreground">
            Ingresa la placa, el modelo y el año de cada vehículo vendido para marcar este prospecto como ganado.
          </p>

          <div className="flex items-center gap-2">
            <Checkbox id="won-prospect-fleet" checked={isFleet} onCheckedChange={v => handleFleetToggle(!!v)} />
            <Label htmlFor="won-prospect-fleet" className="text-xs font-normal cursor-pointer">
              Venta de flota (varios vehículos en esta misma venta)
            </Label>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <div key={row.key} className="rounded-md border p-3 space-y-2 relative">
                {isFleet && rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => removeRow(row.key)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Placa del vehículo vendido *</Label>
                  <Input
                    autoFocus={index === 0}
                    value={row.plate}
                    onChange={e => handlePlateChange(row.key, e.target.value)}
                    // Search as you type; the blur is a safety net for a plate shorter than
                    // the live-search threshold that the user finished on and tabbed away.
                    onBlur={e => lookupPlate(row.key, e.target.value)}
                    placeholder="Ej: AB123CD"
                    className="h-9 text-xs"
                  />

                  {row.lookingUp && (
                    <p className="text-[10px] text-muted-foreground">Buscando la placa en el sistema…</p>
                  )}

                  {/* Plate is free — the normal case for a car we just sold. */}
                  {!row.lookingUp && row.match === null && isValidSoldPlate(row.plate) && (
                    <p className="text-[10px] text-muted-foreground">
                      Placa nueva: se registrará el vehículo con los datos de abajo.
                    </p>
                  )}

                  {/* Partial matches while typing. Shown only when there is no exact hit —
                      once the plate is complete its own card takes over. */}
                  {!row.lookingUp && !row.match && (row.suggestions?.length ?? 0) > 0 && (
                    <div className="rounded-md border bg-muted/40 divide-y">
                      <p className="text-[10px] text-muted-foreground px-2 py-1">
                        Vehículos que coinciden con «{normalizeSoldPlate(row.plate)}»
                      </p>
                      {row.suggestions!.map(s => (
                        <button
                          key={s.vehicleId}
                          type="button"
                          onClick={() => handlePlateChange(row.key, s.plate)}
                          className="w-full text-left px-2 py-1.5 hover:bg-muted transition-colors"
                        >
                          <p className="text-[11px] font-medium">
                            {s.plate} · {s.modelLabel}{s.year ? ` ${s.year}` : ''}
                          </p>
                          {s.ownerName && (
                            <p className="text-[10px] text-muted-foreground truncate">{s.ownerName}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Plate already exists in the system, under someone else. */}
                  {!row.lookingUp && row.match && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1.5">
                      <p className="text-[11px] text-amber-800 leading-snug">
                        Esta placa ya existe en el sistema:{' '}
                        <strong>{row.match.modelLabel}{row.match.year ? ` ${row.match.year}` : ''}</strong>
                        {row.match.ownerName && <> · actualmente a nombre de <strong>{row.match.ownerName}</strong></>}.
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={!!row.linkExisting}
                          onCheckedChange={v => (v ? applyMatch(row) : updateRow(row.key, { linkExisting: false }))}
                          className="mt-0.5"
                        />
                        <span className="text-[11px] text-amber-900 leading-snug">
                          Vincular este vehículo al comprador. Se transferirá a su ficha con el modelo y
                          el año de abajo; no se crea un duplicado.
                        </span>
                      </label>
                      {!row.linkExisting && (
                        <p className="text-[10px] text-amber-700">
                          Sin marcar esta casilla no se puede confirmar la venta: la placa es única en el sistema.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo *</Label>
                    <Select value={row.modelId} onValueChange={v => updateRow(row.key, { modelId: v })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecciona modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map(brand => (
                          <SelectGroup key={brand}>
                            <SelectLabel className="text-[10px] font-bold uppercase text-muted-foreground">{brand}</SelectLabel>
                            {models.filter(m => m.brand === brand).map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.brand} {m.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {index === 0 && preselectHint && (
                      <p className="text-[10px] text-muted-foreground">
                        Preseleccionado por coincidencia exacta con «{preselectHint}» — puedes cambiarlo.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Año *</Label>
                    <Input
                      type="number"
                      value={row.year}
                      onChange={e => updateRow(row.key, { year: e.target.value })}
                      placeholder={String(CURRENT_YEAR)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isFleet && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar vehículo
            </Button>
          )}

          <ServiceSurveyDecision
            value={surveyChoice}
            onChange={setSurveyChoice}
            question="¿Enviar la encuesta de satisfacción de la venta al cliente? *"
            disabledLabel="La encuesta de entrega de vehículo"
            disabledNotice={surveyChoice === 'si' && !salesSurveyEnabled}
          />

          {duplicatePlates && (
            <p className="text-xs text-destructive">Hay placas repetidas en la lista. Cada vehículo debe tener una placa distinta.</p>
          )}
          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button size="sm" className="gac-gradient" disabled={!canSubmit} onClick={handleConfirm}>
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
