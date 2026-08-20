import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { findOrCreateManualModel, type ManualModelClient } from '@/lib/manualVehicleModel';
import { deliverSatisfactionSurvey, describeSkippedDelivery } from './surveyDelivery';

/**
 * "Agregar vehículo" / repurchase dialog for an EXISTING client (requirements.md R6).
 * The won-transition trigger only fires once per prospect, so a returning customer
 * buying again needs a separate, explicit entry point that still goes through the
 * same shared 24h survey gate (`fn_claim_survey_slot`) and the same per-vehicle
 * validation as `register_won_prospect` — mirrored here from
 * `src/components/prospects/WonProspectDialog.tsx`, whose model/year validation and
 * error-mapping shape this file matches, adapted for `register_client_repurchase`
 * (supabase/migrations/20260729120000_satisfaction_prospect_to_client.sql, section 1.7b).
 */

const MIN_YEAR = 1980;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 2;

export interface RepurchaseVehicleModelOption {
  id: string;
  brand: string;
  name: string;
}

interface RepurchaseClient {
  id: string;
  full_name: string;
}

// Sentinel for the "Otro / escribir manualmente" option — never a real vehicle_models.id
// (those are UUIDs). Same convention as AdminClientes / AdminVehiculos / AdminReservas.
const MANUAL_MODEL_VALUE = '__manual__';

interface VehicleRow {
  key: string;
  plate: string;
  /** A real `vehicle_models.id`, or MANUAL_MODEL_VALUE while the user types a brand/model
   *  that is not in the commercial catalog. The sentinel is resolved to a real id right
   *  before submit — the RPC only accepts real ids. */
  modelId: string;
  manualBrand: string;
  manualModel: string;
  year: string;
}

interface RepurchaseDialogProps {
  client: RepurchaseClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: RepurchaseVehicleModelOption[];
  /** Called after a successful RPC call (either outcome) so the caller can refresh
   *  the client's vehicles/surveys lists. Not called when the dialog is dismissed
   *  via the X or when the call fails. */
  onSuccess: () => void;
}

const makeEmptyRow = (): VehicleRow => ({
  key: crypto.randomUUID(), plate: '', modelId: '', manualBrand: '', manualModel: '', year: '',
});

const normalizePlate = (raw: string): string => raw.trim().replace(/\s+/g, ' ').toUpperCase();

const isRowValid = (row: VehicleRow): boolean => {
  if (!normalizePlate(row.plate)) return false;
  if (!row.modelId) return false;
  // A manual row is only complete once BOTH free-text fields are filled; the sentinel
  // alone is not a model.
  if (row.modelId === MANUAL_MODEL_VALUE && (!row.manualBrand.trim() || !row.manualModel.trim())) {
    return false;
  }
  const yearTrim = row.year.trim();
  if (!yearTrim) return false;
  const yearNum = Number(yearTrim);
  return Number.isInteger(yearNum) && yearNum >= MIN_YEAR && yearNum <= MAX_YEAR;
};

const hasDuplicatePlates = (rows: VehicleRow[]): boolean => {
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = normalizePlate(row.plate);
    if (!normalized) continue;
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
};

/**
 * Verbatim exception names raised by `register_client_repurchase`'s validation pass.
 * Matches on the prefix before the colon since several interpolate a value — never
 * surfaces raw Postgres text. `no_new_plates` is handled separately by the caller
 * (benign "nothing to do", not a hard error).
 */
