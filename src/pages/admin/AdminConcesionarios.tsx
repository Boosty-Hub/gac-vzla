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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Plus, Pencil, Phone, Clock, Car, Mail, Instagram, Globe, Wrench, Building2 } from 'lucide-react';
import { toast } from 'sonner';

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
  brand: string;
  type: string;
  email: string | null;
  instagram: string | null;
  website: string | null;
  created_at: string;
}

const AdminConcesionarios = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('concesionarios.create');
  const canEdit = hasPermission('concesionarios.edit');
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Dealership | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDealer, setDetailDealer] = useState<Dealership | null>(null);

  const [filterBrand, setFilterBrand] = useState('todos');
  const [filterType, setFilterType] = useState('todos');

  // Form
  const [formName, setFormName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSchedule, setFormSchedule] = useState('8:00 AM - 5:00 PM');
  const [formBays, setFormBays] = useState('3');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formBrand, setFormBrand] = useState('GAC');
  const [formType, setFormType] = useState('concesionario');
  const [formEmail, setFormEmail] = useState('');
  const [formInstagram, setFormInstagram] = useState('');
  const [formWebsite, setFormWebsite] = useState('');

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
      setDealerships(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDealerships(); }, []);

  const filteredDealerships = dealerships.filter(d => {
    if (filterBrand !== 'todos' && d.brand !== filterBrand) return false;
    if (filterType !== 'todos' && d.type !== filterType) return false;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormCity(''); setFormState(''); setFormAddress('');
    setFormPhone(''); setFormSchedule('8:00 AM - 5:00 PM'); setFormBays('3'); setFormIsActive(true);
    setFormBrand('GAC'); setFormType('concesionario'); setFormEmail(''); setFormInstagram(''); setFormWebsite('');
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
    setFormBrand(d.brand);
    setFormType(d.type);
    setFormEmail(d.email || '');
    setFormInstagram(d.instagram || '');
    setFormWebsite(d.website || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('El nombre es requerido'); return; }
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
      type: formType,
      email: formEmail.trim() || null,
      instagram: formInstagram.trim() || null,
      website: formWebsite.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from('dealerships').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar'); console.error(error); }
      else { toast.success('Concesionario actualizado'); setDialogOpen(false); fetchDealerships(); }
    } else {
      const { error } = await supabase.from('dealerships').insert(payload);
      if (error) { toast.error('Error al crear'); console.error(error); }
      else { toast.success('Concesionario creado'); setDialogOpen(false); fetchDealerships(); }
    }
    setSaving(false);
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
          <Button size="sm" onClick={openCreate} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filterBrand} onValueChange={setFilterBrand}>
          <TabsList className="h-8">
            <TabsTrigger value="todos" className="text-xs px-3 h-6">Todas</TabsTrigger>
            <TabsTrigger value="GAC" className="text-xs px-3 h-6">GAC</TabsTrigger>
            <TabsTrigger value="DFSK" className="text-xs px-3 h-6">DFSK</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={filterType} onValueChange={setFilterType}>
          <TabsList className="h-8">
            <TabsTrigger value="todos" className="text-xs px-3 h-6">Todos</TabsTrigger>
            <TabsTrigger value="concesionario" className="text-xs px-3 h-6 gap-1"><Building2 className="w-3 h-3" /> Concesionarios</TabsTrigger>
            <TabsTrigger value="centro_servicio" className="text-xs px-3 h-6 gap-1"><Wrench className="w-3 h-3" /> Centros de Servicio</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="gac-shadow">
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
                <TableHead>Nombre</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Tipo</TableHead>
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
                <TableRow key={d.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => { setDetailDealer(d); setDetailOpen(true); }}>
                  <TableCell className="font-medium max-w-[200px] truncate">{d.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${d.brand === 'GAC' ? 'border-primary text-primary' : 'border-orange-500 text-orange-600'}`}>
                      {d.brand}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      {d.type === 'concesionario' ? <Building2 className="w-2.5 h-2.5" /> : <Wrench className="w-2.5 h-2.5" />}
                      {d.type === 'concesionario' ? 'Concesionario' : 'Centro Servicio'}
                    </Badge>
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
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(d); }}>
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {detailDealer?.type === 'concesionario' ? <Building2 className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
              {detailDealer?.name}
            </DialogTitle>
          </DialogHeader>
          {detailDealer && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs px-2 py-0.5 ${detailDealer.brand === 'GAC' ? 'border-primary text-primary' : 'border-orange-500 text-orange-600'}`}>
                  {detailDealer.brand}
                </Badge>
                <Badge variant="outline" className="text-xs px-2 py-0.5 gap-1">
                  {detailDealer.type === 'concesionario' ? <Building2 className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                  {detailDealer.type === 'concesionario' ? 'Concesionario' : 'Centro de Servicio'}
                </Badge>
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
                {detailDealer.schedule && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{detailDealer.schedule}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Bahías: {detailDealer.bays}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cerrar</Button>
            {canEdit && (
              <Button className="gac-gradient" onClick={() => { setDetailOpen(false); if (detailDealer) openEdit(detailDealer); }}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Concesionario' : 'Nuevo Concesionario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marca *</Label>
                <Select value={formBrand} onValueChange={setFormBrand}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GAC">GAC</SelectItem>
                    <SelectItem value="DFSK">DFSK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concesionario">Concesionario</SelectItem>
                    <SelectItem value="centro_servicio">Centro de Servicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bahías</Label>
                <Input type="number" value={formBays} onChange={e => setFormBays(e.target.value)} placeholder="3" />
              </div>
              <div className="space-y-2">
                <Label>Horario</Label>
                <Input value={formSchedule} onChange={e => setFormSchedule(e.target.value)} placeholder="8:00 AM - 5:00 PM" />
              </div>
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
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConcesionarios;
