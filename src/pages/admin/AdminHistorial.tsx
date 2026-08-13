import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Search, ClipboardList, Car, MapPin, Hash, User, ShieldCheck, ShieldX, Wrench, ClipboardCheck, Phone, FileText, X } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { cn } from '@/lib/utils';
import { ARCHIVED_RESERVATION_STATUSES, reservationStatusStyle } from '@/lib/reservationStatus';
import { useServiceSurveys } from '@/hooks/useServiceSurveys';
import ServiceSurveyInline from '@/components/satisfaction/ServiceSurveyInline';

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
  const { profile, role, getModuleScope } = useAuth();
  const { selectedDealership: myDealershipId } = useDealershipAccess();
  const roleName = role?.name?.toLowerCase() ?? '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const isVendedor = roleName === 'vendedor';
  // enforceScope: si el scope es 'own' y no es admin → forzar filtro por su concesionario
  const enforceScope = !isAdmin && getModuleScope('historial') === 'own';

  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
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

  // Encuesta de postventa del servicio abierto en el detalle. Se pide sólo para esa cita:
  // traerlas para las 100 filas de la página cargaría datos que nadie va a mirar.
  const { surveys: detailSurveys } = useServiceSurveys(detail ? [detail.id] : []);

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

  const fetchEntries = async () => {
    setLoading(true);

    let query = supabase
      .from('reservations')
      .select(
        'id, dealership_id, client_id, vehicle_id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, created_at, dealerships(name, city, phone), clients(full_name, cedula, phone, email), vehicles(id, plate, year, color, vin, mileage, warranty_active, purchase_date, vehicle_models(name, brand, warranty_km, warranty_months, warranty_service_interval_km, is_manual))',
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

    const { data, error, count } = await query
      .order('reservation_date', { ascending: false })
      .order('reservation_time', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) console.error(error);
    else {
      setEntries((data || []) as unknown as ServiceEntry[]);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [busqueda, dateFrom, dateTo, dealershipFilter, serviceTypeFilter, warrantyFilter, pageSize]);
  useEffect(() => { fetchEntries(); }, [page, dateFrom, dateTo, dealershipFilter, serviceTypeFilter, pageSize, profile?.id, isVendedor, enforceScope, myDealershipId]);

  const openDetail = async (entry: ServiceEntry) => {
    setDetail(entry);
    setDetailOpen(true);
    setVehServiceCount(0);
    if (entry.vehicle_id) {
      const { count } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', entry.vehicle_id)
        // DELIBERATELY still only 'completada' — do NOT widen this to HISTORY_STATUSES.
        // This is the count of services actually PERFORMED on the vehicle and it feeds the
        // warranty evaluation. A cancelled appointment is not a service; counting it would
        // corrupt the warranty math.
        .eq('status', 'completada');
      setVehServiceCount(count || 0);
    }
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

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      result = result.filter(e =>
        e.vehicles?.plate?.toLowerCase().includes(q) ||
        e.clients?.full_name?.toLowerCase().includes(q) ||
        e.service_type?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q) ||
        e.service_notes?.toLowerCase().includes(q)
      );
    }
    if (warrantyFilter !== 'all') {
      result = result.filter(e => {
        const w = evaluateWarranty(e);
        return warrantyFilter === 'active' ? w.active : !w.active;
      });
    }
    return result;
  }, [entries, busqueda, warrantyFilter, evaluateWarranty]);

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
        ) : filteredEntries.length === 0 ? (
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map(e => {
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm">{e.service_type}</h3>
                    <p className="text-xs text-muted-foreground">{e.reservation_date} a las {e.reservation_time?.slice(0, 5)}</p>
                  </div>
                  <Badge className={cn("text-xs", sc.color)}>{sc.label}</Badge>
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

                {e.notes && (
                  <>
                    <Separator />
                    <div className="text-xs">
                      <p className="font-semibold mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> Notas Internas</p>
                      <p className="text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-2">{e.notes}</p>
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
                {detailSurveys.get(e.id) && (
                  <>
                    <Separator />
                    <ServiceSurveyInline survey={detailSurveys.get(e.id)} />
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
    </div>
  );
};

export default AdminHistorial;
