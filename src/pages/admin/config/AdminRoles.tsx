import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Shield, Plus, Pencil, Users, Eye, Trash2, KeyRound, AlertTriangle, Lock, Globe, Building } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Role { id: string; name: string; description: string | null; created_at: string; redirect_portal: string | null; _count?: number; }
interface Permission { id: string; name: string; module: string; }
interface RolePermission { role_id: string; permission_id: string; }
interface AssignedUser { id: string; full_name: string | null; email: string; }

// These roles cannot be deleted — they are core to the system
const PROTECTED_ROLES = new Set(['superadmin', 'admin', 'concesionario', 'vendedor', 'cliente']);

const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

const ACTION_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
  view:   { label: 'Ver',      icon: Eye },
  create: { label: 'Crear',    icon: Plus },
  edit:   { label: 'Editar',   icon: Pencil },
  delete: { label: 'Eliminar', icon: Trash2 },
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', clientes: 'Clientes', vehiculos: 'Vehículos',
  modelos: 'Modelos', concesionarios: 'Concesionarios', reservas: 'Reservas',
  garantias: 'Garantías', historial: 'Historial', prospectos: 'Prospectos',
  usuarios: 'Usuarios', roles: 'Roles', eventos: 'Eventos',
};

// Qué módulos muestran el interruptor "Ver todo" / "Solo propio" NO se decide acá: sale de
// `module_scope_catalog`, que lista los módulos cuyas policies de verdad lo obedecen.
// Esta lista antes estaba escrita a mano e incluía siete módulos donde el botón no hacía
// absolutamente nada: el usuario lo prendía y la base seguía recortando por concesionario.
// Atándolo a la base, un módulo sin su policy simplemente no ofrece el botón.

// Portal → name of the template role to copy permissions from when creating a new role
const PORTAL_TEMPLATE_ROLE: Record<string, string> = {
  admin:         'admin',
  concesionario: 'concesionario',
  cliente:       'cliente',
};

// Modules that have real pages per portal.
// concesionario now has ALL modules — permissions determine what's visible, not the portal.
const PORTAL_MODULES: Record<string, string[]> = {
  admin:         ['dashboard','clientes','vehiculos','modelos','concesionarios','reservas','garantias','historial','prospectos','usuarios','roles','eventos'],
  concesionario: ['dashboard','clientes','vehiculos','modelos','concesionarios','reservas','garantias','historial','prospectos','usuarios','roles','eventos'],
  cliente:       ['reservas'],
};

const PORTAL_LABELS: Record<string, string> = {
  admin: 'Admin', concesionario: 'Concesionario', cliente: 'Cliente',
};

