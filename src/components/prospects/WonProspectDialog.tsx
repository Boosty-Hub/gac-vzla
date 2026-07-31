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
import { deliverSatisfactionSurvey, type DeliverSurveyOutcome } from '@/components/clients/surveyDelivery';

/**
 * Shared "won prospect" dialog — moving a prospect to `ganado` in both the admin and
 * dealership portals. Requires plate + model + year for every sold vehicle (single or
 * fleet) and submits everything through the `register_won_prospect` RPC in one atomic
 * call, which creates/resolves the client, inserts the vehicle(s), and creates (or
 * suppresses, per the 24h rate limit) exactly one satisfaction survey per purchase.
 *
 * `register_won_prospect` is brand new (not yet applied to the live DB by the sibling
 * migration slice) and therefore absent from the generated `src/integrations/supabase/
 * types.ts`. Follows the established `as any` convention used elsewhere in this codebase
 * for tables/RPCs ahead of a type regen (see `SatisfactionOverview.tsx:13-14`).
 *
 * design.md's data-flow diagram (line 42) requires this UI path to also invoke
 * `kommo-api`'s `deliver_satisfaction_survey` action once the survey exists — the
 * Kommo-webhook path (task 2.2) already does this for its own entry point, this is the
 * other one. Reuses `deliverSatisfactionSurvey`/`DeliverSurveyOutcome` from
 * `src/components/clients/surveyDelivery.ts` (built for the resend button / repurchase
 * flow) rather than re-implementing the same edge-function contract a second time.
 * Delivery is attempted ONLY when the RPC did not suppress the survey (suppressed_reason
 * null) — a suppressed survey has nothing to deliver. A delivery failure never rolls back
 * or hides the win: it is reported to the caller as a separate `delivery` outcome on the
 * result, distinct from `suppressedReason` (creation-time gate) and `vehiclesCreated`.
 */

const MIN_YEAR = 1980;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 2;

interface VehicleModelOption {
  id: string;
  brand: string;
  name: string;
}

interface VehicleRow {
  key: string;
  plate: string;
  modelId: string;
  year: string;
}

export interface WonProspectResult {
  clientId: string;
  surveyId: string | null;
  surveyToken: string | null;
  suppressedReason: string | null;
  vehiclesCreated: number;
  /** Outcome of invoking kommo-api's `deliver_satisfaction_survey` after the RPC. `null`
   *  when delivery was never attempted because `suppressedReason` was already set. */
  delivery: DeliverSurveyOutcome | null;
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

export default function WonProspectDialog({ prospectId, modelInterest, onOpenChange, onConfirmed }: WonProspectDialogProps) {
  const [models, setModels] = useState<VehicleModelOption[]>([]);
  const [isFleet, setIsFleet] = useState(false);
  const [rows, setRows] = useState<VehicleRow[]>([makeEmptyRow()]);
  const [preselectHint, setPreselectHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const attemptedPreselectRef = useRef<string | null>(null);

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
    attemptedPreselectRef.current = null;
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

  const duplicatePlates = hasDuplicatePlates(rows);
  const canSubmit = !saving && rows.length > 0 && rows.every(isRowValid) && !duplicatePlates;

  const handleConfirm = async () => {
    if (!prospectId || !canSubmit) return;
    setFormError(null);
    setSaving(true);
    const payload = rows.map(r => ({
      plate: normalizeSoldPlate(r.plate),
      model_id: r.modelId,
      year: Number(r.year.trim()),
    }));
    const { data, error } = await (supabase as any).rpc('register_won_prospect', {
      p_prospect_id: prospectId,
      p_vehicles: payload,
      p_is_fleet: isFleet,
    });
    setSaving(false);
    if (error) {
      setFormError(translateRegisterWonProspectError(error.message));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setFormError('No se pudo confirmar la venta. Inténtalo de nuevo.');
      return;
    }

    // The win itself already succeeded (client/vehicles/survey all committed by the RPC).
    // Delivery is a separate, secondary step — attempted only when there is something to
    // deliver, and its outcome (success, skip, or failure) never blocks or hides the win.
    let delivery: DeliverSurveyOutcome | null = null;
    if (!row.suppressed_reason && row.survey_id) {
      delivery = await deliverSatisfactionSurvey({ survey_id: row.survey_id }, 'won');
    }

    onConfirmed({
      clientId: row.client_id,
      surveyId: row.survey_id ?? null,
      surveyToken: row.survey_token ?? null,
      suppressedReason: row.suppressed_reason ?? null,
      vehiclesCreated: row.vehicles_created ?? 0,
      delivery,
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
