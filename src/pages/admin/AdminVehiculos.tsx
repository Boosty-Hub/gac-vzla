import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Search, Car, ShieldCheck, ShieldX, Hash, CalendarDays, Clock, MapPin, ClipboardCheck, User, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VehicleModel {
  id: string;
  name: string;
  brand: string;
  year: number | null;
}

interface Vehicle {
  id: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number;
  purchase_date: string | null;
  warranty_active: boolean;
  is_active: boolean;
  model_id: string;
  client_id: string;
  vehicle_models: { name: string; brand: string } | null;
  clients: { full_name: string; cedula: string | null; address: string | null; city: string | null; state: string | null } | null;
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

const AdminVehiculos = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('vehiculos.edit');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [warrantyFilter, setWarrantyFilter] = useState('todos');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [detailHistory, setDetailHistory] = useState<ServiceRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [eModelId, setEModelId] = useState('');
  const [eYear, setEYear] = useState('');
  const [ePlate, setEPlate] = useState('');
  const [eVin, setEVin] = useState('');
  const [eColor, setEColor] = useState('');
  const [eMileage, setEMileage] = useState('0');
  const [ePurchaseDate, setEPurchaseDate] = useState('');
  const [eWarranty, setEWarranty] = useState(true);

  const fetchModels = async () => {
    const { data } = await supabase
      .from('vehicle_models')
      .select('id, name, brand, year')
      .eq('is_active', true)
      .order('brand')
      .order('name');
    if (data) setModels(data);
  };

