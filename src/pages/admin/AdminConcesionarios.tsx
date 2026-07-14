import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Plus, Pencil, Phone, Clock, Car, Mail, Instagram, Globe, Wrench, Building2, Trash2, Navigation, X, Power, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { syncKommoDealershipContact } from '@/lib/kommo';
import { toast } from 'sonner';
import { VENEZUELA_STATES } from '@/lib/venezuelaStates';

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  schedule: string | null;
  bays: number;
  is_active: boolean;
  brand: string[];
  type: string;
  is_service_center: boolean;
  email: string | null;
  instagram: string | null;
  website: string | null;
  google_maps_url: string | null;
  opening_hour: number;
  closing_hour: number;
  created_at: string;
}

const AdminConcesionarios = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('concesionarios.create');
  const canEdit = hasPermission('concesionarios.edit');
  const canDelete = hasPermission('concesionarios.delete');
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Dealership | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDealer, setDetailDealer] = useState<Dealership | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dealership | null>(null);

  const [filterBrand, setFilterBrand] = useState('todos');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'brand' | 'city' | 'state' | 'isServiceCenter' | 'bays' | 'openingHour' | 'closingHour' | 'isActive' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkBrand, setBulkBrand] = useState<string[]>(['GAC']);
  const [bulkCity, setBulkCity] = useState('');
  const [bulkState, setBulkState] = useState('');
  const [bulkIsServiceCenter, setBulkIsServiceCenter] = useState(false);
  const [bulkBays, setBulkBays] = useState('3');
  const [bulkOpeningHour, setBulkOpeningHour] = useState(8);
  const [bulkClosingHour, setBulkClosingHour] = useState(17);
  const [bulkIsActive, setBulkIsActive] = useState(true);
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSchedule, setFormSchedule] = useState('8:00 AM - 5:00 PM');
  const [formBays, setFormBays] = useState('3');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formBrand, setFormBrand] = useState<string[]>(['GAC']);
  const [formIsServiceCenter, setFormIsServiceCenter] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formInstagram, setFormInstagram] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  const [formGoogleMapsUrl, setFormGoogleMapsUrl] = useState('');
  const [formOpeningHour, setFormOpeningHour] = useState(8);
  const [formClosingHour, setFormClosingHour] = useState(17);

  const fetchDealerships = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('dealerships')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Error al cargar concesionarios');
      console.error(error);
    } else {
      setDealerships((data as unknown as Dealership[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDealerships(); }, []);

  const filteredDealerships = dealerships.filter(d => {
    if (filterBrand !== 'todos' && !d.brand?.includes(filterBrand)) return false;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormCity(''); setFormState(''); setFormAddress('');
    setFormPhone(''); setFormSchedule('8:00 AM - 5:00 PM'); setFormBays('3'); setFormIsActive(true);
    setFormBrand(['GAC']); setFormIsServiceCenter(false); setFormEmail(''); setFormInstagram(''); setFormWebsite(''); setFormGoogleMapsUrl('');
    setFormOpeningHour(8); setFormClosingHour(17);
    setDialogOpen(true);
  };

  const openEdit = (d: Dealership) => {
    setEditing(d);
    setFormName(d.name);
    setFormCity(d.city || '');
    setFormState(d.state || '');
    setFormAddress(d.address || '');
    setFormPhone(d.phone || '');
    setFormSchedule(d.schedule || '8:00 AM - 5:00 PM');
    setFormBays(String(d.bays));
    setFormIsActive(d.is_active);
    setFormBrand(d.brand || ['GAC']);
    setFormIsServiceCenter(d.is_service_center ?? false);
    setFormEmail(d.email || '');
    setFormInstagram(d.instagram || '');
    setFormWebsite(d.website || '');
    setFormGoogleMapsUrl(d.google_maps_url || '');
    setFormOpeningHour(d.opening_hour ?? 8);
    setFormClosingHour(d.closing_hour ?? 17);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('El nombre es requerido'); return; }
    if (formBrand.length === 0) { toast.error('Selecciona al menos una marca'); return; }
    setSaving(true);

    const payload = {
      name: formName.trim(),
      city: formCity.trim() || null,
      state: formState.trim() || null,
      address: formAddress.trim() || null,
      phone: formPhone.trim() || null,
      schedule: formSchedule.trim() || null,
      bays: parseInt(formBays) || 3,
      is_active: formIsActive,
      brand: formBrand,
      type: 'concesionario' as const,
      is_service_center: formIsServiceCenter,
      email: formEmail.trim() || null,
      instagram: formInstagram.trim() || null,
      website: formWebsite.trim() || null,
      google_maps_url: formGoogleMapsUrl.trim() || null,
      opening_hour: formOpeningHour,
      closing_hour: formClosingHour,
    };

    if (editing) {
      const { error } = await supabase.from('dealerships').update(payload).eq('id', editing.id);
      if (error) {
        const msg = error.message || error.details || 'Error desconocido';
        if (error.code === '42501' || msg.toLowerCase().includes('policy') || msg.toLowerCase().includes('permission')) {
          toast.error('Sin permisos para actualizar este concesionario');
        } else {
          toast.error(`Error al actualizar: ${msg}`);
        }
        console.error('[AdminConcesionarios] update error:', error);
      } else {
        toast.success('Concesionario actualizado');
        setDialogOpen(false);
        fetchDealerships();
        // GAC is the source of truth: push name + phone to the Kommo notification contact
        // (and provision it if missing) so WhatsApp notifications stay aligned with GAC.
        syncKommoDealershipContact(editing.id).catch(console.error);
      }
    } else {
      const { data: createdDealer, error } = await supabase
        .from('dealerships').insert(payload).select('id').single();
      if (error) {
        const msg = error.message || error.details || 'Error desconocido';
        if (error.code === '42501' || msg.toLowerCase().includes('policy') || msg.toLowerCase().includes('permission')) {
          toast.error('Sin permisos para crear concesionarios');
        } else {
          toast.error(`Error al crear: ${msg}`);
        }
        console.error('[AdminConcesionarios] insert error:', error);
      } else {
        toast.success('Concesionario creado');
        setDialogOpen(false);
        fetchDealerships();
        // GAC is the source of truth: provision the Kommo notification contact + lead
        // and push name + phone right away so a new dealership can be notified.
        if (createdDealer?.id) syncKommoDealershipContact(createdDealer.id).catch(console.error);
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('dealerships').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar: ' + error.message); console.error(error); }
    else { toast.success('Concesionario eliminado'); fetchDealerships(); }
    setDeleteTarget(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredDealerships.length > 0 && filteredDealerships.every(d => selectedIds.has(d.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDealerships.map(d => d.id)));
    }
  };

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('dealerships').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar concesionarios');
    else { toast.success(`${ids.length} concesionario(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); fetchDealerships(); }
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('dealerships').delete().in('id', ids);
    if (error) toast.error('Error al eliminar concesionarios');
    else { toast.success(`${ids.length} concesionario(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchDealerships(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'brand': if (bulkBrand.length === 0) return; payload = { brand: bulkBrand }; break;
      case 'city': payload = { city: bulkCity.trim() || null }; break;
      case 'state': payload = { state: (!bulkState || bulkState === '__clear') ? null : bulkState }; break;
      case 'isServiceCenter': payload = { is_service_center: bulkIsServiceCenter }; break;
      case 'bays': if (!bulkBays) return; payload = { bays: parseInt(bulkBays) || 1 }; break;
      case 'openingHour': payload = { opening_hour: bulkOpeningHour }; break;
      case 'closingHour': payload = { closing_hour: bulkClosingHour }; break;
      case 'isActive': payload = { is_active: bulkIsActive }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Concesionarios</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <MapPin className="w-3 h-3" /> {filteredDealerships.length}
          </Badge>
        </div>
        {canCreate && (
          <Button size="sm" onClick={openCreate} className="imb-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filterBrand} onValueChange={v => { setFilterBrand(v); setSelectedIds(new Set()); }}>
          <TabsList className="h-8">
            <TabsTrigger value="todos" className="text-xs px-3 h-6">Todas</TabsTrigger>
            <TabsTrigger value="GAC" className="text-xs px-3 h-6">GAC</TabsTrigger>
            <TabsTrigger value="DFSK" className="text-xs px-3 h-6">DFSK</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="imb-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando concesionarios...</p>
          </CardContent>
        ) : filteredDealerships.length === 0 ? (
          <CardContent className="p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay concesionarios</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="w-8 pl-3">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer"
                    checked={filteredDealerships.length > 0 && filteredDealerships.every(d => selectedIds.has(d.id))}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Centro Serv.</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDealerships.map(d => (
                <TableRow key={d.id} className={cn("[&>td]:py-1.5 cursor-pointer hover:bg-muted/50", selectedIds.has(d.id) && "bg-primary/5")} onClick={() => { setDetailDealer(d); setDetailOpen(true); }}>
                  <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer"
                      checked={selectedIds.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{d.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(d.brand || []).map(b => (
                        <Badge key={b} variant="outline" className={`text-[10px] px-1.5 py-0 ${b === 'GAC' ? 'border-primary text-primary' : 'border-orange-500 text-orange-600'}`}>
                          {b}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {d.is_service_center ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-emerald-500 text-emerald-600">
                        <Wrench className="w-2.5 h-2.5" /> Sí
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>{d.city || '-'}</TableCell>
                  <TableCell>{d.state || '-'}</TableCell>
                  <TableCell>{d.phone || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {d.email && <span title={d.email}><Mail className="w-3 h-3 text-muted-foreground" /></span>}
                      {d.instagram && <span title={d.instagram}><Instagram className="w-3 h-3 text-muted-foreground" /></span>}
                      {d.website && <span title={d.website}><Globe className="w-3 h-3 text-muted-foreground" /></span>}
                      {!d.email && !d.instagram && !d.website && '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {d.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(d); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {detailDealer?.name}
            </DialogTitle>
          </DialogHeader>
          {detailDealer && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                {(detailDealer.brand || []).map(b => (
                  <Badge key={b} variant="outline" className={`text-xs px-2 py-0.5 ${b === 'GAC' ? 'border-primary text-primary' : 'border-orange-500 text-orange-600'}`}>
                    {b}
                  </Badge>
                ))}
                {detailDealer.is_service_center && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5 gap-1 border-emerald-500 text-emerald-600">
                    <Wrench className="w-3 h-3" /> Centro de Servicio
                  </Badge>
                )}
                <Badge variant={detailDealer.is_active ? 'default' : 'secondary'} className="text-xs px-2 py-0.5">
                  {detailDealer.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm">
                {detailDealer.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{detailDealer.address}</span>
                  </div>
                )}
                {(detailDealer.city || detailDealer.state) && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{[detailDealer.city, detailDealer.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {detailDealer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{detailDealer.phone}</span>
                  </div>
                )}
                {detailDealer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{detailDealer.email}</span>
                  </div>
                )}
                {detailDealer.instagram && (
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{detailDealer.instagram}</span>
                  </div>
                )}
                {detailDealer.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{detailDealer.website}</span>
                  </div>
                )}
                {detailDealer.google_maps_url && (
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a href={detailDealer.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[300px]">
                      Ver en Google Maps
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    {detailDealer.schedule || `${String(detailDealer.opening_hour ?? 8).padStart(2, '0')}:00 – ${String(detailDealer.closing_hour ?? 17).padStart(2, '0')}:00`}
                    {detailDealer.schedule && ` (citas: ${String(detailDealer.opening_hour ?? 8).padStart(2, '0')}:00 – ${String((detailDealer.closing_hour ?? 17) - 1).padStart(2, '0')}:00)`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Bahías: {detailDealer.bays}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {canDelete && detailDealer && (
              <Button variant="destructive" size="sm" className="mr-auto" onClick={() => { setDetailOpen(false); setDeleteTarget(detailDealer); }}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cerrar</Button>
            {canEdit && (
              <Button className="imb-gradient" onClick={() => { setDetailOpen(false); if (detailDealer) openEdit(detailDealer); }}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Concesionario' : 'Nuevo Concesionario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Marcas *</Label>
              <div className="flex items-center gap-4">
                {['GAC', 'DFSK'].map(b => (
                  <label key={b} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formBrand.includes(b)}
                      onChange={e => {
                        if (e.target.checked) setFormBrand(prev => [...prev, b]);
                        else setFormBrand(prev => prev.filter(x => x !== b));
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-medium">{b}</span>
                  </label>
                ))}
              </div>
              {formBrand.length === 0 && <p className="text-xs text-destructive">Selecciona al menos una marca</p>}
            </div>
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: GAC Motor Caracas Centro" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Input value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="Caracas" />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input value={formState} onChange={e => setFormState(e.target.value)} placeholder="Distrito Capital" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Av. Francisco de Miranda, Chacao" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="(0412) 123 4567" />
              </div>
              <div className="space-y-2">
                <Label>Correo</Label>
                <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input value={formInstagram} onChange={e => setFormInstagram(e.target.value)} placeholder="@cuenta" />
              </div>
              <div className="space-y-2">
                <Label>Sitio Web</Label>
                <Input value={formWebsite} onChange={e => setFormWebsite(e.target.value)} placeholder="www.ejemplo.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" /> Ubicación Google Maps
              </Label>
              <Input value={formGoogleMapsUrl} onChange={e => setFormGoogleMapsUrl(e.target.value)} placeholder="https://maps.google.com/..." />
              <p className="text-xs text-muted-foreground">Pega el enlace de Google Maps para que los clientes puedan ver la ubicación</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Bahías</Label>
                <Input type="number" value={formBays} onChange={e => setFormBays(e.target.value)} placeholder="3" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Apertura</Label>
                <Select value={String(formOpeningHour)} onValueChange={v => setFormOpeningHour(Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 6).map(h => (
                      <SelectItem key={h} value={String(h)}>{h.toString().padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Cierre</Label>
                <Select value={String(formClosingHour)} onValueChange={v => setFormClosingHour(Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 6).map(h => (
                      <SelectItem key={h} value={String(h)}>{h.toString().padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Horario (texto)</Label>
              <Input value={formSchedule} onChange={e => setFormSchedule(e.target.value)} placeholder="8:00 AM - 5:00 PM" />
              <p className="text-xs text-muted-foreground">Texto descriptivo del horario (informativo). Los bloques de cita se generan con Apertura/Cierre.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Centro de Servicio</Label>
                <p className="text-xs text-muted-foreground">Este concesionario también opera como centro de servicio</p>
              </div>
              <Switch checked={formIsServiceCenter} onCheckedChange={setFormIsServiceCenter} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Activo</Label>
                <p className="text-xs text-muted-foreground">Concesionario disponible en el sistema</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="imb-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background border shadow-lg rounded-full px-4 py-2 overflow-x-auto max-w-[95vw]">
          <span className="text-xs font-medium text-muted-foreground shrink-0">{selectedIds.size} sel.</span>
          <div className="w-px h-4 bg-border shrink-0" />
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkBrand(['GAC']); setBulkAction('brand'); }}>
            <Tag className="w-3 h-3" /> Marca
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkCity(''); setBulkAction('city'); }}>
            <MapPin className="w-3 h-3" /> Ciudad
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkState(''); setBulkAction('state'); }}>
            <MapPin className="w-3 h-3" /> Estado
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkIsServiceCenter(false); setBulkAction('isServiceCenter'); }}>
            <Wrench className="w-3 h-3" /> C.Servicio
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkBays('3'); setBulkAction('bays'); }}>
            <Car className="w-3 h-3" /> Bahías
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkOpeningHour(8); setBulkAction('openingHour'); }}>
            <Clock className="w-3 h-3" /> Apertura
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkClosingHour(17); setBulkAction('closingHour'); }}>
            <Clock className="w-3 h-3" /> Cierre
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkIsActive(true); setBulkAction('isActive'); }}>
            <Power className="w-3 h-3" /> Estado
          </Button>
          {canDelete && (
            <Button variant="destructive" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => setBulkConfirmDeleteOpen(true)}>
              <Trash2 className="w-3 h-3" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Bulk action dialog */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) setBulkAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">
              Acción masiva — {selectedIds.size} concesionario(s)
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            {bulkAction === 'brand' && (
              <div className="space-y-2">
                <Label>Marcas</Label>
                <div className="flex items-center gap-4">
                  {['GAC', 'DFSK'].map(b => (
                    <label key={b} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkBrand.includes(b)}
                        onChange={e => {
                          if (e.target.checked) setBulkBrand(prev => [...prev, b]);
                          else setBulkBrand(prev => prev.filter(x => x !== b));
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary"
                      />
                      <span className="text-sm font-medium">{b}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {bulkAction === 'city' && (
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Input value={bulkCity} onChange={e => setBulkCity(e.target.value)} placeholder="Ej: Caracas" autoFocus />
              </div>
            )}
            {bulkAction === 'state' && (
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={bulkState || '__clear'} onValueChange={setBulkState}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear">— Limpiar estado —</SelectItem>
                    {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'isServiceCenter' && (
              <div className="flex items-center justify-between">
                <Label>Centro de Servicio</Label>
                <Switch checked={bulkIsServiceCenter} onCheckedChange={setBulkIsServiceCenter} />
              </div>
            )}
            {bulkAction === 'bays' && (
              <div className="space-y-2">
                <Label>Número de Bahías</Label>
                <Input type="number" min={1} value={bulkBays} onChange={e => setBulkBays(e.target.value)} autoFocus />
              </div>
            )}
            {bulkAction === 'openingHour' && (
              <div className="space-y-2">
                <Label>Hora de Apertura</Label>
                <Select value={String(bulkOpeningHour)} onValueChange={v => setBulkOpeningHour(Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 6).map(h => (
                      <SelectItem key={h} value={String(h)}>{h.toString().padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'closingHour' && (
              <div className="space-y-2">
                <Label>Hora de Cierre</Label>
                <Select value={String(bulkClosingHour)} onValueChange={v => setBulkClosingHour(Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 13 }, (_, i) => i + 6).map(h => (
                      <SelectItem key={h} value={String(h)}>{h.toString().padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'isActive' && (
              <div className="flex items-center justify-between">
                <Label>Estado activo</Label>
                <Switch checked={bulkIsActive} onCheckedChange={setBulkIsActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button onClick={handleBulkApply} disabled={bulkLoading || (bulkAction === 'brand' && bulkBrand.length === 0)} className="imb-gradient">
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} concesionario(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente los concesionarios seleccionados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar concesionario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente <strong>{deleteTarget?.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminConcesionarios;
