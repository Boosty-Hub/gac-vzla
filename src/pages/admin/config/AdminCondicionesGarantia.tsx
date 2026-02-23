import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ShieldCheck, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WarrantyCondition {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
  description: string | null;
  is_active: boolean;
}

const AdminCondicionesGarantia = () => {
  const [conditions, setConditions] = useState<WarrantyCondition[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarrantyCondition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<WarrantyCondition | null>(null);

  const [fName, setFName] = useState('');
  const [fMaxKm, setFMaxKm] = useState('100000');
  const [fMaxMonths, setFMaxMonths] = useState('72');
  const [fIntervalKm, setFIntervalKm] = useState('5000');
  const [fDescription, setFDescription] = useState('');
  const [fActive, setFActive] = useState(true);

  const fetchConditions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('warranty_conditions')
      .select('*')
      .order('name');
    setConditions((data || []) as WarrantyCondition[]);
    setLoading(false);
  };

  useEffect(() => { fetchConditions(); }, []);

  const openCreate = () => {
    setEditing(null);
    setFName(''); setFMaxKm('100000'); setFMaxMonths('72');
    setFIntervalKm('5000'); setFDescription(''); setFActive(true);
    setDialogOpen(true);
  };

  const openEdit = (c: WarrantyCondition) => {
    setEditing(c);
    setFName(c.name);
    setFMaxKm(String(c.max_km));
    setFMaxMonths(String(c.max_months));
    setFIntervalKm(String(c.service_interval_km));
    setFDescription(c.description || '');
    setFActive(c.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim()) { toast.error('El nombre es requerido'); return; }
    if (!parseInt(fMaxKm) || !parseInt(fMaxMonths) || !parseInt(fIntervalKm)) {
      toast.error('Los valores numéricos son requeridos'); return;
    }
    setSaving(true);
    const payload = {
      name: fName.trim(),
      max_km: parseInt(fMaxKm),
      max_months: parseInt(fMaxMonths),
      service_interval_km: parseInt(fIntervalKm),
      description: fDescription.trim() || null,
      is_active: fActive,
    };

    if (editing) {
      const { error } = await supabase.from('warranty_conditions').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar'); console.error(error); }
      else { toast.success('Condición actualizada'); setDialogOpen(false); fetchConditions(); }
    } else {
      const { error } = await supabase.from('warranty_conditions').insert(payload);
      if (error) { toast.error('Error al crear'); console.error(error); }
      else { toast.success('Condición creada'); setDialogOpen(false); fetchConditions(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('warranty_conditions').delete().eq('id', deleteConfirm.id);
    if (error) { toast.error('Error al eliminar'); console.error(error); }
    else { toast.success('Condición eliminada'); fetchConditions(); }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-display font-bold">Condiciones de Garantía</h1>
          <p className="text-xs text-muted-foreground">Define las reglas para validar garantías de vehículos</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gac-gradient">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Condición
        </Button>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando...</p>
          </CardContent>
        ) : conditions.length === 0 ? (
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay condiciones de garantía</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Nombre</TableHead>
                <TableHead>Km Máx</TableHead>
                <TableHead>Meses Máx</TableHead>
                <TableHead>Intervalo Servicio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conditions.map(c => (
                <TableRow key={c.id} className="[&>td]:py-1.5">
                  <TableCell className="font-medium">
                    <div>{c.name}</div>
                    {c.description && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.description}</p>}
                  </TableCell>
                  <TableCell>{c.max_km.toLocaleString()} km</TableCell>
                  <TableCell>{c.max_months} meses ({(c.max_months / 12).toFixed(0)} años)</TableCell>
                  <TableCell>Cada {c.service_interval_km.toLocaleString()} km</TableCell>
                  <TableCell>
                    <Badge className={cn("text-[10px] px-1.5 py-0", c.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>
                      {c.is_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(c)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteConfirm(c)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* CREATE/EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Condición' : 'Nueva Condición de Garantía'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ej: Garantía Estándar GAC" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Km Máximo *</Label>
                <Input type="number" value={fMaxKm} onChange={e => setFMaxKm(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Meses Máximo *</Label>
                <Input type="number" value={fMaxMonths} onChange={e => setFMaxMonths(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Intervalo Servicio (km) *</Label>
                <Input type="number" value={fIntervalKm} onChange={e => setFIntervalKm(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea value={fDescription} onChange={e => setFDescription(e.target.value)} rows={2} className="text-xs" placeholder="Descripción de las condiciones..." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fActive} onCheckedChange={setFActive} />
              <Label className="text-xs">Activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar Cambios' : 'Crear Condición'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Eliminar Condición</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Estás seguro de eliminar <strong>{deleteConfirm?.name}</strong>? Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCondicionesGarantia;