  const fetchVehicles = async () => {
    setLoading(true);

    let query = supabase
      .from('vehicles')
      .select('*, vehicle_models(name, brand), clients(full_name, cedula, address, city, state)', { count: 'exact' });

    if (warrantyFilter !== 'todos') {
      query = query.eq('warranty_active', warrantyFilter === 'activa');
    }

    if (busqueda.trim()) {
      query = query.or(`plate.ilike.%${busqueda}%,vin.ilike.%${busqueda}%,color.ilike.%${busqueda}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching vehicles:', error);
    } else {
      let filtered = data || [];
      if (brandFilter !== 'all') {
        filtered = filtered.filter(v => v.vehicle_models?.brand === brandFilter);
      }
      setVehicles(filtered as Vehicle[]);
      setTotalCount(brandFilter !== 'all' ? filtered.length : (count || 0));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [busqueda, brandFilter, warrantyFilter, pageSize]);

  useEffect(() => {
    fetchVehicles();
  }, [page, busqueda, brandFilter, warrantyFilter, pageSize]);

  const openDetail = async (v: Vehicle) => {
    setDetailVehicle(v);
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

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v);
    setEModelId(v.model_id);
    setEYear(v.year.toString());
    setEPlate(v.plate || '');
    setEVin(v.vin || '');
    setEColor(v.color || '');
    setEMileage(v.mileage.toString());
    setEPurchaseDate(v.purchase_date || '');
    setEWarranty(v.warranty_active);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editVehicle) return;
    if (!eModelId || !eYear) {
      toast.error('Modelo y año son requeridos');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('vehicles').update({
      model_id: eModelId,
      year: parseInt(eYear),
      plate: ePlate.trim().toUpperCase() || null,
      vin: eVin.trim().toUpperCase() || null,
      color: eColor.trim() || null,
      mileage: parseInt(eMileage) || 0,
      purchase_date: ePurchaseDate || null,
      warranty_active: eWarranty,
    }).eq('id', editVehicle.id);

    if (error) {
      toast.error('Error al actualizar vehículo');
      console.error(error);
    } else {
      toast.success('Vehículo actualizado');
      setEditOpen(false);
      fetchVehicles();
    }
    setSaving(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Vehículos</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Car className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar placa, VIN o color..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            <SelectItem value="GAC">GAC</SelectItem>
            <SelectItem value="DFSK">DFSK</SelectItem>
            <SelectItem value="SHINERAY">SHINERAY</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warrantyFilter} onValueChange={setWarrantyFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Garantía" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las garantías</SelectItem>
            <SelectItem value="activa">Garantía activa</SelectItem>
            <SelectItem value="inactiva">Garantía inactiva</SelectItem>
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
            <p className="text-sm text-muted-foreground">Cargando vehículos...</p>
          </CardContent>
        ) : vehicles.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron vehículos</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Año</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>VIN</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>F. Compra</TableHead>
                <TableHead>Gar.</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map(v => (
                <TableRow key={v.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(v)}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">
                      {v.vehicle_models?.brand || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{v.vehicle_models?.name || '-'}</TableCell>
                  <TableCell>{v.year}</TableCell>
                  <TableCell className="font-mono">{v.plate || '-'}</TableCell>
                  <TableCell>{v.color || '-'}</TableCell>
                  <TableCell className="max-w-[160px] truncate" title={v.clients?.full_name || ''}>
                    {v.clients?.full_name || '-'}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground" title={[v.clients?.address, v.clients?.city, v.clients?.state].filter(Boolean).join(', ') || ''}>
                    {[v.clients?.address, v.clients?.city, v.clients?.state].filter(Boolean).join(', ') || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono">{v.vin || '-'}</TableCell>
                  <TableCell>{v.mileage.toLocaleString()}</TableCell>
                  <TableCell>{formatDate(v.purchase_date)}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-[10px] px-1.5 py-0", v.warranty_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
                      {v.warranty_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); openEdit(v); }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                </TableRow>
              ))}
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
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Editar Vehículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Modelo *</Label>
                <Select value={eModelId} onValueChange={setEModelId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(models.map(m => m.brand))).map(brand => (
                      <SelectGroup key={brand}>
                        <SelectLabel className="text-[10px] font-bold uppercase text-muted-foreground">{brand}</SelectLabel>
                        {models.filter(m => m.brand === brand).map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.brand} {m.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Año *</Label>
                <Input type="number" value={eYear} onChange={e => setEYear(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Placa</Label>
                <Input value={ePlate} onChange={e => setEPlate(e.target.value)} placeholder="ABC123" className="h-8 text-xs uppercase" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VIN</Label>
                <Input value={eVin} onChange={e => setEVin(e.target.value)} className="h-8 text-xs uppercase" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <Input value={eColor} onChange={e => setEColor(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kilometraje</Label>
                <Input type="number" value={eMileage} onChange={e => setEMileage(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha de compra</Label>
                <Input type="date" value={ePurchaseDate} onChange={e => setEPurchaseDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="flex items-center gap-2 col-span-2 pt-1">
                <Switch checked={eWarranty} onCheckedChange={setEWarranty} />
                <Label className="text-xs">Garantía activa</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Car className="w-4 h-4" /> Detalle del Vehículo
            </DialogTitle>
          </DialogHeader>
          {detailVehicle && (() => {
            const v = detailVehicle;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</h3>
                    <p className="text-xs text-muted-foreground">{v.plate || '-'}{v.vin ? ` · VIN: ${v.vin}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setDetailOpen(false); openEdit(v); }}>
                        <Pencil className="w-3 h-3" /> Editar
                      </Button>
                    )}
                    <Badge className={cn("text-xs flex items-center gap-1", v.warranty_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                      {v.warranty_active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                      {v.warranty_active ? 'Garantía Activa' : 'Sin Garantía'}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Cliente</p><p className="font-medium">{v.clients?.full_name || '-'}</p></div></div>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Kilometraje</p><p className="font-medium">{v.mileage.toLocaleString()} km</p></div></div>
                  {(v.clients?.address || v.clients?.city || v.clients?.state) && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 col-span-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Dirección Cliente</p><p className="font-medium">{[v.clients?.address, v.clients?.city, v.clients?.state].filter(Boolean).join(', ')}</p></div></div>}
                  {v.color && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Car className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Color</p><p className="font-medium">{v.color}</p></div></div>}
                  {v.purchase_date && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Compra</p><p className="font-medium">{formatDate(v.purchase_date)}</p></div></div>}
                </div>

                <Separator />
                <h4 className="font-semibold text-xs">Historial de Servicios ({detailHistory.length})</h4>

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
                            <Badge className={cn("text-[10px] px-1.5 py-0", isCompleted ? "bg-green-100 text-green-800" : h.status === 'cancelada' ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800")}>{h.status}</Badge>
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

export default AdminVehiculos;
