import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeftRight, Search, GitMerge, AlertTriangle } from 'lucide-react';
import { sanitizeSearchTerm } from '@/lib/vehicleSearch';
import { cn } from '@/lib/utils';

/**
 * Fusión de dos fichas de un mismo cliente real.
 *
 * Va por `admin_merge_clients` y no por updates sueltos: la RPC mueve vehículos, reservas,
 * choferes, accesos, prospectos, encuestas y decisiones de envío dentro de una sola
 * transacción, y es la única que puede reasignar vehículos sin chocar contra el trigger que
 * blinda `vehicles.client_id`. Ver
 * supabase/migrations/20260907210000_blindaje_dueno_vehiculo.sql.
 */

const MIN_QUERY_LENGTH = 2;
/** Igual que `staff_search_clients`: por debajo de esto un teléfono no identifica a nadie. */
const MIN_PHONE_DIGITS = 7;
const MIN_REASON_LENGTH = 5;
const RESULT_LIMIT = 20;

interface ClientSummary {
  id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
}

interface ClientCard extends ClientSummary {
  /** `null` = no se pudo contar. Ver `countFor`. */
  vehicleCount: number | null;
  reservationCount: number | null;
  portalUserCount: number | null;
}

export interface MergeResult {
  keepId: string;
  dupId: string;
}

interface MergeClientsDialogProps {
  /** Ficha desde la que se abrió la fusión. Es una de las dos candidatas, no necesariamente
   *  la que se conserva. */
  clientId: string | null;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: MergeResult) => void;
}

/** Excepciones tal cual las levanta `admin_merge_clients`. Match por prefijo: nunca se
 *  muestra el texto crudo de Postgres. */
export function translateMergeClientsError(rawMessage: string | null | undefined): string {
  const message = (rawMessage || '').trim();
  if (message.startsWith('not_authorized')) {
    return 'Solo un administrador puede fusionar clientes.';
  }
  if (message.startsWith('same_client')) {
    return 'No se puede fusionar un cliente consigo mismo.';
  }
  if (message.startsWith('client_not_found')) {
    return 'Uno de los dos clientes ya no existe. Actualiza la página e inténtalo de nuevo.';
  }
  if (message.startsWith('keep_sin_cedula')) {
    return 'El cliente que elegiste conservar no tiene cédula y el otro sí. Invierte la dirección de la fusión.';
  }
  if (message.startsWith('keep_inactive')) {
    return 'La ficha que elegiste conservar está desactivada. Reactívala o invierte la dirección de la fusión.';
  }
  return 'No se pudo fusionar. Inténtalo de nuevo o contacta a soporte.';
}

/**
 * Cuál de las dos fichas conviene conservar. La actividad manda sobre todo lo demás: fusionar
 * hacia una ficha desactivada esconde toda la cartera de los listados y deja los vehículos
 * fuera del alcance de `admin_set_vehicle_client`, que rechaza clientes inactivos. Recién
 * después pesa la cédula (la única llave que la RPC exige, rechaza `keep_sin_cedula`) y, en
 * empate, la ficha más antigua, que arrastra el historial más largo.
 */
export function pickDefaultKeepId(a: ClientSummary, b: ClientSummary): string {
  if (a.is_active !== b.is_active) return a.is_active ? a.id : b.id;
  const aHasCedula = !!a.cedula?.trim();
  const bHasCedula = !!b.cedula?.trim();
  if (aHasCedula !== bHasCedula) return aHasCedula ? a.id : b.id;
  return new Date(a.created_at).getTime() <= new Date(b.created_at).getTime() ? a.id : b.id;
}

/**
 * Término listo para interpolar en un `ilike`. `sanitizeSearchTerm` saca comillas y barras,
 * pero `%` y `_` sobreviven como comodines de LIKE: sin quitarlos, escribir «%%» lista la
 * cartera entera. Se quitan en vez de escaparlos porque ni una cédula, ni un teléfono, ni un
 * correo los contienen legítimamente.
 */
const buildSearchQuery = (raw: string): string => sanitizeSearchTerm(raw).replace(/[%_]/g, '');

/**
 * Cuenta filas de una tabla por cliente. Va con `head: true` y sin embed: contar por separado
 * mantiene los tres conteos independientes, y un fallo de uno no se lleva puesto al resto.
 * `null` = la consulta falló; nunca 0, porque «no se pudo contar» y «no tiene ninguno» llevan
 * a decisiones opuestas en una acción que no se puede deshacer.
 */
