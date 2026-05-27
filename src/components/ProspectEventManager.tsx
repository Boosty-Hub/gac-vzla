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

interface ProspectEventRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface ProspectEventManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventsChanged?: () => void;
}

const ProspectEventManager = ({ open, onOpenChange, onEventsChanged }: ProspectEventManagerProps) => {
  const [events, setEvents] = useState<ProspectEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectEventRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [fName, setFName] = useState('');
  const [fOrder, setFOrder] = useState(0);
  const [fActive, setFActive] = useState(true);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectEventRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_events' as any)
      .select('*')
      .order('sort_order')
      .order('name');
    setEvents((data || []) as unknown as ProspectEventRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchEvents();
  }, [open]);

  const openCreate = () => {
    setEditing(null);
    setFName('');
    setFOrder(events.length > 0 ? Math.max(...events.map(e => e.sort_order)) + 1 : 1);
    setFActive(true);
    setFormOpen(true);
  };

  const openEdit = (ev: ProspectEventRow) => {
    setEditing(ev);
    setFName(ev.name);
    setFOrder(ev.sort_order);
    setFActive(ev.is_active);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim()) { toast.error('El nombre del evento es requerido'); return; }
    setSaving(true);
    const payload = { name: fName.trim(), sort_order: fOrder, is_active: fActive };
    if (editing) {
      const { error } = await (supabase.from('prospect_events' as any) as any).update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar evento'); console.error(error); }
      else { toast.success('Evento actualizado'); setFormOpen(false); fetchEvents(); onEventsChanged?.(); }
    } else {
      const { error } = await (supabase.from('prospect_events' as any) as any).insert(payload);
      if (error) {
        if ((error as any).code === '23505') toast.error('Ya existe un evento con ese nombre');
        else toast.error('Error al crear evento');
        console.error(error);
      } else {
        toast.success('Evento creado');
        setFormOpen(false);
        fetchEvents();
        onEventsChanged?.();
      }
    }
    setSaving(false);
  };

  const confirmDelete = (ev: ProspectEventRow) => {
    setDeleteTarget(ev);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase.from('prospect_events' as any) as any).delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar evento'); console.error(error); }
    else { toast.success('Evento eliminado'); setDeleteOpen(false); setDeleteTarget(null); fetchEvents(); onEventsChanged?.(); }
    setDeleting(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Gestionar Eventos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-[11px] text-muted-foreground">Los eventos creados aquí aparecen en la lista al crear o editar prospectos.</p>
              <Button size="sm" onClick={openCreate} className="gac-gradient gap-1">
                <Plus className="w-3.5 h-3.5" /> Nuevo Evento
              </Button>
            </div>
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : events.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hay eventos registrados</div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                    <TableHead className="w-12">Orden</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map(ev => (
                    <TableRow key={ev.id} className="[&>td]:py-1.5">
                      <TableCell className="text-muted-foreground">{ev.sort_order}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">{ev.name}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {ev.is_active ? <span className="text-green-600">●</span> : <span className="text-muted-foreground/40">●</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(ev)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => confirmDelete(ev)}>
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">{editing ? 'Editar Evento' : 'Nuevo Evento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ej: Exhibición Farmatodo Baruta" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={fOrder} onChange={e => setFOrder(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={fActive} onChange={e => setFActive(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs">Activo</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong>. Los prospectos existentes con este evento conservan el texto.
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

export default ProspectEventManager;
