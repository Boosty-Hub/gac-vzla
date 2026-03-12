import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Shield, Plus, Pencil, Users, Eye, Trash2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  _count?: number;
}

interface Permission {
  id: string;
  name: string;
  module: string;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
}

const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

const ACTION_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
  view: { label: 'Ver', icon: Eye },
  create: { label: 'Crear', icon: Plus },
  edit: { label: 'Editar', icon: Pencil },
  delete: { label: 'Eliminar', icon: Trash2 },
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  clientes: 'Clientes',
  vehiculos: 'Vehículos',
  modelos: 'Modelos',
  concesionarios: 'Concesionarios',
  reservas: 'Reservas',
  garantias: 'Garantías',
  historial: 'Historial',
  prospectos: 'Prospectos',
  usuarios: 'Usuarios',
  roles: 'Roles',
};

const AdminRoles = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Role create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Permissions dialog
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [permChecked, setPermChecked] = useState<Set<string>>(new Set());
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      supabase.from('roles').select('*, profiles(count)').order('name'),
      supabase.from('permissions').select('id, name, module').order('module').order('name'),
      supabase.from('role_permissions').select('role_id, permission_id'),
    ]);

    setRoles((rolesRes.data || []).map((r: any) => ({
      ...r,
      _count: r.profiles?.[0]?.count ?? 0,
    })));
    setPermissions(permsRes.data || []);
    setRolePermissions(rpRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Role CRUD
  const openCreate = () => {
    setEditingRole(null);
    setFormName('');
    setFormDescription('');
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setFormName(role.name);
    setFormDescription(role.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const payload = { name: formName.trim(), description: formDescription.trim() || null };

    if (editingRole) {
      const { error } = await supabase.from('roles').update(payload).eq('id', editingRole.id);
      if (error) { toast.error('Error al actualizar rol'); console.error(error); }
      else { toast.success('Rol actualizado'); setDialogOpen(false); fetchAll(); }
    } else {
      const { error } = await supabase.from('roles').insert(payload);
      if (error) { toast.error('Error al crear rol'); console.error(error); }
      else { toast.success('Rol creado'); setDialogOpen(false); fetchAll(); }
    }
    setSaving(false);
  };

  // Permissions assignment
  const openPermissions = (role: Role) => {
    setPermRole(role);
    const currentPerms = rolePermissions
      .filter(rp => rp.role_id === role.id)
      .map(rp => rp.permission_id);
    setPermChecked(new Set(currentPerms));
    setPermDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setPermChecked(prev => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const toggleModule = (mod: string) => {
    const modPerms = permissions.filter(p => p.module === mod);
    const allChecked = modPerms.every(p => permChecked.has(p.id));
    setPermChecked(prev => {
      const next = new Set(prev);
      modPerms.forEach(p => {
        if (allChecked) next.delete(p.id);
        else next.add(p.id);
      });
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!permRole) return;
    setSavingPerms(true);

    // Delete existing role_permissions for this role
    const { error: delError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', permRole.id);

    if (delError) {
      toast.error('Error al actualizar permisos');
      console.error(delError);
      setSavingPerms(false);
      return;
    }

    // Insert new ones
    if (permChecked.size > 0) {
      const inserts = [...permChecked].map(pid => ({
        role_id: permRole.id,
        permission_id: pid,
      }));
      const { error: insError } = await supabase.from('role_permissions').insert(inserts);
      if (insError) {
        toast.error('Error al guardar permisos');
        console.error(insError);
        setSavingPerms(false);
        return;
      }
    }

    toast.success(`Permisos de "${permRole.name}" actualizados`);
    setPermDialogOpen(false);
    fetchAll();
    setSavingPerms(false);
  };

  // Helpers
  const modules = [...new Set(permissions.map(p => p.module))];

  const getRolePermCount = (roleId: string) =>
    rolePermissions.filter(rp => rp.role_id === roleId).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display font-bold">Roles</h1>
        <Button size="sm" onClick={openCreate} className="gac-gradient">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
        </Button>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando roles...</p>
          </CardContent>
        ) : roles.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay roles</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Rol</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Permisos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(r => (
                <TableRow key={r.id} className="[&>td]:py-1.5">
                  <TableCell className="font-medium capitalize">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {r._count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <KeyRound className="w-2.5 h-2.5" /> {getRolePermCount(r.id)}/{permissions.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPermissions(r)} title="Asignar permisos">
                        <KeyRound className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(r)} title="Editar rol">
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* CREATE/EDIT ROLE DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingRole ? 'Editar Rol' : 'Nuevo Rol'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: admin" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descripción del rol" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingRole ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PERMISSIONS ASSIGNMENT DIALOG */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Permisos del rol: <span className="capitalize text-primary">{permRole?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Selecciona los permisos que tendrá este rol. {permChecked.size} de {permissions.length} seleccionados.
          </p>
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="min-w-[130px]">Módulo</TableHead>
                {ACTIONS.map(a => {
                  const { label, icon: Icon } = ACTION_LABELS[a];
                  return (
                    <TableHead key={a} className="text-center w-[70px]">
                      <div className="flex items-center justify-center gap-1">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                    </TableHead>
                  );
                })}
                <TableHead className="text-center w-[60px]">Todos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map(mod => {
                const modPerms = permissions.filter(p => p.module === mod);
                const allChecked = modPerms.every(p => permChecked.has(p.id));
                const someChecked = modPerms.some(p => permChecked.has(p.id));
                return (
                  <TableRow key={mod} className="[&>td]:py-2">
                    <TableCell className="font-medium">{MODULE_LABELS[mod] || mod}</TableCell>
                    {ACTIONS.map(a => {
                      const perm = permissions.find(p => p.name === `${mod}.${a}`);
                      if (!perm) return <TableCell key={a} className="text-center"><span className="text-muted-foreground/30">—</span></TableCell>;
                      return (
                        <TableCell key={a} className="text-center">
                          <Checkbox
                            checked={permChecked.has(perm.id)}
                            onCheckedChange={() => togglePerm(perm.id)}
                            className="mx-auto"
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={() => toggleModule(mod)}
                        className="mx-auto"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePerms} disabled={savingPerms} className="gac-gradient">
              {savingPerms ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar Permisos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRoles;
