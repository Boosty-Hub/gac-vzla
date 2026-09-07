import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronRight, History, ArrowRight } from 'lucide-react';

/**
 * Historial de dueños de un vehículo, sólo lectura.
 *
 * Lee `public.vehicle_owner_audit`, que el trigger `trg_vehicles_audit_owner` llena con TODO
 * cambio de `vehicles.client_id`, venga de donde venga. Su única policy es un SELECT para
 * admins: si quien mira no lo es, la consulta vuelve vacía y el bloque no se muestra —
 * exactamente igual que cuando el vehículo nunca cambió de manos. Ver
 * supabase/migrations/20260907210000_blindaje_dueno_vehiculo.sql.
 */

const HISTORY_LIMIT = 50;

interface VehicleOwnerAuditRow {
  id: number;
  vehicle_id: string;
  plate: string | null;
  old_client_id: string | null;
  new_client_id: string | null;
  changed_at: string;
  changed_by: string | null;
  db_role: string;
  app_source: string | null;
  reason: string | null;
}

/** De qué módulo salió el cambio. `app_source` guarda la ventana que abrió cada RPC. */
function describeSource(appSource: string | null): string | null {
  switch (appSource) {
    case 'clientes:set_owner': return 'Vinculado desde Clientes';
    case 'clientes:unlink': return 'Desvinculado desde Clientes';
    case 'clientes:merge': return 'Fusión de clientes duplicados';
    default: return appSource;
  }
}

/** Quién lo hizo. `changed_by` queda en NULL cuando el cambio no vino de una sesión de
 *  usuario (service_role, cron), y ahí lo único que identifica al autor es el rol de base. */
function describeAuthor(row: VehicleOwnerAuditRow, name: string | undefined, namesRead: boolean): string {
  if (name) return name;
  if (row.changed_by) return namesRead ? 'Usuario ya eliminado' : 'No se pudo cargar el nombre';
  return row.db_role === 'service_role' ? 'Proceso automático' : `Proceso interno (${row.db_role})`;
}

/** Nombre del cliente de una punta del cambio. Ver `clientNamesRead`. */
function describeClient(clientId: string | null, names: Record<string, string>, namesRead: boolean): string {
  if (!clientId) return 'Sin dueño';
  if (names[clientId]) return names[clientId];
  return namesRead ? 'Cliente eliminado' : 'No se pudo cargar el nombre';
}

interface VehicleOwnerHistoryProps {
  vehicleId: string;
}

export default function VehicleOwnerHistory({ vehicleId }: VehicleOwnerHistoryProps) {
  const [rows, setRows] = useState<VehicleOwnerAuditRow[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  // `false` = la consulta de nombres falló, así que un id sin nombre no prueba nada.
  const [clientNamesRead, setClientNamesRead] = useState(true);
  const [authorNamesRead, setAuthorNamesRead] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setOpen(false);
    setClientNamesRead(true);
    setAuthorNamesRead(true);

    (async () => {
      // `vehicle_owner_audit` no está en los tipos generados (tabla nueva, sin regenerar
      // types.ts): el cast es la convención ya establecida en el repo para eso.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('vehicle_owner_audit')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('changed_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (cancelled) return;

      if (error) {
        // Sin permiso (no-admin) o tabla ausente: el bloque simplemente no aparece. No es un
        // error que le sirva de algo a quien está mirando la ficha.
        console.error('Error cargando el historial de dueños del vehículo:', error);
        return;
      }

      const audit = (data || []) as VehicleOwnerAuditRow[];
      setRows(audit);
      if (audit.length === 0) return;

      // La tabla no tiene ninguna clave foránea a propósito (para que auditar nunca bloquee
      // un borrado), así que los nombres se resuelven a mano en dos viajes.
      const clientIds = Array.from(new Set(
        audit.flatMap(r => [r.old_client_id, r.new_client_id]).filter(Boolean) as string[],
      ));
      const authorIds = Array.from(new Set(audit.map(r => r.changed_by).filter(Boolean) as string[]));

      const [clientsRes, profilesRes] = await Promise.all([
        clientIds.length
          ? supabase.from('clients').select('id, full_name').in('id', clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
        authorIds.length
          ? supabase.from('profiles').select('id, full_name, email').in('id', authorIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[], error: null }),
      ]);
      if (cancelled) return;

      // Si la lectura falló no se afirma nada sobre los nombres: en una pantalla de auditoría,
      // decir "Cliente eliminado" por un error de red es peor que no decir nada.
      if (clientsRes.error) console.error('Error resolviendo nombres de clientes del historial:', clientsRes.error);
      setClientNamesRead(!clientsRes.error);
      const names: Record<string, string> = {};
      for (const c of clientsRes.data || []) {
        names[c.id] = c.full_name;
      }
      setClientNames(names);

      if (profilesRes.error) console.error('Error resolviendo autores del historial:', profilesRes.error);
      setAuthorNamesRead(!profilesRes.error);
      const authors: Record<string, string> = {};
      for (const p of profilesRes.data || []) {
        authors[p.id] = p.full_name || p.email || 'Usuario sin nombre';
      }
      setAuthorNames(authors);
    })();

    return () => { cancelled = true; };
  }, [vehicleId]);

  // Un vehículo que nunca cambió de dueño no tiene nada que contar: se esconde el bloque en
  // vez de mostrar un encabezado vacío.
  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <Separator />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-semibold hover:text-primary transition-colors">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <History className="w-3.5 h-3.5" />
          Historial de dueños ({rows.length})
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.id} className="border rounded-md p-2.5 text-[11px] space-y-1">
                <p className="text-muted-foreground">
                  {format(new Date(row.changed_at), 'dd/MM/yyyy HH:mm')}
                </p>
                <p className="flex flex-wrap items-center gap-1 font-medium">
                  <span>{describeClient(row.old_client_id, clientNames, clientNamesRead)}</span>
                  <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span>{describeClient(row.new_client_id, clientNames, clientNamesRead)}</span>
                </p>
                <p className="text-muted-foreground">
                  Por: {describeAuthor(row, row.changed_by ? authorNames[row.changed_by] : undefined, authorNamesRead)}
                  {describeSource(row.app_source) ? ` · ${describeSource(row.app_source)}` : ''}
                </p>
                {row.reason && <p className="whitespace-pre-wrap">Motivo: {row.reason}</p>}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
