import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProspectStatusRow {
  id: string;
  name: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

const COLOR_OPTIONS = [
  { value: 'bg-blue-100 text-blue-800', label: 'Azul' },
  { value: 'bg-sky-100 text-sky-800', label: 'Celeste' },
  { value: 'bg-yellow-100 text-yellow-800', label: 'Amarillo' },
  { value: 'bg-indigo-100 text-indigo-800', label: 'Índigo' },
  { value: 'bg-purple-100 text-purple-800', label: 'Morado' },
  { value: 'bg-amber-100 text-amber-800', label: 'Ámbar' },
  { value: 'bg-orange-100 text-orange-800', label: 'Naranja' },
  { value: 'bg-green-100 text-green-800', label: 'Verde' },
  { value: 'bg-red-100 text-red-800', label: 'Rojo' },
  { value: 'bg-gray-100 text-gray-800', label: 'Gris' },
  { value: 'bg-teal-100 text-teal-800', label: 'Teal' },
  { value: 'bg-pink-100 text-pink-800', label: 'Rosa' },
];

interface ProspectStatusManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusesChanged?: () => void;
}

const ProspectStatusManager = ({ open, onOpenChange, onStatusesChanged }: ProspectStatusManagerProps) => {
  const [statuses, setStatuses] = useState<ProspectStatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectStatusRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fLabel, setFLabel] = useState('');
  const [fColor, setFColor] = useState('bg-blue-100 text-blue-800');
  const [fOrder, setFOrder] = useState(0);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectStatusRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStatuses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_statuses' as any)
      .select('*')
      .order('sort_order');
    setStatuses((data || []) as unknown as ProspectStatusRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchStatuses();
  }, [open]);

  const generateName = (label: string) => {
    return label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const openCreate = () => {
    setEditing(null);
    setFLabel('');
    setFColor('bg-blue-100 text-blue-800');
    setFOrder(statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order)) + 1 : 1);
    setFormOpen(true);
  };

  const openEdit = (s: ProspectStatusRow) => {
    setEditing(s);
    setFLabel(s.label);
    setFColor(s.color);
    setFOrder(s.sort_order);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!fLabel.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);

    const name = editing ? editing.name : generateName(fLabel);

    const payload = {
      name,
      label: fLabel.trim(),
      color: fColor,
      sort_order: fOrder,
      is_active: true,
    };

    if (editing) {
      const { error } = await (supabase.from('prospect_statuses' as any) as any).update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar estado'); console.error(error); }
      else { toast.success('Estado actualizado'); setFormOpen(false); fetchStatuses(); onStatusesChanged?.(); }
    } else {
      const { error } = await (supabase.from('prospect_statuses' as any) as any).insert(payload);
      if (error) { toast.error('Error al crear estado'); console.error(error); }
      else { toast.success('Estado creado'); setFormOpen(false); fetchStatuses(); onStatusesChanged?.(); }
    }
    setSaving(false);
  };

  const confirmDelete = (s: ProspectStatusRow) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase.from('prospect_statuses' as any) as any).delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar estado'); console.error(error); }
    else { toast.success('Estado eliminado'); setDeleteOpen(false); setDeleteTarget(null); fetchStatuses(); onStatusesChanged?.(); }
    setDeleting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Gestionar Estados de Prospectos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreate} className="gac-gradient gap-1">
                <Plus className="w-3.5 h-3.5" /> Nuevo Estado
              </Button>
            </div>
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                    <TableHead className="w-10">Orden</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statuses.map(s => (
                    <TableRow key={s.id} className="[&>td]:py-1.5">
                      <TableCell className="text-muted-foreground">{s.sort_order}</TableCell>
                      <TableCell>
                        <Badge className={cn("text-[10px] px-2 py-0.5", s.color)}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[10px]">{s.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(s)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => confirmDelete(s)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE/EDIT STATUS FORM */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">{editing ? 'Editar Estado' : 'Nuevo Estado'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre del estado *</Label>
              <Input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="Ej: En Conversación" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Select value={fColor} onValueChange={setFColor}>
                <SelectTrigger className="h-8 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px] px-1.5 py-0", fColor)}>Vista previa</Badge>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <Badge className={cn("text-[10px] px-1.5 py-0", c.value)}>{c.label}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={fOrder} onChange={e => setFOrder(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            {fLabel && (
              <div className="text-xs text-muted-foreground">
                Vista previa: <Badge className={cn("text-[10px] px-2 py-0.5", fColor)}>{fLabel}</Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar estado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el estado <strong>{deleteTarget?.label}</strong>. Los prospectos que tengan este estado no se verán afectados pero mostrarán el valor sin formato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProspectStatusManager;
