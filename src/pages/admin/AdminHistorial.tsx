import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Search, ClipboardList, Car, MapPin, Hash, User, ShieldCheck, ShieldX, Wrench, ClipboardCheck, Phone, FileText, X, Pencil, AlertTriangle, Send, Clock, Star, Minus } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { cn } from '@/lib/utils';
import {
  ARCHIVED_RESERVATION_STATUSES,
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
  reservationStatusStyle,
} from '@/lib/reservationStatus';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useServiceSurveys } from '@/hooks/useServiceSurveys';
import ServiceSurveyInline from '@/components/satisfaction/ServiceSurveyInline';
import ServiceSurveySendPanel from '@/components/satisfaction/ServiceSurveySendPanel';
import ServiceSurveySendDialog, { type ServiceSurveyTarget } from '@/components/satisfaction/ServiceSurveySendDialog';
import { serviceSurveyIconState } from '@/lib/serviceSurveyIcon';
import { useServiceSurveySettings } from '@/hooks/useServiceSurveySettings';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { isInternalServiceName, serviceNotesLabel } from '@/lib/serviceTypes';
import { useInternalServiceTypes } from '@/hooks/useInternalServiceTypes';

interface ServiceEntry {
  id: string;
  dealership_id: string;
  client_id: string | null;
  vehicle_id: string | null;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  service_notes: string | null;
  cancellation_reason: string | null;
  recommendation: string | null;
  internal_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  created_at: string;
  dealerships: { name: string; city: string | null; phone: string | null } | null;
  clients: { full_name: string; cedula: string | null; phone: string | null; email: string | null } | null;
  vehicles: {
    id: string;
    plate: string | null;
    year: number;
    color: string | null;
    vin: string | null;
    mileage: number;
    warranty_active: boolean;
    purchase_date: string | null;
    vehicle_models: { name: string; brand: string; warranty_km: number | null; warranty_months: number | null; warranty_service_interval_km: number | null; is_manual: boolean | null } | null;
  } | null;
}

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
}

// CORRECTION (2026-08-13): the comment previously here claimed `reservations.status` was an
// unconstrained `text` column. It is not, and never was:
//
//   reservations_status_check CHECK (status = ANY (ARRAY[
//     'pendiente','confirmada','en_proceso','completada','cancelada']))
//
// That mistaken belief is what justified carrying `culminado` around as a "harmless extra".
// It was not harmless — two views OFFERED it in their status dropdowns, and the database
// rejected every attempt to save it. See src/lib/reservationStatus.ts.
const statusBadge = reservationStatusStyle;

// Statuses that close an appointment and therefore belong in the service history.
const HISTORY_STATUSES = [...ARCHIVED_RESERVATION_STATUSES];

