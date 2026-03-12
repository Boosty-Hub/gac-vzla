import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Phone } from 'lucide-react';
import { toast } from 'sonner';

interface Salesperson {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
}

interface SalespersonManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSalespersonsChanged?: () => void;
}

const SalespersonManager = ({ open, onOpenChange, onSalespersonsChanged }: SalespersonManagerProps) => {
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Salesperson | null>(null);
  const [saving, setSaving] = useState(false);
  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fActive, setFActive] = useState(true);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Salesperson | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSalespersons = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('salespersons' as any)
      .select('*')
      .order('name');
    setSalespersons((data || []) as unknown as Salesperson[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchSalespersons();
  }, [open]);

  const openCreate = () => {
    setEditing(null);
    setFName('');
    setFPhone('');
    setFActive(true);
    setFormOpen(true);
  };

  const openEdit = (s: Salesperson) => {
    setEditing(s);
    setFName(s.name);
    setFPhone(s.phone || '');
    setFActive(s.is_active);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);

    const payload = {
      name: fName.trim(),
      phone: fPhone.trim() || null,
      is_active: fActive,
    };

    if (editing) {
      const { error } = await (supabase.from('salespersons' as any) as any).update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar vendedor'); console.error(error); }
      else { toast.success('Vendedor actualizado'); setFormOpen(false); fetchSalespersons(); onSalespersonsChanged?.(); }
    } else {
      const { error } = await (supabase.from('salespersons' as any) as any).insert(payload);
      if (error) { toast.error('Error al crear vendedor'); console.error(error); }
      else { toast.success('Vendedor creado'); setFormOpen(false); fetchSalespersons(); onSalespersonsChanged?.(); }
    }
    setSaving(false);
  };

  const confirmDelete = (s: Salesperson) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase.from('salespersons' as any) as any).delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar vendedor'); console.error(error); }
    else { toast.success('Vendedor eliminado'); setDeleteOpen(false); setDeleteTarget(null); fetchSalespersons(); onSalespersonsChanged?.(); }
    setDeleting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Gestionar Vendedores</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreate} className="gac-gradient gap-1">
                <Plus className="w-3.5 h-3.5" /> Nuevo Vendedor
              </Button>
            </div>
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : salespersons.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hay vendedores registrados</div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salespersons.map(s => (
                    <TableRow key={s.id} className="[&>td]:py-1.5">
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        {s.phone ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-2.5 h-2.5" />{s.phone}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.is_active ? 'text-green-700 border-green-300' : 'text-muted-foreground'}>
                          {s.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
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

      {/* CREATE/EDIT FORM */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">{editing ? 'Editar Vendedor' : 'Nuevo Vendedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Nombre del vendedor" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="+58 412 1234567" className="h-8 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={fActive} onCheckedChange={setFActive} />
              <Label className="text-xs">Activo</Label>
            </div>
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
            <AlertDialogTitle>¿Eliminar vendedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará al vendedor <strong>{deleteTarget?.name}</strong>. Los prospectos asignados a este vendedor conservarán su referencia.
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

export default SalespersonManager;
