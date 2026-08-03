import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { findOrCreateManualModel, type ManualModelClient } from '@/lib/manualVehicleModel';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Car, ShieldCheck, ShieldX, Hash, CalendarDays, Clock, MapPin, ClipboardCheck, User, Pencil, X, Trash2, Palette, Power, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildVehicleSearchFilter, sanitizeSearchTerm } from '@/lib/vehicleSearch';
import { useServiceSurveys } from '@/hooks/useServiceSurveys';
import ServiceSurveyInline from '@/components/satisfaction/ServiceSurveyInline';
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
  // true = third-party vehicle registered only to record a one-off service —
  // never a unit we sold. See supabase/migrations/20260730140000_manual_vehicles_and_clients.sql.
  is_manual: boolean;
  model_id: string;
  client_id: string;
  vehicle_models: { name: string; brand: string } | null;
  clients: { full_name: string; cedula: string | null; address: string | null; city: string | null; state: string | null } | null;
}

// Sentinel for the "Otro / escribir manualmente" option in the model Select —
// never a real vehicle_models.id (those are UUIDs).
const MANUAL_MODEL_VALUE = '__manual__';



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
  const isMobile = useIsMobile();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('vehiculos.edit');
  const canDelete = hasPermission('vehiculos.delete');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [warrantyFilter, setWarrantyFilter] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  // Monotonic sequence to discard stale fetchVehicles responses (overlapping
  // calls can resolve out of order because of the model-id lookup await).
  const fetchSeq = useRef(0);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [detailHistory, setDetailHistory] = useState<ServiceRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // R7 — the postventa survey result for each service in the history above.
  const { surveys: serviceSurveys } = useServiceSurveys(detailHistory.map(h => h.id));

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
  const [eManualBrand, setEManualBrand] = useState('');
  const [eManualModel, setEManualModel] = useState('');

  const fetchModels = async () => {
    // is_manual = false: manual models are per-vehicle placeholders for
    // third-party service, not commercial catalog — they must never populate
    // this picker (see 20260730140000_manual_vehicles_and_clients.sql).
    const { data } = await (supabase as any)
      .from('vehicle_models')
      .select('id, name, brand, year')
      .eq('is_active', true)
      .eq('is_manual', false)
      .order('brand')
      .order('name');
    if (data) setModels(data);
  };

  const fetchVehicles = async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);

    const searchTerm = sanitizeSearchTerm(busqueda);

    // Model name search: resolve matching model IDs so the main search box
    // also finds vehicles by model (e.g. "GS3").
    let modelIds: string[] = [];
    if (searchTerm) {
      const { data: matchingModels } = await supabase
        .from('vehicle_models')
        .select('id')
        .ilike('name', `%${searchTerm}%`);
      if (seq !== fetchSeq.current) return;
      modelIds = (matchingModels || []).map((m: { id: string }) => m.id);
    }

    // Cast: `vehicles.is_manual` isn't in the stale generated types.ts, so the
    // untyped `*` select here would otherwise infer a Row shape missing it —
    // the `as Vehicle[]` cast below would then fail type-checking.
    let query = (supabase as any)
      .from('vehicles')
      .select('*, vehicle_models(name, brand), clients(full_name, cedula, address, city, state)', { count: 'exact' });

    if (warrantyFilter !== 'todos') {
      query = query.eq('warranty_active', warrantyFilter === 'activa');
    }

    if (searchTerm) {
      const searchFilter = buildVehicleSearchFilter(searchTerm, modelIds);
      if (searchFilter) {
        query = query.or(searchFilter);
      }
    }

    // Purchase date range filter
    if (dateFrom) query = query.gte('purchase_date', dateFrom);
    if (dateTo) query = query.lte('purchase_date', dateTo);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    // Stale response guard: a newer fetch has started, drop this result.
    if (seq !== fetchSeq.current) return;

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
  }, [busqueda, brandFilter, warrantyFilter, pageSize, dateFrom, dateTo]);

  useEffect(() => {
    fetchVehicles();
  }, [page, busqueda, brandFilter, warrantyFilter, pageSize, dateFrom, dateTo]);

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
    if (v.is_manual && v.vehicle_models) {
      // Manual models are excluded from `models` (the picker's options), so
      // there is no matching SelectItem for v.model_id — reopen in "Otro"
      // mode with the typed brand/model prefilled instead of showing a blank
      // Select.
      setEModelId(MANUAL_MODEL_VALUE);
      setEManualBrand(v.vehicle_models.brand);
      setEManualModel(v.vehicle_models.name);
    } else {
      setEModelId(v.model_id);
      setEManualBrand('');
      setEManualModel('');
    }
    setEYear(v.year.toString());
    setEPlate(v.plate || '');
    setEVin(v.vin || '');
    setEColor(v.color || '');
    setEMileage(v.mileage.toString());
    setEPurchaseDate(v.purchase_date || '');
    setEWarranty(v.warranty_active);
    setEditOpen(true);
  };

  const handleEModelChange = (value: string) => {
    setEModelId(value);
    if (value !== MANUAL_MODEL_VALUE) {
      setEManualBrand('');
      setEManualModel('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editVehicle) return;
    const isManualModel = eModelId === MANUAL_MODEL_VALUE;
    if ((!isManualModel && !eModelId) || !eYear) {
      toast.error('Modelo y año son requeridos');
      return;
    }
    if (isManualModel && (!eManualBrand.trim() || !eManualModel.trim())) {
      toast.error('Marca y modelo son requeridos');
      return;
    }
    setSaving(true);

    let modelId = eModelId;
    if (isManualModel) {
      const resolvedId = await findOrCreateManualModel(
        supabase as unknown as ManualModelClient,
        eManualBrand,
        eManualModel,
      );
      if (!resolvedId) {
        toast.error('No se pudo registrar el modelo manual');
        setSaving(false);
        return;
      }
      modelId = resolvedId;
    }

    const { error } = await (supabase as any).from('vehicles').update({
      model_id: modelId,
      year: parseInt(eYear),
      plate: ePlate.trim().toUpperCase() || null,
      vin: eVin.trim().toUpperCase() || null,
      color: eColor.trim() || null,
      mileage: parseInt(eMileage) || 0,
      purchase_date: ePurchaseDate || null,
      // A third-party vehicle never carries our warranty, regardless of the
      // switch's last value.
      warranty_active: isManualModel ? false : eWarranty,
      is_manual: isManualModel,
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

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'model' | 'year' | 'plate' | 'vin' | 'color' | 'mileage' | 'purchaseDate' | 'warranty' | 'isActive' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkModelId, setBulkModelId] = useState('');
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkYear, setBulkYear] = useState('');
  const [bulkPlate, setBulkPlate] = useState('');
  const [bulkVin, setBulkVin] = useState('');
  const [bulkColor, setBulkColor] = useState('');
  const [bulkMileage, setBulkMileage] = useState('');
  const [bulkPurchaseDate, setBulkPurchaseDate] = useState('');
  const [bulkWarranty, setBulkWarranty] = useState(true);
  const [bulkIsActive, setBulkIsActive] = useState(true);
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (vehicles.length > 0 && vehicles.every(v => selectedIds.has(v.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vehicles.map(v => v.id)));
    }
  };

  // sortedVehicles is defined after sort helpers (below)

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('vehicles').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar vehículos');
    else { toast.success(`${ids.length} vehículo(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); fetchVehicles(); }
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('vehicles').delete().in('id', ids);
    if (error) toast.error('Error al eliminar vehículos');
    else { toast.success(`${ids.length} vehículo(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchVehicles(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'model': if (!bulkModelId) return; payload = { model_id: bulkModelId }; break;
      case 'year': if (!bulkYear) return; payload = { year: parseInt(bulkYear) }; break;
      case 'plate': payload = { plate: bulkPlate.trim().toUpperCase() || null }; break;
      case 'vin': payload = { vin: bulkVin.trim().toUpperCase() || null }; break;
      case 'color': payload = { color: bulkColor.trim() || null }; break;
      case 'mileage': if (!bulkMileage) return; payload = { mileage: parseInt(bulkMileage) || 0 }; break;
      case 'purchaseDate': payload = { purchase_date: bulkPurchaseDate || null }; break;
      case 'warranty': payload = { warranty_active: bulkWarranty }; break;
      case 'isActive': payload = { is_active: bulkIsActive }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  const availableBrands = Array.from(new Set(models.map(m => m.brand)));

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    let from = '';
    let to = '';
    if (preset === 'mes') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
    } else if (preset === 'trimestre') {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      from = `${now.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), qStart + 3, 0).getDate();
      to = `${now.getFullYear()}-${String(qStart + 3).padStart(2, '0')}-${lastDay}`;
    } else if (preset === 'año') {
      from = `${now.getFullYear()}-01-01`;
      to = `${now.getFullYear()}-12-31`;
    }
    setDateFrom(from);
    setDateTo(to);
    setDatePreset(preset);
    setDatePopoverOpen(false);
  };

  const clearDateFilter = () => { setDateFrom(''); setDateTo(''); setDatePreset(''); };

  const dateFilterLabel = () => {
    if (datePreset === 'mes') return 'Este mes';
    if (datePreset === 'trimestre') return 'Trimestre';
    if (datePreset === 'año') return 'Este año';
    if (dateFrom || dateTo) {
      const fmt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '...';
      return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    }
    return 'F. Compra';
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedVehicles = [...vehicles].sort((a, b) => {
    if (!sortField) return 0;
    let aVal: any, bVal: any;
    switch (sortField) {
      case 'brand': aVal = a.vehicle_models?.brand || ''; bVal = b.vehicle_models?.brand || ''; break;
      case 'model': aVal = a.vehicle_models?.name || ''; bVal = b.vehicle_models?.name || ''; break;
      case 'year': aVal = a.year; bVal = b.year; break;
      case 'plate': aVal = a.plate || ''; bVal = b.plate || ''; break;
      case 'color': aVal = a.color || ''; bVal = b.color || ''; break;
      case 'client': aVal = a.clients?.full_name || ''; bVal = b.clients?.full_name || ''; break;
      case 'vin': aVal = a.vin || ''; bVal = b.vin || ''; break;
      case 'mileage': aVal = a.mileage; bVal = b.mileage; break;
      case 'purchase_date': aVal = a.purchase_date || ''; bVal = b.purchase_date || ''; break;
      case 'warranty': aVal = a.warranty_active ? 1 : 0; bVal = b.warranty_active ? 1 : 0; break;
      default: return 0;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30 shrink-0" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Vehículos</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Car className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 items-end">
        <div className="relative col-span-2 lg:col-span-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Placa, VIN, color, modelo..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            <SelectItem value="GAC">GAC</SelectItem>
            <SelectItem value="DFSK">DFSK</SelectItem>
            <SelectItem value="SHINERAY">SHINERAY</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warrantyFilter} onValueChange={setWarrantyFilter}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Garantía" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las garantías</SelectItem>
            <SelectItem value="activa">Garantía activa</SelectItem>
            <SelectItem value="inactiva">Garantía inactiva</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range popover */}
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5 w-full justify-start", (dateFrom || dateTo) && "border-primary text-primary")}>
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{dateFilterLabel()}</span>
              {(dateFrom || dateTo) && (
                <span onClick={e => { e.stopPropagation(); clearDateFilter(); }} className="ml-auto hover:text-destructive shrink-0">
                  <X className="w-3 h-3" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(288px,90vw)] p-3 space-y-3" align="start">
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant={datePreset === 'mes' ? 'default' : 'outline'} className="flex-1 h-7 text-xs" onClick={() => applyDatePreset('mes')}>Este mes</Button>
              <Button size="sm" variant={datePreset === 'trimestre' ? 'default' : 'outline'} className="flex-1 h-7 text-xs" onClick={() => applyDatePreset('trimestre')}>Trimestre</Button>
              <Button size="sm" variant={datePreset === 'año' ? 'default' : 'outline'} className="flex-1 h-7 text-xs" onClick={() => applyDatePreset('año')}>Este año</Button>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Desde</Label>
                <Input type="date" value={dateFrom} className="h-8 text-xs" onChange={e => { setDateFrom(e.target.value); setDatePreset(''); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Hasta</Label>
                <Input type="date" value={dateTo} className="h-8 text-xs" onChange={e => { setDateTo(e.target.value); setDatePreset(''); }} />
              </div>
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={() => { clearDateFilter(); setDatePopoverOpen(false); }}>
                <X className="w-3 h-3 mr-1" /> Limpiar filtro
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* List */}
      {loading ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando vehículos...</p>
          </CardContent>
        </Card>
      ) : vehicles.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron vehículos</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* ── MOBILE CARDS ── */
        <div className="space-y-2">
          {/* Select-all bar */}
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
              checked={vehicles.length > 0 && vehicles.every(v => selectedIds.has(v.id))}
              onChange={toggleSelectAll} />
            <span className="text-xs text-muted-foreground">Seleccionar todos ({vehicles.length})</span>
          </div>
          {sortedVehicles.map(v => (
            <Card
              key={v.id}
              className={cn("gac-shadow cursor-pointer active:scale-[0.99] transition-transform", selectedIds.has(v.id) && "ring-1 ring-primary/40 bg-primary/5")}
              onClick={() => openDetail(v)}
            >
              <CardContent className="p-3 space-y-2">
                {/* Row 1: checkbox + brand/model/year + warranty */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div onClick={e => e.stopPropagation()} className="shrink-0 pt-0.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                        checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold shrink-0">{v.vehicle_models?.brand || '-'}</Badge>
                        <span className="font-semibold text-sm truncate">{v.vehicle_models?.name || '-'}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{v.year}</span>
                        {v.is_manual && (
                          <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-800" title="Vehículo de tercero, no vendido por nosotros">
                            Externo
                          </Badge>
                        )}
                      </div>
                      {v.plate && <p className="text-xs font-mono text-muted-foreground mt-0.5">{v.plate}{v.color ? ` · ${v.color}` : ''}</p>}
                    </div>
                  </div>
                  <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", v.warranty_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
                    {v.warranty_active ? 'Gar. Activa' : 'Sin Gar.'}
                  </Badge>
                </div>
                {/* Row 2: client + location */}
                {v.clients && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="font-medium text-foreground truncate">{v.clients.full_name}</span>
                    {(v.clients.city || v.clients.state) && (
                      <span className="text-muted-foreground truncate">· {[v.clients.city, v.clients.state].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                )}
                {/* Row 3: km + purchase date + edit */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{v.mileage.toLocaleString()} km</span>
                    {v.purchase_date && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatDate(v.purchase_date)}</span>}
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={e => { e.stopPropagation(); openEdit(v); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ── DESKTOP TABLE ── */
        <Card className="gac-shadow">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                    checked={vehicles.length > 0 && vehicles.every(v => selectedIds.has(v.id))}
                    onChange={toggleSelectAll} />
                </TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('brand')}>Marca<SortIcon field="brand" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('model')}>Modelo<SortIcon field="model" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('year')}>Año<SortIcon field="year" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('plate')}>Placa<SortIcon field="plate" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('color')}>Color<SortIcon field="color" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('client')}>Cliente<SortIcon field="client" /></button></TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('vin')}>VIN<SortIcon field="vin" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('mileage')}>Km<SortIcon field="mileage" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('purchase_date')}>F. Compra<SortIcon field="purchase_date" /></button></TableHead>
                <TableHead><button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('warranty')}>Gar.<SortIcon field="warranty" /></button></TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVehicles.map(v => (
                <TableRow key={v.id} className={cn("[&>td]:py-1.5 cursor-pointer hover:bg-muted/50", selectedIds.has(v.id) && "bg-primary/5")} onClick={() => openDetail(v)}>
                  <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                      checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{v.vehicle_models?.brand || '-'}</Badge></TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>{v.vehicle_models?.name || '-'}</span>
                      {v.is_manual && (
                        <Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-800" title="Vehículo de tercero, no vendido por nosotros">
                          Externo
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{v.year}</TableCell>
                  <TableCell className="font-mono">{v.plate || '-'}</TableCell>
                  <TableCell>{v.color || '-'}</TableCell>
                  <TableCell className="max-w-[160px] truncate" title={v.clients?.full_name || ''}>{v.clients?.full_name || '-'}</TableCell>
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
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); openEdit(v); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {!loading && vehicles.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground hidden sm:block">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
            </p>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 filas</SelectItem>
                <SelectItem value="300">300 filas</SelectItem>
                <SelectItem value="1000">1000 filas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted">Anterior</button>
              <span className="text-xs text-muted-foreground">Pág. {page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted">Siguiente</button>
            </div>
          )}
        </div>
      )}

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-1 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 py-2 border border-gray-700 max-w-[calc(100vw-2rem)] overflow-x-auto">
            <span className="text-xs font-bold whitespace-nowrap text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">{selectedIds.size} sel.</span>
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('model'); setBulkBrand(''); setBulkModelId(''); }}><Car className="w-3 h-3" /> Modelo</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('year'); setBulkYear(''); }}><CalendarDays className="w-3 h-3" /> Año</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('plate'); setBulkPlate(''); }}><Hash className="w-3 h-3" /> Placa</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('vin'); setBulkVin(''); }}><Hash className="w-3 h-3" /> VIN</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('color'); setBulkColor(''); }}><Palette className="w-3 h-3" /> Color</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('mileage'); setBulkMileage(''); }}><Hash className="w-3 h-3" /> Km</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('purchaseDate'); setBulkPurchaseDate(''); }}><CalendarDays className="w-3 h-3" /> F. Compra</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('warranty'); setBulkWarranty(true); }}><ShieldCheck className="w-3 h-3" /> Garantía</Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => { setBulkAction('isActive'); setBulkIsActive(true); }}><Power className="w-3 h-3" /> Estado</Button>
            {canDelete && (<><div className="w-px h-4 bg-gray-700 shrink-0 mx-1" /><Button size="sm" variant="ghost" className="text-red-400 hover:bg-white/10 hover:text-red-300 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2" onClick={() => setBulkConfirmDeleteOpen(true)}><Trash2 className="w-3 h-3" /> Eliminar</Button></>)}
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0" onClick={() => setSelectedIds(new Set())}><X className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      )}

      {/* BULK ACTION DIALOG */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) setBulkAction(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-display">
              {bulkAction === 'model' && 'Cambiar modelo'}
              {bulkAction === 'year' && 'Cambiar año'}
              {bulkAction === 'plate' && 'Cambiar placa'}
              {bulkAction === 'vin' && 'Cambiar VIN'}
              {bulkAction === 'color' && 'Cambiar color'}
              {bulkAction === 'mileage' && 'Cambiar kilometraje'}
              {bulkAction === 'purchaseDate' && 'Cambiar fecha de compra'}
              {bulkAction === 'warranty' && 'Cambiar garantía'}
              {bulkAction === 'isActive' && 'Cambiar estado activo'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-xs text-muted-foreground">Se aplicará a <strong>{selectedIds.size}</strong> vehículo(s).</p>
            {bulkAction === 'model' && (
              <div className="space-y-2">
                <Select value={bulkBrand || '__none'} onValueChange={v => { setBulkBrand(v === '__none' ? '' : v); setBulkModelId(''); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar marca" /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">— Seleccionar marca —</SelectItem>{availableBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={bulkModelId || '__none'} onValueChange={v => setBulkModelId(v === '__none' ? '' : v)} disabled={!bulkBrand}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={bulkBrand ? 'Seleccionar modelo' : 'Primero seleccione marca'} /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">— Seleccionar modelo —</SelectItem>{models.filter(m => m.brand === bulkBrand).map(m => <SelectItem key={m.id} value={m.id}>{m.brand} {m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'year' && <Input type="number" value={bulkYear} onChange={e => setBulkYear(e.target.value)} placeholder={`Ej: ${new Date().getFullYear()}`} className="h-9" />}
            {bulkAction === 'plate' && <Input value={bulkPlate} onChange={e => setBulkPlate(e.target.value)} placeholder="Ej: ABC123 · vacío = quitar" className="h-9 uppercase" />}
            {bulkAction === 'vin' && <Input value={bulkVin} onChange={e => setBulkVin(e.target.value)} placeholder="VIN · vacío = quitar" className="h-9 uppercase" />}
            {bulkAction === 'color' && <Input value={bulkColor} onChange={e => setBulkColor(e.target.value)} placeholder="Ej: Blanco · vacío = quitar" className="h-9" />}
            {bulkAction === 'mileage' && <Input type="number" value={bulkMileage} onChange={e => setBulkMileage(e.target.value)} placeholder="Ej: 15000" className="h-9" />}
            {bulkAction === 'purchaseDate' && (
              <div className="space-y-1">
                <Input type="date" value={bulkPurchaseDate} onChange={e => setBulkPurchaseDate(e.target.value)} className="h-9" />
                <p className="text-[11px] text-muted-foreground">Vacío = quitar fecha de compra</p>
              </div>
            )}
            {bulkAction === 'warranty' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="text-sm font-medium">{bulkWarranty ? 'Garantía activa' : 'Sin garantía'}</p><p className="text-xs text-muted-foreground">Estado de garantía</p></div>
                <Switch checked={bulkWarranty} onCheckedChange={setBulkWarranty} />
              </div>
            )}
            {bulkAction === 'isActive' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="text-sm font-medium">{bulkIsActive ? 'Activo' : 'Inactivo'}</p><p className="text-xs text-muted-foreground">Estado en el sistema</p></div>
                <Switch checked={bulkIsActive} onCheckedChange={setBulkIsActive} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button className="flex-1 gac-gradient" disabled={bulkLoading || (bulkAction === 'model' && !bulkModelId) || (bulkAction === 'year' && !bulkYear) || (bulkAction === 'mileage' && !bulkMileage)} onClick={handleBulkApply}>
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} vehículo(s)?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará permanentemente <strong>{selectedIds.size}</strong> vehículo(s) y su historial. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel disabled={bulkLoading} className="flex-1">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Eliminar ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Vehículo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Modelo *</Label>
              <Select value={eModelId} onValueChange={handleEModelChange}>
                <SelectTrigger><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                <SelectContent>
                  {/* FIRST, not last: the catalog holds 269 active models, so at the bottom
                      this option was effectively invisible. */}
                  <SelectItem value={MANUAL_MODEL_VALUE} className="font-medium">Otro / escribir manualmente</SelectItem>
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
            {eModelId === MANUAL_MODEL_VALUE && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                <p className="text-[11px] text-amber-800 leading-snug">
                  Vehículo de un tercero (no vendido por nosotros). Se registrará <strong>sin garantía</strong>: solo queda constancia del servicio realizado.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Marca *</Label>
                    <Input value={eManualBrand} onChange={e => setEManualBrand(e.target.value)} placeholder="Ej: Toyota" />
                  </div>
                  <div className="space-y-1">
                    <Label>Modelo *</Label>
                    <Input value={eManualModel} onChange={e => setEManualModel(e.target.value)} placeholder="Ej: Corolla" />
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Año *</Label>
                <Input type="number" value={eYear} onChange={e => setEYear(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Placa</Label>
                <Input value={ePlate} onChange={e => setEPlate(e.target.value)} placeholder="ABC123" className="uppercase" />
              </div>
              <div className="space-y-1">
                <Label>VIN</Label>
                <Input value={eVin} onChange={e => setEVin(e.target.value)} className="uppercase" />
              </div>
              <div className="space-y-1">
                <Label>Color</Label>
                <Input value={eColor} onChange={e => setEColor(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Kilometraje</Label>
                <Input type="number" value={eMileage} onChange={e => setEMileage(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fecha de compra</Label>
                <Input type="date" value={ePurchaseDate} onChange={e => setEPurchaseDate(e.target.value)} />
              </div>
            </div>
            {eModelId === MANUAL_MODEL_VALUE ? (
              <p className="text-xs text-muted-foreground pt-1">Sin garantía (vehículo de tercero)</p>
            ) : (
              <div className="flex items-center gap-3 pt-1">
                <Switch checked={eWarranty} onCheckedChange={setEWarranty} />
                <Label>Garantía activa</Label>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button className="flex-1 gac-gradient" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Car className="w-4 h-4" /> Detalle del Vehículo
            </DialogTitle>
          </DialogHeader>
          {detailVehicle && (() => {
            const v = detailVehicle;
            return (
              <div className="space-y-4">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="font-display font-bold text-sm flex items-center gap-1.5 flex-wrap">
                      {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}
                      {v.is_manual && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800" title="Vehículo de tercero, no vendido por nosotros">
                          Externo
                        </Badge>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">{v.plate || '-'}{v.vin ? ` · VIN: ${v.vin}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
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

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 col-span-2 sm:col-span-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Cliente</p><p className="font-medium truncate">{v.clients?.full_name || '-'}</p></div>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">Kilometraje</p><p className="font-medium">{v.mileage.toLocaleString()} km</p></div>
                  </div>
                  {(v.clients?.address || v.clients?.city || v.clients?.state) && (
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 col-span-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Dirección</p><p className="font-medium truncate">{[v.clients?.address, v.clients?.city, v.clients?.state].filter(Boolean).join(', ')}</p></div>
                    </div>
                  )}
                  {v.color && (
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                      <Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div><p className="text-[10px] text-muted-foreground">Color</p><p className="font-medium">{v.color}</p></div>
                    </div>
                  )}
                  {v.purchase_date && (
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div><p className="text-[10px] text-muted-foreground">Compra</p><p className="font-medium">{formatDate(v.purchase_date)}</p></div>
                    </div>
                  )}
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
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">{h.service_type}</span>
                            <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", isCompleted ? "bg-green-100 text-green-800" : h.status === 'cancelada' ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800")}>{h.status}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
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
                          <ServiceSurveyInline survey={serviceSurveys.get(h.id)} />
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