export function translateRegisterClientRepurchaseError(rawMessage: string | null | undefined): string {
  const message = (rawMessage || '').trim();
  if (message.startsWith('client_not_found')) {
    return 'No se encontró el cliente. Actualiza la página e inténtalo de nuevo.';
  }
  if (message.startsWith('not_authorized')) {
    return 'No tienes permiso para registrar esta recompra.';
  }
  if (message.startsWith('at_least_one_vehicle_required')) {
    return 'Agrega al menos un vehículo con placa, modelo y año.';
  }
  if (message.startsWith('invalid_vehicle_entry')) {
    return 'Uno de los vehículos tiene datos inválidos. Revisa la lista e inténtalo de nuevo.';
  }
  if (message.startsWith('plate_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener placa.';
  }
  if (message.startsWith('model_id_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener un modelo seleccionado.';
  }
  if (message.startsWith('year_required_for_every_vehicle')) {
    return 'Todos los vehículos deben tener el año indicado.';
  }
  if (message.startsWith('invalid_model_id')) {
    return 'Uno de los modelos seleccionados no es válido.';
  }
  if (message.startsWith('model_id_not_found')) {
    return 'Uno de los modelos seleccionados ya no existe. Actualiza la lista e inténtalo de nuevo.';
  }
  if (message.startsWith('invalid_year')) {
    return 'Uno de los años ingresados no es válido.';
  }
  if (message.startsWith('year_out_of_range')) {
    const match = message.match(/expected between (\d+) and (\d+)/);
    return match
      ? `Uno de los años está fuera de rango (debe estar entre ${match[1]} y ${match[2]}).`
      : 'Uno de los años está fuera del rango permitido.';
  }
  return 'No se pudo registrar la recompra. Inténtalo de nuevo o contacta a soporte.';
}

export default function RepurchaseDialog({ client, open, onOpenChange, models, onSuccess }: RepurchaseDialogProps) {
  const { selectedDealership, isAdmin, loading: dealershipLoading } = useDealershipAccess();
  const [rows, setRows] = useState<VehicleRow[]>([makeEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  // La encuesta de entrega de vehículo se puede apagar desde Configuración →
  // Automatizaciones. Apagada, la RPC no crea la encuesta, así que el botón "Registrar y
  // enviar encuesta" prometería algo que no va a pasar. Se consulta para no ofrecerlo.
  const [salesSurveyOn, setSalesSurveyOn] = useState(true);

  // Reset the form every time the dialog is (re)opened for a client.
  useEffect(() => {
    if (!open) return;
    setRows([makeEmptyRow()]);
    setFormError(null);
    setFormInfo(null);
  }, [open, client?.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.rpc as any)('get_survey_delivery_config');
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as { sales_enabled?: boolean } | undefined;
      setSalesSurveyOn(row?.sales_enabled ?? true);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const brands = Array.from(new Set(models.map(m => m.brand)));
  const duplicatePlates = hasDuplicatePlates(rows);
  // Non-admin roles (concesionario/vendedor) must supply a dealership_id the RPC can
  // authorize against (public.current_user_dealership_ids()); admins bypass that check
  // entirely (is_admin_user()), so their dealership resolution never blocks submission.
  const dealershipReady = isAdmin || (!dealershipLoading && !!selectedDealership);
  const canSubmit = !saving && dealershipReady && rows.length > 0 && rows.every(isRowValid) && !duplicatePlates;

  const addRow = () => setRows(prev => [...prev, makeEmptyRow()]);
  const removeRow = (key: string) => setRows(prev => (prev.length > 1 ? prev.filter(r => r.key !== key) : prev));
  const updateRow = (key: string, patch: Partial<VehicleRow>) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return; // block accidental close mid-submit
    if (!nextOpen) onOpenChange(false);
  };

  const handleSubmit = async (sendSurvey: boolean) => {
    if (!client || !canSubmit) return;
    setFormError(null);
    setFormInfo(null);
    setSaving(true);

    // Resolve any hand-typed model into a real `vehicle_models` row BEFORE calling the RPC,
    // which validates `model_id` against the table and would reject the sentinel.
    // `findOrCreateManualModel` reuses an existing `is_manual` row for the same brand/model
    // instead of creating a duplicate on every repurchase.
    let payload: Array<{ plate: string; model_id: string; year: number }>;
    try {
      payload = await Promise.all(rows.map(async r => ({
        plate: normalizePlate(r.plate),
        model_id: r.modelId === MANUAL_MODEL_VALUE
          ? await findOrCreateManualModel(supabase as unknown as ManualModelClient, r.manualBrand, r.manualModel)
          : r.modelId,
        year: Number(r.year.trim()),
      })));
    } catch (err) {
      setSaving(false);
      console.error(err);
      setFormError('No se pudo registrar el modelo escrito manualmente. Inténtalo de nuevo.');
      return;
    }
    const dealershipId = isAdmin ? null : (selectedDealership || null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('register_client_repurchase', {
      p_client_id: client.id,
      p_vehicles: payload,
      p_send_survey: sendSurvey,
      p_dealership_id: dealershipId,
    });
    setSaving(false);

    if (error) {
      const message = (error.message || '').trim();
      // `no_new_plates` — every plate submitted already belongs to this client. Benign
      // "nothing to do", not a hard error: shown as info, dialog stays open so the user
      // can adjust the plate(s) instead of losing their in-progress entry.
      if (message.startsWith('no_new_plates')) {
        setFormInfo('Todas las placas ingresadas ya estaban registradas para este cliente. No se registró ningún vehículo nuevo.');
        return;
      }
      setFormError(translateRegisterClientRepurchaseError(message));
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setFormError('No se pudo registrar la recompra. Inténtalo de nuevo.');
      return;
    }

    toast.success(`${row.vehicles_created} vehículo(s) registrado(s) para ${client.full_name}.`);

    if (sendSurvey) {
      if (row.suppressed_reason) {
        // The survey row was intentionally not created for delivery — same handling as
        // the resend button (surveyDelivery.ts's describeSkippedDelivery).
        toast.warning(describeSkippedDelivery(row.suppressed_reason));
      } else if (row.survey_id) {
        const outcome = await deliverSatisfactionSurvey({ survey_id: row.survey_id }, 'repurchase');
        if (outcome.kind === 'delivered') {
          toast.success('Encuesta de satisfacción enviada.');
        } else if (outcome.kind === 'skipped') {
          toast.warning(describeSkippedDelivery(outcome.reason));
        } else if (outcome.kind === 'config_error') {
          toast.error(`No se envió la encuesta: configuración de Kommo incompleta (${outcome.message}).`);
        } else {
          toast.error(`No se pudo enviar la encuesta: ${outcome.message}`);
        }
      }
    }

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-display">Agregar vehículo</DialogTitle>
        </DialogHeader>
        <div className="py-1 space-y-3">
          <p className="text-xs text-muted-foreground">
            Estás registrando un nuevo vehículo para <strong>{client?.full_name}</strong>. Por tratarse de una
            recompra, se enviará una encuesta de satisfacción al cliente, a menos que elijas no hacerlo.
          </p>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <div key={row.key} className="rounded-md border p-3 space-y-2 relative">
                {rows.length > 1 && (
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
                  <Label className="text-xs">Placa del vehículo *</Label>
                  <Input
                    autoFocus={index === 0}
                    value={row.plate}
                    onChange={e => updateRow(row.key, { plate: e.target.value.toUpperCase() })}
                    placeholder="Ej: AB123CD"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo *</Label>
                    <Select value={row.modelId} onValueChange={v => updateRow(row.key, { modelId: v })}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecciona modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* FIRST, not last: the catalog holds 269 active models, so at the
                            bottom this option was effectively invisible. */}
                        <SelectItem value={MANUAL_MODEL_VALUE} className="text-xs font-medium">
                          Otro / escribir manualmente
                        </SelectItem>
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

                {row.modelId === MANUAL_MODEL_VALUE && (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Vehículo de un tercero (no vendido por nosotros). Se registrará{' '}
                      <strong>sin garantía</strong>: solo queda constancia del servicio realizado.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Marca *</Label>
                        <Input
                          value={row.manualBrand}
                          onChange={e => updateRow(row.key, { manualBrand: e.target.value })}
                          placeholder="Ej: Toyota"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Modelo *</Label>
                        <Input
                          value={row.manualModel}
                          onChange={e => updateRow(row.key, { manualModel: e.target.value })}
                          placeholder="Ej: Corolla"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar otro vehículo
          </Button>

          {duplicatePlates && (
            <p className="text-xs text-destructive">Hay placas repetidas en la lista. Cada vehículo debe tener una placa distinta.</p>
          )}
          {!isAdmin && !dealershipLoading && !selectedDealership && (
            <p className="text-xs text-destructive">No se pudo determinar tu concesionario. Actualiza la página e inténtalo de nuevo.</p>
          )}
          {formInfo && <p className="text-xs text-muted-foreground">{formInfo}</p>}
          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {salesSurveyOn ? (
            <>
              <Button
                size="sm"
                className="w-full gac-gradient"
                disabled={!canSubmit}
                onClick={() => handleSubmit(true)}
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Registrar y enviar encuesta'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={!canSubmit}
                onClick={() => handleSubmit(false)}
              >
                Registrar sin enviar encuesta
              </Button>
            </>
          ) : (
            // Con la encuesta apagada se ofrece un solo botón. Dejar el de "y enviar encuesta"
            // sería mentirle al vendedor: registraría los vehículos y no saldría nada.
            <>
              <Button
                size="sm"
                className="w-full gac-gradient"
                disabled={!canSubmit}
                onClick={() => handleSubmit(false)}
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Registrar vehículo(s)'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                La encuesta de entrega de vehículo está desactivada, así que no se enviará
                ninguna. Se prende en Configuración → Automatizaciones.
              </p>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
