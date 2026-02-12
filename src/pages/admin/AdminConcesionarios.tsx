import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { MapPin, Plus, Pencil, Phone, Clock, Car } from 'lucide-react';
import { toast } from 'sonner';

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  schedule: string | null;
  daily_capacity: number;
  is_active: boolean;
  created_at: string;
}

const AdminConcesionarios = () => {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Dealership | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSchedule, setFormSchedule] = useState('8:00 AM - 5:00 PM');
  const [formCapacity, setFormCapacity] = useState('10');
  const [formIsActive, setFormIsActive] = useState(true);

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

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormCity(''); setFormState(''); setFormAddress('');
    setFormPhone(''); setFormSchedule('8:00 AM - 5:00 PM'); setFormCapacity('10'); setFormIsActive(true);
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
    setFormCapacity(String(d.daily_capacity));
    setFormIsActive(d.is_active);
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
      daily_capacity: parseInt(formCapacity) || 10,
      is_active: formIsActive,
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
            <MapPin className="w-3 h-3" /> {dealerships.length}
          </Badge>
        </div>
        <Button size="sm" onClick={openCreate} className="gac-gradient">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
        </Button>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando concesionarios...</p>
          </CardContent>
        ) : dealerships.length === 0 ? (
          <CardContent className="p-8 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay concesionarios</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Nombre</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Cap.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealerships.map(d => (
                <TableRow key={d.id} className="[&>td]:py-1.5">
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.city || '-'}</TableCell>
                  <TableCell>{d.state || '-'}</TableCell>
                  <TableCell>{d.phone || '-'}</TableCell>
                  <TableCell>{d.schedule || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Car className="w-2.5 h-2.5" /> {d.daily_capacity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {d.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(d)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Concesionario' : 'Nuevo Concesionario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="0212-2631234" />
              </div>
              <div className="space-y-2">
                <Label>Capacidad diaria</Label>
                <Input type="number" value={formCapacity} onChange={e => setFormCapacity(e.target.value)} placeholder="10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Horario</Label>
              <Input value={formSchedule} onChange={e => setFormSchedule(e.target.value)} placeholder="8:00 AM - 5:00 PM" />
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
