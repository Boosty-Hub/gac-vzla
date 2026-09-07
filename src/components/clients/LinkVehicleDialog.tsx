import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Car, Search, AlertTriangle, Link2 } from 'lucide-react';
import { sanitizeSearchTerm } from '@/lib/vehicleSearch';
import { cn } from '@/lib/utils';

/**
 * Vincular / re-vincular un vehículo existente a un cliente.
 *
 * Es la contraparte del botón de desvincular, y la ÚNICA vía legítima para mover un vehículo
 * de dueño: desde el 2026-09-07 un trigger BEFORE UPDATE sobre `vehicles` rechaza con 42501
 * cualquier cambio de `client_id` que no venga de una función autorizada, así que un
 * `.from('vehicles').update({ client_id })` desde acá fallaría. Ver
 * supabase/migrations/20260907210000_blindaje_dueno_vehiculo.sql.
 */

const MIN_QUERY_LENGTH = 2;
const MIN_REASON_LENGTH = 5;
const RESULT_LIMIT = 20;

interface LinkVehicleClient {
  id: string;
  full_name: string;
}

/** Lo que hace falta para que quien llama refresque su lista sin volver a consultar todo. */
export interface LinkedVehicleSummary {
  id: string;
  plate: string | null;
  warranty_active: boolean;
  is_manual: boolean;
  brand: string | null;
  /** Dueño anterior, para poder sacarlo de SU lista también. NULL = no tenía dueño. */
  previousClientId: string | null;
}

interface SearchRow {
  id: string;
  plate: string | null;
  vin: string | null;
  year: number;
  client_id: string | null;
  is_active: boolean;
  vehicle_models: { brand: string; name: string } | null;
}

interface OwnerInfo {
  full_name: string;
  is_active: boolean;
}

interface LinkVehicleDialogProps {
  client: LinkVehicleClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama sólo cuando la RPC devolvió bien. No se llama al cerrar ni al fallar. */
  onSuccess: (linked: LinkedVehicleSummary) => void;
}

/**
 * Excepciones tal cual las levanta `admin_set_vehicle_client`. Se matchea por prefijo porque
 * el trigger interpola valores en su mensaje, y nunca se muestra el texto crudo de Postgres.
 */
export function translateSetVehicleClientError(rawMessage: string | null | undefined): string {
  const message = (rawMessage || '').trim();
  if (message.startsWith('not_authorized')) {
    return 'Solo un administrador puede cambiar el dueño de un vehículo.';
  }
  if (message.startsWith('client_inactive')) {
    return 'Ese cliente está desactivado (es un duplicado fusionado). Elige la ficha real.';
  }
  if (message.startsWith('client_not_found')) {
    return 'Ese cliente ya no existe. Actualiza la página e inténtalo de nuevo.';
  }
  if (message.startsWith('vehicle_not_found')) {
    return 'Ese vehículo ya no existe. Búscalo de nuevo.';
  }
  if (message.startsWith('vehicle_owner_change_denied')) {
    return 'El sistema bloqueó el cambio de dueño. Vuelve a intentarlo desde este mismo botón; si sigue fallando, contacta a soporte.';
  }
  return 'No se pudo vincular el vehículo. Inténtalo de nuevo o contacta a soporte.';
}

/**
 * Término listo para interpolar en un `ilike`. `sanitizeSearchTerm` saca comillas y barras,
 * pero `%` y `_` sobreviven como comodines de LIKE: sin quitarlos, escribir «%%» vuelca 20
 * vehículos arbitrarios con placa, VIN y dueño. Se quitan en vez de escaparlos porque ninguna
 * placa ni ningún VIN los contiene legítimamente.
 */
const buildSearchQuery = (raw: string): string => sanitizeSearchTerm(raw).replace(/[%_]/g, '');

const describeVehicle = (row: SearchRow): string => {
  const model = [row.vehicle_models?.brand, row.vehicle_models?.name].filter(Boolean).join(' ');
  return [model || 'Modelo desconocido', row.year].filter(Boolean).join(' ');
};