const countFor = async (
  table: 'vehicles' | 'reservations' | 'client_users',
  clientId: string,
): Promise<number | null> => {
  const query = table === 'vehicles'
    ? supabase.from('vehicles').select('id', { count: 'exact', head: true })
    : table === 'reservations'
      ? supabase.from('reservations').select('id', { count: 'exact', head: true })
      : supabase.from('client_users').select('id', { count: 'exact', head: true });
  const { count, error } = await query.eq('client_id', clientId);
  if (error) {
    console.error(`Error contando ${table} del cliente:`, error);
    return null;
  }
  return count ?? 0;
};

export default function MergeClientsDialog({
  clientId, clientName, open, onOpenChange, onSuccess,
}: MergeClientsDialogProps) {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [cards, setCards] = useState<{ base: ClientCard; other: ClientCard } | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const cardsSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setDebouncedTerm('');
    setResults([]);
    setCards(null);
    setKeepId(null);
    setReason('');
    setFormError(null);
    setSearching(false);
    setLoadingCards(false);
    // Descarta lo que quedó volando de la apertura anterior.
    searchSeq.current += 1;
    cardsSeq.current += 1;
  }, [open, clientId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open || !clientId) return;
    const query = buildSearchQuery(debouncedTerm);
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);
    (async () => {
      // Select directo sobre `clients` y no `staff_search_clients`: esa RPC no busca por
      // correo (y el correo de relleno es justo lo que fabrica duplicados), no devuelve
      // is_active — un duplicado ya fusionado quedaría indistinguible — ni la ciudad que
      // hace falta para comparar las dos fichas. Este diálogo ya está reservado a admin,
      // que ve toda la cartera.
      const digits = debouncedTerm.replace(/\D/g, '');
      const filters = [
        `full_name.ilike."%${query}%"`,
        `cedula.ilike."%${query}%"`,
        `email.ilike."%${query}%"`,
      ];
      // El teléfono sólo entra con el número casi completo. `staff_search_clients` subió este
      // mismo umbral de 4 a 7 (20260831130000) porque una placa mal tipeada aportaba 4 dígitos
      // que matcheaban el teléfono de un cliente ajeno.
      if (digits.length >= MIN_PHONE_DIGITS) filters.push(`phone.ilike."%${digits}%"`);

      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, cedula, phone, email, city, is_active, created_at')
        .or(filters.join(','))
        .order('full_name')
        .limit(RESULT_LIMIT);

      if (seq !== searchSeq.current) return;
      setSearching(false);

      if (error) {
        console.error('Error buscando clientes para fusionar:', error);
        setResults([]);
        setFormError('No se pudo buscar el cliente. Inténtalo de nuevo.');
        return;
      }
      setResults(((data || []) as ClientSummary[]).filter(c => c.id !== clientId));
    })();
  }, [debouncedTerm, open, clientId]);

  const loadPair = async (otherId: string) => {
    if (!clientId) return;
    // Guard de secuencia propio (no el de la búsqueda, que se mueve solo con el debounce):
    // dos clics seguidos sobre candidatos distintos lanzan dos cargas y gana la que responda
    // última, que puede no ser la que se eligió.
    const seq = ++cardsSeq.current;
    setFormError(null);
    setLoadingCards(true);

    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, cedula, phone, email, city, is_active, created_at')
      .in('id', [clientId, otherId]);

    if (seq !== cardsSeq.current) return;

    if (error || !data) {
      console.error('Error cargando las fichas a comparar:', error);
      setLoadingCards(false);
      setFormError('No se pudieron cargar las dos fichas. Inténtalo de nuevo.');
      return;
    }

    const rows = data as ClientSummary[];
    const base = rows.find(r => r.id === clientId);
    const other = rows.find(r => r.id === otherId);
    if (!base || !other) {
      setLoadingCards(false);
      setFormError('Uno de los dos clientes ya no existe. Actualiza la página e inténtalo de nuevo.');
      return;
    }

    // Se cuentan aparte y no con un embed `vehicles(count)`: cada conteo falla por su cuenta y
    // así se puede decir cuál no se pudo leer, en vez de mostrar un 0 que parece una ficha
    // vacía. Un embed devuelve el bloque entero o nada.
    const [
      baseVehicles, baseReservations, basePortalUsers,
      otherVehicles, otherReservations, otherPortalUsers,
    ] = await Promise.all([
      countFor('vehicles', base.id),
      countFor('reservations', base.id),
      countFor('client_users', base.id),
      countFor('vehicles', other.id),
      countFor('reservations', other.id),
      countFor('client_users', other.id),
    ]);

    if (seq !== cardsSeq.current) return;

    setCards({
      base: { ...base, vehicleCount: baseVehicles, reservationCount: baseReservations, portalUserCount: basePortalUsers },
      other: { ...other, vehicleCount: otherVehicles, reservationCount: otherReservations, portalUserCount: otherPortalUsers },
    });
    setKeepId(pickDefaultKeepId(base, other));
    setLoadingCards(false);
  };

  const keep = cards ? (keepId === cards.base.id ? cards.base : cards.other) : null;
  const dup = cards ? (keepId === cards.base.id ? cards.other : cards.base) : null;
  // Se anticipa el `keep_sin_cedula` de la RPC en vez de dejar que falle: la corrección es
  // invertir la dirección, y eso se puede decir antes de gastar el intento.
  const keepMissingCedula = !!keep && !!dup && !keep.cedula?.trim() && !!dup.cedula?.trim();
  // Conservar la ficha desactivada esconde toda la cartera de los listados activos y deja los
  // vehículos fuera del alcance de `admin_set_vehicle_client` (rechaza `client_inactive`):
  // recuperarlo exigiría reactivar por SQL a mano.
  const keepInactive = !!keep && !keep.is_active;
  // Un conteo que falló no es un conteo de cero, y son justo los números con los que se decide
  // cuál de las dos fichas es la real.
  const countsUnknown = !!keep && !!dup && [keep, dup].some(
    c => c.vehicleCount === null || c.reservationCount === null || c.portalUserCount === null,
  );
  const canSubmit = !!keep && !!dup && !keepMissingCedula && !keepInactive && !countsUnknown
    && reason.trim().length >= MIN_REASON_LENGTH && !saving;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    if (!nextOpen) onOpenChange(false);
  };

  // Desvincular un vehículo —que se puede deshacer— ya pide confirmación; fusionar mueve la
  // cartera entera y desactiva una ficha, y desde la pantalla no se revierte. Además
  // "Invertir dirección" intercambia la posición de las dos tarjetas, así que el operador
  // puede estar mirando otra fila de la que cree.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSubmit = async () => {
    if (!keep || !dup || !canSubmit) return;
    setFormError(null);
    setSaving(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('admin_merge_clients', {
      p_keep_id: keep.id,
      p_dup_id: dup.id,
      p_reason: reason.trim(),
    });
    setSaving(false);

    if (error) {
      console.error(error);
      setFormError(translateMergeClientsError(error.message));
      return;
    }

    toast.success(`Fichas fusionadas. Todo quedó en ${keep.full_name}; ${dup.full_name} quedó desactivada.`);
    onSuccess({ keepId: keep.id, dupId: dup.id });
    onOpenChange(false);
  };

  const renderCard = (card: ClientCard, role: 'keep' | 'dup') => (
    <div
      className={cn(
        'rounded-md border p-2.5 space-y-1 text-[11px]',
        role === 'keep' ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge className={cn('text-[10px] px-1.5 py-0', role === 'keep' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800')}>
          {role === 'keep' ? 'Se conserva' : 'Duplicado'}
        </Badge>
        {!card.is_active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Desactivado</Badge>}
      </div>
      <p className="text-xs font-semibold truncate">{card.full_name}</p>
      <p className="truncate">Cédula: {card.cedula || '—'}</p>
      <p className="truncate">Teléfono: {card.phone || '—'}</p>
      <p className="truncate">Correo: {card.email || '—'}</p>
      <p className="truncate">Ciudad: {card.city || '—'}</p>
      <p className="text-muted-foreground">
        {card.vehicleCount ?? '—'} vehículo(s) · {card.reservationCount ?? '—'} reserva(s) ·{' '}
        {card.portalUserCount ?? '—'} usuario(s) del portal
      </p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-display flex items-center gap-2">
            <GitMerge className="w-4 h-4" /> Fusionar con otro cliente
          </DialogTitle>
        </DialogHeader>

        <div className="py-1 space-y-3">
          <p className="text-xs text-muted-foreground">
            {cards ? (
              <>
                Revisa las dos fichas y elige cuál se conserva. Todo lo de la otra pasa a esa.
              </>
            ) : (
              <>
                Busca la otra ficha del mismo cliente real. Se unifican en una sola:{' '}
                <strong>{clientName}</strong> es una de las dos candidatas, y tú eliges cuál se
                conserva.
              </>
            )}
          </p>

          {!cards && (
            <div className="space-y-1">
              <Label className="text-xs">Nombre, cédula, teléfono o correo</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={term}
                  onChange={e => setTerm(e.target.value)}
                  placeholder="Escribe al menos 2 caracteres"
                  className="h-9 text-xs pl-8"
                />
              </div>
            </div>
          )}

          {!cards && (
            <div className="max-h-[28vh] overflow-y-auto space-y-1.5 pr-1">
              {searching || loadingCards ? (
                <p className="text-xs text-muted-foreground py-2">Buscando...</p>
              ) : buildSearchQuery(debouncedTerm).length < MIN_QUERY_LENGTH ? (
                <p className="text-xs text-muted-foreground py-2">
                  Escribe al menos {MIN_QUERY_LENGTH} caracteres para buscar la otra ficha.
                </p>
              ) : results.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Ningún otro cliente coincide con esa búsqueda.</p>
              ) : (
                results.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => { if (!loadingCards) loadPair(row.id); }}
                    className="w-full text-left rounded-md border bg-muted/40 hover:bg-muted p-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{row.full_name}</span>
                      {!row.is_active && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Desactivado</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {row.cedula || 'Sin cédula'} · {row.phone || 'Sin teléfono'} · {row.email || 'Sin correo'}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {cards && keep && dup && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {renderCard(keep, 'keep')}
                {renderCard(dup, 'dup')}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  // Invertir cambia de lugar las dos tarjetas: se borra el motivo a propósito,
                  // para que el botón quede desarmado y haya que releer cuál es cuál.
                  onClick={() => { setKeepId(dup.id); setReason(''); }}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> Invertir dirección
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setCards(null); setKeepId(null); }}
                >
                  Elegir otro cliente
                </Button>
              </div>

              {keepInactive && (
                <p className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  La ficha que elegiste conservar está desactivada. Invierte la dirección, o
                  reactívala desde su edición antes de fusionar: si todo queda en una ficha
                  desactivada, desaparece de los listados y sus vehículos no se pueden volver a
                  mover.
                </p>
              )}

              {keepMissingCedula && (
                <p className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  El cliente que elegiste conservar no tiene cédula y el otro sí.{' '}
                  {dup.is_active
                    ? 'Invierte la dirección de la fusión.'
                    : 'La otra ficha está desactivada, así que tampoco sirve como sobreviviente: carga la cédula en la ficha activa desde su edición y vuelve a fusionar.'}
                </p>
              )}

              {countsUnknown && (
                <p className="text-[11px] text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  No se pudieron contar los vehículos, reservas o usuarios del portal de una de
                  las fichas. Actualiza la página y vuelve a abrir la fusión: sin esos números no
                  hay cómo saber cuál de las dos es la real.
                </p>
              )}

              {!!dup.portalUserCount && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-md p-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {dup.portalUserCount} usuario(s) del portal de <strong>{dup.full_name}</strong>{' '}
                    van a poder entrar y ver TODA la información de <strong>{keep.full_name}</strong>:
                    sus vehículos, reservas, historial de servicio y encuestas. Confirma que es la
                    misma persona o empresa.
                  </span>
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Motivo *</Label>
                <Input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Ej: misma persona cargada dos veces desde Kommo"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Queda guardado en el historial de dueños de cada vehículo movido. Mínimo{' '}
                  {MIN_REASON_LENGTH} caracteres.
                </p>
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">
                Se mueven a <strong>{keep.full_name}</strong> los vehículos, reservas, choferes,
                usuarios del portal, prospectos, encuestas y decisiones de envío de{' '}
                <strong>{dup.full_name}</strong>, y se rellenan con sus datos los campos que estén
                vacíos en la ficha que se conserva. El duplicado <strong>no se borra</strong>: queda
                desactivado y se puede revisar después.
              </p>
            </div>
          )}

          {formError && <p className="text-xs text-destructive">{formError}</p>}
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="flex-1 gac-gradient" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Fusionar'}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Fusionar estas dos fichas?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-xs">
                  <p>
                    Todo lo que hoy cuelga de <strong>{dup?.full_name}</strong> pasa a{' '}
                    <strong>{keep?.full_name}</strong>: vehículos, reservas, choferes, prospectos,
                    encuestas y los accesos al portal del cliente.
                  </p>
                  <p>
                    <strong>{dup?.full_name}</strong> queda desactivada y deja de aparecer en los
                    listados.
                  </p>
                  <p className="text-amber-700">
                    Si en realidad son dos personas o empresas distintas, quien entre al portal con
                    el acceso de {dup?.full_name} va a ver los vehículos y el historial de{' '}
                    {keep?.full_name}. Desde esta pantalla no se puede deshacer.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Revisar de nuevo</AlertDialogCancel>
              <AlertDialogAction onClick={handleSubmit}>Sí, fusionar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
