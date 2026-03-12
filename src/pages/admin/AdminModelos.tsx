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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, Pencil, Car, ImagePlus, Trash2 } from 'lucide-react';
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
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('modelos.create');
  const canEdit = hasPermission('modelos.edit');
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
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        {canCreate && (
          <Button size="sm" onClick={openCreateDialog} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
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
                <TableHead className="w-12">Foto</TableHead>
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
                  <TableCell>{m.engine || '-'}</TableCell>
                  <TableCell>{m.transmission || '-'}</TableCell>
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
