import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, GitMerge, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import MergeClientsDialog from './MergeClientsDialog';
import {
  buildDuplicateGroups,
  type DuplicateClientRow,
  type DuplicateGroup,
} from '@/lib/duplicateClients';

/**
 * Pestaña "Duplicados" del módulo Clientes.
 *
 * Encuentra las fichas que son el mismo cliente real cargado dos veces y ofrece fusionarlas
 * con el diálogo de siempre. La detección vive en `@/lib/duplicateClients` y va por nombre
 * normalizado: los duplicados que dejó la carga inicial tienen la cédula mal tipeada, así que
 * ninguna búsqueda por cédula los encuentra.
 *
 * Los conteos de vehículos y reservas se traen en una consulta por tabla y no con un
 * `count` por cliente: son decenas de fichas y serían decenas de viajes. Si una de esas dos
 * consultas falla, esa columna queda en "no se pudo contar" — nunca en 0: fusionar no se
 * deshace, y "no tiene nada" y "no pude leerlo" llevan a decisiones opuestas.
 */

const PAGE_SIZE = 1000;
/** Tope de seguridad, igual que `fetchAllRows`: si se alcanza, es un bug, no un caso real. */
const MAX_PAGES = 100;
/** Ids por consulta. Van en la URL: una lista larga rompe el gateway de Supabase (ver la nota
 *  de `fetchClients` en AdminClientes.tsx). */
const ID_CHUNK = 100;

type CountsByClient = Map<string, number>;

/**
 * Trae TODAS las fichas activas. Se pagina a mano en vez de usar `fetchAllRows` porque acá
 * hace falta distinguir un error de "no hay más filas": ese helper devuelve `[]` en los dos
 * casos, y un error silencioso se leería como "no hay duplicados", que es justo la conclusión
 * contraria a la verdadera.
 */
async function fetchActiveClients(): Promise<DuplicateClientRow[]> {
  const rows: DuplicateClientRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, cedula, phone, email, city, created_at')
      .eq('is_active', true)
      .order('id')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = (data || []) as DuplicateClientRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

/** `null` = la consulta falló. Nunca un mapa a medias: un conteo parcial se vería como real. */
async function countByClient(
  table: 'vehicles' | 'reservations',
  ids: string[],
): Promise<CountsByClient | null> {
  const counts: CountsByClient = new Map(ids.map(id => [id, 0]));

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = table === 'vehicles'
        ? supabase.from('vehicles').select('id, client_id')
        : supabase.from('reservations').select('id, client_id');
      const { data, error } = await query
        .in('client_id', chunk)
        .order('id')
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) {
        console.error(`Error contando ${table} de los clientes duplicados:`, error);
        return null;
      }
      const rows = (data || []) as { client_id: string | null }[];
      for (const row of rows) {
        if (!row.client_id) continue;
        counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
      }
      if (rows.length < PAGE_SIZE) break;
    }
  }

  return counts;
}

interface DuplicateClientsPanelProps {
  /** El listado de Clientes muestra las mismas fichas: una fusión lo deja viejo. */
  onClientsChanged?: () => void;
}

