import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, ShieldCheck, ShieldX, AlertTriangle, Search, CalendarDays, Hash, MapPin, Clock, ClipboardCheck, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evaluateWarranty, resolveWarrantyCondition, formatServiceCount, type WarrantyEvaluation } from '@/lib/warranty';

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
  description: string | null;
  is_active: boolean;
}

interface VehicleRow {
  id: string;
  plate: string | null;
  year: number;
  color: string | null;
  vin: string | null;
  mileage: number;
  warranty_active: boolean;
  purchase_date: string | null;
  vehicle_models: {
    name: string;
    brand: string;
    warranty_km: number | null;
    warranty_months: number | null;
    warranty_service_interval_km: number | null;
    warranty_condition_id: number | null;
  } | null;
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
}

interface ServiceRecord {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  service_notes: string | null;
  completed_at: string | null;
  dealerships: { name: string } | null;
}

type WarrantyResult = WarrantyEvaluation;

const ROW_OPTIONS = [10, 25, 50, 100];

const statusBadgeClass = (status: WarrantyEvaluation['status']): string => {
  if (status === 'active') return 'bg-green-100 text-green-800';
  if (status === 'expired') return 'bg-gray-200 text-gray-800';
  if (status === 'violated') return 'bg-red-100 text-red-800';
  return 'bg-muted text-muted-foreground';
};

const statusLabel = (status: WarrantyEvaluation['status']): string => {
  if (status === 'active') return 'Activa';
  if (status === 'expired') return 'Expirada';
  if (status === 'violated') return 'Violada';
  return 'Sin condición';
};

const StatusIcon = ({ status, className }: { status: WarrantyEvaluation['status']; className?: string }) => {
  if (status === 'active') return <ShieldCheck className={className} />;
  if (status === 'violated') return <AlertTriangle className={className} />;
  return <ShieldX className={className} />;
};

