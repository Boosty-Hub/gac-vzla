import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Wrench, Plus, Pencil, Trash2, Clock, Star } from 'lucide-react';
import { toast } from 'sonner';

interface ServiceType {
  id: number;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  sends_postventa_survey: boolean;
  created_at: string;
}

const AdminServicios = () => {
  const [services, setServices] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ServiceType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ServiceType | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formDuration, setFormDuration] = useState('60');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSendsSurvey, setFormSendsSurvey] = useState(true);

  const fetchServices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('service_types')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Error al cargar servicios');
      console.error(error);
    } else {
      setServices(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchServices(); }, []);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDuration('60');
    setFormIsActive(true);
    setFormSendsSurvey(true);
    setDialogOpen(true);
  };

  const openEdit = (s: ServiceType) => {
    setEditing(s);
    setFormName(s.name);
    setFormDuration(String(s.duration_minutes));
    setFormIsActive(s.is_active);
    setFormSendsSurvey(s.sends_postventa_survey ?? true);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('El nombre es requerido'); return; }
    const duration = parseInt(formDuration);
    if (!duration || duration < 15) { toast.error('La duración mínima es 15 minutos'); return; }
    setSaving(true);

    const payload = {
      name: formName.trim(),
      duration_minutes: duration,
      is_active: formIsActive,
      sends_postventa_survey: formSendsSurvey,
    };

    if (editing) {
      const { error } = await supabase.from('service_types').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar'); console.error(error); }
      else { toast.success('Servicio actualizado'); setDialogOpen(false); fetchServices(); }
    } else {
      const { error } = await supabase.from('service_types').insert(payload);
      if (error) { toast.error('Error al crear'); console.error(error); }
      else { toast.success('Servicio creado'); setDialogOpen(false); fetchServices(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase.from('service_types').delete().eq('id', deleteConfirm.id);
    if (error) { toast.error('Error al eliminar'); console.error(error); }
    else { toast.success('Servicio eliminado'); fetchServices(); }
    setDeleteConfirm(null);
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Tipos de Servicio</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Wrench className="w-3 h-3" /> {services.length}
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
            <p className="text-sm text-muted-foreground">Cargando servicios...</p>
          </CardContent>
        ) : services.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay tipos de servicio</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Nombre</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Encuesta postventa</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map(s => (
                <TableRow key={s.id} className="[&>td]:py-1.5">
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {formatDuration(s.duration_minutes)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.sends_postventa_survey ?? true ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                        <Star className="w-2.5 h-2.5" /> Sí
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">No se envía</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(s)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(s)}>
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Cambio de aceite" />
            </div>
            <div className="space-y-2">
              <Label>Duración (minutos) *</Label>
              <Input type="number" min={15} step={15} value={formDuration} onChange={e => setFormDuration(e.target.value)} placeholder="60" />
              <p className="text-xs text-muted-foreground">
                {parseInt(formDuration) > 0 ? formatDuration(parseInt(formDuration)) : '—'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Activo</Label>
                <p className="text-xs text-muted-foreground">Disponible para reservas</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Enviar encuesta de postventa</Label>
                <p className="text-xs text-muted-foreground">
                  Al marcar la cita como Completada. Apagalo para reclamos o gestiones donde
                  preguntar por la experiencia no aplica.
                </p>
              </div>
              <Switch checked={formSendsSurvey} onCheckedChange={setFormSendsSurvey} />
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

      {/* DELETE CONFIRM DIALOG */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Eliminar Servicio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            ¿Estás seguro de eliminar <strong>{deleteConfirm?.name}</strong>? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServicios;