export default function DuplicateClientsPanel({ onClientsChanged }: DuplicateClientsPanelProps) {
  const { role } = useAuth();
  const roleName = role?.name?.toLowerCase() || '';
  // La RPC de fusión exige is_admin_user(): un botón visible para el resto siempre
  // respondería "no autorizado". Mismo criterio que ClientDetailDialog.
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [vehicleCounts, setVehicleCounts] = useState<CountsByClient | null>(null);
  const [reservationCounts, setReservationCounts] = useState<CountsByClient | null>(null);
  const [merging, setMerging] = useState<{ baseId: string; baseName: string; candidateId: string | null } | null>(null);
  const scanSeq = useRef(0);

  const scan = useCallback(async () => {
    const seq = ++scanSeq.current;
    setLoading(true);
    setLoadError(false);

    let active: DuplicateClientRow[];
    try {
      active = await fetchActiveClients();
    } catch (err) {
      console.error('Error buscando clientes duplicados:', err);
      if (seq !== scanSeq.current) return;
      setLoadError(true);
      setGroups([]);
      setLoading(false);
      return;
    }

    const found = buildDuplicateGroups(active);
    const ids = found.flatMap(g => g.clients.map(c => c.id));
    const [vehicles, reservations] = ids.length
      ? await Promise.all([countByClient('vehicles', ids), countByClient('reservations', ids)])
      : [new Map<string, number>(), new Map<string, number>()];

    if (seq !== scanSeq.current) return;
    setScannedCount(active.length);
    setGroups(found);
    setVehicleCounts(vehicles);
    setReservationCounts(reservations);
    setLoading(false);
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const countLabel = (counts: CountsByClient | null, clientId: string, noun: string) =>
    counts === null ? `${noun}: no se pudo contar` : `${counts.get(clientId) ?? 0} ${noun}`;

  const countsUnknown = vehicleCounts === null || reservationCounts === null;

  /** Sólo se puede afirmar con los dos conteos leídos: si fallaron, no se sabe. */
  const bothHaveVehicles = (group: DuplicateGroup) =>
    vehicleCounts !== null && group.clients.filter(c => (vehicleCounts.get(c.id) ?? 0) > 0).length > 1;

  if (loading) {
    return (
      <Card className="gac-shadow">
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Buscando fichas duplicadas...</p>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="gac-shadow">
        <CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <p className="text-sm font-medium">No se pudo revisar la lista de clientes</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            La búsqueda quedó incompleta, así que no se puede afirmar que no haya duplicados.
            Vuelve a intentarlo.
          </p>
          <Button size="sm" variant="outline" onClick={scan}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-display font-bold">Duplicados</h2>
          <p className="text-xs text-muted-foreground">
            {groups.length === 0
              ? `Se revisaron ${scannedCount} fichas activas.`
              : `${groups.length} posible(s) duplicado(s) entre ${scannedCount} fichas activas.`}{' '}
            Se comparan por nombre, sin acentos ni mayúsculas: las cédulas mal tipeadas no se
            detectan de otra forma.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={scan}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Volver a revisar
        </Button>
      </div>

      {countsUnknown && groups.length > 0 && (
        <p className="text-xs text-destructive flex items-start gap-1.5 border border-destructive/40 rounded-md p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          No se pudieron contar los vehículos o las reservas de estas fichas. Donde dice "no se
          pudo contar" no quiere decir que la ficha esté vacía, sino que no se pudo leer. Vuelve
          a revisar antes de fusionar.
        </p>
      )}

      {groups.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No hay fichas duplicadas</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-lg mx-auto">
              Ningún cliente activo aparece dos veces con el mismo nombre. Las fichas que ya
              fusionaste quedaron desactivadas y no se cuentan acá; puedes verlas en la pestaña
              Clientes con el filtro Estado en "Inactivos".
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map(group => {
          const delicate = bothHaveVehicles(group);
          const pair = group.clients.length === 2 ? group.clients : null;
          return (
            <Card key={group.key} className={cn('gac-shadow', delicate && 'border-amber-400')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold">{group.displayName}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {group.clients.length} fichas
                    </Badge>
                    {group.samePhone && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800">
                        Mismo teléfono
                      </Badge>
                    )}
                    {delicate && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {pair ? 'Las dos tienen vehículos' : 'Varias tienen vehículos'}
                      </Badge>
                    )}
                  </div>
                  {isAdmin && pair && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setMerging({
                        baseId: pair[0].id,
                        baseName: pair[0].full_name,
                        candidateId: pair[1].id,
                      })}
                    >
                      <GitMerge className="w-3.5 h-3.5 mr-1" /> Revisar y fusionar
                    </Button>
                  )}
                </div>

                {delicate && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-md p-2">
                    Más de una ficha tiene vehículos: al fusionar, las dos carteras quedan bajo un
                    mismo cliente. Confirma que es la misma persona o empresa antes de seguir.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.clients.map(c => (
                    <div key={c.id} className="rounded-md border p-2.5 space-y-1 text-[11px]">
                      <p className="text-xs font-semibold truncate">{c.full_name}</p>
                      <p className="truncate">Cédula / RIF: {c.cedula || '—'}</p>
                      <p className="truncate">Teléfono: {c.phone || '—'}</p>
                      <p className="truncate">Correo: {c.email || '—'}</p>
                      <p className="truncate">Ciudad: {c.city || '—'}</p>
                      <p className={cn('text-muted-foreground', countsUnknown && 'text-destructive')}>
                        {countLabel(vehicleCounts, c.id, 'vehículo(s)')} ·{' '}
                        {countLabel(reservationCounts, c.id, 'reserva(s)')}
                      </p>
                      {isAdmin && !pair && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs w-full"
                          onClick={() => setMerging({
                            baseId: c.id,
                            baseName: c.full_name,
                            candidateId: null,
                          })}
                        >
                          <GitMerge className="w-3.5 h-3.5 mr-1" /> Fusionar esta ficha
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <MergeClientsDialog
        clientId={merging?.baseId ?? null}
        clientName={merging?.baseName ?? ''}
        candidateId={merging?.candidateId ?? null}
        open={!!merging}
        onOpenChange={open => { if (!open) setMerging(null); }}
        onSuccess={() => {
          setMerging(null);
          // Se vuelve a escanear en vez de sacar el grupo de la lista: la ficha que sobrevive
          // pudo quedarse con datos de la otra, y los conteos de vehículos y reservas cambian.
          scan();
          onClientsChanged?.();
        }}
      />
    </div>
  );
}
