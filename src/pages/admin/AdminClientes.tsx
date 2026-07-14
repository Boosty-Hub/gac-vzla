import { Fragment, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Pencil, Users, Car, ChevronDown, ChevronRight, Trash2, UserPlus, Eye, EyeOff, Mail, ShieldCheck, ShieldX, Hash, CalendarDays, Clock, MapPin, ClipboardCheck, MessageCircle, X, Power, KeyRound, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractEdgeError } from '@/lib/edgeError';
import { isRecurrentClient } from '@/lib/recompra';
import { VENEZUELA_STATES } from '@/lib/venezuelaStates';

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

interface ServiceRecord {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  service_notes: string | null;
  completed_at: string | null;
  dealerships: { name: string } | null;
}

interface ClientVehicleInfo {
  id: string;
  warranty_active: boolean;
  vehicle_models: { brand: string } | null;
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
  profile_id: string | null;
  profiles: { pin_code: string | null } | null;
  vehicles: ClientVehicleInfo[];
  client_users: { count: number }[];
}

const AdminClientes = () => {
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const canCreate = hasPermission('clientes.create');
  const canEdit = hasPermission('clientes.edit');
  const canDelete = hasPermission('clientes.delete');
  const [clients, setClients] = useState<Client[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterWarranty, setFilterWarranty] = useState('todos');
  const [filterCity, setFilterCity] = useState('todos');

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
  const [formPin, setFormPin] = useState('');

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

  // Vehicle detail dialog
  const [vDetailOpen, setVDetailOpen] = useState(false);
  const [vDetailVehicle, setVDetailVehicle] = useState<Vehicle | null>(null);
  const [vDetailHistory, setVDetailHistory] = useState<ServiceRecord[]>([]);
  const [vDetailLoading, setVDetailLoading] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'city' | 'state' | 'email' | 'isActive' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkCity, setBulkCity] = useState('');
  const [bulkState, setBulkState] = useState('');
  const [bulkEmail, setBulkEmail] = useState('');
  const [bulkIsActive, setBulkIsActive] = useState(true);
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const openVehicleDetail = async (v: Vehicle) => {
    setVDetailVehicle(v);
    setVDetailHistory([]);
    setVDetailOpen(true);
    setVDetailLoading(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, reservation_date, reservation_time, service_type, current_mileage, status, service_notes, completed_at, dealerships(name)')
      .eq('vehicle_id', v.id)
      .order('reservation_date', { ascending: false })
      .limit(50);
    setVDetailHistory((data || []) as ServiceRecord[]);
    setVDetailLoading(false);
  };

  const fetchClients = async () => {
    setLoading(true);
    let query = supabase
      .from('clients')
      .select('*, vehicles(id, warranty_active, vehicle_models(brand)), client_users(count), profiles!clients_profile_id_fkey(pin_code)', { count: 'exact' });

    if (busqueda.trim()) {
      query = query.or(`full_name.ilike.%${busqueda}%,cedula.ilike.%${busqueda}%,email.ilike.%${busqueda}%,phone.ilike.%${busqueda}%`);
    }

    if (filterStatus !== 'todos') {
      query = query.eq('is_active', filterStatus === 'activo');
    }
    if (filterCity !== 'todos') {
      query = query.eq('city', filterCity);
    }

    const { data, error, count } = await query
      .order('full_name')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      toast.error('Error al cargar clientes');
      console.error(error);
    } else {
      let filtered = data || [];
      // Client-side warranty filter since it depends on nested vehicles
      if (filterWarranty !== 'todos') {
        filtered = filtered.filter(c => {
          const hasActiveWarranty = c.vehicles?.some((v: any) => v.warranty_active);
          return filterWarranty === 'activa' ? hasActiveWarranty : !hasActiveWarranty;
        });
      }
      setClients(filtered as Client[]);
      setTotalCount(filterWarranty !== 'todos' ? filtered.length : (count || 0));
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
  }, [busqueda, pageSize, filterStatus, filterWarranty, filterCity]);

  useEffect(() => {
    fetchClients();
  }, [page, busqueda, pageSize, filterStatus, filterWarranty, filterCity]);

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
    setFormPin('');
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
    setFormPin(client.profiles?.pin_code || '');
    setClientDialogOpen(true);
  };

  const handleSaveClient = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    const newPin = formPin.trim();
    if (editingClient?.profile_id && newPin && !/^\d{4}$/.test(newPin)) {
      toast.error('El PIN debe ser de 4 dígitos');
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
      if (error) { toast.error('Error al actualizar cliente'); console.error(error); setSaving(false); return; }

      // PIN de acceso: vive en profiles, solo si el cliente tiene cuenta (profile_id)
      if (editingClient.profile_id && newPin !== (editingClient.profiles?.pin_code || '')) {
        const { error: pinErr } = await supabase.from('profiles')
          .update({ pin_code: newPin || null })
          .eq('id', editingClient.profile_id);
        if (pinErr) {
          toast.error((pinErr as { code?: string }).code === '23505'
            ? 'Ese PIN ya está en uso por otro usuario'
            : 'Cliente guardado, pero no se pudo actualizar el PIN');
          setClientDialogOpen(false); fetchClients(); setSaving(false); return;
        }
      }

      toast.success('Cliente actualizado'); setClientDialogOpen(false); fetchClients();
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
        toast.error(await extractEdgeError(error, 'Error al crear usuario'));
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

  const buildClientWaUrl = (c: Client) => {
    if (!c.phone) return null;
    const digits = c.phone.replace(/\D/g, '');
    let normalized: string;
    if (digits.startsWith('58')) {
      normalized = `+${digits}`;
    } else if (digits.startsWith('0')) {
      normalized = `+58${digits.slice(1)}`;
    } else {
      normalized = `+58${digits}`;
    }
    const brand = c.vehicles?.find(v => v.vehicle_models?.brand)?.vehicle_models?.brand || '';
    const msg = `¡Es un gusto saludarte! *${c.full_name}* Te hablamos del departamento de post venta de *${brand}*`;
    return `https://wa.me/${normalized.replace('+', '')}?text=${encodeURIComponent(msg)}`;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (clients.length > 0 && clients.every(c => selectedIds.has(c.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)));
    }
  };

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('clients').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar clientes');
    else { toast.success(`${ids.length} cliente(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); fetchClients(); }
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('clients').delete().in('id', ids);
    if (error) toast.error('Error al eliminar clientes');
    else { toast.success(`${ids.length} cliente(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchClients(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'city': payload = { city: bulkCity.trim() || null }; break;
      case 'state': payload = { state: (!bulkState || bulkState === '__clear') ? null : bulkState }; break;
      case 'email': payload = { email: bulkEmail.trim() || null }; break;
      case 'isActive': payload = { is_active: bulkIsActive }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Clientes</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
        {canCreate && (
          <Button size="sm" onClick={openCreateClient} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[180px] sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nombre, cédula, correo, teléfono..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs sm:w-[120px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterWarranty} onValueChange={setFilterWarranty}>
          <SelectTrigger className="h-8 text-xs sm:w-[150px]"><SelectValue placeholder="Garantía" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las garantías</SelectItem>
            <SelectItem value="activa">Garantía activa</SelectItem>
            <SelectItem value="inactiva">Sin garantía activa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCity} onValueChange={setFilterCity}>
          <SelectTrigger className="h-8 text-xs sm:w-[140px]"><SelectValue placeholder="Ciudad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las ciudades</SelectItem>
            {Array.from(new Set(clients.map(c => c.city).filter(Boolean))).sort().map(city => (
              <SelectItem key={city!} value={city!}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 text-xs sm:w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 filas</SelectItem>
            <SelectItem value="300">300 filas</SelectItem>
            <SelectItem value="1000">1000 filas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando clientes...</p>
          </CardContent>
        </Card>
      ) : clients.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No se encontraron clientes</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        /* ── MOBILE CARD LIST ── */
        <div className="space-y-2">
          {clients.map(c => {
            const hasWarranty = c.vehicles?.some(v => v.warranty_active);
            const isRecurrent = isRecurrentClient({ cedula: c.cedula, vehicleCount: c.vehicles?.length ?? 0 });
            const waUrl = buildClientWaUrl(c);
            const isExpanded = expandedClient === c.id;
            return (
              <Card key={c.id} className={cn("gac-shadow cursor-pointer", selectedIds.has(c.id) && "ring-1 ring-primary/40 bg-primary/5")}>
                <CardContent className="p-3 space-y-2" onClick={() => toggleExpand(c.id)}>
                  {/* Row 1: checkbox + name + status badge */}
                  <div className="flex items-start gap-2">
                    <div onClick={e => e.stopPropagation()} className="shrink-0 pt-0.5">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                        checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold truncate">{c.full_name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {c.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                          {isRecurrent && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 gap-0.5">
                              <Repeat className="w-2.5 h-2.5" /> Recurrente
                            </Badge>
                          )}
                          {c.vehicles?.length > 0 && (
                            hasWarranty ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 gap-0.5">
                                <ShieldCheck className="w-2.5 h-2.5" /> Garantía
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 gap-0.5">
                                <ShieldX className="w-2.5 h-2.5" /> Sin garantía
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Row 2: cedula + phone + email */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pl-5">
                    {c.cedula && <span>{c.cedula}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span className="truncate max-w-[180px]">{c.email}</span>}
                    {c.city && <span>{c.city}{c.state ? `, ${c.state}` : ''}</span>}
                  </div>
                  {/* Row 3: vehicles count + actions */}
                  <div className="flex items-center justify-between pl-5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                        <Car className="w-2.5 h-2.5" /> {c.vehicles?.length ?? 0} veh.
                      </Badge>
                      <button
                        className="text-[10px] text-primary flex items-center gap-0.5"
                        onClick={() => toggleExpand(c.id)}
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {isExpanded ? 'Ocultar' : 'Ver vehículos'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 relative" onClick={() => openUsersDialog(c)}>
                        <UserPlus className="w-3.5 h-3.5" />
                        {(c.client_users?.[0]?.count || 0) > 0 && (
                          <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                            {c.client_users[0].count}
                          </span>
                        )}
                      </Button>
                      {waUrl && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" asChild>
                          <a href={waUrl} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditClient(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Expanded vehicles */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t space-y-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Vehículos</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddVehicle(c.id)}>
                          <Plus className="w-3 h-3 mr-1" /> Agregar
                        </Button>
                      </div>
                      {!clientVehicles[c.id] ? (
                        <p className="text-xs text-muted-foreground">Cargando...</p>
                      ) : clientVehicles[c.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin vehículos registrados</p>
                      ) : (
                        <div className="space-y-1.5">
                          {clientVehicles[c.id].map(v => (
                            <div key={v.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2 border cursor-pointer" onClick={() => openVehicleDetail(v)}>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {v.plate && `${v.plate} · `}{v.mileage.toLocaleString()} km
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant={v.warranty_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                  {v.warranty_active ? 'Garantía' : 'Sin garantía'}
                                </Badge>
                                {canEdit && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => { e.stopPropagation(); openEditVehicle(v); }}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── DESKTOP TABLE ── */
        <Card className="gac-shadow">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="w-8 pl-3">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                    checked={clients.length > 0 && clients.every(c => selectedIds.has(c.id))}
                    onChange={toggleSelectAll} />
                </TableHead>
                <TableHead className="w-6"></TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Veh.</TableHead>
                <TableHead>Garantía</TableHead>
                <TableHead>Usr.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acc.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(c => (
                <Fragment key={c.id}>
                  <TableRow className="cursor-pointer [&>td]:py-1.5" onClick={() => toggleExpand(c.id)}>
                    <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                        checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    </TableCell>
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
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Car className="w-2.5 h-2.5" /> {c.vehicles?.length ?? 0}
                        </Badge>
                        {isRecurrentClient({ cedula: c.cedula, vehicleCount: c.vehicles?.length ?? 0 }) && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 gap-0.5" title="Cliente recurrente">
                            <Repeat className="w-2.5 h-2.5" /> Recurrente
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.vehicles?.length > 0 ? (
                        c.vehicles.some(v => v.warranty_active) ? (
                          <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5" /> Activa
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-800 gap-0.5">
                            <ShieldX className="w-2.5 h-2.5" /> Inactiva
                          </Badge>
                        )
                      ) : <span className="text-muted-foreground">-</span>}
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
                      <div className="flex items-center justify-end gap-1">
                        {(() => {
                          const waUrl = buildClientWaUrl(c);
                          return waUrl ? (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:text-green-700" asChild>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp">
                                <MessageCircle className="w-3 h-3" />
                              </a>
                            </Button>
                          ) : null;
                        })()}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditClient(c)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedClient === c.id && (
                    <TableRow key={`${c.id}-vehicles`}>
                      <TableCell colSpan={11} className="bg-muted/50 p-4">
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
                              <div key={v.id} className="flex items-center justify-between bg-background rounded-lg p-3 border cursor-pointer hover:shadow-md transition-shadow" onClick={() => openVehicleDetail(v)}>
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
                                  {canEdit && (
                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditVehicle(v); }}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                  )}
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
        </Card>
      )}

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
      <Dialog open={clientDialogOpen} onOpenChange={open => { if (open) setClientDialogOpen(true); }}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-lg"
          onClose={() => setClientDialogOpen(false)}
        >
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

            {editingClient && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <Label className="font-medium">PIN de acceso del cliente</Label>
                </div>
                {editingClient.profile_id ? (
                  <>
                    <div className="flex items-end gap-2">
                      <Input
                        inputMode="numeric"
                        maxLength={4}
                        value={formPin}
                        onChange={e => setFormPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="4 dígitos"
                        className="font-mono tracking-[0.3em] text-lg flex-1"
                      />
                      {formPin && (
                        <Button type="button" variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setFormPin('')}>
                          Quitar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Con este PIN el cliente ingresa al portal. Debe ser único; se guarda al presionar "Guardar Cambios".</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">El cliente aún no tiene cuenta. Podrá tener un PIN cuando ingrese por primera vez con su placa.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setClientDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveClient} disabled={saving} className="flex-1 gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingClient ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Users Dialog */}
      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
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

      {/* Vehicle Detail Dialog */}
      <Dialog open={vDetailOpen} onOpenChange={setVDetailOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Car className="w-4 h-4" /> Detalle del Vehículo
            </DialogTitle>
          </DialogHeader>
          {vDetailVehicle && (() => {
            const v = vDetailVehicle;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-bold text-sm">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</h3>
                    <p className="text-xs text-muted-foreground">{v.plate || '-'}{v.vin ? ` · VIN: ${v.vin}` : ''}</p>
                  </div>
                  <Badge className={cn("text-xs flex items-center gap-1", v.warranty_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                    {v.warranty_active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                    {v.warranty_active ? 'Garantía' : 'Sin Garantía'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Kilometraje</p><p className="font-medium">{v.mileage.toLocaleString()} km</p></div></div>
                  {v.color && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Car className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Color</p><p className="font-medium">{v.color}</p></div></div>}
                  {v.purchase_date && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Compra</p><p className="font-medium">{v.purchase_date}</p></div></div>}
                </div>

                <Separator />
                <h4 className="font-semibold text-xs">Historial de Servicios ({vDetailHistory.length})</h4>

                {vDetailLoading ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Cargando historial...</p>
                  </div>
                ) : vDetailHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin servicios registrados</p>
                ) : (
                  <div className="space-y-2">
                    {vDetailHistory.map(h => {
                      const isCompleted = h.status === 'completada';
                      return (
                        <div key={h.id} className="border rounded-md p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{h.service_type}</span>
                            <Badge className={cn("text-[10px] px-1.5 py-0", isCompleted ? "bg-green-100 text-green-800" : h.status === 'cancelada' ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800")}>{h.status}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{h.reservation_date}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{h.reservation_time?.slice(0, 5)}</span>
                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{h.current_mileage.toLocaleString()} km</span>
                          </div>
                          {h.dealerships && <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{h.dealerships.name}</div>}
                          {h.service_notes && (
                            <div className="bg-green-50 border border-green-200 rounded p-1.5">
                              <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo realizado:</p>
                              <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-1 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 py-2 border border-gray-700 max-w-[calc(100vw-2rem)] overflow-x-auto">
            <span className="text-xs font-bold whitespace-nowrap text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">
              {selectedIds.size} sel.
            </span>
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('city'); setBulkCity(''); }}>
              <MapPin className="w-3 h-3" /> Ciudad
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('state'); setBulkState(''); }}>
              <MapPin className="w-3 h-3" /> Estado (Vzla)
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('email'); setBulkEmail(''); }}>
              <Mail className="w-3 h-3" /> Correo
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('isActive'); setBulkIsActive(true); }}>
              <Power className="w-3 h-3" /> Estado
            </Button>
            {canDelete && (
              <>
                <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
                <Button size="sm" variant="ghost" className="text-red-400 hover:bg-white/10 hover:text-red-300 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
                  onClick={() => setBulkConfirmDeleteOpen(true)}>
                  <Trash2 className="w-3 h-3" /> Eliminar
                </Button>
              </>
            )}
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
              onClick={() => setSelectedIds(new Set())}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* BULK ACTION DIALOG */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) setBulkAction(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-display">
              {bulkAction === 'city' && 'Cambiar ciudad'}
              {bulkAction === 'state' && 'Cambiar estado (Venezuela)'}
              {bulkAction === 'email' && 'Cambiar correo electrónico'}
              {bulkAction === 'isActive' && 'Cambiar estado activo'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-xs text-muted-foreground">Se aplicará a <strong>{selectedIds.size}</strong> cliente(s) seleccionado(s).</p>
            {bulkAction === 'city' && (
              <Input value={bulkCity} onChange={e => setBulkCity(e.target.value)}
                placeholder="Ej: Caracas · vacío = quitar ciudad" className="h-9 text-xs" />
            )}
            {bulkAction === 'state' && (
              <Select value={bulkState} onValueChange={setBulkState}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar estado venezolano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear">Sin estado</SelectItem>
                  {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {bulkAction === 'email' && (
              <Input type="email" value={bulkEmail} onChange={e => setBulkEmail(e.target.value)}
                placeholder="correo@ejemplo.com · vacío = quitar correo" className="h-9 text-xs" />
            )}
            {bulkAction === 'isActive' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{bulkIsActive ? 'Activo' : 'Inactivo'}</p>
                  <p className="text-xs text-muted-foreground">Estado del cliente en el sistema</p>
                </div>
                <Switch checked={bulkIsActive} onCheckedChange={setBulkIsActive} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button size="sm" className="flex-1 gac-gradient" disabled={bulkLoading} onClick={handleBulkApply}>
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} cliente(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente <strong>{selectedIds.size}</strong> cliente(s) y sus datos asociados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Eliminar ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vehicle Dialog */}
      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
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
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setVehicleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveVehicle} disabled={savingVehicle} className="flex-1 gac-gradient">
              {savingVehicle ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingVehicle ? 'Guardar Cambios' : 'Registrar Vehículo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClientes;
