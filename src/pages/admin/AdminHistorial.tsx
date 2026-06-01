import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Search, ClipboardList, Car, MapPin, CalendarDays, Clock, Hash, User, ShieldCheck, ShieldX, Wrench, ClipboardCheck, Phone, FileText } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { cn } from '@/lib/utils';

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
    vehicle_models: { name: string; brand: string; warranty_km: number | null; warranty_months: number | null; warranty_service_interval_km: number | null } | null;
  } | null;
}

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const AdminHistorial = () => {
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [statusFilter, setStatusFilter] = useState('completada');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [warrantyCond, setWarrantyCond] = useState<WarrantyCondition | null>(null);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ServiceEntry | null>(null);
  const [vehServiceCount, setVehServiceCount] = useState(0);

  useEffect(() => {
    supabase
      .from('warranty_conditions')
      .select('id, name, max_km, max_months, service_interval_km')
      .eq('is_active', true)
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setWarrantyCond(data[0] as WarrantyCondition); });
  }, []);

  const fetchEntries = async () => {
    setLoading(true);

    let query = supabase
      .from('reservations')
      .select(
        'id, dealership_id, client_id, vehicle_id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, created_at, dealerships(name, city, phone), clients(full_name, cedula, phone, email), vehicles(id, plate, year, color, vin, mileage, warranty_active, purchase_date, vehicle_models(name, brand, warranty_km, warranty_months, warranty_service_interval_km))',
        { count: 'exact' }
      );

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (busqueda.trim()) {
      query = query.or(`service_type.ilike.%${busqueda}%,notes.ilike.%${busqueda}%,service_notes.ilike.%${busqueda}%`);
    }

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

  useEffect(() => { setPage(0); }, [busqueda, statusFilter, pageSize]);
  useEffect(() => { fetchEntries(); }, [page, busqueda, statusFilter, pageSize]);

  const openDetail = async (entry: ServiceEntry) => {
    setDetail(entry);
    setDetailOpen(true);
    setVehServiceCount(0);
    if (entry.vehicle_id) {
      const { count } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', entry.vehicle_id)
        .eq('status', 'completada');
      setVehServiceCount(count || 0);
    }
  };

  const evaluateWarranty = (entry: ServiceEntry): { active: boolean; reason: string | null } => {
    if (!entry.vehicles) return { active: false, reason: null };
    const v = entry.vehicles;
    const m = v.vehicle_models;
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
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const completedCount = entries.filter(e => e.status === 'completada').length;

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

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar servicio, notas..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="completada">Completados</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="confirmada">Confirmados</SelectItem>
            <SelectItem value="en_proceso">En Proceso</SelectItem>
            <SelectItem value="cancelada">Cancelados</SelectItem>
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
                <TableHead>Vehículo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Concesionario</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => {
                const w = evaluateWarranty(e);
                const sc = STATUS_CONFIG[e.status] || { label: e.status, color: 'bg-muted' };
                return (
                  <TableRow key={e.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(e)}>
                    <TableCell className="font-medium">{e.reservation_date}</TableCell>
                    <TableCell>{e.reservation_time?.slice(0, 5)}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{e.vehicles?.vehicle_models?.brand} {e.vehicles?.vehicle_models?.name} {e.vehicles?.year}</span>
                        <br />
                        <span className="text-muted-foreground font-mono">{e.vehicles?.plate || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate" title={e.clients?.full_name || ''}>
                      {e.clients?.full_name || '-'}
                    </TableCell>
                    <TableCell>{e.service_type}</TableCell>
                    <TableCell className="text-muted-foreground">{e.dealerships?.name || '-'}</TableCell>
                    <TableCell>{e.current_mileage.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5 w-fit", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                        {w.active ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldX className="w-2.5 h-2.5" />}
                        {w.active ? 'Sí' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] px-1.5 py-0", sc.color)}>{sc.label}</Badge>
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
            const sc = STATUS_CONFIG[e.status] || { label: e.status, color: 'bg-muted' };
            return (
              <div className="space-y-4">
                {/* Status & Service */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm">{e.service_type}</h3>
                    <p className="text-xs text-muted-foreground">{e.reservation_date} a las {e.reservation_time?.slice(0, 5)}</p>
                  </div>
                  <Badge className={cn("text-xs", sc.color)}>{sc.label}</Badge>
                </div>

                {/* Vehicle info */}
                {e.vehicles && (
                  <Card className={cn("border-l-4", w.active ? "border-l-green-500" : "border-l-red-500")}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-semibold text-xs">{e.vehicles.vehicle_models?.brand} {e.vehicles.vehicle_models?.name} {e.vehicles.year}</p>
                            <p className="text-[10px] text-muted-foreground">{e.vehicles.plate || '-'}{e.vehicles.vin ? ` · VIN: ${e.vehicles.vin}` : ''}{e.vehicles.color ? ` · ${e.vehicles.color}` : ''}</p>
                          </div>
                        </div>
                        <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-0.5", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                          {w.active ? 'Garantía' : 'Sin Garantía'}
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

                {/* Client info */}
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

                {/* Dealership */}
                {e.dealerships && (
                  <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Concesionario</p>
                      <p className="font-medium">{e.dealerships.name}{e.dealerships.city ? ` — ${e.dealerships.city}` : ''}</p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {e.notes && (
                  <>
                    <Separator />
                    <div className="text-xs">
                      <p className="font-semibold mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> Notas del cliente</p>
                      <p className="text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-2">{e.notes}</p>
                    </div>
                  </>
                )}

                {/* Service notes (completed work) */}
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

                {/* Technical report PDF */}
                {e.technical_report_url && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-600" /> Informe Técnico</p>
                      <TechnicalReportUploader reservationId={e.id} value={e.technical_report_url} onChange={() => {}} readonly />
                    </div>
                  </>
                )}

                {/* Warranty condition info: model-specific first, fall back to global */}
                {(() => {
                  const m = e.vehicles?.vehicle_models;
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
