import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProspectSourceRow {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

interface ProspectSourceManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSourcesChanged?: () => void;
}

const ProspectSourceManager = ({ open, onOpenChange, onSourcesChanged }: ProspectSourceManagerProps) => {
  const [sources, setSources] = useState<ProspectSourceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectSourceRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fLabel, setFLabel] = useState('');
  const [fOrder, setFOrder] = useState(0);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectSourceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSources = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_sources' as any)
      .select('*')
      .order('sort_order');
    setSources((data || []) as unknown as ProspectSourceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchSources();
  }, [open]);

  const generateValue = (label: string) =>
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const openCreate = () => {
    setEditing(null);
    setFLabel('');
    setFOrder(sources.length > 0 ? Math.max(...sources.map(s => s.sort_order)) + 1 : 1);
    setFormOpen(true);
  };

  const openEdit = (s: ProspectSourceRow) => {
    setEditing(s);
    setFLabel(s.label);
    setFOrder(s.sort_order);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!fLabel.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);

    const value = editing ? editing.value : generateValue(fLabel);
    const payload = { value, label: fLabel.trim(), sort_order: fOrder, is_active: true };

    if (editing) {
      const { error } = await (supabase.from('prospect_sources' as any) as any).update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar tipo de contacto'); console.error(error); }
      else { toast.success('Tipo de contacto actualizado'); setFormOpen(false); fetchSources(); onSourcesChanged?.(); }
    } else {
      const { error } = await (supabase.from('prospect_sources' as any) as any).insert(payload);
      if (error) { toast.error('Error al crear tipo de contacto'); console.error(error); }
      else { toast.success('Tipo de contacto creado'); setFormOpen(false); fetchSources(); onSourcesChanged?.(); }
    }
    setSaving(false);
  };

  const confirmDelete = (s: ProspectSourceRow) => {
    setDeleteTarget(s);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase.from('prospect_sources' as any) as any).delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar tipo de contacto'); console.error(error); }
    else { toast.success('Tipo de contacto eliminado'); setDeleteOpen(false); setDeleteTarget(null); fetchSources(); onSourcesChanged?.(); }
    setDeleting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Gestionar Tipos de Contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreate} className="gac-gradient gap-1">
                <Plus className="w-3.5 h-3.5" /> Nuevo Tipo
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
                    <TableHead>Etiqueta</TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(s => (
                    <TableRow key={s.id} className="[&>td]:py-1.5">
                      <TableCell className="text-muted-foreground">{s.sort_order}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 capitalize">{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[10px]">{s.value}</TableCell>
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
            <DialogTitle className="font-display text-sm">{editing ? 'Editar Tipo de Contacto' : 'Nuevo Tipo de Contacto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="Ej: WhatsApp" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={fOrder} onChange={e => setFOrder(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            {fLabel && !editing && (
              <p className="text-[11px] text-muted-foreground">
                Clave generada: <span className="font-mono">{generateValue(fLabel)}</span>
              </p>
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
            <AlertDialogTitle>¿Eliminar tipo de contacto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.label}</strong>. Los prospectos existentes con este tipo no se verán afectados pero mostrarán la clave sin formato.
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

export default ProspectSourceManager;
