import { Fragment, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Pencil, Users, Car, ChevronDown, ChevronRight, Trash2, UserPlus, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VehicleModel {
  id: string;
  name: string;
  brand: string;
  year: number | null;
}

interface Vehicle {
  id: string;
  model_id: string;
  client_id: string;
  year: number;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number;
  purchase_date: string | null;
  warranty_active: boolean;
  is_active: boolean;
  vehicle_models: VehicleModel | null;
}

interface ClientUser {
  id: string;
  profile_id: string;
  created_at: string;
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
}

interface Client {
  id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  vehicles: { count: number }[];
  client_users: { count: number }[];
}

const AdminClientes = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Client dialog
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCedula, setFormCedula] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Vehicles
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientVehicles, setClientVehicles] = useState<Record<string, Vehicle[]>>({});
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleClientId, setVehicleClientId] = useState<string>('');
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vFormModelId, setVFormModelId] = useState('');
  const [vFormYear, setVFormYear] = useState('');
  const [vFormPlate, setVFormPlate] = useState('');
  const [vFormVin, setVFormVin] = useState('');
  const [vFormColor, setVFormColor] = useState('');
  const [vFormMileage, setVFormMileage] = useState('0');
  const [vFormPurchaseDate, setVFormPurchaseDate] = useState('');
  const [vFormWarranty, setVFormWarranty] = useState(true);
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Client users dialog
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersClient, setUsersClient] = useState<Client | null>(null);
  const [clientUsersList, setClientUsersList] = useState<ClientUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [cuEmail, setCuEmail] = useState('');
  const [cuPassword, setCuPassword] = useState('');
  const [cuFullName, setCuFullName] = useState('');
  const [cuShowPassword, setCuShowPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    let query = supabase
      .from('clients')
      .select('*, vehicles(count), client_users(count)', { count: 'exact' });

    if (busqueda.trim()) {
      query = query.or(`full_name.ilike.%${busqueda}%,cedula.ilike.%${busqueda}%,email.ilike.%${busqueda}%,phone.ilike.%${busqueda}%`);
    }

    const { data, error, count } = await query
      .order('full_name')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      toast.error('Error al cargar clientes');
      console.error(error);
    } else {
      setClients(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const fetchModels = async () => {
    const { data } = await supabase
      .from('vehicle_models')
      .select('id, name, brand, year')
      .eq('is_active', true)
      .order('brand')
      .order('name');
    if (data) setModels(data);
  };

  const fetchVehicles = async (clientId: string) => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*, vehicle_models(id, name, brand, year)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (data) {
      setClientVehicles(prev => ({ ...prev, [clientId]: data as any }));
    }
  };

  useEffect(() => {
    setPage(0);
  }, [busqueda, pageSize]);

  useEffect(() => {
    fetchClients();
  }, [page, busqueda, pageSize]);

  useEffect(() => {
    fetchModels();
  }, []);

  const toggleExpand = (clientId: string) => {
    if (expandedClient === clientId) {
      setExpandedClient(null);
    } else {
      setExpandedClient(clientId);
      if (!clientVehicles[clientId]) {
        fetchVehicles(clientId);
      }
    }
  };

  // Client CRUD
  const openCreateClient = () => {
    setEditingClient(null);
    setFormName(''); setFormCedula(''); setFormPhone(''); setFormEmail('');
    setFormAddress(''); setFormCity(''); setFormState(''); setFormIsActive(true);
    setClientDialogOpen(true);
  };

  const openEditClient = (client: Client) => {
    setEditingClient(client);
    setFormName(client.full_name);
    setFormCedula(client.cedula || '');
    setFormPhone(client.phone || '');
    setFormEmail(client.email || '');
    setFormAddress(client.address || '');
    setFormCity(client.city || '');
    setFormState(client.state || '');
    setFormIsActive(client.is_active);
    setClientDialogOpen(true);
  };

  const handleSaveClient = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSaving(true);

    const payload = {
      full_name: formName.trim(),
      cedula: formCedula.trim() || null,
      phone: formPhone.trim() || null,
      email: formEmail.trim() || null,
      address: formAddress.trim() || null,
      city: formCity.trim() || null,
      state: formState.trim() || null,
      is_active: formIsActive,
    };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
      if (error) { toast.error('Error al actualizar cliente'); console.error(error); }
      else { toast.success('Cliente actualizado'); setClientDialogOpen(false); fetchClients(); }
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) { toast.error('Error al crear cliente'); console.error(error); }
      else { toast.success('Cliente creado'); setClientDialogOpen(false); fetchClients(); }
    }
    setSaving(false);
  };

  // Vehicle CRUD
  const openAddVehicle = (clientId: string) => {
    setEditingVehicle(null);
    setVehicleClientId(clientId);
    setVFormModelId(''); setVFormYear(new Date().getFullYear().toString());
    setVFormPlate(''); setVFormVin(''); setVFormColor('');
    setVFormMileage('0'); setVFormPurchaseDate(''); setVFormWarranty(true);
    setVehicleDialogOpen(true);
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setVehicleClientId(vehicle.client_id);
    setVFormModelId(vehicle.model_id);
    setVFormYear(vehicle.year.toString());
    setVFormPlate(vehicle.plate || '');
    setVFormVin(vehicle.vin || '');
    setVFormColor(vehicle.color || '');
    setVFormMileage(vehicle.mileage.toString());
    setVFormPurchaseDate(vehicle.purchase_date || '');
    setVFormWarranty(vehicle.warranty_active);
    setVehicleDialogOpen(true);
  };

  const handleSaveVehicle = async () => {
    if (!vFormModelId || !vFormYear) {
      toast.error('Modelo y año son requeridos');
      return;
    }
    setSavingVehicle(true);

    const payload = {
      client_id: vehicleClientId,
      model_id: vFormModelId,
      year: parseInt(vFormYear),
      plate: vFormPlate.trim().toUpperCase() || null,
      vin: vFormVin.trim().toUpperCase() || null,
      color: vFormColor.trim() || null,
      mileage: parseInt(vFormMileage) || 0,
      purchase_date: vFormPurchaseDate || null,
      warranty_active: vFormWarranty,
    };

    if (editingVehicle) {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', editingVehicle.id);
      if (error) { toast.error('Error al actualizar vehículo'); console.error(error); }
      else { toast.success('Vehículo actualizado'); setVehicleDialogOpen(false); fetchVehicles(vehicleClientId); }
    } else {
      const { error } = await supabase.from('vehicles').insert(payload);
      if (error) { toast.error('Error al crear vehículo'); console.error(error); }
      else { toast.success('Vehículo registrado'); setVehicleDialogOpen(false); fetchVehicles(vehicleClientId); }
    }
    setSavingVehicle(false);
  };

  // Client users
  const fetchClientUsers = async (clientId: string) => {
    setLoadingUsers(true);
    const { data } = await supabase
      .from('client_users')
      .select('id, profile_id, created_at, profiles(email, full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setClientUsersList((data || []) as ClientUser[]);
    setLoadingUsers(false);
  };

  const openUsersDialog = (client: Client) => {
    setUsersClient(client);
    setCuEmail(''); setCuPassword(''); setCuFullName(''); setCuShowPassword(false);
    setUsersDialogOpen(true);
    fetchClientUsers(client.id);
  };

  const handleCreateClientUser = async () => {
    if (!usersClient) return;
    if (!cuEmail.trim() || !cuPassword.trim()) {
      toast.error('Email y contrase\u00f1a son requeridos'); return;
    }
    if (cuPassword.length < 6) {
      toast.error('La contrase\u00f1a debe tener al menos 6 caracteres'); return;
    }
    setCreatingUser(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: {
          email: cuEmail.trim(),
          password: cuPassword,
          full_name: cuFullName.trim() || usersClient.full_name,
          client_id: usersClient.id,
        },
      });

      if (error) {
        toast.error(error.message || 'Error al crear usuario');
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Usuario creado y vinculado al cliente');
        setCuEmail(''); setCuPassword(''); setCuFullName(''); setCuShowPassword(false);
        fetchClientUsers(usersClient.id);
      }
    } catch (err) {
      toast.error('Error de conexi\u00f3n');
      console.error(err);
    }
    setCreatingUser(false);
  };

  const handleRemoveClientUser = async (cuId: string) => {
    const { error } = await supabase.from('client_users').delete().eq('id', cuId);
    if (error) { toast.error('Error al desvincular usuario'); console.error(error); }
    else {
      toast.success('Usuario desvinculado');
      if (usersClient) fetchClientUsers(usersClient.id);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Clientes</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
        <Button size="sm" onClick={openCreateClient} className="gac-gradient">
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nombre, cédula, correo, teléfono..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 filas</SelectItem>
            <SelectItem value="300">300 filas</SelectItem>
            <SelectItem value="1000">1000 filas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando clientes...</p>
          </CardContent>
        ) : clients.length === 0 ? (
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron clientes</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="w-6"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Veh.</TableHead>
                <TableHead>Usr.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(c => (
                <Fragment key={c.id}>
                  <TableRow className="cursor-pointer [&>td]:py-1.5" onClick={() => toggleExpand(c.id)}>
                    <TableCell className="w-6 pr-0">
                      {expandedClient === c.id
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell>{c.cedula || '-'}</TableCell>
                    <TableCell>{c.phone || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email || '-'}</TableCell>
                    <TableCell>{c.city || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                        <Car className="w-2.5 h-2.5" /> {c.vehicles?.[0]?.count ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 relative" onClick={() => openUsersDialog(c)} title="Gestionar usuarios">
                        <UserPlus className="w-3 h-3" />
                        {(c.client_users?.[0]?.count || 0) > 0 && (
                          <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                            {c.client_users[0].count}
                          </span>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditClient(c)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedClient === c.id && (
                    <TableRow key={`${c.id}-vehicles`}>
                      <TableCell colSpan={10} className="bg-muted/50 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Car className="w-4 h-4" /> Vehículos del cliente
                          </h4>
                          <Button size="sm" variant="outline" onClick={() => openAddVehicle(c.id)}>
                            <Plus className="w-3 h-3 mr-1" /> Agregar Vehículo
                          </Button>
                        </div>
                        {!clientVehicles[c.id] ? (
                          <p className="text-xs text-muted-foreground">Cargando...</p>
                        ) : clientVehicles[c.id].length === 0 ? (
                          <p className="text-xs text-muted-foreground">Este cliente no tiene vehículos registrados</p>
                        ) : (
                          <div className="space-y-2">
                            {clientVehicles[c.id].map(v => (
                              <div key={v.id} className="flex items-center justify-between bg-background rounded-lg p-3 border">
                                <div className="flex items-center gap-3">
                                  <Car className="w-5 h-5 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-medium">
                                      <span className="text-muted-foreground">{v.vehicle_models?.brand || ''}</span>{' '}
                                      {v.vehicle_models?.name || 'Modelo desconocido'} {v.year}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {v.plate && `Placa: ${v.plate}`}
                                      {v.plate && v.color && ' · '}
                                      {v.color && `Color: ${v.color}`}
                                      {(v.plate || v.color) && ' · '}
                                      {v.mileage.toLocaleString()} km
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={v.warranty_active ? "default" : "secondary"} className="text-xs">
                                    {v.warranty_active ? 'Garantía' : 'Sin garantía'}
                                  </Badge>
                                  <Button variant="ghost" size="sm" onClick={() => openEditVehicle(v)}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} de {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-muted"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Nombre Completo *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nombre del cliente" />
              </div>
              <div className="space-y-2">
                <Label>Cédula</Label>
                <Input value={formCedula} onChange={e => setFormCedula(e.target.value)} placeholder="V-12345678" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+58 412 1234567" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Correo Electrónico</Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Dirección</Label>
                <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Dirección del cliente" />
              </div>
              <div className="space-y-2">
                <Label>Ciudad</Label>
                <Input value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="Ciudad" />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input value={formState} onChange={e => setFormState(e.target.value)} placeholder="Estado" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Activo</Label>
                <p className="text-xs text-muted-foreground">Cliente activo en el sistema</p>
              </div>
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveClient} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingClient ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Users Dialog */}
      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Usuarios del cliente</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            <span className="font-medium text-foreground">{usersClient?.full_name}</span> — {usersClient?.cedula || 'Sin cédula'}
          </p>

          {/* Existing users */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Usuarios vinculados</Label>
            {loadingUsers ? (
              <p className="text-xs text-muted-foreground">Cargando...</p>
            ) : clientUsersList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Este cliente no tiene usuarios vinculados</p>
            ) : (
              <div className="space-y-1.5">
                {clientUsersList.map(cu => (
                  <div key={cu.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 border">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">{cu.profiles?.full_name || 'Sin nombre'}</p>
                        <p className="text-[10px] text-muted-foreground">{cu.profiles?.email}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleRemoveClientUser(cu.id)} title="Desvincular">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Add new user */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold">Agregar nuevo usuario</Label>
            <div className="space-y-2">
              <Input
                type="email"
                value={cuEmail}
                onChange={e => setCuEmail(e.target.value)}
                placeholder="Correo electrónico *"
                className="h-8 text-xs"
              />
              <div className="relative">
                <Input
                  type={cuShowPassword ? 'text' : 'password'}
                  value={cuPassword}
                  onChange={e => setCuPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres) *"
                  className="h-8 text-xs pr-8"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setCuShowPassword(!cuShowPassword)}
                >
                  {cuShowPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </Button>
              </div>
              <Input
                value={cuFullName}
                onChange={e => setCuFullName(e.target.value)}
                placeholder={`Nombre (por defecto: ${usersClient?.full_name || ''})`}
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" onClick={handleCreateClientUser} disabled={creatingUser} className="w-full gac-gradient">
              {creatingUser ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><UserPlus className="w-3.5 h-3.5 mr-1" /> Crear y vincular usuario</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vehicle Dialog */}
      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editingVehicle ? 'Editar Vehículo' : 'Agregar Vehículo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modelo *</Label>
                <Select value={vFormModelId} onValueChange={setVFormModelId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                  <SelectContent>
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.brand} {m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Año *</Label>
                <Input type="number" value={vFormYear} onChange={e => setVFormYear(e.target.value)} placeholder="2024" />
              </div>
              <div className="space-y-2">
                <Label>Placa</Label>
                <Input value={vFormPlate} onChange={e => setVFormPlate(e.target.value)} placeholder="ABC123" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input value={vFormColor} onChange={e => setVFormColor(e.target.value)} placeholder="Blanco" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>VIN</Label>
                <Input value={vFormVin} onChange={e => setVFormVin(e.target.value)} placeholder="Número de identificación vehicular" />
              </div>
              <div className="space-y-2">
                <Label>Kilometraje</Label>
                <Input type="number" value={vFormMileage} onChange={e => setVFormMileage(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Fecha de Compra</Label>
                <Input type="date" value={vFormPurchaseDate} onChange={e => setVFormPurchaseDate(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Garantía Activa</Label>
                <p className="text-xs text-muted-foreground">El vehículo tiene garantía vigente</p>
              </div>
              <Switch checked={vFormWarranty} onCheckedChange={setVFormWarranty} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveVehicle} disabled={savingVehicle} className="gac-gradient">
              {savingVehicle ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingVehicle ? 'Guardar Cambios' : 'Registrar Vehículo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClientes;
