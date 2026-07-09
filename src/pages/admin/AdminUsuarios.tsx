import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Search, UserPlus, Pencil, Shield, Users, Plus, Eye, EyeOff, Link2, Copy, Check as CheckIcon, KeyRound, AlertTriangle, Mail, Phone, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractEdgeError } from '@/lib/edgeError';

interface ProfileWithRole {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_code: string | null;
  phone: string | null;
  roles: {
    id: string;
    name: string;
    description: string | null;
  } | null;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
}

interface Permission {
  id: string;
  name: string;
  module: string;
}

const PERM_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
const PERM_ACTION_LABELS: Record<string, { label: string; Icon: typeof Eye }> = {
  view:   { label: 'Ver',      Icon: Eye },
  create: { label: 'Crear',    Icon: Plus },
  edit:   { label: 'Editar',   Icon: Pencil },
  delete: { label: 'Eliminar', Icon: Trash2 },
};
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', clientes: 'Clientes', vehiculos: 'Vehículos',
  modelos: 'Modelos', concesionarios: 'Concesionarios', reservas: 'Reservas',
  garantias: 'Garantías', historial: 'Historial', prospectos: 'Prospectos',
  usuarios: 'Usuarios', roles: 'Roles', eventos: 'Eventos',
};

const AdminUsuarios = () => {
  const isMobile = useIsMobile();
  const { hasPermission, profile: currentProfile } = useAuth();
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<string>('todos');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ProfileWithRole | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPinCode, setEditPinCode] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createPinCode, setCreatePinCode] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createDealershipId, setCreateDealershipId] = useState('');
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Dealerships for concesionario role
  const [dealerships, setDealerships] = useState<{ id: string; name: string }[]>([]);
  // Edit dealership — single for concesionario, multi for vendedor
  const [editDealershipId, setEditDealershipId] = useState('');
  const [editDealershipIds, setEditDealershipIds] = useState<string[]>([]);
  // Create multi-dealership for vendedor
  const [createDealershipIds, setCreateDealershipIds] = useState<string[]>([]);
  // Linked dealership profile IDs
  const [linkedProfileIds, setLinkedProfileIds] = useState<Set<string>>(new Set());

  // Delete confirmation dialog
  const [deletingUser, setDeletingUser] = useState<ProfileWithRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-user permissions dialog
  const [userPermDialogOpen, setUserPermDialogOpen] = useState(false);
  const [userPermUser, setUserPermUser] = useState<ProfileWithRole | null>(null);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [userPermChecked, setUserPermChecked] = useState<Set<string>>(new Set()); // effective permission IDs
  const [userRolePermIds, setUserRolePermIds] = useState<Set<string>>(new Set()); // baseline from role
  const [loadingUserPerms, setLoadingUserPerms] = useState(false);
  const [savingUserPerms, setSavingUserPerms] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, roles(id, name, description)')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar usuarios');
      console.error(error);
    } else {
      setUsers((data as any) || []);
    }
    setLoading(false);
  };

  const fetchRoles = async () => {
    const { data } = await supabase.from('roles').select('*').order('name');
    if (data) setRoles(data);
  };

  const fetchDealerships = async () => {
    const { data } = await supabase.from('dealerships').select('id, name').eq('is_active', true).order('name');
    if (data) setDealerships(data);
  };

  const fetchLinkedProfiles = async () => {
    const { data } = await supabase.from('dealership_users').select('profile_id');
    if (data) setLinkedProfileIds(new Set(data.map((d: any) => d.profile_id)));
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchDealerships();
    fetchLinkedProfiles();
  }, []);

  const openCreateDialog = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateFullName('');
    setCreateRoleId('');
    setCreateDealershipId('');
    setCreateDealershipIds([]);
    setCreatePinCode('');
    setCreatePhone('');
    setShowPassword(false);
    setCreateDialogOpen(true);
  };

  const getSelectedRoleName = (roleId: string) => roles.find(r => r.id === roleId)?.name || '';
  const needsDealership = (roleId: string) => ['concesionario', 'vendedor'].includes(getSelectedRoleName(roleId).toLowerCase());
  const isVendedorRole = (roleId: string) => getSelectedRoleName(roleId).toLowerCase() === 'vendedor';

  const handleGenerateMagicLink = async (userId: string) => {
    setGeneratingLink(userId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-magic-link', {
        body: { user_id: userId },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || 'Error al generar link');
        return;
      }
      const url = `${window.location.origin}/magic-login?token=${data.token}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(userId);
      toast.success('Magic link copiado al portapapeles (válido por 360 días)');
      setTimeout(() => setCopiedLink(null), 3000);
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setGeneratingLink(null);
    }
  };

  const handleCreateUser = async () => {
    if (!createEmail.trim() || !createPassword.trim()) {
      toast.error('Email y contraseña son requeridos');
      return;
    }
    if (createPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    const createRoleName = getSelectedRoleName(createRoleId).toLowerCase();
    if (createRoleName === 'concesionario' && !createDealershipId) {
      toast.error('Debe seleccionar un concesionario para este rol');
      return;
    }
    if (createRoleName === 'vendedor' && createDealershipIds.length === 0) {
      toast.error('Debe seleccionar al menos un concesionario para el vendedor');
      return;
    }
    const pinValue = createPinCode.trim();
    if (pinValue && !/^\d{4}$/.test(pinValue)) {
      toast.error('El PIN debe ser de exactamente 4 dígitos numéricos');
      return;
    }
    setCreating(true);

    try {
      const createRoleName2 = getSelectedRoleName(createRoleId).toLowerCase();
      const primaryDealershipId = createRoleName2 === 'vendedor'
        ? (createDealershipIds[0] || null)
        : (needsDealership(createRoleId) ? createDealershipId || null : null);

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: createEmail.trim(),
          password: createPassword,
          full_name: createFullName.trim() || null,
          role_id: createRoleId || null,
          dealership_id: primaryDealershipId,
          pin_code: pinValue || null,
          phone: createPhone.trim() || null,
        },
      });

      if (error) {
        toast.error(await extractEdgeError(error, 'Error al crear usuario'));
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        // Save pin_code after user creation if provided
        if (pinValue && data?.user_id) {
          await supabase
            .from('profiles')
            .update({ pin_code: pinValue } as any)
            .eq('id', data.user_id);
        }
        // Insert additional dealership links for vendedor
        if (createRoleName2 === 'vendedor' && data?.user_id && createDealershipIds.length > 1) {
          const extras = createDealershipIds.slice(1).map(did => ({ dealership_id: did, profile_id: data.user_id }));
          await supabase.from('dealership_users').insert(extras);
        }
        toast.success('Usuario creado exitosamente');
        setCreateDialogOpen(false);
        setCreateDealershipIds([]);
        setCreatePhone('');
        fetchUsers();
        fetchLinkedProfiles();
      }
    } catch (err) {
      toast.error('Error de conexión');
      console.error(err);
    }
    setCreating(false);
  };

  const openEditDialog = async (user: ProfileWithRole) => {
    setEditingUser(user);
    setEditFullName(user.full_name || '');
    setEditRoleId(user.role_id || '');
    setEditIsActive(user.is_active);
    setEditPinCode(user.pin_code || '');
    setEditPhone(user.phone || '');
    setEditDealershipId('');
    setEditDealershipIds([]);
    // Load all current dealership links
    const { data } = await supabase.from('dealership_users').select('dealership_id').eq('profile_id', user.id);
    if (data && data.length > 0) {
      const ids = data.map((d: any) => d.dealership_id);
      setEditDealershipId(ids[0]); // for concesionario single-select
      setEditDealershipIds(ids);   // for vendedor multi-select
    }
    setEditDialogOpen(true);
  };

  const toggleEditDealership = (id: string) => {
    setEditDealershipIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleCreateDealership = (id: string) => {
    setCreateDealershipIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    const roleName = getSelectedRoleName(editRoleId).toLowerCase();
    if (roleName === 'concesionario' && !editDealershipId) {
      toast.error('Debe seleccionar un concesionario para este rol');
      return;
    }
    if (roleName === 'vendedor' && editDealershipIds.length === 0) {
      toast.error('Debe seleccionar al menos un concesionario para el vendedor');
      return;
    }
    setSaving(true);

    const pinValue = editPinCode.trim();
    if (pinValue && !/^\d{4}$/.test(pinValue)) {
      toast.error('El PIN debe ser de exactamente 4 dígitos numéricos');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName,
        role_id: editRoleId || null,
        is_active: editIsActive,
        pin_code: pinValue || null,
        phone: editPhone.trim() || null,
      } as any)
      .eq('id', editingUser.id);

    if (error) {
      toast.error('Error al actualizar usuario');
      console.error(error);
    } else {
      // Delete all existing links then re-insert
      await supabase.from('dealership_users').delete().eq('profile_id', editingUser.id);
      if (needsDealership(editRoleId)) {
        const idsToInsert = isVendedorRole(editRoleId) ? editDealershipIds : (editDealershipId ? [editDealershipId] : []);
        if (idsToInsert.length > 0) {
          await supabase.from('dealership_users').insert(
            idsToInsert.map(did => ({ dealership_id: did, profile_id: editingUser.id }))
          );
        }
      }
      toast.success('Usuario actualizado correctamente');
      setEditDialogOpen(false);
      fetchUsers();
      fetchLinkedProfiles();
    }
    setSaving(false);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: deletingUser.id },
      });
      if (error) {
        toast.error(await extractEdgeError(error, 'Error al eliminar usuario'));
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Usuario eliminado correctamente');
        setDeletingUser(null);
        fetchUsers();
        fetchLinkedProfiles();
      }
    } catch (err) {
      toast.error('Error de conexión');
      console.error(err);
    }
    setDeleting(false);
  };

  // ── Per-user permissions handlers ──────────────────────────────────────────
  const openUserPermissions = async (u: ProfileWithRole) => {
    setUserPermUser(u);
    setLoadingUserPerms(true);
    setUserPermDialogOpen(true);

    // 1. All permissions
    const { data: allPerms } = await supabase.from('permissions').select('id, name, module').order('module').order('name');
    const perms = (allPerms || []) as Permission[];
    setAllPermissions(perms);

    // 2. Role baseline
    let roleIds = new Set<string>();
    if (u.role_id) {
      const { data: rp } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', u.role_id);
      if (rp) roleIds = new Set(rp.map((r: any) => r.permission_id));
    }
    setUserRolePermIds(roleIds);

    // 3. User overrides
    const { data: ups } = await supabase
      .from('user_permissions' as any)
      .select('permission_id, granted')
      .eq('profile_id', u.id);

    // Build effective set
    const effective = new Set(roleIds);
    if (ups) {
      for (const up of ups as any[]) {
        if (up.granted) effective.add(up.permission_id);
        else effective.delete(up.permission_id);
      }
    }
    setUserPermChecked(effective);
    setLoadingUserPerms(false);
  };

  const toggleUserPerm = (permId: string) => {
    setUserPermChecked(prev => {
      const next = new Set(prev);
      next.has(permId) ? next.delete(permId) : next.add(permId);
      return next;
    });
  };

  const toggleUserModule = (mod: string) => {
    const modPerms = allPermissions.filter(p => p.module === mod);
    const allChecked = modPerms.every(p => userPermChecked.has(p.id));
    setUserPermChecked(prev => {
      const next = new Set(prev);
      modPerms.forEach(p => allChecked ? next.delete(p.id) : next.add(p.id));
      return next;
    });
  };

  const handleSaveUserPerms = async () => {
    if (!userPermUser) return;
    setSavingUserPerms(true);

    // Delete all existing overrides for this user
    await supabase.from('user_permissions' as any).delete().eq('profile_id', userPermUser.id);

    // Insert only the differences from role baseline
    const inserts: { profile_id: string; permission_id: string; granted: boolean }[] = [];
    for (const perm of allPermissions) {
      const inRole = userRolePermIds.has(perm.id);
      const isChecked = userPermChecked.has(perm.id);
      if (isChecked && !inRole)  inserts.push({ profile_id: userPermUser.id, permission_id: perm.id, granted: true });
      if (!isChecked && inRole) inserts.push({ profile_id: userPermUser.id, permission_id: perm.id, granted: false });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('user_permissions' as any).insert(inserts);
      if (error) {
        toast.error('Error al guardar permisos');
        console.error(error);
        setSavingUserPerms(false);
        return;
      }
    }

    toast.success(`Permisos de "${userPermUser.full_name || userPermUser.email}" actualizados`);
    setUserPermDialogOpen(false);
    setSavingUserPerms(false);
  };

  const filteredUsers = users.filter(u => {
    const matchBusqueda = !busqueda ||
      u.email.toLowerCase().includes(busqueda.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(busqueda.toLowerCase());
    const matchRol = filtroRol === 'todos' || u.roles?.name === filtroRol;
    return matchBusqueda && matchRol;
  });

  const getRoleBadgeColor = (roleName: string | undefined) => {
    switch (roleName) {
      case 'superadmin': return 'bg-red-100 text-red-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'concesionario': return 'bg-blue-100 text-blue-800';
      case 'cliente': return 'bg-green-100 text-green-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getInitials = (user: ProfileWithRole) => {
    if (user.full_name) {
      return user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Usuarios</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {users.length}
          </Badge>
        </div>
        {hasPermission('usuarios.create') && (
          <Button size="sm" onClick={openCreateDialog} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      {(() => {
        const unlinkedVendedores = users.filter(u => {
          const roleName = u.roles?.name?.toLowerCase();
          return (roleName === 'vendedor' || roleName === 'concesionario') && !linkedProfileIds.has(u.id);
        });
        return unlinkedVendedores.length > 0 ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold">Vendedores sin concesionario vinculado ({unlinkedVendedores.length})</p>
                <p className="mt-0.5">
                  {unlinkedVendedores.map(u => u.full_name || u.email).join(', ')}
                </p>
                <p className="mt-1 text-amber-600">Estos usuarios no podrán acceder correctamente al portal. Edítalos para asignarles un concesionario.</p>
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar nombre o correo..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={filtroRol} onValueChange={setFiltroRol}>
          <SelectTrigger className="w-[130px] sm:w-[140px] h-8 text-xs shrink-0">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            {roles.map(r => (
              <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
          </CardContent>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron usuarios</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* ── MOBILE CARDS ── */
        <div className="space-y-2">
          {filteredUsers.map(u => (
            <Card key={u.id} className="gac-shadow">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-[11px] bg-muted">{getInitials(u)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-semibold truncate">{u.full_name || 'Sin nombre'}</p>
                        {u.pin_code && <KeyRound className="w-3 h-3 text-primary shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Mail className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{u.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={cn('text-[10px] px-1.5 py-0 capitalize', getRoleBadgeColor(u.roles?.name))}>
                      {u.roles?.name || 'Sin rol'}
                    </Badge>
                    <Badge variant={u.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString('es-VE')}</span>
                  <div className="flex items-center gap-0.5">
                    {hasPermission('usuarios.edit') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Generar Magic Link"
                        onClick={() => handleGenerateMagicLink(u.id)} disabled={generatingLink === u.id}>
                        {copiedLink === u.id ? <CheckIcon className="w-3 h-3 text-green-600" /> : generatingLink === u.id ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Link2 className="w-3 h-3" />}
                      </Button>
                    )}
                    {hasPermission('usuarios.edit') && u.roles?.name !== 'superadmin' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Permisos del usuario"
                        onClick={() => openUserPermissions(u)}>
                        <Shield className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {hasPermission('usuarios.edit') && (
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEditDialog(u)} disabled={u.id === currentProfile?.id}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    {hasPermission('usuarios.delete') && u.id !== currentProfile?.id && u.roles?.name !== 'superadmin' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Eliminar usuario" onClick={() => setDeletingUser(u)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ── DESKTOP TABLE ── */
        <Card className="gac-shadow">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Usuario</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map(u => (
                <TableRow key={u.id} className="[&>td]:py-1.5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-muted">{getInitials(u)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{u.full_name || 'Sin nombre'}</span>
                      {u.pin_code && (
                        <span title={`PIN: ${u.pin_code}`}><KeyRound className="w-3 h-3 text-primary" /></span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge className={cn("text-[10px] px-1.5 py-0 capitalize", getRoleBadgeColor(u.roles?.name))}>
                      {u.roles?.name || 'Sin rol'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('es-VE')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {hasPermission('usuarios.edit') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Generar Magic Link"
                          onClick={() => handleGenerateMagicLink(u.id)}
                          disabled={generatingLink === u.id}
                        >
                          {copiedLink === u.id ? <CheckIcon className="w-3 h-3 text-green-600" /> : generatingLink === u.id ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Link2 className="w-3 h-3" />}
                        </Button>
                      )}
                      {hasPermission('usuarios.edit') && u.roles?.name !== 'superadmin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          title="Permisos del usuario"
                          onClick={() => openUserPermissions(u)}
                        >
                          <Shield className="w-3 h-3" />
                        </Button>
                      )}
                      {hasPermission('usuarios.edit') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEditDialog(u)}
                          disabled={u.id === currentProfile?.id}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {hasPermission('usuarios.delete') && u.id !== currentProfile?.id && u.roles?.name !== 'superadmin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          title="Eliminar usuario"
                          onClick={() => setDeletingUser(u)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Editar Usuario</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Correo Electrónico</Label>
                <Input value={editingUser.email} disabled className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editFullName">Nombre Completo</Label>
                <Input
                  id="editFullName"
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  placeholder="Nombre del usuario"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPhone" className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Teléfono
                </Label>
                <Input
                  id="editPhone"
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="Ej: 0414-1234567"
                />
                <p className="text-xs text-muted-foreground">Móvil o local. Opcional.</p>
              </div>

              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={editRoleId} onValueChange={v => { setEditRoleId(v); if (!needsDealership(v)) setEditDealershipId(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="capitalize">{r.name}</span>
                        {r.description && <span className="text-xs text-muted-foreground ml-2">- {r.description}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsDealership(editRoleId) && (
                <div className="space-y-2">
                  <Label>
                    {isVendedorRole(editRoleId) ? 'Concesionarios (puede seleccionar varios)' : 'Concesionario'}
                  </Label>
                  {isVendedorRole(editRoleId) ? (
                    <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                      {dealerships.map(d => (
                        <label key={d.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={editDealershipIds.includes(d.id)}
                            onChange={() => toggleEditDealership(d.id)}
                            className="w-3.5 h-3.5 accent-primary"
                          />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Select value={editDealershipId} onValueChange={setEditDealershipId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar concesionario" />
                      </SelectTrigger>
                      <SelectContent>
                        {dealerships.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {isVendedorRole(editRoleId)
                      ? `${editDealershipIds.length} concesionario(s) seleccionado(s) — el vendedor verá sus prospectos en cada uno`
                      : 'El usuario solo verá reservas y prospectos de este concesionario'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label>Estado</Label>
                  <p className="text-xs text-muted-foreground">Activar o desactivar el acceso del usuario</p>
                </div>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPinCode" className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> Código PIN (4 dígitos)
                </Label>
                <Input
                  id="editPinCode"
                  value={editPinCode}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setEditPinCode(v);
                  }}
                  placeholder="Ej: 1234"
                  maxLength={4}
                  className="font-mono text-lg tracking-widest"
                />
                <p className="text-xs text-muted-foreground">PIN para inicio de sesión rápido. Dejar vacío para deshabilitar.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUser} disabled={saving} className="gac-gradient">
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Guardar Cambios'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* CREATE USER DIALOG */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Correo Electrónico *</Label>
              <Input
                type="email"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input
                value={createFullName}
                onChange={e => setCreateFullName(e.target.value)}
                placeholder="Nombre del usuario"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Teléfono
              </Label>
              <Input
                type="tel"
                value={createPhone}
                onChange={e => setCreatePhone(e.target.value)}
                placeholder="Ej: 0414-1234567"
              />
              <p className="text-xs text-muted-foreground">Móvil o local. Opcional.</p>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={createRoleId} onValueChange={v => { setCreateRoleId(v); if (!needsDealership(v)) setCreateDealershipId(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="capitalize">{r.name}</span>
                      {r.description && <span className="text-xs text-muted-foreground ml-2">- {r.description}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsDealership(createRoleId) && (
              <div className="space-y-2">
                <Label>
                  {isVendedorRole(createRoleId) ? 'Concesionarios (puede seleccionar varios)' : 'Concesionario *'}
                </Label>
                {isVendedorRole(createRoleId) ? (
                  <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                    {dealerships.map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={createDealershipIds.includes(d.id)}
                          onChange={() => toggleCreateDealership(d.id)}
                          className="w-3.5 h-3.5 accent-primary"
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <Select value={createDealershipId} onValueChange={setCreateDealershipId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar concesionario" />
                    </SelectTrigger>
                    <SelectContent>
                      {dealerships.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  {isVendedorRole(createRoleId)
                    ? `${createDealershipIds.length} concesionario(s) seleccionado(s) — el vendedor verá sus prospectos en cada uno`
                    : 'El usuario solo verá reservas y prospectos de este concesionario'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Código PIN (4 dígitos)
              </Label>
              <Input
                value={createPinCode}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setCreatePinCode(v);
                }}
                placeholder="Ej: 1234"
                maxLength={4}
                className="font-mono text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground">PIN para inicio de sesión rápido (opcional)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={creating} className="gac-gradient">
              {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* PER-USER PERMISSIONS DIALOG */}
      <Dialog open={userPermDialogOpen} onOpenChange={setUserPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              Permisos de:{' '}
              <span className="text-primary">{userPermUser?.full_name || userPermUser?.email}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Configura permisos específicos para este usuario. Los cambios sobreescriben el rol base
            sólo para este usuario y se aplican en tiempo real.{' '}
            {userPermChecked.size} de {allPermissions.length} permisos activos.
          </p>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border border-primary bg-primary inline-block" />
              Del rol base
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border border-green-500 bg-green-100 inline-block" />
              Añadido solo a este usuario
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border border-muted bg-muted/50 inline-block" />
              Sin permiso
            </span>
          </div>

          {loadingUserPerms ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead className="min-w-[130px]">Módulo</TableHead>
                  {PERM_ACTIONS.map(a => {
                    const { label, Icon } = PERM_ACTION_LABELS[a];
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
                {[...new Set(allPermissions.map(p => p.module))].map(mod => {
                  const modPerms = allPermissions.filter(p => p.module === mod);
                  const allChecked = modPerms.every(p => userPermChecked.has(p.id));
                  return (
                    <TableRow key={mod} className="[&>td]:py-2">
                      <TableCell className="font-medium">{MODULE_LABELS[mod] || mod}</TableCell>
                      {PERM_ACTIONS.map(a => {
                        const perm = allPermissions.find(p => p.name === `${mod}.${a}`);
                        if (!perm) return (
                          <TableCell key={a} className="text-center">
                            <span className="text-muted-foreground/30">—</span>
                          </TableCell>
                        );
                        const checked = userPermChecked.has(perm.id);
                        const fromRole = userRolePermIds.has(perm.id);
                        return (
                          <TableCell key={a} className="text-center">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleUserPerm(perm.id)}
                                className={cn(
                                  "mx-auto",
                                  checked && !fromRole && "border-green-500 data-[state=checked]:bg-green-500",
                                )}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={() => toggleUserModule(mod)}
                          className="mx-auto"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUserPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveUserPerms} disabled={savingUserPerms || loadingUserPerms} className="gac-gradient">
              {savingUserPerms
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Guardar Permisos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {deletingUser?.full_name || deletingUser?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es permanente y no se puede deshacer. Se elimina la cuenta de acceso
              del usuario. Para revocar el acceso sin borrar el historial, usá "Desactivar" en editar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteUser(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsuarios;
