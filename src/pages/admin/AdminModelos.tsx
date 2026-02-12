import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Pencil, Car } from 'lucide-react';
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
}

const BRANDS = ['GAC', 'DFSK', 'SHINERAY'];

const AdminModelos = () => {
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
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
  }, []);

  const openCreateDialog = () => {
    setEditingModel(null);
    setFormName('');
    setFormBrand('GAC');
    setFormYear(new Date().getFullYear().toString());
    setFormEngine('');
    setFormTransmission('');
    setFormIsActive(true);
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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre del modelo es requerido');
      return;
    }
    setSaving(true);

    const payload = {
      name: formName.trim(),
      brand: formBrand,
      year: formYear ? parseInt(formYear) : null,
      engine: formEngine.trim() || null,
      transmission: formTransmission.trim() || null,
      is_active: formIsActive,
    };

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

  const filteredModels = models.filter(m =>
    !busqueda ||
    m.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.brand.toLowerCase().includes(busqueda.toLowerCase()) ||
    (m.engine || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display font-bold">Modelos de Vehículos</h1>
        <Button size="sm" onClick={openCreateDialog} className="gac-gradient">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar nombre, marca o motor..."
          className="pl-8 h-8 text-xs"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando modelos...</p>
          </CardContent>
        ) : filteredModels.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron modelos</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Motor</TableHead>
                <TableHead>Transmisión</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.map(m => (
                <TableRow key={m.id} className="[&>td]:py-1.5">
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{m.brand}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.engine || '-'}</TableCell>
                  <TableCell>{m.transmission || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {m.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(m)}>
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
        <DialogContent>
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
            <div className="flex items-center justify-between">
              <div>
                <Label>Estado</Label>
                <p className="text-xs text-muted-foreground">Modelo activo en el catálogo</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingModel ? 'Guardar Cambios' : 'Crear Modelo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminModelos;