const AdminGarantias = () => {
  const isMobile = useIsMobile();
  const [conditions, setConditions] = useState<WarrantyCondition[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Detail
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<VehicleRow | null>(null);
  const [detailHistory, setDetailHistory] = useState<ServiceRecord[]>([]);
  const [detailWarranty, setDetailWarranty] = useState<WarrantyResult | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchAllVehicles = async () => {
    const PAGE_SIZE = 1000;
    let allVehicles: VehicleRow[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, color, vin, mileage, warranty_active, purchase_date, vehicle_models(name, brand, warranty_km, warranty_months, warranty_service_interval_km, warranty_condition_id), clients(full_name, cedula, phone)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      const rows = (data || []) as VehicleRow[];
      allVehicles = allVehicles.concat(rows);
      hasMore = rows.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    return allVehicles;
  };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: conds }, vehs] = await Promise.all([
      supabase.from('warranty_conditions').select('*').eq('is_active', true).order('name'),
      fetchAllVehicles(),
    ]);
    setConditions((conds || []) as WarrantyCondition[]);
    setVehicles(vehs);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const evaluate = (v: VehicleRow, completedServices: number): WarrantyResult => {
    const resolved = resolveWarrantyCondition(v.vehicle_models, conditions);
    return evaluateWarranty(
      { mileage: v.mileage, warranty_active: v.warranty_active, purchase_date: v.purchase_date },
      resolved,
      completedServices,
    );
  };

  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (vehicles.length === 0) return;
    (async () => {
      const counts: Record<string, number> = {};
      const BATCH = 200;
      const ids = vehicles.map(v => v.id);
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { data } = await supabase
          .from('reservations')
          .select('vehicle_id')
          .eq('status', 'completada')
          .in('vehicle_id', batch);
        (data || []).forEach((r: any) => { counts[r.vehicle_id] = (counts[r.vehicle_id] || 0) + 1; });
      }
      setServiceCounts(counts);
    })();
  }, [vehicles]);

  const vehiclesWithWarranty = vehicles.map(v => ({
    vehicle: v,
    warranty: evaluate(v, serviceCounts[v.id] || 0),
  }));

  const filtered = vehiclesWithWarranty.filter(({ vehicle: v, warranty: w }) => {
    if (statusFilter === 'activa' && w.status !== 'active') return false;
    if (statusFilter === 'expirada' && w.status !== 'expired') return false;
    if (statusFilter === 'violada' && w.status !== 'violated') return false;
    if (statusFilter === 'inactiva' && w.status === 'active') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !(v.plate || '').toLowerCase().includes(q) &&
        !(v.vin || '').toLowerCase().includes(q) &&
        !(v.vehicle_models?.brand || '').toLowerCase().includes(q) &&
        !(v.vehicle_models?.name || '').toLowerCase().includes(q) &&
        !(v.clients?.full_name || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalActive = vehiclesWithWarranty.filter(x => x.warranty.status === 'active').length;
  const totalExpired = vehiclesWithWarranty.filter(x => x.warranty.status === 'expired').length;
  const totalViolated = vehiclesWithWarranty.filter(x => x.warranty.status === 'violated').length;

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const paginatedData = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, rowsPerPage]);

  const openDetail = async (v: VehicleRow, w: WarrantyResult) => {
    setDetailVehicle(v);
    setDetailWarranty(w);
    setDetailHistory([]);
    setDetailOpen(true);
    setLoadingDetail(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, reservation_date, reservation_time, service_type, current_mileage, status, service_notes, completed_at, dealerships(name)')
      .eq('vehicle_id', v.id)
      .order('reservation_date', { ascending: false })
      .limit(50);
    setDetailHistory((data || []) as ServiceRecord[]);
    setLoadingDetail(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-display font-bold">Control de Garantías</h1>
          {conditions.length > 0 && (
            <p className="text-xs text-muted-foreground leading-tight mt-0.5 hidden sm:block">{conditions[0].name}: {(conditions[0].max_months / 12).toFixed(0)} años o {conditions[0].max_km.toLocaleString()} km · Servicios cada {conditions[0].service_interval_km.toLocaleString()} km</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="bg-green-100 text-green-800 gap-1 text-xs"><ShieldCheck className="w-3 h-3" /> {totalActive}</Badge>
          <Badge className="bg-gray-200 text-gray-800 gap-1 text-xs"><ShieldX className="w-3 h-3" /> {totalExpired}</Badge>
          <Badge className="bg-red-100 text-red-800 gap-1 text-xs"><AlertTriangle className="w-3 h-3" /> {totalViolated}</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[180px] sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar placa, VIN, modelo, cliente..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="activa">Garantía Activa</SelectItem>
            <SelectItem value="expirada">Garantía Expirada</SelectItem>
            <SelectItem value="violada">Garantía Violada</SelectItem>
            <SelectItem value="inactiva">Inactiva (expirada + violada)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando vehículos...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay vehículos</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* ── MOBILE CARDS ── */
        <div className="space-y-2">
          {paginatedData.map(({ vehicle: v, warranty: w }) => (
            <Card key={v.id} className="gac-shadow cursor-pointer active:scale-[0.99] transition-transform" onClick={() => openDetail(v, w)}>
              <CardContent className="p-3 space-y-2">
                {/* Row 1: model/year + warranty badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{v.plate || '-'}{v.vin ? ` · ${v.vin}` : ''}</p>
                  </div>
                  <Badge className={cn("text-[10px] px-1.5 py-0 gap-0.5 shrink-0", statusBadgeClass(w.status))}>
                    <StatusIcon status={w.status} className="w-2.5 h-2.5" />
                    {statusLabel(w.status)}
                  </Badge>
                </div>
                {/* Row 2: client + km */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 min-w-0"><User className="w-3 h-3 shrink-0" /><span className="truncate">{v.clients?.full_name || '-'}</span></span>
                  <span className="flex items-center gap-1 shrink-0"><Hash className="w-3 h-3" />{v.mileage.toLocaleString()} km</span>
                </div>
                {/* Row 3: stats chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] bg-muted rounded px-1.5 py-0.5">{formatServiceCount(w.servicesCompleted)}</span>
                  <span className="text-[10px] bg-muted/50 rounded px-1.5 py-0.5 text-muted-foreground">Sugeridos por km: {w.servicesExpected}</span>
                  <span className="text-[10px] bg-muted rounded px-1.5 py-0.5">{w.monthsRemaining > 0 ? w.monthsRemaining : '0'} meses rest.</span>
                  <span className="text-[10px] bg-muted rounded px-1.5 py-0.5">{w.kmRemaining > 0 ? w.kmRemaining.toLocaleString() : '0'} km rest.</span>
                  {v.purchase_date && <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 flex items-center gap-1"><CalendarDays className="w-2.5 h-2.5" />{v.purchase_date}</span>}
                </div>
                {/* Violation alert — prominent */}
                {w.status === 'violated' && w.reasons.length > 0 && (
                  <div className="border border-red-300 bg-red-50 rounded-md px-2 py-1.5 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-700 leading-tight font-medium">Garantía violada · {w.reasons.join(' · ')}</p>
                  </div>
                )}
                {/* Expired reason (less prominent) */}
                {w.status === 'expired' && w.reasons.length > 0 && (
                  <p className="text-[10px] text-gray-600 leading-tight">{w.reasons.join(' · ')}</p>
                )}
              </CardContent>
            </Card>
          ))}
          {/* Pagination footer mobile */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Select value={String(rowsPerPage)} onValueChange={v => setRowsPerPage(Number(v))}>
                <SelectTrigger className="h-7 w-[60px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROW_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <span>/ pág.</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{(safePage - 1) * rowsPerPage + 1}–{Math.min(safePage * rowsPerPage, filtered.length)} de {filtered.length}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* ── DESKTOP TABLE ── */
        <Card className="gac-shadow">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Vehículo</TableHead>
                    <TableHead className="text-xs">Placa</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-right">Km</TableHead>
                    <TableHead className="text-xs text-center">Servicios</TableHead>
                    <TableHead className="text-xs text-center">Meses Rest.</TableHead>
                    <TableHead className="text-xs text-center">Km Rest.</TableHead>
                    <TableHead className="text-xs text-center">Garantía</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map(({ vehicle: v, warranty: w }) => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(v, w)}>
                      <TableCell className="text-xs font-medium">
                        {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}
                      </TableCell>
                      <TableCell className="text-xs">{v.plate || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{v.clients?.full_name || '-'}</TableCell>
                      <TableCell className="text-xs text-right">{v.mileage.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-center">
                        <div className="font-semibold">{w.servicesCompleted}</div>
                        <div className="text-[10px] text-muted-foreground">Sugeridos por km: {w.servicesExpected}</div>
                      </TableCell>
                      <TableCell className="text-xs text-center">{w.monthsRemaining > 0 ? w.monthsRemaining : '0'}</TableCell>
                      <TableCell className="text-xs text-center">{w.kmRemaining > 0 ? w.kmRemaining.toLocaleString() : '0'}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-[10px] gap-1", statusBadgeClass(w.status))}>
                          <StatusIcon status={w.status} className="w-3 h-3" />
                          {statusLabel(w.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between border-t px-4 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Filas por página:</span>
                <Select value={String(rowsPerPage)} onValueChange={v => setRowsPerPage(Number(v))}>
                  <SelectTrigger className="h-7 w-[65px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROW_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{(safePage - 1) * rowsPerPage + 1}–{Math.min(safePage * rowsPerPage, filtered.length)} de {filtered.length}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Detalle de Garantía
            </DialogTitle>
          </DialogHeader>
          {detailVehicle && detailWarranty && (() => {
            const v = detailVehicle;
            const w = detailWarranty;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</h3>
                    <p className="text-xs text-muted-foreground">{v.plate || '-'}{v.vin ? ` · VIN: ${v.vin}` : ''}</p>
                  </div>
                  <Badge className={cn("text-xs flex items-center gap-1", statusBadgeClass(w.status))}>
                    <StatusIcon status={w.status} className="w-3 h-3" />
                    {statusLabel(w.status)}
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><span>{v.clients?.full_name || '-'}</span></div>
                  <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><span>{v.mileage.toLocaleString()} km</span></div>
                  {v.purchase_date && <div className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /><span>Compra: {v.purchase_date}</span></div>}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-muted rounded-lg p-2 flex items-center justify-center">
                    <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">{formatServiceCount(w.servicesCompleted)}</Badge>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 flex items-center justify-center">
                    <p className="text-[10px] text-muted-foreground">Sugeridos por km: {w.servicesExpected}</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-sm font-bold">{w.kmRemaining > 0 ? `${(w.kmRemaining / 1000).toFixed(0)}k` : '0'}</p>
                    <p className="text-[10px] text-muted-foreground">Km rest.</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-sm font-bold">{w.monthsRemaining > 0 ? w.monthsRemaining : '0'}</p>
                    <p className="text-[10px] text-muted-foreground">Meses rest.</p>
                  </div>
                </div>

                {w.status === 'violated' && w.reasons.length > 0 && (
                  <div className="bg-red-50 border border-red-300 rounded-md p-2.5 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800 mb-1">Garantía violada</p>
                      <p className="text-red-700">{w.reasons.join(' · ')}</p>
                    </div>
                  </div>
                )}
                {w.status === 'expired' && w.reasons.length > 0 && (
                  <div className="bg-gray-100 border border-gray-300 rounded-md p-2.5 text-xs">
                    <p className="font-semibold text-gray-800 mb-1">Garantía expirada</p>
                    <p className="text-gray-700">{w.reasons.join(' · ')}</p>
                  </div>
                )}

                <Separator />
                <h4 className="font-semibold text-xs">Historial de Servicios</h4>

                {loadingDetail ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Cargando historial...</p>
                  </div>
                ) : detailHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin servicios registrados</p>
                ) : (
                  <div className="space-y-2">
                    {detailHistory.map(h => {
                      const isCompleted = h.status === 'completada';
                      return (
                        <div key={h.id} className="border rounded-md p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{h.service_type}</span>
                            <Badge className={cn("text-[10px] px-1.5 py-0", isCompleted ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>{h.status}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{h.reservation_date}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{h.reservation_time?.slice(0, 5)}</span>
                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{h.current_mileage.toLocaleString()} km</span>
                          </div>
                          {h.dealerships && <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{h.dealerships.name}</div>}
                          {h.service_notes && (
                            <div className="bg-green-50 border border-green-200 rounded p-1.5">
                              <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo realizado:</p>
                              <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGarantias;
