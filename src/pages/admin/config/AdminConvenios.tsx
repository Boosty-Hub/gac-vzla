import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { listExternalSources, renameExternalSource, deleteExternalSource, type ExternalSource } from '@/lib/externalSources';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Handshake, Pencil, Trash2, Users, Info } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Convenios = las etiquetas de `clients.external_source` (de qué alianza vino un cliente
 * externo). NO es un módulo nuevo: vive dentro del dominio de Clientes y se gatea con los
 * permisos `clientes.*` que ya existen, igual que la pestaña de clientes externos dentro de
 * AdminClientes. No hay permiso `convenios.*`.
 *
 * Renombrar A -> B cuando B ya existe LOGRA el merge solo: ambos grupos de clientes quedan
 * bajo el mismo texto. No hay una acción de "fusionar" separada.
 *
 * Ver supabase/migrations/20260831150000_convenios_y_portal_externo.sql.
 */

const AdminConvenios = () => {
  const { role, hasPermission } = useAuth();
  const roleName = role?.name?.toLowerCase() ?? '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const canView = isAdmin || hasPermission('clientes.view');
  const canEdit = isAdmin || hasPermission('clientes.edit');
  const canDelete = isAdmin || hasPermission('clientes.delete');

  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [renaming, setRenaming] = useState<ExternalSource | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ExternalSource | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchSources = async () => {
    setLoading(true);
    setSources(await listExternalSources());
    setLoading(false);
  };

  useEffect(() => { if (canView) fetchSources(); }, [canView]);

  const openRename = (s: ExternalSource) => { setRenaming(s); setNewName(s.source); };

  const willMerge = renaming && newName.trim() && newName.trim() !== renaming.source
    && sources.some(s => s.source.toLowerCase() === newName.trim().toLowerCase() && s.source !== renaming.source);

  const handleRename = async () => {
    if (!renaming) return;
    const trimmed = newName.trim();
    if (!trimmed) { toast.error('El nuevo nombre no puede quedar vacío'); return; }
    if (trimmed === renaming.source) { setRenaming(null); return; }
    setSaving(true);
    try {
      const count = await renameExternalSource(renaming.source, trimmed);
      toast.success(`${count} cliente${count === 1 ? '' : 's'} actualizado${count === 1 ? '' : 's'}`);
      setRenaming(null);
      fetchSources();
    } catch (e) {
      toast.error('Error al renombrar el convenio');
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      const count = await deleteExternalSource(deleting.source);
      toast.success(`${count} cliente${count === 1 ? '' : 's'} quedó${count === 1 ? '' : 'aron'} sin convenio`);
      setDeleting(null);
      fetchSources();
    } catch (e) {
      toast.error('Error al eliminar el convenio');
      console.error(e);
    }
    setRemoving(false);
  };

  if (!canView) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No tenés permiso para ver esta pantalla.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Convenios</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Handshake className="w-3 h-3" /> {sources.length}
          </Badge>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-xs flex gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
        <p className="text-muted-foreground">
          Un convenio es la alianza por la que llegó un cliente externo (por ejemplo, una
          aseguradora). Se cargan desde la pestaña de clientes externos en Clientes. Acá podés
          renombrarlos o eliminarlos. <strong>Renombrar un convenio a un nombre que ya existe los
          fusiona</strong>: todos los clientes de ambos quedan bajo el nombre nuevo, sin ninguna
          acción extra.
        </p>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando convenios...</p>
          </CardContent>
        ) : sources.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Handshake className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Todavía no hay convenios cargados</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Convenio</TableHead>
                <TableHead>Clientes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map(s => (
                <TableRow key={s.source} className="[&>td]:py-1.5">
                  <TableCell className="font-medium">{s.source}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {s.clientes}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openRename(s)} title="Renombrar">
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleting(s)} title="Eliminar">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* RENAME DIALOG */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Renombrar Convenio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nombre actual</Label>
              <Input value={renaming?.source ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Nombre nuevo *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Seguros Caracas" />
            </div>
            {willMerge && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                Ya existe un convenio llamado <strong>"{newName.trim()}"</strong>. Al guardar, los
                clientes de <strong>"{renaming?.source}"</strong> se van a fusionar con los de ese
                convenio: todos van a quedar bajo el mismo nombre.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Esto actualiza a los {renaming?.clientes} cliente{renaming?.clientes === 1 ? '' : 's'} que tienen este convenio.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button onClick={handleRename} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM DIALOG */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Eliminar Convenio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            ¿Estás seguro de eliminar <strong>{deleting?.source}</strong>? Los{' '}
            <strong>{deleting?.clientes} cliente{deleting?.clientes === 1 ? '' : 's'}</strong> que
            tienen este convenio van a quedar <strong>sin convenio asignado</strong>. Los clientes
            no se borran ni dejan de ser externos, solo pierden esta etiqueta. Esta acción no se
            puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={removing}>
              {removing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConvenios;
