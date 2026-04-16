import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Pencil, Car, ImagePlus, Trash2, X, Calendar, Wrench, Settings2, Shield, Power, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VehicleModel {
  id: string;
  name: string;
  brand: string;
  year: number | null;
  engine: string | null;
  transmission: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  warranty_km: number | null;
  warranty_months: number | null;
  warranty_service_interval_km: number | null;
}

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number | null;
  max_months: number | null;
  service_interval_km: number | null;
  description: string | null;
}

const BRANDS = ['GAC', 'DFSK', 'SHINERAY'];

const AdminModelos = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('modelos.create');
  const canEdit = hasPermission('modelos.edit');
  const canDelete = hasPermission('modelos.delete');
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [brandFilter, setBrandFilter] = useState('todos');
  const [sortField, setSortField] = useState('brand');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingModel, setEditingModel] = useState<VehicleModel | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('GAC');
  const [formYear, setFormYear] = useState('');
  const [formEngine, setFormEngine] = useState('');
  const [formTransmission, setFormTransmission] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formWarrantyKm, setFormWarrantyKm] = useState('');
  const [formWarrantyMonths, setFormWarrantyMonths] = useState('');
  const [formWarrantyIntervalKm, setFormWarrantyIntervalKm] = useState('');
  const [formWarrantyConditionId, setFormWarrantyConditionId] = useState<string>('global');
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [warrantyConditions, setWarrantyConditions] = useState<WarrantyCondition[]>([]);

  const fetchModels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicle_models')
      .select('*')
      .order('brand')
      .order('name');

    if (error) {
      toast.error('Error al cargar modelos');
      console.error(error);
    } else {
      setModels(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchModels();
    supabase.from('warranty_conditions').select('id, name, max_km, max_months, service_interval_km, description').eq('is_active', true).order('name')
      .then(({ data }) => setWarrantyConditions((data || []) as WarrantyCondition[]));
  }, []);

  const openCreateDialog = () => {
    setEditingModel(null);
    setFormName('');
    setFormBrand('GAC');
    setFormYear(new Date().getFullYear().toString());
    setFormEngine('');
    setFormTransmission('');
    setFormIsActive(true);
    setFormWarrantyConditionId('global');
    setFormWarrantyKm('');
    setFormWarrantyMonths('');
    setFormWarrantyIntervalKm('');
    setFormImageFile(null);
    setFormImagePreview(null);
    setRemoveImage(false);
    setDialogOpen(true);
  };

  const openEditDialog = (model: VehicleModel) => {
    setEditingModel(model);
    setFormName(model.name);
    setFormBrand(model.brand);
    setFormYear(model.year?.toString() || '');
    setFormEngine(model.engine || '');
    setFormTransmission(model.transmission || '');
    setFormIsActive(model.is_active);
    setFormWarrantyKm(model.warranty_km?.toString() || '');
    setFormWarrantyMonths(model.warranty_months?.toString() || '');
    setFormWarrantyIntervalKm(model.warranty_service_interval_km?.toString() || '');
    const matched = warrantyConditions.find(c =>
      c.max_km === model.warranty_km &&
      c.max_months === model.warranty_months &&
      c.service_interval_km === model.warranty_service_interval_km
    );
    setFormWarrantyConditionId(matched ? matched.id.toString() : 'global');
    setFormImageFile(null);
    setFormImagePreview(model.image_url || null);
    setRemoveImage(false);
    setDialogOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no debe superar 5 MB'); return; }
    setFormImageFile(file);
    setFormImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    setFormImageFile(null);
    setFormImagePreview(null);
    setRemoveImage(true);
  };

  const handleWarrantyConditionChange = (conditionId: string) => {
    setFormWarrantyConditionId(conditionId);
    if (conditionId === 'global') {
      setFormWarrantyKm('');
      setFormWarrantyMonths('');
      setFormWarrantyIntervalKm('');
    } else {
      const c = warrantyConditions.find(wc => wc.id.toString() === conditionId);
      if (c) {
        setFormWarrantyKm(c.max_km?.toString() || '');
        setFormWarrantyMonths(c.max_months?.toString() || '');
        setFormWarrantyIntervalKm(c.service_interval_km?.toString() || '');
      }
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre del modelo es requerido');
      return;
    }
    setSaving(true);

    let imageUrl: string | null | undefined = undefined;

    // Upload new image if selected
    if (formImageFile) {
      const ext = formImageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${formBrand.toLowerCase()}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('vehicle-models')
        .upload(filePath, formImageFile, { upsert: true });
      if (uploadError) {
        toast.error('Error al subir imagen');
        console.error(uploadError);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('vehicle-models').getPublicUrl(filePath);
      imageUrl = urlData.publicUrl;
    } else if (removeImage) {
      imageUrl = null;
    }

    const base = {
      name: formName.trim(),
      brand: formBrand,
      year: formYear ? parseInt(formYear) : null,
      engine: formEngine.trim() || null,
      transmission: formTransmission.trim() || null,
      is_active: formIsActive,
      warranty_km: formWarrantyKm ? parseInt(formWarrantyKm) : null,
      warranty_months: formWarrantyMonths ? parseInt(formWarrantyMonths) : null,
      warranty_service_interval_km: formWarrantyIntervalKm ? parseInt(formWarrantyIntervalKm) : null,
    };
    const payload = imageUrl !== undefined ? { ...base, image_url: imageUrl } : base;

    if (editingModel) {
      const { error } = await supabase
        .from('vehicle_models')
        .update(payload)
        .eq('id', editingModel.id);

      if (error) {
        toast.error('Error al actualizar modelo');
        console.error(error);
      } else {
        toast.success('Modelo actualizado');
        setDialogOpen(false);
        fetchModels();
      }
    } else {
      const { error } = await supabase
        .from('vehicle_models')
        .insert(payload);

      if (error) {
        toast.error('Error al crear modelo');
        console.error(error);
      } else {
        toast.success('Modelo creado');
        setDialogOpen(false);
        fetchModels();
      }
    }
    setSaving(false);
  };

  const filteredModels = models.filter(m => {
    if (brandFilter !== 'todos' && m.brand !== brandFilter) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      if (
        !m.name.toLowerCase().includes(q) &&
        !m.brand.toLowerCase().includes(q) &&
        !(m.engine || '').toLowerCase().includes(q) &&
        !(m.transmission || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedModels = [...filteredModels].sort((a, b) => {
    let aVal: any, bVal: any;
    switch (sortField) {
      case 'brand': aVal = a.brand; bVal = b.brand; break;
      case 'name': aVal = a.name; bVal = b.name; break;
      case 'year': aVal = a.year ?? 0; bVal = b.year ?? 0; break;
      case 'engine': aVal = a.engine || ''; bVal = b.engine || ''; break;
      case 'transmission': aVal = a.transmission || ''; bVal = b.transmission || ''; break;
      case 'warranty': aVal = a.warranty_km ?? 0; bVal = b.warranty_km ?? 0; break;
      case 'status': aVal = a.is_active ? 1 : 0; bVal = b.is_active ? 1 : 0; break;
      default: aVal = a.brand; bVal = b.brand;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 opacity-30 shrink-0" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />;
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'brand' | 'year' | 'engine' | 'transmission' | 'warranty' | 'isActive' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkBrand, setBulkBrand] = useState('GAC');
  const [bulkYear, setBulkYear] = useState('');
  const [bulkEngine, setBulkEngine] = useState('');
  const [bulkTransmission, setBulkTransmission] = useState('');
  const [bulkWarrantyKm, setBulkWarrantyKm] = useState('');
  const [bulkWarrantyMonths, setBulkWarrantyMonths] = useState('');
  const [bulkWarrantyInterval, setBulkWarrantyInterval] = useState('');
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
    if (filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredModels.map(m => m.id)));
    }
  };

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('vehicle_models').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar modelos');
    else { toast.success(`${ids.length} modelo(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); fetchModels(); }
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('vehicle_models').delete().in('id', ids);
    if (error) toast.error('Error al eliminar modelos');
    else { toast.success(`${ids.length} modelo(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchModels(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'brand': payload = { brand: bulkBrand }; break;
      case 'year': payload = { year: bulkYear ? parseInt(bulkYear) : null }; break;
      case 'engine': payload = { engine: bulkEngine.trim() || null }; break;
      case 'transmission': payload = { transmission: bulkTransmission.trim() || null }; break;
      case 'warranty':
        payload = {
          warranty_km: bulkWarrantyKm ? parseInt(bulkWarrantyKm) : null,
          warranty_months: bulkWarrantyMonths ? parseInt(bulkWarrantyMonths) : null,
          warranty_service_interval_km: bulkWarrantyInterval ? parseInt(bulkWarrantyInterval) : null,
        };
        break;
      case 'isActive': payload = { is_active: bulkIsActive }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display font-bold">Modelos de Vehículos</h1>
        {canCreate && (
          <Button size="sm" onClick={openCreateDialog} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar modelo, motor, transmisión..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={brandFilter} onValueChange={v => { setBrandFilter(v); setSelectedIds(new Set()); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las marcas</SelectItem>
            {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando modelos...</p>
          </CardContent>
        ) : sortedModels.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron modelos</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                    checked={filteredModels.length > 0 && filteredModels.every(m => selectedIds.has(m.id))}
                    onChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="w-12">Foto</TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('brand')}>
                    Marca<SortIcon field="brand" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('name')}>
                    Modelo<SortIcon field="name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('year')}>
                    Año<SortIcon field="year" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('engine')}>
                    Motor<SortIcon field="engine" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('transmission')}>
                    Transmisión<SortIcon field="transmission" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('warranty')}>
                    Garantía<SortIcon field="warranty" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort('status')}>
                    Estado<SortIcon field="status" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedModels.map(m => (
                <TableRow key={m.id} className="[&>td]:py-1.5">
                  <TableCell className="pl-3">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                      checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                  </TableCell>
                  <TableCell>
                    {m.image_url ? (
                      <img src={m.image_url} alt={m.name} className="w-10 h-10 rounded-md object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                        <Car className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{m.brand}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.year || '-'}</TableCell>
                  <TableCell>{m.engine || '-'}</TableCell>
                  <TableCell>{m.transmission || '-'}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {m.warranty_km || m.warranty_months ? (
                      <span>{m.warranty_km ? `${(m.warranty_km / 1000).toFixed(0)}k km` : '—'} · {m.warranty_months ? `${m.warranty_months} m` : '—'}</span>
                    ) : <span className="italic">Global</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {m.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(m)}>
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

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-1 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 py-2 border border-gray-700 max-w-[calc(100vw-2rem)] overflow-x-auto">
            <span className="text-xs font-bold whitespace-nowrap text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">
              {selectedIds.size} sel.
            </span>
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('brand'); setBulkBrand('GAC'); }}>
              <Car className="w-3 h-3" /> Marca
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('year'); setBulkYear(''); }}>
              <Calendar className="w-3 h-3" /> Año
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('engine'); setBulkEngine(''); }}>
              <Wrench className="w-3 h-3" /> Motor
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('transmission'); setBulkTransmission(''); }}>
              <Settings2 className="w-3 h-3" /> Transmisión
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('warranty'); setBulkWarrantyKm(''); setBulkWarrantyMonths(''); setBulkWarrantyInterval(''); }}>
              <Shield className="w-3 h-3" /> Garantía
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('isActive'); setBulkIsActive(true); }}>
              <Power className="w-3 h-3" /> Estado
            </Button>
            {canDelete && (
              <>
                <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
                <Button size="sm" variant="ghost" className="text-red-400 hover:bg-white/10 hover:text-red-300 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
                  onClick={() => setBulkConfirmDeleteOpen(true)}>
                  <Trash2 className="w-3 h-3" /> Eliminar
                </Button>
              </>
            )}
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
              onClick={() => setSelectedIds(new Set())}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* BULK ACTION DIALOG */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) setBulkAction(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-display">
              {bulkAction === 'brand' && 'Cambiar marca'}
              {bulkAction === 'year' && 'Cambiar año'}
              {bulkAction === 'engine' && 'Cambiar motor'}
              {bulkAction === 'transmission' && 'Cambiar transmisión'}
              {bulkAction === 'warranty' && 'Cambiar garantía'}
              {bulkAction === 'isActive' && 'Cambiar estado'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-xs text-muted-foreground">Se aplicará a <strong>{selectedIds.size}</strong> modelo(s) seleccionado(s).</p>
            {bulkAction === 'brand' && (
              <Select value={bulkBrand} onValueChange={setBulkBrand}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {bulkAction === 'year' && (
              <Input type="number" value={bulkYear} onChange={e => setBulkYear(e.target.value)}
                placeholder={`Ej: ${new Date().getFullYear()}`} className="h-9 text-xs" />
            )}
            {bulkAction === 'engine' && (
              <Input value={bulkEngine} onChange={e => setBulkEngine(e.target.value)}
                placeholder="Ej: 1.5T · vacío = quitar motor" className="h-9 text-xs" />
            )}
            {bulkAction === 'transmission' && (
              <Input value={bulkTransmission} onChange={e => setBulkTransmission(e.target.value)}
                placeholder="Ej: Automática 7DCT · vacío = quitar" className="h-9 text-xs" />
            )}
            {bulkAction === 'warranty' && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Deja vacío para usar la condición global</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Km máx.</Label>
                    <Input type="number" value={bulkWarrantyKm} onChange={e => setBulkWarrantyKm(e.target.value)} placeholder="100000" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Meses</Label>
                    <Input type="number" value={bulkWarrantyMonths} onChange={e => setBulkWarrantyMonths(e.target.value)} placeholder="72" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Intervalo (km)</Label>
                    <Input type="number" value={bulkWarrantyInterval} onChange={e => setBulkWarrantyInterval(e.target.value)} placeholder="5000" className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}
            {bulkAction === 'isActive' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{bulkIsActive ? 'Activo' : 'Inactivo'}</p>
                  <p className="text-xs text-muted-foreground">Visible en el catálogo</p>
                </div>
                <Switch checked={bulkIsActive} onCheckedChange={setBulkIsActive} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button size="sm" className="flex-1 gac-gradient" disabled={bulkLoading} onClick={handleBulkApply}>
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} modelo(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente <strong>{selectedIds.size}</strong> modelo(s) seleccionados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Eliminar ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingModel ? 'Editar Modelo' : 'Nuevo Modelo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="modelName">Nombre del Modelo *</Label>
                <Input id="modelName" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: GS4" />
              </div>
              <div className="space-y-2">
                <Label>Marca *</Label>
                <Select value={formBrand} onValueChange={setFormBrand}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="modelEngine">Motor</Label>
                <Input id="modelEngine" value={formEngine} onChange={e => setFormEngine(e.target.value)} placeholder="Ej: 1.5T" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelTransmission">Transmisión</Label>
                <Input id="modelTransmission" value={formTransmission} onChange={e => setFormTransmission(e.target.value)} placeholder="Ej: Automática 7DCT" />
              </div>
            </div>
            {/* Warranty fields */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Condición de Garantía</Label>
              <Select value={formWarrantyConditionId} onValueChange={handleWarrantyConditionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una condición" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Usar condición global</SelectItem>
                  {warrantyConditions.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formWarrantyConditionId === 'global' ? (
                <p className="text-[11px] text-muted-foreground">Se aplicarán las condiciones globales de garantía configuradas en el sistema.</p>
              ) : (
                (() => {
                  const c = warrantyConditions.find(wc => wc.id.toString() === formWarrantyConditionId);
                  if (!c) return null;
                  return (
                    <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
                      {c.description && <p>{c.description}</p>}
                      <p className="font-medium text-foreground/70">
                        {c.max_km ? `${(c.max_km / 1000).toFixed(0)}k km` : '—'} · {c.max_months ? `${c.max_months} meses` : '—'} · Servicio c/{c.service_interval_km ? `${(c.service_interval_km / 1000).toFixed(0)}k km` : '—'}
                      </p>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Image upload */}
            <div className="space-y-2">
              <Label>Imagen del Modelo</Label>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleImageSelect} />
              {formImagePreview ? (
                <div className="relative w-full h-40 rounded-lg border overflow-hidden bg-muted">
                  <img src={formImagePreview} alt="Preview" className="w-full h-full object-contain" />
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <Button type="button" size="icon" variant="secondary" className="h-7 w-7 rounded-full shadow" onClick={() => fileInputRef.current?.click()}>
                      <ImagePlus className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="destructive" className="h-7 w-7 rounded-full shadow" onClick={handleRemoveImage}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <ImagePlus className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Clic para subir imagen</span>
                  <span className="text-[10px] text-muted-foreground">JPG, PNG, WebP · Máx 5 MB</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Estado</Label>
                <p className="text-xs text-muted-foreground">Modelo activo en el catálogo</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingModel ? 'Guardar Cambios' : 'Crear Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminModelos;
