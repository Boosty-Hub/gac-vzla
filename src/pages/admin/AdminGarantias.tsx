import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, ShieldCheck, ShieldX, Search, CalendarDays, Hash, MapPin, Clock, ClipboardCheck, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
  description: string | null;
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
  vehicle_models: { name: string; brand: string } | null;
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

interface WarrantyResult {
  active: boolean;
  reason: string | null;
  conditionName: string;
  servicesExpected: number;
  servicesCompleted: number;
  nextServiceKm: number;
  monthsRemaining: number;
  kmRemaining: number;
}

const ROW_OPTIONS = [10, 25, 50, 100];

const AdminGarantias = () => {
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

  const fetchData = async () => {
    setLoading(true);
    const [{ data: conds }, { data: vehs }] = await Promise.all([
      supabase.from('warranty_conditions').select('*').eq('is_active', true).order('name'),
      supabase.from('vehicles').select('id, plate, year, color, vin, mileage, warranty_active, purchase_date, vehicle_models(name, brand), clients(full_name, cedula, phone)').eq('is_active', true).order('created_at', { ascending: false }).limit(500),
    ]);
    setConditions((conds || []) as WarrantyCondition[]);
    setVehicles((vehs || []) as VehicleRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const evaluateWarranty = (v: VehicleRow, completedServices: number): WarrantyResult => {
    if (conditions.length === 0) {
      return { active: false, reason: 'No hay condiciones de garantía configuradas', conditionName: '-', servicesExpected: 0, servicesCompleted: completedServices, nextServiceKm: 0, monthsRemaining: 0, kmRemaining: 0 };
    }
    const cond = conditions[0];
    const reasons: string[] = [];

    if (!v.warranty_active) reasons.push('Garantía desactivada manualmente');

    const kmRemaining = cond.max_km - v.mileage;
    if (v.mileage > cond.max_km) reasons.push(`Excede ${cond.max_km.toLocaleString()} km (actual: ${v.mileage.toLocaleString()} km)`);

    let monthsRemaining = cond.max_months;
    if (v.purchase_date) {
      const purchase = new Date(v.purchase_date);
      const now = new Date();
      const monthsElapsed = (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
      monthsRemaining = cond.max_months - monthsElapsed;
      if (monthsElapsed > cond.max_months) reasons.push(`Excede ${cond.max_months} meses desde la compra (${monthsElapsed} meses transcurridos)`);
    }

    const servicesExpected = cond.service_interval_km > 0 ? Math.floor(v.mileage / cond.service_interval_km) : 0;
    if (completedServices < servicesExpected) reasons.push(`Servicios atrasados: ${completedServices}/${servicesExpected} realizados`);

    const nextServiceKm = cond.service_interval_km > 0 ? (Math.floor(v.mileage / cond.service_interval_km) + 1) * cond.service_interval_km : 0;

    return {
      active: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join(' · ') : null,
      conditionName: cond.name,
      servicesExpected,
      servicesCompleted: completedServices,
      nextServiceKm,
      monthsRemaining: Math.max(0, monthsRemaining),
      kmRemaining: Math.max(0, kmRemaining),
    };
  };

  const [serviceCounts, setServiceCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (vehicles.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('reservations')
        .select('vehicle_id')
        .eq('status', 'completada')
        .in('vehicle_id', vehicles.map(v => v.id));
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.vehicle_id] = (counts[r.vehicle_id] || 0) + 1; });
      setServiceCounts(counts);
    })();
  }, [vehicles]);

  const vehiclesWithWarranty = vehicles.map(v => ({
    vehicle: v,
    warranty: evaluateWarranty(v, serviceCounts[v.id] || 0),
  }));

  const filtered = vehiclesWithWarranty.filter(({ vehicle: v, warranty: w }) => {
    if (statusFilter === 'activa' && !w.active) return false;
    if (statusFilter === 'inactiva' && w.active) return false;
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

  const totalActive = vehiclesWithWarranty.filter(x => x.warranty.active).length;
  const totalInactive = vehiclesWithWarranty.filter(x => !x.warranty.active).length;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-display font-bold">Control de Garantías</h1>
          {conditions.length > 0 && (
            <p className="text-xs text-muted-foreground">{conditions[0].name}: {(conditions[0].max_months / 12).toFixed(0)} años o {conditions[0].max_km.toLocaleString()} km · Servicios cada {conditions[0].service_interval_km.toLocaleString()} km</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 gap-1"><ShieldCheck className="w-3 h-3" /> {totalActive}</Badge>
          <Badge className="bg-red-100 text-red-800 gap-1"><ShieldX className="w-3 h-3" /> {totalInactive}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar placa, VIN, modelo, cliente..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="activa">Garantía Activa</SelectItem>
            <SelectItem value="inactiva">Garantía Inactiva</SelectItem>
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
      ) : (
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
                      <TableCell className="text-xs text-center">{w.servicesCompleted}/{w.servicesExpected}</TableCell>
                      <TableCell className="text-xs text-center">{w.monthsRemaining > 0 ? w.monthsRemaining : '0'}</TableCell>
                      <TableCell className="text-xs text-center">{w.kmRemaining > 0 ? w.kmRemaining.toLocaleString() : '0'}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-[10px] gap-1", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                          {w.active ? 'Activa' : 'Inactiva'}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
                  <Badge className={cn("text-xs flex items-center gap-1", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                    {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                    {w.active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><span>{v.clients?.full_name || '-'}</span></div>
                  <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><span>{v.mileage.toLocaleString()} km</span></div>
                  {v.purchase_date && <div className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /><span>Compra: {v.purchase_date}</span></div>}
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-sm font-bold">{w.servicesCompleted}</p>
                    <p className="text-[10px] text-muted-foreground">Realizados</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-sm font-bold">{w.servicesExpected}</p>
                    <p className="text-[10px] text-muted-foreground">Esperados</p>
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

                {!w.active && w.reason && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs">
                    <p className="font-semibold text-red-800 mb-1">Razón de invalidez</p>
                    <p className="text-red-700">{w.reason}</p>
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