export default function LinkVehicleDialog({ client, open, onOpenChange, onSuccess }: LinkVehicleDialogProps) {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchRow[]>([]);
  const [owners, setOwners] = useState<Record<string, OwnerInfo>>({});
  const [selected, setSelected] = useState<SearchRow | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Descarta respuestas viejas: escribir rápido dispara varias búsquedas y la última en
  // llegar no es necesariamente la del texto que quedó en el campo.
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setDebouncedTerm('');
    setResults([]);
    setOwners({});
    setSelected(null);
    setReason('');
    setFormError(null);
    setSearching(false);
  }, [open, client?.id]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const query = buildSearchQuery(debouncedTerm);
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOwners({});
      setSearching(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);
    // Buscar de nuevo es elegir de nuevo: dejar seleccionado un vehículo que ya no está en la
    // lista es la forma más fácil de vincular el equivocado.
    setSelected(null);
    setFormError(null);
    (async () => {
      // Select directo y no `staff_search_vehicles_by_plate`: este diálogo ya está reservado
      // a admin (la RPC exige is_admin_user()), la policy `vehicles_select` le muestra todo,
      // y así también aparecen los vehículos desvinculados (client_id NULL) y los inactivos,
      // que son justamente los que hay que poder re-vincular. Además busca por VIN.
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, plate, vin, year, client_id, is_active, vehicle_models(brand, name)')
        .or(`plate.ilike."%${query}%",vin.ilike."%${query}%"`)
        .order('plate')
        .limit(RESULT_LIMIT);

      if (seq !== searchSeq.current) return;

      if (error) {
        console.error('Error buscando vehículos por placa/VIN:', error);
        setResults([]);
        setSearching(false);
        setFormError('No se pudo buscar el vehículo. Inténtalo de nuevo.');
        return;
      }

      // `client_id` sigue declarado NOT NULL en los tipos generados (no se regeneraron desde
      // que la columna admite NULL, 20260901130000), y un vehículo desvinculado es justo el
      // caso que este buscador tiene que encontrar.
      const rows = (data || []) as unknown as SearchRow[];
      setResults(rows);
      setSearching(false);

      // Los nombres de los dueños se resuelven en un segundo viaje y no con un embed: hace
      // falta `is_active` para poder avisar que el dueño actual es un duplicado fusionado, y
      // así un fallo al resolver nombres no se lleva puesta la lista de vehículos.
      const ownerIds = Array.from(new Set(rows.map(r => r.client_id).filter(Boolean))) as string[];
      if (ownerIds.length === 0) {
        setOwners({});
        return;
      }
      const { data: ownerRows } = await supabase
        .from('clients')
        .select('id, full_name, is_active')
        .in('id', ownerIds);
      if (seq !== searchSeq.current) return;
      const map: Record<string, OwnerInfo> = {};
      for (const row of ownerRows || []) {
        map[row.id] = { full_name: row.full_name, is_active: row.is_active };
      }
      setOwners(map);
    })();
  }, [debouncedTerm, open]);

  const alreadyMine = !!selected && !!client && selected.client_id === client.id;
  const currentOwner = selected?.client_id ? owners[selected.client_id] : undefined;
  const canSubmit = !!client && !!selected && !alreadyMine && reason.trim().length >= MIN_REASON_LENGTH && !saving;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    if (!nextOpen) onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!client || !selected || !canSubmit) return;
    setFormError(null);
    setSaving(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('admin_set_vehicle_client', {
      p_vehicle_id: selected.id,
      p_client_id: client.id,
      p_reason: reason.trim(),
    });
    setSaving(false);

    if (error) {
      console.error(error);
      setFormError(translateSetVehicleClientError(error.message));
      return;
    }

    // `RETURNS public.vehicles` es una fila, no una tabla: llega como objeto. Aun así se
    // normaliza por si el cliente de Supabase la envuelve, y se cae a la fila de búsqueda.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id?: string; plate?: string | null; warranty_active?: boolean; is_manual?: boolean }
      | null;

    onSuccess({
      id: selected.id,
      plate: row?.plate ?? selected.plate,
      warranty_active: row?.warranty_active ?? false,
      is_manual: row?.is_manual ?? false,
      brand: selected.vehicle_models?.brand ?? null,
      previousClientId: selected.client_id,
    });
    toast.success(`${selected.plate || 'El vehículo'} quedó vinculado a ${client.full_name}.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-display flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Vincular vehículo existente
          </DialogTitle>
        </DialogHeader>

        <div className="py-1 space-y-3">
          <p className="text-xs text-muted-foreground">
            Busca un vehículo que ya está en el sistema y pásalo a la ficha de{' '}
            <strong>{client?.full_name}</strong>. Esto no crea un vehículo nuevo: mueve uno que ya
            existe, con todo su historial de servicios.
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Placa o VIN</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={term}
                onChange={e => setTerm(e.target.value.toUpperCase())}
                placeholder="Escribe al menos 2 caracteres"
                className="h-9 text-xs pl-8"
              />
            </div>
          </div>

          <div className="max-h-[32vh] overflow-y-auto space-y-1.5 pr-1">
            {searching ? (
              <p className="text-xs text-muted-foreground py-2">Buscando...</p>
            ) : buildSearchQuery(debouncedTerm).length < MIN_QUERY_LENGTH ? (
              <p className="text-xs text-muted-foreground py-2">
                Escribe al menos {MIN_QUERY_LENGTH} caracteres de la placa o del VIN.
              </p>
            ) : results.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Ningún vehículo coincide con esa placa o ese VIN.
              </p>
            ) : (
              results.map(row => {
                const owner = row.client_id ? owners[row.client_id] : undefined;
                const isSelected = selected?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => { setSelected(row); setFormError(null); }}
                    className={cn(
                      'w-full text-left rounded-md border p-2 transition-colors',
                      isSelected ? 'border-primary bg-primary/5' : 'bg-muted/40 hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">
                        {row.plate || 'Sin placa'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {!row.is_active && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inactivo</Badge>
                        )}
                        {row.client_id ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
                            Con dueño
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Sin dueño</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      <Car className="w-3 h-3 inline mr-1 -mt-0.5" />
                      {describeVehicle(row)}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      VIN: {row.vin || '—'} · Dueño actual:{' '}
                      {row.client_id ? (owner?.full_name || 'Cliente sin acceso visible') : 'Sin dueño'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {selected && alreadyMine && (
            <div className="rounded-md border p-2.5 text-[11px] bg-muted/50">
              Ese vehículo ya está vinculado a <strong>{client?.full_name}</strong>. Elige otro.
            </div>
          )}

          {selected && !alreadyMine && selected.client_id && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-1">
              <p className="text-[11px] text-amber-800 leading-snug flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>{selected.plate || 'Este vehículo'}</strong> hoy es de{' '}
                  <strong>{currentOwner?.full_name || 'otro cliente'}</strong>. Al confirmar se lo
                  quitas a esa ficha y pasa a la de <strong>{client?.full_name}</strong>, junto con
                  su historial. Queda registrado quién lo movió y por qué.
                </span>
              </p>
            </div>
          )}

          {selected && !alreadyMine && !selected.client_id && (
            <div className="rounded-md border p-2.5 text-[11px] bg-muted/50">
              <strong>{selected.plate || 'Este vehículo'}</strong> no tiene dueño asignado. Pasará a
              la ficha de <strong>{client?.full_name}</strong>.
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Motivo *</Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: el vehículo estaba cargado en la ficha equivocada"
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Queda guardado en el historial de dueños del vehículo. Mínimo {MIN_REASON_LENGTH} caracteres.
            </p>
          </div>

          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="flex-1 gac-gradient" disabled={!canSubmit} onClick={handleSubmit}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Vincular vehículo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
