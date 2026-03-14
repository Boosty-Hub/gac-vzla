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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Search, UserPlus, Pencil, Shield, Users, Plus, Eye, EyeOff, Link2, Copy, Check as CheckIcon, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

const AdminUsuarios = () => {
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
  const [saving, setSaving] = useState(false);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createPinCode, setCreatePinCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createDealershipId, setCreateDealershipId] = useState('');
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Dealerships for concesionario role
  const [dealerships, setDealerships] = useState<{ id: string; name: string }[]>([]);
  // Edit dealership
  const [editDealershipId, setEditDealershipId] = useState('');

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

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchDealerships();
  }, []);

  const openCreateDialog = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateFullName('');
    setCreateRoleId('');
    setCreateDealershipId('');
    setShowPassword(false);
    setCreateDialogOpen(true);
  };

  const getSelectedRoleName = (roleId: string) => roles.find(r => r.id === roleId)?.name || '';

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
    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: createEmail.trim(),
          password: createPassword,
          full_name: createFullName.trim() || null,
          role_id: createRoleId || null,
          dealership_id: getSelectedRoleName(createRoleId) === 'concesionario' ? createDealershipId || null : null,
        },
      });

      if (error) {
        toast.error(error.message || 'Error al crear usuario');
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Usuario creado exitosamente');
        setCreateDialogOpen(false);
        fetchUsers();
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
    setEditDealershipId('');
    // Load current dealership link
    const { data } = await supabase.from('dealership_users').select('dealership_id').eq('profile_id', user.id).limit(1);
    if (data && data.length > 0) setEditDealershipId(data[0].dealership_id);
    setEditDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName,
        role_id: editRoleId || null,
        is_active: editIsActive,
      })
      .eq('id', editingUser.id);

    if (error) {
      toast.error('Error al actualizar usuario');
      console.error(error);
    } else {
      // Update dealership link
      const editRoleName = getSelectedRoleName(editRoleId);
      // Remove existing links
      await supabase.from('dealership_users').delete().eq('profile_id', editingUser.id);
      // Add new link if concesionario
      if (editRoleName === 'concesionario' && editDealershipId) {
        await supabase.from('dealership_users').insert({ dealership_id: editDealershipId, profile_id: editingUser.id });
      }
      toast.success('Usuario actualizado correctamente');
      setEditDialogOpen(false);
      fetchUsers();
    }
    setSaving(false);
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

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar nombre o correo..."
            className="pl-8 h-8 text-xs"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <Select value={filtroRol} onValueChange={setFiltroRol}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
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

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
          </CardContent>
        ) : filteredUsers.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron usuarios</p>
          </CardContent>
        ) : (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

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
                <Label>Rol</Label>
                <Select value={editRoleId} onValueChange={v => { setEditRoleId(v); if (getSelectedRoleName(v) !== 'concesionario') setEditDealershipId(''); }}>
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

              {getSelectedRoleName(editRoleId) === 'concesionario' && (
                <div className="space-y-2">
                  <Label>Concesionario</Label>
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
                  <p className="text-xs text-muted-foreground">El usuario solo verá reservas y prospectos de este concesionario</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label>Estado</Label>
                  <p className="text-xs text-muted-foreground">Activar o desactivar el acceso del usuario</p>
                </div>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
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
              <Label>Rol</Label>
              <Select value={createRoleId} onValueChange={v => { setCreateRoleId(v); if (getSelectedRoleName(v) !== 'concesionario') setCreateDealershipId(''); }}>
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
            {getSelectedRoleName(createRoleId) === 'concesionario' && (
              <div className="space-y-2">
                <Label>Concesionario *</Label>
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
                <p className="text-xs text-muted-foreground">El usuario solo verá reservas y prospectos de este concesionario</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={creating} className="gac-gradient">
              {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsuarios;
