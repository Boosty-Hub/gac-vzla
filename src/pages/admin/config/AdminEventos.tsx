import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

interface ProspectEvent {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const AdminEventos = () => {
  const [events, setEvents] = useState<ProspectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectEvent | null>(null);
  const [eName, setEName] = useState('');
  const [eSortOrder, setESortOrder] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectEvent | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_events' as any)
      .select('*')
      .order('sort_order')
      .order('name');
    setEvents((data || []) as unknown as ProspectEvent[]);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  const openCreate = () => {
    setEditing(null);
    setEName('');
    // Default sort_order: max existing + 10
    const maxOrder = events.length > 0 ? Math.max(...events.map(e => e.sort_order || 0)) : 0;
    setESortOrder(String(maxOrder + 10));
    setDialogOpen(true);
  };

  const openEdit = (ev: ProspectEvent) => {
    setEditing(ev);
    setEName(ev.name);
    setESortOrder(String(ev.sort_order));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!eName.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const payload = { name: eName.trim(), sort_order: parseInt(eSortOrder) || 0, is_active: true };

    if (editing) {
      const { error } = await supabase
        .from('prospect_events' as any)
        .update(payload)
        .eq('id', editing.id);
      if (error) { toast.error('Error al actualizar evento'); console.error(error); }
      else { toast.success('Evento actualizado'); setDialogOpen(false); fetchEvents(); }
    } else {
      const { error } = await supabase
        .from('prospect_events' as any)
        .insert(payload);
      if (error) { toast.error('Error al crear evento'); console.error(error); }
      else { toast.success('Evento creado'); setDialogOpen(false); fetchEvents(); }
    }
    setSaving(false);
  };

  const handleToggleActive = async (ev: ProspectEvent) => {
    const { error } = await supabase
      .from('prospect_events' as any)
      .update({ is_active: !ev.is_active })
      .eq('id', ev.id);
    if (error) toast.error('Error al actualizar');
    else { toast.success(ev.is_active ? 'Evento desactivado' : 'Evento activado'); fetchEvents(); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('prospect_events' as any)
      .delete()
      .eq('id', deleteTarget.id);
    if (error) toast.error('Error al eliminar evento');
    else { toast.success('Evento eliminado'); setDeleteTarget(null); fetchEvents(); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los eventos disponibles para clasificar prospectos (exhibiciones, ferias, etc.)
          </p>
        </div>
        <Button size="sm" className="gac-gradient gap-1.5" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nuevo Evento
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Cargando...</div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarDays className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No hay eventos configurados</p>
            <p className="text-xs text-muted-foreground mb-4">Crea tu primer evento para clasificar prospectos</p>
            <Button size="sm" className="gac-gradient gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Crear Evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <Card key={ev.id} className={!ev.is_active ? 'opacity-60' : ''}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ev.name}</p>
                    <p className="text-xs text-muted-foreground">Orden: {ev.sort_order}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={ev.is_active ? 'default' : 'secondary'}
                    className="text-xs cursor-pointer select-none"
                    onClick={() => handleToggleActive(ev)}
                  >
                    {ev.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(ev)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(ev)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Evento' : 'Nuevo Evento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre del evento *</Label>
              <Input
                value={eName}
                onChange={e => setEName(e.target.value)}
                placeholder="Ej. Exhibición Farmatodo Baruta"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orden de aparición</Label>
              <Input
                type="number"
                value={eSortOrder}
                onChange={e => setESortOrder(e.target.value)}
                placeholder="100"
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Número más bajo aparece primero en el selector</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" className="gac-gradient" onClick={handleSave} disabled={saving}>
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el evento <strong>{deleteTarget?.name}</strong>. Los prospectos que ya tengan este evento asignado no serán afectados.
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

export default AdminEventos;
