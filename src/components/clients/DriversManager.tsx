import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pencil, Plus, Search, Trash2, User } from 'lucide-react';
import { filterDrivers, findDuplicateDriver, formatDriverName, type DriverOption } from '@/lib/drivers';

/**
 * Driver roster for a fleet client (R5), plus the name-search half of R9.
 *
 * Drivers are deactivated, never hard-deleted: `vehicles.driver_id` is ON DELETE SET NULL,
 * so a real delete would silently erase the historical record of who drove a vehicle. The
 * unique index that stops duplicate names is partial (`WHERE is_active`), which means a
 * deactivated name is free to be reused — exactly the behaviour you want when someone
 * leaves and is later rehired.
 */

interface DriversManagerProps {
  clientId: string;
  /** Bumped by the parent to force a refetch after an external change (e.g. a vehicle reassignment). */
  reloadKey?: number;
  /** Notifies the parent that the roster changed, so vehicle dropdowns can refresh. */
  onDriversChanged?: () => void;
  canEdit: boolean;
  /** Rendered above the list. Used by the client portal to explain what drivers are for. */
  hint?: string;
}

const DriversManager = ({ clientId, reloadKey = 0, onDriversChanged, canEdit, hint }: DriversManagerProps) => {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DriverOption | null>(null);
  const [formName, setFormName] = useState('');
  const [formCedula, setFormCedula] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<DriverOption | null>(null);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    // `drivers` is a new table, not yet in the generated types.ts — `as any` matches this
    // project's established convention for untyped new DB objects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('drivers')
      .select('id, full_name, cedula, phone')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('full_name');
    if (error) {
      console.error(error);
      toast.error('Error al cargar los choferes');
    } else {
      setDrivers((data || []) as DriverOption[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers, reloadKey]);

  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormCedula(''); setFormPhone('');
    setDialogOpen(true);
  };

  const openEdit = (driver: DriverOption) => {
    setEditing(driver);
    setFormName(driver.full_name);
    setFormCedula(driver.cedula || '');
    setFormPhone(driver.phone || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error('El nombre del chofer es requerido');
      return;
    }

    // Catch the duplicate here rather than letting the unique index raise 23505 — the user
    // needs to know WHICH existing driver collided so they can pick that one instead.
    const others = editing ? drivers.filter(d => d.id !== editing.id) : drivers;
    const duplicate = findDuplicateDriver(name, others);
    if (duplicate) {
      toast.error(`"${duplicate.full_name}" ya está registrado para este cliente. Selecciónalo en lugar de crear otro.`);
      return;
    }

    setSaving(true);
    const payload = {
      full_name: formatDriverName(name),
      cedula: formCedula.trim() || null,
      phone: formPhone.trim() || null,
    };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error } = editing
      ? await (supabase as any).from('drivers').update(payload).eq('id', editing.id).select('id')
      : await (supabase as any).from('drivers').insert({ ...payload, client_id: clientId }).select('id');
    /* eslint-enable @typescript-eslint/no-explicit-any */
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error(
        (error as { code?: string }).code === '23505'
          ? 'Ya existe un chofer con ese nombre para este cliente'
          : 'Error al guardar el chofer',
      );
      return;
    }

    toast.success(editing ? 'Chofer actualizado' : 'Chofer agregado');
    setDialogOpen(false);
    fetchDrivers();
    onDriversChanged?.();
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('drivers')
      .update({ is_active: false })
      .eq('id', deactivating.id)
      .select('id');
    setDeactivating(null);

    if (error) {
      console.error(error);
      toast.error('Error al quitar el chofer');
      return;
    }
    if (!data || data.length === 0) {
      toast.error('No se pudo quitar el chofer: tu usuario no tiene permisos sobre este cliente.');
      return;
    }
    toast.success('Chofer quitado. Los vehículos que tenía asignados quedan sin chofer.');
    fetchDrivers();
    onDriversChanged?.();
  };

  const visible = filterDrivers(drivers, search);

  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar chofer por nombre o cédula"
            className="h-8 pl-7 text-xs"
          />
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar chofer
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-6">
          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Cargando choferes...</p>
        </div>
      ) : drivers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Este cliente aún no tiene choferes registrados.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Ningún chofer coincide con "{search}".
        </p>
      ) : (
        <div className="space-y-1.5">
          {visible.map(d => (
            <div key={d.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2 border gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{d.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[d.cedula, d.phone].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                  </p>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)} title="Editar chofer">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-600 hover:text-red-700"
                    onClick={() => setDeactivating(d)}
                    title="Quitar chofer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {editing ? 'Editar chofer' : 'Nuevo chofer'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre completo *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Moisés López"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cédula</Label>
              <Input
                value={formCedula}
                onChange={e => setFormCedula(e.target.value)}
                placeholder="V-12345678"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Recomendada: es lo que distingue a dos choferes con el mismo nombre.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={formPhone}
                onChange={e => setFormPhone(e.target.value)}
                placeholder="+58 412 1234567"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1 h-9" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-9 gac-gradient">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : editing ? 'Guardar' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivating} onOpenChange={open => !open && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar a {deactivating?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de aparecer en la lista de choferes y los vehículos que tenga asignados quedarán
              sin chofer. El historial de servicios no se modifica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDeactivate}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DriversManager;