const AdminHistorial = () => {
  const { profile, role, getModuleScope, hasPermission } = useAuth();
  const internalServiceNames = useInternalServiceTypes();
  const { selectedDealership: myDealershipId } = useDealershipAccess();
  const roleName = role?.name?.toLowerCase() ?? '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const isVendedor = roleName === 'vendedor';
  // enforceScope: si el scope es 'own' y no es admin → forzar filtro por su concesionario
  const enforceScope = !isAdmin && getModuleScope('historial') === 'own';
  // `historial.edit` ya existia en la tabla de permisos desde antes de esta pantalla; hoy lo
  // tienen admin y superadmin. Se otorga o se quita desde Configuracion -> Roles, sin tocar
  // codigo, que es la regla para todo modulo nuevo de este proyecto.
  const canEditHistory = hasPermission('historial.edit');
  // Mismo permiso que usan las otras pantallas para mandar encuestas a mano.
  const canSendSurvey = isAdmin || hasPermission('encuestas.send');

  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // Lo que efectivamente se le pide a la base. La búsqueda dejó de filtrar en el navegador
  // (ver fetchEntries) y ahora viaja: sin este retardo serían siete consultas para escribir
  // una placa de siete caracteres.
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dealershipFilter, setDealershipFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [warrantyFilter, setWarrantyFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [warrantyCond, setWarrantyCond] = useState<WarrantyCondition | null>(null);
  const [dealerships, setDealerships] = useState<{ id: string; name: string }[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ServiceEntry | null>(null);
  const [vehServiceCount, setVehServiceCount] = useState(0);

  // Edición del registro histórico. Nació de un reporte concreto: una cita quedó marcada
  // como cancelada por error y esta pantalla, que es donde vive el registro, era 100% de
  // sólo lectura. No había ninguna forma de corregirlo sin SQL.
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editMileage, setEditMileage] = useState('');
  const [editServiceNotes, setEditServiceNotes] = useState('');
  const [editCancelReason, setEditCancelReason] = useState('');
  const [editRecommendation, setEditRecommendation] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');

  // Encuestas de postventa de TODA la página, en UNA consulta (`.in('reservation_id', ids)`).
  //
  // Antes se pedía sólo la del detalle abierto, con el argumento de que traerlas para las 100
  // filas cargaba datos que nadie iba a mirar. Dejó de ser cierto: el listado ahora pinta un
  // icono por fila con el estado de la encuesta, así que ese dato se mira en todas.
  const surveyIds = useMemo(() => entries.map(e => e.id), [entries]);
  const { surveys: serviceSurveys, reload: reloadSurveys } = useServiceSurveys(surveyIds);

  // Las dos condiciones que deciden si una cita PUEDE recibir la encuesta. Se leen una vez
  // para toda la pantalla: por fila serían mil consultas para pintar una columna.
  const { enabled: surveyEnabled, sendsSurvey } = useServiceSurveySettings();

  // Cita cuyo envío se está confirmando. El diálogo es UNO solo para el listado y para el
  // detalle: dos caminos de envío que preguntan distinto terminan siendo dos comportamientos.
  const [surveyTarget, setSurveyTarget] = useState<ServiceSurveyTarget | null>(null);

  const openSurveyDialog = (entry: ServiceEntry) => setSurveyTarget({
    reservationId: entry.id,
    clientId: entry.client_id,
    clientName: entry.clients?.full_name ?? null,
    clientPhone: entry.clients?.phone ?? null,
    plate: entry.vehicles?.plate ?? null,
    serviceType: entry.service_type,
    date: entry.reservation_date,
  });

  useEffect(() => {
    supabase
      .from('warranty_conditions')
      .select('id, name, max_km, max_months, service_interval_km')
      .eq('is_active', true)
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setWarrantyCond(data[0] as WarrantyCondition); });

    supabase
      .from('dealerships')
      .select('id, name')
      .order('name')
      .then(({ data }) => setDealerships((data || []) as { id: string; name: string }[]));

    supabase
      .from('reservations')
      .select('service_type')
      // Same widening as the main query — otherwise the service-type dropdown could not
      // offer a type that only ever appears on cancelled appointments, making those rows
      // visible in the table but impossible to filter to.
      .in('status', HISTORY_STATUSES)
      .then(({ data }) => {
        const types = [...new Set((data || []).map(d => d.service_type).filter(Boolean))].sort();
        setServiceTypes(types as string[]);
      });
  }, []);

  /**
   * Ids de vehículos y clientes que coinciden con el texto buscado.
   *
   * La placa y el nombre del cliente viven en OTRAS tablas, así que no se pueden meter en un
   * `.or()` sobre `reservations`. Se resuelven primero y entran como listas de ids. El tope
   * de 500 es real: si alguien busca una sola letra podría coincidir media base, y una URL
   * con 3.000 uuid no llega al servidor. Con un texto concreto — una placa, un apellido —
   * nunca se acerca.
   */
  const resolveSearchIds = async (like: string) => {
    const [veh, cli] = await Promise.all([
      supabase.from('vehicles').select('id').ilike('plate', like).limit(500),
      supabase.from('clients').select('id').ilike('full_name', like).limit(500),
    ]);
    return {
      vehicleIds: (veh.data || []).map(v => v.id),
      clientIds: (cli.data || []).map(c => c.id),
    };
  };

  const fetchEntries = async () => {
    setLoading(true);

    // La búsqueda se resuelve ANTES de armar la consulta porque necesita dos consultas
    // previas (placas y nombres). Ver el comentario de `buildQuery`.
    //
    // Los caracteres que se sacan son los que rompen la sintaxis de filtros de PostgREST:
    // una coma dentro del valor de un `.or()` se lee como el separador entre condiciones y
    // la consulta entera falla. No aparecen en placas ni en nombres.
    const raw = busquedaAplicada.trim();
    const term = raw.replace(/["(),\\]/g, ' ').trim();
    const like = term ? `%${term}%` : '';
    const search = term ? await resolveSearchIds(like) : null;

    const buildQuery = () => {
      let query = supabase
        .from('reservations')
        .select(
          'id, dealership_id, client_id, vehicle_id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, cancellation_reason, recommendation, internal_notes, technical_report_url, completed_at, created_at, dealerships(name, city, phone), clients(full_name, cedula, phone, email), vehicles(id, plate, year, color, vin, mileage, warranty_active, purchase_date, vehicle_models(name, brand, warranty_km, warranty_months, warranty_service_interval_km, is_manual))',
          { count: 'exact' }
        )
        // Was `.eq('status','completada')`, which made cancelled appointments unfindable:
        // they exist in the DB (cancelling is an UPDATE, never a DELETE) but no surface
        // titled "Historial de Servicios" would show them.
        .in('status', HISTORY_STATUSES);

      if (isVendedor && profile?.id) {
        // Vendedor siempre ve solo sus propios registros
        query = query.eq('created_by_profile_id', profile.id);
      } else if (enforceScope && myDealershipId) {
        // Scope 'own': concesionario ve solo su propio concesionario
        query = query.eq('dealership_id', myDealershipId);
      } else if (!enforceScope && dealershipFilter !== 'all') {
        // Scope 'all' o admin: usar el selector de concesionario
        query = query.eq('dealership_id', dealershipFilter);
      }

      if (dateFrom) query = query.gte('reservation_date', dateFrom);
      if (dateTo) query = query.lte('reservation_date', dateTo);
      if (dealershipFilter !== 'all') query = query.eq('dealership_id', dealershipFilter);
      if (serviceTypeFilter !== 'all') query = query.eq('service_type', serviceTypeFilter);

      // BÚSQUEDA DEL LADO DEL SERVIDOR.
      //
      // Antes filtraba `entries`, que es SÓLO la página cargada: 100 filas de 707 archivadas.
      // Buscar una placa cuya cita estaba en la página 3 devolvía "sin resultados", y el
      // registro parecía no existir. Ese es exactamente el reporte de "la cita completada
      // aparece en la ficha del vehículo pero no en el historial": estaba, pero la búsqueda
      // no llegaba hasta ella. Peor todavía, el contador de abajo seguía diciendo 707.
      if (search) {
        const ors = [
          `service_type.ilike."${like}"`,
          `notes.ilike."${like}"`,
          `service_notes.ilike."${like}"`,
        ];
        if (search.vehicleIds.length) ors.push(`vehicle_id.in.(${search.vehicleIds.join(',')})`);
        if (search.clientIds.length) ors.push(`client_id.in.(${search.clientIds.join(',')})`);
        query = query.or(ors.join(','));
      }

      return query
        .order('reservation_date', { ascending: false })
        .order('reservation_time', { ascending: false });
    };

    // El filtro de garantía se calcula en el navegador: depende del vehículo, de su modelo y
    // de las condiciones globales, y no hay columna que lo tenga. Aplicado sobre una sola
    // página diría "3 resultados" cuando hay 40, así que cuando está activo se traen todas
    // las filas que pasan los demás filtros y la paginación pasa a hacerse acá.
    if (warrantyFilter !== 'all') {
      const all = await fetchAllRows<ServiceEntry>(
        (from, to) => buildQuery().range(from, to) as unknown as PromiseLike<{ data: ServiceEntry[] | null }>,
      );
      const matching = all.filter(e => {
        const w = evaluateWarranty(e);
        return warrantyFilter === 'active' ? w.active : !w.active;
      });
      setEntries(matching.slice(page * pageSize, (page + 1) * pageSize));
      setTotalCount(matching.length);
      setLoading(false);
      return;
    }

    const { data, error, count } = await buildQuery()
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) console.error(error);
    else {
      setEntries((data || []) as unknown as ServiceEntry[]);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  // Retardo entre lo que se escribe y lo que se consulta.
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 350);
    return () => clearTimeout(timer);
  }, [busqueda]);

  useEffect(() => { setPage(0); }, [busquedaAplicada, dateFrom, dateTo, dealershipFilter, serviceTypeFilter, warrantyFilter, pageSize]);
  // `warrantyCond` está en las dependencias porque el filtro de garantía lo usa para
  // decidir: si llega después de la primera consulta, el resultado se recalcula.
  useEffect(() => { fetchEntries(); }, [page, busquedaAplicada, dateFrom, dateTo, dealershipFilter, serviceTypeFilter, warrantyFilter, warrantyCond, pageSize, profile?.id, isVendedor, enforceScope, myDealershipId]);

  const openDetail = async (entry: ServiceEntry) => {
    setDetail(entry);
    setDetailOpen(true);
    setVehServiceCount(0);
    if (entry.vehicle_id) {
      // `vehicle_service_history` y no un select sobre `reservations`: la policy de reservas
      // recorta por concesionario, así que el select directo sólo contaba los servicios del
      // centro de quien mira. Ver
      // supabase/migrations/20260827200000_historial_del_vehiculo_entre_centros.sql.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('vehicle_service_history', {
        p_vehicle_id: entry.vehicle_id,
      });
      if (error) console.error('Error cargando el historial del vehículo:', error);
      // DELIBERATELY still only 'completada' — do NOT widen this to HISTORY_STATUSES.
      // This is the count of services actually PERFORMED on the vehicle and it feeds the
      // warranty evaluation. A cancelled appointment is not a service; counting it would
      // corrupt the warranty math.
      // Por la misma razón se descuentan las gestiones internas (Solicitud de Repuestos):
      // son un pedido a planta, no un servicio hecho sobre el vehículo. Eran 3 filas
      // completadas contando como mantenimientos. La cuenta sigue en JS y no en un
      // `head: true` porque la lista de servicios internos es configurable.
      setVehServiceCount(
        ((data || []) as { service_type: string | null; status: string }[])
          .filter(r => r.status === 'completada')
          .filter(r => !isInternalServiceName(r.service_type, internalServiceNames))
          .length,
      );
    }
  };

  const openEdit = () => {
    if (!detail) return;
    setEditStatus(detail.status);
    setEditMileage(String(detail.current_mileage ?? ''));
    setEditServiceNotes(detail.service_notes || '');
    setEditCancelReason(detail.cancellation_reason || '');
    setEditRecommendation(detail.recommendation || '');
    setEditInternalNotes(detail.internal_notes || '');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!detail) return;
    const km = Number(editMileage);
    if (!Number.isFinite(km) || km < 0) {
      toast.error('El kilometraje del servicio tiene que ser un número válido');
      return;
    }
    // Mismo criterio que el dialogo de cancelar en Reservas: si queda cancelada, el motivo
    // es obligatorio. Un motivo opcional se deja vacio casi siempre, y entonces la columna
    // existe pero no sirve -- peor que no tenerla, porque aparenta que el dato esta.
    if (editStatus === 'cancelada' && !editCancelReason.trim()) {
      toast.error('Escribi el motivo de cancelacion para poder guardar');
      return;
    }

    setEditSaving(true);

    const payload: Record<string, unknown> = {
      status: editStatus,
      current_mileage: km,
      service_notes: editServiceNotes.trim() || null,
      recommendation: editRecommendation.trim() || null,
      internal_notes: editInternalNotes.trim() || null,
      // Deja de estar cancelada -> el motivo deja de tener sentido y se borra. Conservarlo
      // dejaria una cita completada con un motivo de cancelacion colgado.
      cancellation_reason: editStatus === 'cancelada' ? editCancelReason.trim() : null,
    };

    // Pasar a completada sin fecha de cierre deja un registro que dice "completado" y no
    // sabe cuándo. Al revés, sacarla de completada y dejarle la fecha es peor todavía.
    if (editStatus === 'completada' && !detail.completed_at) {
      payload.completed_at = new Date().toISOString();
    } else if (editStatus !== 'completada') {
      payload.completed_at = null;
    }

    // `.select()` no es cosmético: cuando una política RLS rechaza la fila, PostgREST
    // actualiza cero filas y devuelve 204 SIN error. Sin leer las filas afectadas, un
    // usuario sin permisos vería un cartel verde sobre un cambio que nunca ocurrió.
    const { data: updated, error } = await supabase
      .from('reservations')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(payload as any)
      .eq('id', detail.id)
      .select('id');

    setEditSaving(false);

    if (error) {
      console.error(error);
      toast.error('No se pudo guardar el cambio');
      return;
    }
    if (!updated || updated.length === 0) {
      toast.error('No se pudo guardar: tu usuario no tiene permisos sobre este concesionario.');
      return;
    }

    // Si el nuevo estado ya no es de archivo, la cita vuelve al listado de Reservas y sale
    // de esta pantalla. Se dice explícitamente para que no parezca que se borró.
    const leavesHistory = !ARCHIVED_RESERVATION_STATUSES.has(editStatus);
    toast.success(
      leavesHistory
        ? 'Servicio actualizado. Como ya no está completado ni cancelado, vuelve al módulo de Reservas.'
        : 'Servicio actualizado',
    );

    setEditOpen(false);
    setDetailOpen(false);
    setDetail(null);
    fetchEntries();
  };

  const evaluateWarranty = useCallback((entry: ServiceEntry): { active: boolean; reason: string | null } => {
    if (!entry.vehicles) return { active: false, reason: null };
    const v = entry.vehicles;
    const m = v.vehicle_models;
    // A manually-typed model belongs to a third-party vehicle never sold by GAC. It must never
    // fall through to the global warrantyCond fallback below — that would silently report a
    // competitor's car as under warranty. Mirrors the guard in src/lib/warranty.ts
    // (resolveWarrantyCondition), which this page does not call directly.
    if (m?.is_manual) return { active: false, reason: 'Vehículo de terceros — sin garantía GAC' };
    const hasModelWarranty = m && (m.warranty_km != null || m.warranty_months != null);
    const maxKm = hasModelWarranty && m!.warranty_km != null ? m!.warranty_km : warrantyCond?.max_km ?? 0;
    const maxMonths = hasModelWarranty && m!.warranty_months != null ? m!.warranty_months : warrantyCond?.max_months ?? 0;
    if (!hasModelWarranty && !warrantyCond) return { active: v.warranty_active, reason: null };
    const reasons: string[] = [];
    if (maxKm > 0 && v.mileage > maxKm) reasons.push(`Km excedido (${v.mileage.toLocaleString()} / ${maxKm.toLocaleString()})`);
    if (v.purchase_date && maxMonths > 0) {
      const months = Math.floor((Date.now() - new Date(v.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 30));
      if (months > maxMonths) reasons.push(`Tiempo excedido (${months} / ${maxMonths} meses)`);
    }
    return { active: reasons.length === 0 && v.warranty_active, reason: reasons.length > 0 ? reasons.join('; ') : null };
  }, [warrantyCond]);

  // `entries` ya viene filtrado y paginado por fetchEntries — búsqueda y garantía incluidas.
  // El memo que había acá filtraba de nuevo sobre la página cargada y era la causa del bug
  // de arriba; se fue entero a propósito, para que no quede una segunda fuente de verdad.

  const hasActiveFilters = !!(busqueda || dateFrom || dateTo || dealershipFilter !== 'all' || serviceTypeFilter !== 'all' || warrantyFilter !== 'all');

  const clearFilters = () => {
    setBusqueda('');
    setDateFrom('');
    setDateTo('');
    setDealershipFilter('all');
    setServiceTypeFilter('all');
    setWarrantyFilter('all');
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Historial de Servicios</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <ClipboardList className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
      </div>

      {/* Fila 1: búsqueda + fechas */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Placa, cliente, notas..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Input
          type="date"
          className="w-[140px] h-8 text-xs"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          title="Fecha desde"
        />
        <Input
          type="date"
          className="w-[140px] h-8 text-xs"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          title="Fecha hasta"
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs gap-1">
            <X className="w-3 h-3" /> Limpiar
          </Button>
        )}
      </div>

      {/* Fila 2: dropdowns */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
          <SelectTrigger className="w-[170px] h-8 text-xs">
            <SelectValue placeholder="Tipo de servicio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {serviceTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!enforceScope && !isVendedor && (
          <Select value={dealershipFilter} onValueChange={setDealershipFilter}>
            <SelectTrigger className="w-[190px] h-8 text-xs">
              <SelectValue placeholder="Concesionario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los concesionarios</SelectItem>
              {dealerships.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={warrantyFilter} onValueChange={setWarrantyFilter}>
          <SelectTrigger className="w-[145px] h-8 text-xs">
            <SelectValue placeholder="Garantía" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda garantía</SelectItem>
            <SelectItem value="active">Con garantía</SelectItem>
            <SelectItem value="inactive">Sin garantía</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 filas</SelectItem>
            <SelectItem value="300">300 filas</SelectItem>
            <SelectItem value="1000">1000 filas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando historial...</p>
          </CardContent>
        ) : entries.length === 0 ? (
          <CardContent className="p-8 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron registros</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Fecha</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Concesionario</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead className="text-center">Encuesta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => {
                const w = evaluateWarranty(e);
                return (
                  <TableRow key={e.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(e)}>
                    <TableCell className="font-medium">{e.reservation_date}</TableCell>
                    <TableCell>{e.reservation_time?.slice(0, 5)}</TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px] px-1.5 py-0 w-fit', statusBadge(e.status).color)}>
                        {statusBadge(e.status).label}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{e.vehicles?.plate || '-'}</TableCell>
                    <TableCell>
                      {e.vehicles?.vehicle_models?.brand} {e.vehicles?.vehicle_models?.name} {e.vehicles?.year}
                    </TableCell>
                    <TableCell className="max-w-[130px] truncate" title={e.clients?.full_name || ''}>
                      {e.clients?.full_name || '-'}
                    </TableCell>
                    <TableCell>{e.service_type}</TableCell>
                    <TableCell className="text-muted-foreground">{e.dealerships?.name || '-'}</TableCell>
                    <TableCell>{e.current_mileage.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5 w-fit", e.vehicles?.vehicle_models?.is_manual ? "bg-blue-100 text-blue-800" : w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                        {e.vehicles?.vehicle_models?.is_manual ? <Car className="w-2.5 h-2.5" /> : w.active ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldX className="w-2.5 h-2.5" />}
                        {e.vehicles?.vehicle_models?.is_manual ? 'Terceros' : w.active ? 'Sí' : 'No'}
                      </Badge>
                    </TableCell>
                    {/* Encuesta de postventa, a un clic desde el listado. `stopPropagation`
                        es obligatorio: la fila entera abre el detalle, y sin él tocar el
                        icono abriría las dos cosas a la vez. */}
                    <TableCell className="text-center" onClick={ev => ev.stopPropagation()}>
                      {e.status !== 'completada' ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (() => {
                        const state = serviceSurveyIconState(serviceSurveys.get(e.id), sendsSurvey(e.service_type));
                        if (state === 'no_aplica') {
                          return (
                            <span title={`«${e.service_type}» no envía encuesta de postventa`}>
                              <Minus className="w-3.5 h-3.5 text-muted-foreground/50 mx-auto" />
                            </span>
                          );
                        }
                        const look = {
                          respondida: { Icon: Star,  cls: 'text-green-600 fill-green-600', title: 'El cliente ya respondió la encuesta' },
                          enviada:    { Icon: Clock, cls: 'text-amber-600',                title: 'Encuesta enviada, sin responder' },
                          sin_enviar: { Icon: Send,  cls: 'text-primary',                  title: 'Enviar encuesta de postventa' },
                        }[state];
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            title={canSendSurvey ? look.title : 'Sin permiso para enviar encuestas'}
                            disabled={!canSendSurvey}
                            onClick={() => openSurveyDialog(e)}
                          >
                            <look.Icon className={cn('w-3.5 h-3.5', look.cls)} />
                          </Button>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted">Anterior</button>
            <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted">Siguiente</button>
          </div>
        </div>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Detalle del Servicio
            </DialogTitle>
          </DialogHeader>
          {detail && (() => {
            const e = detail;
            const w = evaluateWarranty(e);
            const sc = statusBadge(e.status);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-sm">{e.service_type}</h3>
                    <p className="text-xs text-muted-foreground">{e.reservation_date} a las {e.reservation_time?.slice(0, 5)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={cn("text-xs", sc.color)}>{sc.label}</Badge>
                    {/* Corrige el registro sin salir de donde se lo esta mirando. Gated por
                        `historial.edit`, que ya existia en la tabla de permisos y hoy tienen
                        solo admin y superadmin - se ajusta desde Configuracion -> Roles. */}
                    {canEditHistory && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openEdit}>
                        <Pencil className="w-3 h-3 mr-1" /> Editar
                      </Button>
                    )}
                  </div>
                </div>

                {e.vehicles && (
                  <Card className={cn("border-l-4", e.vehicles.vehicle_models?.is_manual ? "border-l-blue-500" : w.active ? "border-l-green-500" : "border-l-red-500")}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-semibold text-xs">{e.vehicles.vehicle_models?.brand} {e.vehicles.vehicle_models?.name} {e.vehicles.year}</p>
                            <p className="text-[10px] text-muted-foreground">{e.vehicles.plate || '-'}{e.vehicles.vin ? ` · VIN: ${e.vehicles.vin}` : ''}{e.vehicles.color ? ` · ${e.vehicles.color}` : ''}</p>
                          </div>
                        </div>
                        <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", e.vehicles.vehicle_models?.is_manual ? "bg-blue-100 text-blue-800" : w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {e.vehicles.vehicle_models?.is_manual ? <Car className="w-3 h-3" /> : w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                          {e.vehicles.vehicle_models?.is_manual ? 'Terceros' : w.active ? 'Garantía' : 'Sin Garantía'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted rounded-md p-1.5">
                          <p className="text-xs font-bold">{e.vehicles.mileage.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">Km actual</p>
                        </div>
                        <div className="bg-muted rounded-md p-1.5">
                          <p className="text-xs font-bold">{e.current_mileage.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">Km servicio</p>
                        </div>
                        <div className="bg-muted rounded-md p-1.5">
                          <p className="text-xs font-bold">{vehServiceCount}</p>
                          <p className="text-[10px] text-muted-foreground">Servicios</p>
                        </div>
                      </div>
                      {!w.active && w.reason && (
                        <p className="text-[10px] text-red-600 font-medium">⚠ {w.reason}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {e.clients && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Cliente</p>
                        <p className="font-medium">{e.clients.full_name}</p>
                      </div>
                    </div>
                    {e.clients.cedula && (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Cédula</p>
                          <p className="font-medium">{e.clients.cedula}</p>
                        </div>
                      </div>
                    )}
                    {e.clients.phone && (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Teléfono</p>
                          <p className="font-medium">{e.clients.phone}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {e.dealerships && (
                  <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Concesionario</p>
                      <p className="font-medium">{e.dealerships.name}{e.dealerships.city ? ` — ${e.dealerships.city}` : ''}</p>
                    </div>
                  </div>
                )}

                {/* `notes` es POR QUÉ entró el vehículo, no una nota interna: lo escribe quien
                    crea la cita ("Describa la falla, desperfecto o tipo de servicio
                    solicitado"). Las notas internas del equipo son otra columna,
                    `internal_notes`, que esta pantalla ni siquiera consulta. El rótulo
                    anterior decía "Notas Internas" y hacía leer el ingreso como si fuera un
                    comentario privado. Junto al bloque "Trabajo realizado" de abajo, esto
                    cierra la trazabilidad: por qué entró y qué se le hizo. */}
                {e.notes && (
                  <>
                    <Separator />
                    <div className="text-xs">
                      <p className="font-semibold mb-1 flex items-center gap-1">
                        <Wrench className="w-3 h-3" /> {serviceNotesLabel(e.service_type)}
                      </p>
                      <p className="text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-2">{e.notes}</p>
                    </div>
                  </>
                )}

                {/* Una cita cancelada sin motivo a la vista obliga a abrir Editar para saber
                    qué pasó. Es el dato que alguien viene a buscar acá. */}
                {e.status === 'cancelada' && (
                  <>
                    <Separator />
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs">
                      <p className="font-semibold text-red-800 mb-1 flex items-center gap-1">
                        <X className="w-3 h-3" /> Motivo de cancelación
                      </p>
                      <p className="text-red-700 whitespace-pre-wrap">
                        {e.cancellation_reason || 'Sin motivo registrado (cancelada antes del 24/08/2026).'}
                      </p>
                    </div>
                  </>
                )}

                {e.service_notes && (
                  <>
                    <Separator />
                    <div className="bg-green-50 border border-green-200 rounded-md p-3 text-xs">
                      <p className="font-semibold text-green-800 mb-1 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo realizado</p>
                      <p className="text-green-700 whitespace-pre-wrap">{e.service_notes}</p>
                      {e.completed_at && (
                        <p className="text-green-600 text-[10px] mt-2">Completado: {new Date(e.completed_at).toLocaleString('es-VE')}</p>
                      )}
                    </div>
                  </>
                )}

                {e.technical_report_url && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-600" /> Informe Técnico</p>
                      <TechnicalReportUploader reservationId={e.id} value={e.technical_report_url} onChange={() => {}} readonly />
                    </div>
                  </>
                )}

                {/* Resultado de la encuesta de postventa de ESTE servicio. Rinde null cuando
                    no hay encuesta, así que un servicio sin ella se ve igual que antes. */}
                {serviceSurveys.get(e.id) && (
                  <>
                    <Separator />
                    <ServiceSurveyInline survey={serviceSurveys.get(e.id)} />
                  </>
                )}

                {/* Enviar la encuesta desde acá. Antes la única puerta era el diálogo
                    "Completar Servicio", que se cierra una sola vez: un servicio ya cerrado
                    no tenía forma de recibirla. Muestra también quién decidió qué. */}
                {e.status === 'completada' && (
                  <>
                    <Separator />
                    <ServiceSurveySendPanel
                      reservationId={e.id}
                      status={e.status}
                      serviceType={e.service_type}
                      canSend={canSendSurvey}
                      survey={serviceSurveys.get(e.id)}
                      sendsSurvey={sendsSurvey(e.service_type)}
                      surveyEnabled={surveyEnabled}
                      onSend={() => openSurveyDialog(e)}
                    />
                  </>
                )}

                {(() => {
                  const m = e.vehicles?.vehicle_models;
                  // Third-party vehicle: never show a warranty condition, least of all the
                  // global GAC fallback below — this section would otherwise misrepresent a
                  // competitor's car as covered by GAC's own warranty terms.
                  if (m?.is_manual) {
                    return (
                      <>
                        <Separator />
                        <div className="text-xs bg-blue-50 border border-blue-200 rounded-md p-2.5">
                          <p className="font-semibold text-blue-800 mb-1 flex items-center gap-1"><Car className="w-3 h-3" /> Vehículo de terceros</p>
                          <p className="text-blue-700">Este vehículo no fue vendido por GAC y no tiene relación de garantía con la marca.</p>
                        </div>
                      </>
                    );
                  }
                  const hasModelWarranty = m && (m.warranty_km != null || m.warranty_months != null);
                  if (hasModelWarranty) {
                    const intervalKm = m!.warranty_service_interval_km ?? warrantyCond?.service_interval_km;
                    return (
                      <>
                        <Separator />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Condición de Garantía</p>
                          <p>
                            {m!.brand} {m!.name}:
                            {m!.warranty_months ? ` ${(m!.warranty_months / 12).toFixed(0)} años` : ''}
                            {m!.warranty_km ? ` o ${m!.warranty_km.toLocaleString()} km` : ''}
                            {intervalKm ? ` · Servicio cada ${intervalKm.toLocaleString()} km` : ''}
                          </p>
                        </div>
                      </>
                    );
                  }
                  if (!warrantyCond) return null;
                  return (
                    <>
                      <Separator />
                      <div className="text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Condición de Garantía</p>
                        <p>{warrantyCond.name}: {(warrantyCond.max_months / 12).toFixed(0)} años o {warrantyCond.max_km.toLocaleString()} km · Servicio cada {warrantyCond.service_interval_km.toLocaleString()} km</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirmación de envío de la encuesta de postventa. Uno solo, compartido por el
          icono del listado y por el botón del detalle. */}
      <ServiceSurveySendDialog
        target={surveyTarget}
        survey={surveyTarget ? serviceSurveys.get(surveyTarget.reservationId) : undefined}
        surveyEnabled={surveyEnabled}
        sendsSurvey={surveyTarget ? sendsSurvey(surveyTarget.serviceType) : true}
        onOpenChange={open => { if (!open) setSurveyTarget(null); }}
        onSent={reloadSurveys}
      />

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Editar Servicio
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 py-1">
              <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-1">
                <p><span className="font-semibold">Cliente:</span> {detail.clients?.full_name || '-'}</p>
                <p><span className="font-semibold">Placa:</span> {detail.vehicles?.plate || '-'}</p>
                <p><span className="font-semibold">Servicio:</span> {detail.service_type}</p>
                <p><span className="font-semibold">Fecha:</span> {detail.reservation_date}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Estado</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESERVATION_STATUSES.map(st => (
                      <SelectItem key={st} value={st}>{RESERVATION_STATUS_LABELS[st]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* La lista sale de RESERVATION_STATUSES, que espeja el CHECK de la base.
                    Ofrecer un estado que la base rechaza fue exactamente el bug de
                    "Culminada" del 2026-08-13. */}
                {!ARCHIVED_RESERVATION_STATUSES.has(editStatus) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Con este estado la cita deja de ser historial y vuelve al módulo de
                    Reservas. No se borra: se la busca allá.
                  </p>
                )}
              </div>

              {editStatus === 'cancelada' && (
                <div className="space-y-2">
                  <Label className="text-sm">Motivo de cancelación *</Label>
                  <Textarea
                    rows={3}
                    value={editCancelReason}
                    onChange={ev => setEditCancelReason(ev.target.value)}
                    placeholder="Por qué se canceló la cita: el cliente reagendó, no se presentó, falta de repuesto..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm">Km del servicio</Label>
                <Input
                  type="number"
                  min={0}
                  value={editMileage}
                  onChange={ev => setEditMileage(ev.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Trabajo realizado</Label>
                <Textarea
                  rows={4}
                  value={editServiceNotes}
                  onChange={ev => setEditServiceNotes(ev.target.value)}
                  placeholder="Trabajos realizados, repuestos cambiados, observaciones..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Recomendación (visible para el cliente)</Label>
                <Textarea
                  rows={3}
                  value={editRecommendation}
                  onChange={ev => setEditRecommendation(ev.target.value)}
                  placeholder="Recomendaciones de seguimiento..."
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Notas internas (solo equipo GAC)</Label>
                <Textarea
                  rows={3}
                  value={editInternalNotes}
                  onChange={ev => setEditInternalNotes(ev.target.value)}
                  placeholder="Observaciones internas, no visibles para el cliente..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gac-gradient">
              {editSaving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHistorial;