const AdminRoles = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Role dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRedirectPortal, setFormRedirectPortal] = useState('concesionario');

  // Permissions dialog
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [permChecked, setPermChecked] = useState<Set<string>>(new Set());
  const [moduleScopes, setModuleScopes] = useState<Record<string, 'own' | 'all'>>({});
  // module → qué significa "Ver todo" ahí. Vacío hasta que carga: si la consulta falla es
  // preferible no ofrecer el interruptor antes que ofrecer uno que no se cumple.
  const [scopeCatalog, setScopeCatalog] = useState<Record<string, string>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [deleteRoleUsers, setDeleteRoleUsers] = useState<AssignedUser[]>([]);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [rolesRes, permsRes, rpRes, catalogRes] = await Promise.all([
      supabase.from('roles').select('*, profiles(count)').order('name'),
      supabase.from('permissions').select('id, name, module').order('module').order('name'),
      supabase.from('role_permissions').select('role_id, permission_id'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('module_scope_catalog').select('module, note').order('sort_order'),
    ]);
    setRoles((rolesRes.data || []).map((r: any) => ({ ...r, _count: r.profiles?.[0]?.count ?? 0 })));
    setPermissions(permsRes.data || []);
    setRolePermissions(rpRes.data || []);
    setScopeCatalog(Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((catalogRes.data as any[]) || []).map(c => [c.module as string, (c.note as string) || '']),
    ));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditingRole(null); setFormName(''); setFormDescription(''); setFormRedirectPortal('concesionario');
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role); setFormName(role.name); setFormDescription(role.description || '');
    setFormRedirectPortal((role as any).redirect_portal || 'concesionario');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const payload = { name: formName.trim(), description: formDescription.trim() || null, redirect_portal: formRedirectPortal };

    if (editingRole) {
      const { error } = await supabase.from('roles').update(payload).eq('id', editingRole.id);
      if (error) { toast.error('Error al actualizar'); } else { toast.success('Rol actualizado'); setDialogOpen(false); fetchAll(); }
    } else {
      const { data: newRole, error } = await supabase.from('roles').insert(payload).select('id').single();
      if (error || !newRole) { toast.error('Error al crear'); setSaving(false); return; }

      // Auto-assign: copy permissions from the template role (same name as the portal)
      const templateRoleName = PORTAL_TEMPLATE_ROLE[formRedirectPortal];
      const templateRole = roles.find(r => r.name.toLowerCase() === templateRoleName?.toLowerCase());
      if (templateRole) {
        const templatePermIds = rolePermissions
          .filter(rp => rp.role_id === templateRole.id)
          .map(rp => rp.permission_id);
        if (templatePermIds.length > 0) {
          await supabase.from('role_permissions').insert(
            templatePermIds.map(pid => ({ role_id: newRole.id, permission_id: pid }))
          );
        }
      }
      toast.success(`Rol creado — se copiaron los permisos de "${templateRoleName || formRedirectPortal}"`);
      setDialogOpen(false); fetchAll();
    }
    setSaving(false);
  };

  const openPermissions = async (role: Role) => {
    setPermRole(role);
    const currentPerms = rolePermissions.filter(rp => rp.role_id === role.id).map(rp => rp.permission_id);
    setPermChecked(new Set(currentPerms));
    // Load module scopes for this role
    const { data: scopes } = await supabase
      .from('role_module_scopes' as any)
      .select('module, scope')
      .eq('role_id', role.id);
    const scopeMap: Record<string, 'own' | 'all'> = {};
    if (scopes) {
      for (const s of scopes as any[]) scopeMap[s.module] = s.scope;
    }
    setModuleScopes(scopeMap);
    setPermDialogOpen(true);
  };

  const toggleScope = (mod: string) => {
    setModuleScopes(prev => ({ ...prev, [mod]: prev[mod] === 'all' ? 'own' : 'all' }));
  };

  const openDelete = async (role: Role) => {
    setDeleteRole(role);
    setDeleteRoleUsers([]);
    setDeleteDialogOpen(true);
    setLoadingDelete(true);
    // Load users assigned to this role
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role_id', role.id);
    setDeleteRoleUsers((data || []) as AssignedUser[]);
    setLoadingDelete(false);
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    setDeleting(true);
    const { error } = await supabase.from('roles').delete().eq('id', deleteRole.id);
    if (error) {
      toast.error('Error al eliminar el rol');
      console.error(error);
    } else {
      toast.success(`Rol "${deleteRole.name}" eliminado`);
      setDeleteDialogOpen(false);
      setDeleteRole(null);
      fetchAll();
    }
    setDeleting(false);
  };

  const togglePerm = (permId: string) => {
    setPermChecked(prev => { const n = new Set(prev); n.has(permId) ? n.delete(permId) : n.add(permId); return n; });
  };

  const toggleModule = (mod: string) => {
    const modPerms = permissions.filter(p => p.module === mod);
    const allChecked = modPerms.every(p => permChecked.has(p.id));
    setPermChecked(prev => {
      const n = new Set(prev);
      modPerms.forEach(p => { if (allChecked) n.delete(p.id); else n.add(p.id); });
      return n;
    });
  };

  const handleSavePerms = async () => {
    if (!permRole) return;
    setSavingPerms(true);

    // Save role permissions
    await supabase.from('role_permissions').delete().eq('role_id', permRole.id);
    if (permChecked.size > 0) {
      const { error } = await supabase.from('role_permissions').insert([...permChecked].map(pid => ({ role_id: permRole.id, permission_id: pid })));
      if (error) { toast.error('Error al guardar'); setSavingPerms(false); return; }
    }

    // Solo se guarda el scope de los módulos que la base declara scopeables y que además
    // tienen algún permiso activo. Sobre un rol de cliente no se guarda ninguno: las policies
    // lo ignoran por portal, así que dejar la fila solo confundiría a quien la lea después.
    await supabase.from('role_module_scopes' as any).delete().eq('role_id', permRole.id);
    const activeModules = permRole.redirect_portal === 'cliente'
      ? []
      : [...new Set(permissions.filter(p => permChecked.has(p.id)).map(p => p.module))];
    const scopeInserts = activeModules
      .filter(mod => mod in scopeCatalog)
      .map(mod => ({ role_id: permRole.id, module: mod, scope: moduleScopes[mod] ?? 'own' }));
    if (scopeInserts.length > 0) {
      await supabase.from('role_module_scopes' as any).insert(scopeInserts);
    }

    toast.success('Permisos actualizados');
    setPermDialogOpen(false); fetchAll(); setSavingPerms(false);
  };

  const modules = [...new Set(permissions.map(p => p.module))];
  const getRolePermCount = (id: string) => rolePermissions.filter(rp => rp.role_id === id).length;
  const rolePortal = (permRole as any)?.redirect_portal || '';
  const portalMods = PORTAL_MODULES[rolePortal] || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display font-bold">Roles</h1>
        <div className="flex items-center gap-2">
          {/* Quick-access to portal template permissions */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-0.5">Plantillas:</span>
            {(['concesionario', 'admin', 'cliente'] as const).map(portalKey => {
              const templateRole = roles.find(r => r.name.toLowerCase() === portalKey.toLowerCase());
              if (!templateRole) return null;
              return (
                <Button
                  key={portalKey}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1 capitalize"
                  onClick={() => openPermissions(templateRole)}
                  title={`Ver/editar permisos del portal ${portalKey}`}
                >
                  <KeyRound className="w-2.5 h-2.5" />
                  {portalKey}
                </Button>
              );
            })}
          </div>
          <Button size="sm" onClick={openCreate} className="gac-gradient"><Plus className="w-3.5 h-3.5 mr-1" /> Nuevo</Button>
        </div>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-muted-foreground">Cargando...</p></CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Rol</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Permisos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(r => {
                const portal = (r as any).redirect_portal || '';
                return (
                  <TableRow key={r.id} className="[&>td]:py-1.5">
                    <TableCell className="font-medium capitalize">{r.name}</TableCell>
                    <TableCell>
                      {PORTAL_LABELS[portal]
                        ? <Badge variant="outline" className="text-[10px] px-1.5 py-0">{PORTAL_LABELS[portal]}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.description || '-'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5"><Users className="w-2.5 h-2.5" /> {r._count}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5"><KeyRound className="w-2.5 h-2.5" /> {getRolePermCount(r.id)}/{permissions.length}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPermissions(r)} title="Permisos"><KeyRound className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(r)} title="Editar"><Pencil className="w-3 h-3" /></Button>
                        {PROTECTED_ROLES.has(r.name.toLowerCase())
                          ? <span title="Rol protegido — no se puede eliminar"><Lock className="w-3 h-3 text-muted-foreground/40 mx-1.5" /></span>
                          : <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDelete(r)} title="Eliminar rol"><Trash2 className="w-3 h-3" /></Button>
                        }
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editingRole ? 'Editar Rol' : 'Nuevo Rol'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="ej: Asesor de Servicio" />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descripción del rol" />
            </div>
            <div className="space-y-2">
              <Label>Vista del portal</Label>
              <Select value={formRedirectPortal} onValueChange={setFormRedirectPortal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — panel de administración</SelectItem>
                  <SelectItem value="concesionario">Concesionario — reservas + prospectos</SelectItem>
                  <SelectItem value="cliente">Cliente — portal de citas</SelectItem>
                </SelectContent>
              </Select>
              {!editingRole && (
                <p className="text-xs text-muted-foreground">
                  Al crear, se copian automáticamente los permisos del rol <span className="font-medium capitalize">"{PORTAL_TEMPLATE_ROLE[formRedirectPortal] || formRedirectPortal}"</span>. Puedes modificarlos después desde la pantalla de permisos.
                </p>
              )}
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

      {/* PERMISSIONS DIALOG — matrix view with portal color coding */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Permisos del rol: <span className="capitalize text-primary">{permRole?.name}</span>
              {rolePortal && <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">{PORTAL_LABELS[rolePortal]}</Badge>}
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-2">
            {permChecked.size} de {permissions.length} seleccionados
            {portalMods.length > 0 && (
              <span className="ml-2 text-[11px] text-amber-600 font-medium">
                · Módulos con fondo gris no tienen página en el portal <span className="capitalize">"{rolePortal}"</span> pero puedes activarlos igual
              </span>
            )}
          </p>

          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="min-w-[130px]">Módulo</TableHead>
                {ACTIONS.map(a => {
                  const { label, icon: Icon } = ACTION_LABELS[a];
                  return (
                    <TableHead key={a} className="text-center w-[70px]">
                      <div className="flex items-center justify-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
                    </TableHead>
                  );
                })}
                <TableHead className="text-center w-[60px]">Todos</TableHead>
                <TableHead className="text-center w-[110px]">
                  <span title="Por defecto el rol ve solo los datos de su concesionario. 'Ver todo' le da acceso a todos los datos del sistema.">
                    Alcance ⓘ
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map(mod => {
                const modPerms = permissions.filter(p => p.module === mod);
                const allChecked = modPerms.every(p => permChecked.has(p.id));
                const hasAnyPerm = modPerms.some(p => permChecked.has(p.id));
                const notInPortal = portalMods.length > 0 && !portalMods.includes(mod);
                const isScopeable = mod in scopeCatalog && permRole?.redirect_portal !== 'cliente';
                const scope = moduleScopes[mod] ?? 'own';
                return (
                  <TableRow key={mod} className={cn("[&>td]:py-2", notInPortal && "bg-muted/40")}>
                    <TableCell className="font-medium">
                      <span>{MODULE_LABELS[mod] || mod}</span>
                      {notInPortal && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 text-muted-foreground border-muted-foreground/30">
                          solo Admin
                        </Badge>
                      )}
                    </TableCell>
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
                      <Checkbox checked={allChecked} onCheckedChange={() => toggleModule(mod)} className="mx-auto" />
                    </TableCell>
                    <TableCell className="text-center">
                      {isScopeable && hasAnyPerm ? (
                        <button
                          onClick={() => toggleScope(mod)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 transition-colors",
                            scope === 'all'
                              ? "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                              : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"
                          )}
                          title={
                            (scope === 'all'
                              ? 'Ve todo el sistema — clic para restringir a su concesionario'
                              : 'Ve solo lo de su concesionario — clic para dar acceso a todo')
                            + (scopeCatalog[mod] ? `\n${scopeCatalog[mod]}` : '')
                          }
                        >
                          {scope === 'all'
                            ? <><Globe className="w-2.5 h-2.5" /> Ver todo</>
                            : <><Building className="w-2.5 h-2.5" /> Solo propio</>
                          }
                        </button>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
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

      {/* DELETE ROLE DIALOG */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> Eliminar rol: <span className="capitalize">{deleteRole?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingDelete ? (
            <div className="py-6 text-center"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : deleteRoleUsers.length > 0 ? (
            // Has users assigned — block deletion
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold mb-1">No se puede eliminar este rol todavía</p>
                  <p>Hay <span className="font-bold">{deleteRoleUsers.length} usuario{deleteRoleUsers.length > 1 ? 's' : ''}</span> con este rol asignado. Primero cambia su rol desde <strong>Usuarios</strong>, luego podrás eliminar este rol.</p>
                </div>
              </div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {deleteRoleUsers.length > 1 ? 'Usuarios que debes reasignar:' : 'Usuario que debes reasignar:'}
              </div>
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {deleteRoleUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                      {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.full_name || '—'}</p>
                      <p className="text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Entendido</Button>
              </DialogFooter>
            </div>
          ) : (
            // No users — show warnings and confirm
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Antes de continuar, ten en cuenta:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-red-700">
                    <li>Esta acción <strong>no se puede deshacer</strong></li>
                    <li>Se eliminarán todos los permisos asociados a este rol</li>
                    <li>Si asignas este rol a un usuario en el futuro, deberás configurar los permisos desde cero</li>
                    <li>Cualquier automatización o referencia a este rol dejará de funcionar</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                El rol <span className="font-semibold capitalize">"{deleteRole?.name}"</span> no tiene usuarios asignados actualmente. Puedes eliminarlo con seguridad.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sí, eliminar rol'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRoles;
