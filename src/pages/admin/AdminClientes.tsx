import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { listExternalSources, type ExternalSource } from '@/lib/externalSources';
import { findOrCreateManualModel, type ManualModelClient } from '@/lib/manualVehicleModel';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SatisfactionOverview from '@/components/satisfaction/SatisfactionOverview';
import ServiceSatisfactionOverview from '@/components/satisfaction/ServiceSatisfactionOverview';
import ClientDetailDialog from '@/components/clients/ClientDetailDialog';
import { Search, Plus, Pencil, Users, Car, ChevronDown, ChevronRight, Trash2, UserPlus, Eye, EyeOff, Mail, ShieldCheck, ShieldX, Hash, CalendarDays, Clock, MapPin, ClipboardCheck, MessageCircle, X, Power, KeyRound, Repeat, Wrench, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { invokeAdminFunction } from '@/lib/adminFunctions';
import { isRecurrentClient } from '@/lib/recompra';
import { syncClientToKommo } from '@/lib/kommo';
import { VENEZUELA_STATES } from '@/lib/venezuelaStates';
import { useServiceSurveys } from '@/hooks/useServiceSurveys';
import ServiceSurveyInline from '@/components/satisfaction/ServiceSurveyInline';

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
  // true = third-party vehicle registered only to record a one-off service —
  // never a unit we sold. See supabase/migrations/20260730140000_manual_vehicles_and_clients.sql.
  is_manual: boolean;
  vehicle_models: VehicleModel | null;
}

// Sentinel for the "Otro / escribir manualmente" option in the model Select —
// never a real vehicle_models.id (those are UUIDs).
const MANUAL_MODEL_VALUE = '__manual__';

/**
 * `set_client_external` todavía no está en los tipos generados (RPC nueva, sin regenerar
 * types.ts). Se declara su firma real acá una sola vez, en vez de castear a `any` en cada
 * llamada: así los dos call sites siguen tipados.
 * Ver supabase/migrations/20260806160000_set_client_external.sql.
 */
type UntypedRpc = (fn: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

function setClientExternal(clientId: string, value: boolean) {
  return (supabase.rpc as unknown as UntypedRpc)('set_client_external', {
    p_client_id: clientId,
    p_value: value,
  });
}

function setClientsExternal(clientIds: string[], value: boolean) {
  return (supabase.rpc as unknown as UntypedRpc)('set_clients_external', {
    p_client_ids: clientIds,
    p_value: value,
  });
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
  is_manual: boolean;
  // Hace falta para saber si el cliente externo ya puede entrar a /mi-flota: sin placa no
  // tiene con qué identificarse. Ver 20260811150000_external_portal.sql.
  plate: string | null;
  vehicle_models: { brand: string } | null;
}

/**
 * Qué le falta a un cliente externo para poder entrar al portal (/mi-flota).
 *
 * El acceso NO se provisiona: no hay usuario ni contraseña que crear. Se entra con la placa
 * y el teléfono, así que alcanza con que esos dos datos existan. Pero justamente por eso hay
 * que decirlo: un externo cargado sin teléfono, o sin vehículo con placa, queda afuera sin
 * que nada avise.
 */
function portalAccessGap(client: { phone: string | null; vehicles?: ClientVehicleInfo[] }): string | null {
  const faltantes: string[] = [];
  if (!client.phone?.trim()) faltantes.push('teléfono');
  if (!client.vehicles?.some(v => v.plate?.trim())) faltantes.push('un vehículo con placa');
  return faltantes.length ? faltantes.join(' y ') : null;
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
  // true = person registered only to invoice a one-off service — not a real
  // customer. Excluded from the list/count by default (see fetchClients).
  is_manual: boolean;
  // Convenio/alianza por la que llegó este externo. NULL cuando no aplica. Un trigger lo
  // normaliza y lo limpia si el cliente deja de ser externo. Ver 20260811130000.
  external_source: string | null;
  // true = fleet account (R8). Unlocks driver management for this client's vehicles.
  is_fleet: boolean;
  created_at: string;
  profile_id: string | null;
  profiles: { pin_code: string | null } | null;
  vehicles: ClientVehicleInfo[];
  client_users: { count: number }[];
}

const AdminClientes = () => {
  const { hasPermission, role } = useAuth();
  const roleName = role?.name?.toLowerCase() || '';
  // Mismo criterio que ClientDetailDialog.tsx: "SOLO PARA ADMIN", sin excepcion para
  // concesionario/vendedor aunque tengan clientes.edit.
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = hasPermission('clientes.create');
  const canEdit = hasPermission('clientes.edit');
  const canDelete = hasPermission('clientes.delete');
  const [unlinkingVehicle, setUnlinkingVehicle] = useState<Vehicle | null>(null);
  const [unlinkSaving, setUnlinkSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // Lo que realmente se consulta. Sin esto la búsqueda corre una vez por tecla y escribir
  // "Sanchez" son 7 consultas, de las que 6 se descartan. El input sigue respondiendo al
  // instante; sólo se retrasa el viaje a la base.
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterWarranty, setFilterWarranty] = useState('todos');
  const [filterCity, setFilterCity] = useState('todos');
  // Manual (third-party/service-only) clients are excluded by default so they
  // never pollute the real customer base — this toggle brings them back into
  // the same list, visually badged. See fetchClients.
  // Filtro por tipo de cliente. Antes era un booleano `showManualClients` que INCLUÍA a
  // los externos en la misma lista: al activarlo, con cero externos cargados, la vista
  // recargaba y volvía a mostrar exactamente los mismos 1378 clientes — que es tal cual
  // lo reportado ("no arroja ningún tipo de información"). Ahora el filtro es excluyente,
  // así que "Externos" muestra externos o muestra vacío, pero nunca miente.
  // La pestaña ES el filtro. Antes era un desplegable aparte: dos fuentes de verdad para lo
  // mismo, y los externos quedaban escondidos detrás de un combo que había que saber abrir.
  const [tab, setTab] = useState<'clientes' | 'externos' | 'satisfaccion'>('clientes');
  const filterKind: 'propios' | 'externos' = tab === 'externos' ? 'externos' : 'propios';
  // Cuántos hay de cada tipo, para el número al lado de cada pestaña.
  const [kindCounts, setKindCounts] = useState<{ propios: number; externos: number } | null>(null);

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
  const [formIsFleet, setFormIsFleet] = useState(false);
  // Cliente externo: lo cargamos a mano, no vino de una venta ni del CRM. Se persiste
  // igual que cualquier otro; la bandera es de origen y de filtrado. NO toca la garantía
  // — eso lo decide `vehicle_models.is_manual`. Ver 20260806150000.
  const [formIsManual, setFormIsManual] = useState(false);
  // De qué convenio vino. Se ofrecen las etiquetas ya usadas para que no se multipliquen
  // ("Seguros Caracas" y "seguros caracas" romperían el filtro).
  const [formExternalSource, setFormExternalSource] = useState('');
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [filterSource, setFilterSource] = useState('todos');
  const [formPin, setFormPin] = useState('');

  // Vehicles
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientVehicles, setClientVehicles] = useState<Record<string, Vehicle[]>>({});
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleClientId, setVehicleClientId] = useState<string>('');
  // Si el dueño es un cliente externo, su vehículo también lo es — sea del catálogo o
  // escrito a mano. "Externo" quiere decir "lo cargamos nosotros a mano", no "la marca no
  // es nuestra"; por eso se marca por el cliente y no solo por el modelo.
  const [vehicleClientIsExternal, setVehicleClientIsExternal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vFormModelId, setVFormModelId] = useState('');
  const [vFormYear, setVFormYear] = useState('');
  const [vFormPlate, setVFormPlate] = useState('');
  const [vFormVin, setVFormVin] = useState('');
  const [vFormColor, setVFormColor] = useState('');
  const [vFormMileage, setVFormMileage] = useState('0');
  const [vFormPurchaseDate, setVFormPurchaseDate] = useState('');
  const [vFormWarranty, setVFormWarranty] = useState(true);
  const [vFormManualBrand, setVFormManualBrand] = useState('');
  const [vFormManualModel, setVFormManualModel] = useState('');
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
  // R7 — postventa survey result per service, shown inline in the vehicle history below.
  const { surveys: vehicleServiceSurveys } = useServiceSurveys(vDetailHistory.map(h => h.id));
  const [vDetailLoading, setVDetailLoading] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'city' | 'state' | 'email' | 'isActive' | 'isManual' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkCity, setBulkCity] = useState('');
  const [bulkState, setBulkState] = useState('');
  const [bulkEmail, setBulkEmail] = useState('');
  const [bulkIsActive, setBulkIsActive] = useState(true);
  const [bulkIsManual, setBulkIsManual] = useState(true);
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Client detail preview dialog (Info / Vehículos / Encuesta tabs)
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  // Set when the dialog is opened from a survey row, so it lands on the Encuestas tab —
  // that is what the user was looking at when they clicked.
  const [surveyTabOnOpen, setSurveyTabOnOpen] = useState(false);
  const [openingSurveyClient, setOpeningSurveyClient] = useState(false);

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

    // Búsqueda, filtros y paginación se resuelven ENTEROS en SQL; sólo vuelven los ids de
    // esta página. Antes las coincidencias por placa/VIN, modelo y chofer se resolvían acá
    // con tres consultas extra y después TODOS los ids encontrados viajaban dentro de la URL
    // como `id.in.(uuid,...)`. Con un término común eso pasaba los ~24 KiB que acepta el
    // gateway de Supabase, que respondía `400 Bad Request` en texto plano: ese era el
    // "Error al cargar clientes" que aparecía al teclear un nombre (medido: "s" → 748 ids →
    // 28.036 chars → 400). Ver supabase/migrations/20260811120000_search_clients_page.sql.
    //
    // No volver a armar filtros con listas de ids en la URL: crece con los datos y vuelve a
    // romper sola cuando la base crece, sin que nadie toque este archivo.
    const { data: pageRows, error: pageError } = await (supabase as any).rpc('search_clients_page', {
      p_query: busquedaDebounced.trim(),
      p_kind: filterKind,
      p_status: filterStatus,
      p_city: filterCity,
      p_warranty: filterWarranty,
      p_source: filterSource,
      p_limit: pageSize,
      p_offset: page * pageSize,
    });

    if (pageError) {
      toast.error('Error al cargar clientes');
      console.error(pageError);
      setLoading(false);
      return;
    }

    // `total_count` viene repetido en cada fila (window function). Con cero filas no hay de
    // dónde leerlo, y cero filas significa que esta página no tiene nada: total 0.
    const rows = (pageRows || []) as { client_id: string; total_count: number }[];
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const ids = rows.map(r => r.client_id);

    if (ids.length === 0) {
      // Pasa al borrar estando en la última página: esa página se quedó sin filas pero la
      // lista no está vacía. Volver a la primera en vez de mostrar un tablero en blanco que
      // parece un error. `loading` queda en true a propósito: el fetch que dispara setPage
      // lo apaga, y así no parpadea un "sin resultados" entre medio.
      if (page > 0) {
        setPage(0);
        return;
      }
      setClients([]);
      setTotalCount(total);
      setLoading(false);
      return;
    }

    // Segundo viaje sólo por las filas de la página: como máximo `pageSize` ids en la URL.
    const { data, error } = await (supabase as any)
      .from('clients')
      .select('*, vehicles(id, warranty_active, is_manual, plate, vehicle_models(brand)), client_users(count), profiles!clients_profile_id_fkey(pin_code)')
      .in('id', ids)
      .order('full_name');

    if (error) {
      toast.error('Error al cargar clientes');
      console.error(error);
    } else {
      setClients((data || []) as Client[]);
      setTotalCount(total);
    }
    setLoading(false);
  };

  const fetchModels = async () => {
    // is_manual = false: manual models are per-vehicle placeholders for
    // third-party service, not commercial catalog — they must never populate
    // this picker (see 20260730140000_manual_vehicles_and_clients.sql).
    const { data } = await (supabase as any)
      .from('vehicle_models')
      .select('id, name, brand, year')
      .eq('is_active', true)
      .eq('is_manual', false)
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
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    setPage(0);
  }, [busquedaDebounced, pageSize, filterStatus, filterWarranty, filterCity, filterKind, filterSource]);

  useEffect(() => {
    fetchClients();
  }, [page, busquedaDebounced, pageSize, filterStatus, filterWarranty, filterCity, filterKind, filterSource]);

  // Etiquetas de convenio ya usadas, para el datalist del formulario y el filtro. Se
  // recarga al guardar un cliente para que un convenio nuevo aparezca sin refrescar.
  const fetchExternalSources = async () => {
    setExternalSources(await listExternalSources());
  };

  /**
   * Totales de cada pestaña. Son GLOBALES a propósito: no los tocan la búsqueda ni los
   * filtros, así que sólo hace falta recalcularlos cuando se crea, borra o re-marca un
   * cliente — no en cada tecla. Por eso no vive dentro de `fetchClients`.
   */
  const fetchKindCounts = async () => {
    const one = (kind: 'propios' | 'externos') => (supabase as any).rpc('search_clients_page', {
      p_query: '', p_kind: kind, p_status: 'todos', p_city: 'todos',
      p_warranty: 'todos', p_source: 'todos', p_limit: 1, p_offset: 0,
    });
    const [p, e] = await Promise.all([one('propios'), one('externos')]);
    const total = (res: { data: { total_count: number }[] | null }) => Number(res.data?.[0]?.total_count ?? 0);
    setKindCounts({ propios: total(p), externos: total(e) });
  };

  /** Lo que hay que refrescar cuando cambia el CONJUNTO de clientes, no la vista. */
  const refreshCounters = () => { fetchKindCounts(); fetchExternalSources(); };

  useEffect(() => {
    fetchModels();
    refreshCounters();
    // Sólo al montar: son catálogos, no dependen de los filtros. Las mutaciones que sí los
    // cambian llaman a refreshCounters() explícitamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep link from the Satisfacción dashboard: `?client=<id>&tab=encuestas`. Works
  // identically at both /admin/clientes and /concesionario/clientes (this component
  // is mounted at both routes — see src/App.tsx) since useSearchParams is
  // route-agnostic; the base path is never hardcoded. Fetches the target client
  // directly by id (not from the currently loaded/paginated `clients` list) so it
  // resolves regardless of pagination/filters. On failure (deleted client, or out of
  // this user's RLS-visible scope) it fails quietly and visibly: a toast, no crash,
  // no empty dialog, and the params are cleared immediately.
  const clientParam = searchParams.get('client');
  const tabParam = searchParams.get('tab');

  useEffect(() => {
    if (!clientParam) return;
    let cancelled = false;

    const openFromDeepLink = async () => {
      const { data, error } = await (supabase as any)
        .from('clients')
        .select('*, vehicles(id, warranty_active, is_manual, plate, vehicle_models(brand)), client_users(count), profiles!clients_profile_id_fkey(pin_code)')
        .eq('id', clientParam)
        .maybeSingle();
      if (cancelled) return;

      if (error || !data) {
        toast.error('No se pudo abrir el cliente indicado: no existe o no tienes acceso.');
        setSearchParams({}, { replace: true });
        return;
      }
      setDetailClient(data as Client);
    };

    openFromDeepLink();
    return () => { cancelled = true; };
  }, [clientParam]);

  /**
   * Opens the client-detail dialog from a row of the Satisfacción table.
   *
   * The survey row only carries `client_id`, and the dialog needs the full client record
   * (plus the nested vehicles/users/pin the list query loads), so it is fetched on demand
   * with the SAME select as the deep-link path rather than reusing the paginated `clients`
   * state — the client behind a survey is very often not on the current page.
   */
  const openClientFromSurvey = async (clientId: string) => {
    if (openingSurveyClient) return;
    setOpeningSurveyClient(true);
    const { data, error } = await (supabase as any)
      .from('clients')
      .select('*, vehicles(id, warranty_active, is_manual, plate, vehicle_models(brand)), client_users(count), profiles!clients_profile_id_fkey(pin_code)')
      .eq('id', clientId)
      .maybeSingle();
    setOpeningSurveyClient(false);

    if (error || !data) {
      toast.error('No se pudo abrir la ficha del cliente: no existe o no tienes acceso.');
      return;
    }
    setSurveyTabOnOpen(true);
    setDetailClient(data as Client);
  };

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
  const openCreateClient = (asExternal = false) => {
    setEditingClient(null);
    setFormName(''); setFormCedula(''); setFormPhone(''); setFormEmail('');
    setFormAddress(''); setFormCity(''); setFormState(''); setFormIsActive(true);
    setFormIsFleet(false);
    setFormIsManual(asExternal);
    setFormExternalSource('');
    setFormPin('');
    setClientDialogOpen(true);
  };

  // Marca/desmarca un cliente ya cargado como externo. Va por RPC y no por dos updates
  // sueltos porque el cliente y sus vehículos tienen que quedar coherentes: marcar al
  // cliente sin arrastrar sus vehículos deja la vista de externos a medias.
  const toggleClientExternal = async (client: Client) => {
    const next = !client.is_manual;
    const { error } = await setClientExternal(client.id, next);
    if (error) {
      toast.error('No se pudo cambiar el tipo de cliente');
      console.error(error);
      return;
    }
    toast.success(next
      ? `${client.full_name} quedó como cliente externo, junto con sus vehículos`
      : `${client.full_name} ya no es cliente externo`);
    fetchClients();
    refreshCounters();
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
    setFormIsFleet(!!client.is_fleet);
    setFormIsManual(!!client.is_manual);
    setFormExternalSource(client.external_source || '');
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
      // Optional flag (R8). It gates the assigned-driver field on this client's vehicles;
      // it is NOT what prevents duplicate surveys — `fn_claim_survey_slot` already
      // rate-limits every client to one survey per 24h regardless of this value.
      is_fleet: formIsFleet,
      // Cliente externo = cargado a mano. Ver 20260806150000.
      is_manual: formIsManual,
      // El trigger normaliza espacios y lo pone en NULL si is_manual queda en false, así que
      // no hace falta limpiarlo acá. Ver 20260811130000.
      external_source: formIsManual ? (formExternalSource.trim() || null) : null,
    };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
      if (error) { toast.error('Error al actualizar cliente'); console.error(error); setSaving(false); return; }

      // Si acá se cambió la marca de externo hay que arrastrar los vehículos, y eso lo
      // resuelve la misma RPC que usa el botón rápido de la lista. El update de arriba ya
      // dejó la bandera del cliente; esto la reafirma y sincroniza sus vehículos.
      if (formIsManual !== editingClient.is_manual) {
        const { error: extErr } = await setClientExternal(editingClient.id, formIsManual);
        if (extErr) {
          toast.error('Cliente guardado, pero no se pudieron sincronizar sus vehículos');
          console.error(extErr);
        }
      }

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

      toast.success('Cliente actualizado'); setClientDialogOpen(false); fetchClients(); refreshCounters();
    } else {
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single();
      if (error) { toast.error('Error al crear cliente'); console.error(error); }
      else {
        // Fire-and-forget: sync the new client into Kommo's Post Venta "En conversación"
        // stage without blocking the success toast/dialog close.
        //
        // NUNCA para un cliente externo. Es un tercero al que le hicimos un servicio
        // suelto, no un cliente comercial: sincronizarlo fabricaría un lead de Post Venta
        // falso por cada entrada de taller. Es la misma guarda que ya tiene el ingreso
        // manual desde reservas (`clientIsManual` en src/lib/reservationAssignment.ts).
        if (data?.id && !formIsManual) syncClientToKommo(data.id).catch(console.error);
        setClientDialogOpen(false);
        fetchClients();
        refreshCounters();

        // `clients_insert` deja crear al concesionario/vendedor, pero `clients_select` solo
        // les muestra clientes que YA tienen una reserva en su concesionario. Sin este
        // aviso el cliente recién creado simplemente no aparece y parece que no se guardó.
        if (data?.id) {
          const { data: visible } = await supabase.from('clients').select('id').eq('id', data.id).maybeSingle();
          if (!visible) {
            toast.info('Guardado. Todavía no lo ves en la lista: aparecerá cuando tenga una reserva en tu concesionario.');
          }
        }

        if (data?.id && formIsManual) {
          // Un cliente externo sin vehículo no sirve para nada: se registra justamente
          // para poder atenderle una unidad. Se encadena el alta del vehículo en vez de
          // dejarlo como un paso que hay que acordarse de hacer después.
          toast.success('Cliente externo creado. Registrá su vehículo.');
          openAddVehicle(data.id, true, true);
        } else {
          toast.success('Cliente creado');
        }
      }
    }
    setSaving(false);
  };

  // Vehicle CRUD
  // `preferManualModel` arranca el diálogo en modo "Otro" (marca/modelo a mano). Se usa al
  // encadenar desde el alta de un cliente externo: lo habitual ahí es un vehículo que no
  // está en nuestro catálogo. Sigue siendo cambiable — un externo también puede traer un
  // GAC que no le vendimos nosotros.
  const openAddVehicle = (clientId: string, clientIsExternal = false, preferManualModel = false) => {
    setEditingVehicle(null);
    setVehicleClientId(clientId);
    setVehicleClientIsExternal(clientIsExternal);
    setVFormModelId(preferManualModel ? MANUAL_MODEL_VALUE : '');
    setVFormYear(new Date().getFullYear().toString());
    setVFormPlate(''); setVFormVin(''); setVFormColor('');
    setVFormMileage('0'); setVFormPurchaseDate(''); setVFormWarranty(true);
    setVFormManualBrand(''); setVFormManualModel('');
    setVehicleDialogOpen(true);
  };

  const handleUnlinkVehicle = async () => {
    if (!unlinkingVehicle) return;
    const vehicleId = unlinkingVehicle.id;
    const clientId = unlinkingVehicle.client_id;
    setUnlinkSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('admin_unlink_vehicle_from_client', {
      p_vehicle_id: vehicleId,
    });
    setUnlinkSaving(false);
    setUnlinkingVehicle(null);

    if (error) {
      console.error(error);
      toast.error(
        (error.message || '').includes('not_authorized')
          ? 'No se pudo desvincular: tu usuario no tiene permisos para esta acción.'
          : 'Error al desvincular el vehículo',
      );
      return;
    }

    // Mismo criterio que el resto de esta pantalla: se actualiza el estado local en vez de
    // refetchear todo — el vehiculo ya no es de este cliente, sale de su lista expandida.
    setClientVehicles(prev => ({
      ...prev,
      [clientId]: (prev[clientId] || []).filter(v => v.id !== vehicleId),
    }));
    setClients(prev => prev.map(c => c.id === clientId
      ? { ...c, vehicles: (c.vehicles || []).filter(v => v.id !== vehicleId) }
      : c));
    toast.success('Vehículo desvinculado. Sigue existiendo en el sistema, sin cliente asignado.');
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setVehicleClientId(vehicle.client_id);
    // Al editar se conserva la marca de externo que ya tenía la ficha. Recalcularla desde
    // el cliente cargado en pantalla la borraría cuando se edita desde otra vista.
    setVehicleClientIsExternal(vehicle.is_manual);
    if (vehicle.is_manual && vehicle.vehicle_models) {
      // Manual models are excluded from `models` (the picker's options), so
      // there is no matching SelectItem for vehicle.model_id — reopen in
      // "Otro" mode with the typed brand/model prefilled instead of showing
      // a blank Select.
      setVFormModelId(MANUAL_MODEL_VALUE);
      setVFormManualBrand(vehicle.vehicle_models.brand);
      setVFormManualModel(vehicle.vehicle_models.name);
    } else {
      setVFormModelId(vehicle.model_id);
      setVFormManualBrand(''); setVFormManualModel('');
    }
    setVFormYear(vehicle.year.toString());
    setVFormPlate(vehicle.plate || '');
    setVFormVin(vehicle.vin || '');
    setVFormColor(vehicle.color || '');
    setVFormMileage(vehicle.mileage.toString());
    setVFormPurchaseDate(vehicle.purchase_date || '');
    setVFormWarranty(vehicle.warranty_active);
    setVehicleDialogOpen(true);
  };

  const handleVFormModelChange = (value: string) => {
    setVFormModelId(value);
    if (value !== MANUAL_MODEL_VALUE) {
      setVFormManualBrand('');
      setVFormManualModel('');
    }
  };

  const handleSaveVehicle = async () => {
    const isManualModel = vFormModelId === MANUAL_MODEL_VALUE;
    if ((!isManualModel && !vFormModelId) || !vFormYear) {
      toast.error('Modelo y año son requeridos');
      return;
    }
    if (isManualModel && (!vFormManualBrand.trim() || !vFormManualModel.trim())) {
      toast.error('Marca y modelo son requeridos');
      return;
    }
    setSavingVehicle(true);

    let modelId = vFormModelId;
    if (isManualModel) {
      const resolvedId = await findOrCreateManualModel(
        supabase as unknown as ManualModelClient,
        vFormManualBrand,
        vFormManualModel,
      );
      if (!resolvedId) {
        toast.error('No se pudo registrar el modelo manual');
        setSavingVehicle(false);
        return;
      }
      modelId = resolvedId;
    }

    const payload = {
      client_id: vehicleClientId,
      model_id: modelId,
      year: parseInt(vFormYear),
      plate: vFormPlate.trim().toUpperCase() || null,
      vin: vFormVin.trim().toUpperCase() || null,
      color: vFormColor.trim() || null,
      mileage: parseInt(vFormMileage) || 0,
      purchase_date: vFormPurchaseDate || null,
      // A third-party vehicle never carries our warranty, regardless of the
      // switch's last value. Ojo: depende del MODELO, no de `is_manual` del vehículo —
      // un cliente externo puede traer un GAC que sí tiene garantía vigente.
      warranty_active: isManualModel ? false : vFormWarranty,
      is_manual: isManualModel || vehicleClientIsExternal,
    };

    if (editingVehicle) {
      const { error } = await (supabase as any).from('vehicles').update(payload).eq('id', editingVehicle.id);
      if (error) { toast.error('Error al actualizar vehículo'); console.error(error); }
      else { toast.success('Vehículo actualizado'); setVehicleDialogOpen(false); fetchVehicles(vehicleClientId); }
    } else {
      const { error } = await (supabase as any).from('vehicles').insert(payload);
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
      const { data, error } = await invokeAdminFunction<{ error?: string }>(
        'create-client-user', {
          email: cuEmail.trim(),
          password: cuPassword,
          full_name: cuFullName.trim() || usersClient.full_name,
          client_id: usersClient.id,
        }, 'Error al crear usuario');

      if (error) {
        toast.error(error);
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
    // Only ever reference a brand we actually sell — a manually-typed
    // third-party vehicle must never appear as "our" brand in this greeting.
    // Without this guard, a client whose only vehicle is manual would leave
    // `brand` empty and produce a broken "post venta de **" message.
    const brand = c.vehicles?.find(v => !v.is_manual && v.vehicle_models?.brand)?.vehicle_models?.brand;
    const msg = brand
      ? `¡Es un gusto saludarte! *${c.full_name}* Te hablamos del departamento de post venta de *${brand}*`
      : `¡Es un gusto saludarte! *${c.full_name}* Te hablamos del departamento de post venta`;
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
    else { toast.success(`${ids.length} cliente(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); fetchClients(); refreshCounters(); }
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('clients').delete().in('id', ids);
    if (error) toast.error('Error al eliminar clientes');
    else { toast.success(`${ids.length} cliente(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchClients(); refreshCounters(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;

    // Externo no es un UPDATE plano: tiene que arrastrar los vehículos de cada cliente,
    // y eso vive en la RPC. Ver 20260806170000_set_clients_external_bulk.sql.
    if (bulkAction === 'isManual') {
      setBulkLoading(true);
      const ids = [...selectedIds];
      const { error } = await setClientsExternal(ids, bulkIsManual);
      if (error) {
        toast.error('No se pudo cambiar el tipo de los clientes');
        console.error(error);
      } else {
        toast.success(bulkIsManual
          ? `${ids.length} cliente(s) marcados como externos, junto con sus vehículos`
          : `${ids.length} cliente(s) ya no son externos`);
        setSelectedIds(new Set());
        setBulkAction(null);
        fetchClients();
        refreshCounters();
      }
      setBulkLoading(false);
      return;
    }

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
    <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="space-y-3">
      <TabsList>
        <TabsTrigger value="clientes" className="gap-1.5">
          Clientes
          {kindCounts && <span className="text-[10px] opacity-70 tabular-nums">{kindCounts.propios}</span>}
        </TabsTrigger>
        <TabsTrigger value="externos" className="gap-1.5">
          <Wrench className="w-3 h-3" />
          Clientes externos
          {kindCounts && <span className="text-[10px] opacity-70 tabular-nums">{kindCounts.externos}</span>}
        </TabsTrigger>
        <TabsTrigger value="satisfaccion">Satisfacción</TabsTrigger>
      </TabsList>

      {/* La lista se renderiza UNA vez para las dos pestañas de clientes, fuera de
          <TabsContent>: es el mismo módulo con otro filtro, y duplicar mil líneas de JSX
          para cambiar un booleano es la forma segura de que las dos copias se despeguen.
          Radix además desmonta el panel inactivo, así que dos TabsContent recargarían la
          tabla entera en cada cambio de pestaña. */}
      {tab !== 'satisfaccion' && (
      <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">
            {tab === 'externos' ? 'Clientes externos' : 'Clientes'}
          </h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {totalCount}
          </Badge>
        </div>
        {canCreate && (
          // En la pestaña de externos, "Nuevo externo" es LA acción: ofrecer ahí un botón
          // que crea un cliente propio sólo lleva a cargarlo en el lugar equivocado.
          <div className="flex items-center gap-2">
            {tab === 'externos' ? (
              <Button size="sm" onClick={() => openCreateClient(true)} className="gac-gradient">
                <Wrench className="w-3.5 h-3.5 mr-1" /> Nuevo externo
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => openCreateClient(true)} title="Cliente cargado a mano, no proveniente de una venta ni del CRM">
                  <Wrench className="w-3.5 h-3.5 mr-1" /> Nuevo externo
                </Button>
                <Button size="sm" onClick={() => openCreateClient(false)} className="gac-gradient">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:flex-1 sm:min-w-[180px] sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar nombre, cédula, correo, teléfono, placa, modelo o chofer..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
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
        {/* Sólo aparece si hay convenios cargados: un filtro con una única opción es ruido. */}
        {externalSources.length > 0 && (
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 text-xs sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los convenios</SelectItem>
              {externalSources.map(s => (
                <SelectItem key={s.source} value={s.source}>{s.source} ({s.clientes})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
            {filterKind === 'externos' && !busqueda.trim() ? (
              // Estado vacío explícito. Antes, con cero externos cargados, el filtro
              // recargaba y devolvía la misma lista completa: parecía que el filtro no
              // hacía nada. Decir que no hay ninguno todavía es información; repetir los
              // 1378 de siempre, no.
              <>
                <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">Todavía no hay clientes externos</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-lg mx-auto">
                  Externo quiere decir que lo cargaste vos a mano, no que vino de una venta o del
                  CRM. Su vehículo puede ser nuestro igual. Se marcan solos al crearlos desde
                  "Nuevo externo" o al usar "Ingresar manualmente" en una reserva.
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-lg mx-auto">
                  Los que ya tenías cargados no se marcaron solos: en la base no queda rastro de
                  cuáles entraron a mano. Marcalos vos con el ícono de llave <Wrench className="w-3 h-3 inline mx-0.5" />
                  desde la pestaña <span className="font-medium">Clientes</span> — sus vehículos
                  se marcan junto con ellos, y podés hacerlo en lote seleccionando varios.
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-lg mx-auto">
                  Con teléfono y una placa cargados, entran solos a <span className="font-mono">/mi-flota</span>:
                  no hay usuario ni contraseña que dar de alta.
                </p>
                {canCreate && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openCreateClient(true)}>
                    <Wrench className="w-3.5 h-3.5 mr-1" /> Registrar cliente externo
                  </Button>
                )}
              </>
            ) : (
              <>
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No se encontraron clientes</p>
              </>
            )}
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
                          {c.is_manual && (
                            <Badge
                              className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 gap-0.5"
                              title={c.external_source
                                ? `Cliente externo — llegó por ${c.external_source}`
                                : 'Cliente cargado a mano, no proveniente de una venta ni del CRM'}
                            >
                              <Wrench className="w-2.5 h-2.5" /> Externo{c.external_source ? ` · ${c.external_source}` : ''}
                            </Badge>
                          )}
                          {c.is_manual && (() => {
                            const falta = portalAccessGap(c);
                            return falta ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-amber-300 text-amber-700" title={`No puede entrar al portal: falta ${falta}`}>
                                <KeyRound className="w-2.5 h-2.5" /> Falta {falta}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-green-300 text-green-700" title="Puede entrar a /mi-flota con su placa y su teléfono">
                                <KeyRound className="w-2.5 h-2.5" /> Portal
                              </Badge>
                            );
                          })()}
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailClient(c)} title="Ver detalle">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('h-7 w-7', c.is_manual && 'text-amber-700')}
                          onClick={() => toggleClientExternal(c)}
                          title={c.is_manual ? 'Quitar la marca de externo' : 'Marcar como cliente externo'}
                        >
                          <Wrench className="w-3.5 h-3.5" />
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
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddVehicle(c.id, c.is_manual)}>
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
                                {isAdmin && (
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-700"
                                    title="Desvincular vehículo del cliente"
                                    onClick={e => { e.stopPropagation(); setUnlinkingVehicle(v); }}
                                  >
                                    <Link2Off className="w-3 h-3" />
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
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{c.full_name}</span>
                        {c.is_manual && (
                          <Badge
                            className="text-[10px] px-1.5 py-0 shrink-0 bg-amber-100 text-amber-800 gap-0.5"
                            title={c.external_source
                              ? `Cliente externo — llegó por ${c.external_source}`
                              : 'Cliente cargado a mano, no proveniente de una venta ni del CRM'}
                          >
                            <Wrench className="w-2.5 h-2.5" /> Externo{c.external_source ? ` · ${c.external_source}` : ''}
                          </Badge>
                        )}
                        {c.is_manual && (() => {
                          const falta = portalAccessGap(c);
                          return falta ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 gap-0.5 border-amber-300 text-amber-700" title={`No puede entrar al portal: falta ${falta}`}>
                              <KeyRound className="w-2.5 h-2.5" /> Falta {falta}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 gap-0.5 border-green-300 text-green-700" title="Puede entrar a /mi-flota con su placa y su teléfono">
                              <KeyRound className="w-2.5 h-2.5" /> Portal
                            </Badge>
                          );
                        })()}
                      </div>
                    </TableCell>
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
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDetailClient(c)} title="Ver detalle">
                          <Eye className="w-3 h-3" />
                        </Button>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn('h-6 w-6', c.is_manual && 'text-amber-700')}
                            onClick={() => toggleClientExternal(c)}
                            title={c.is_manual ? 'Quitar la marca de externo' : 'Marcar como cliente externo'}
                          >
                            <Wrench className="w-3 h-3" />
                          </Button>
                        )}
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
                          <Button size="sm" variant="outline" onClick={() => openAddVehicle(c.id, c.is_manual)}>
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
                                  {isAdmin && (
                                    <Button
                                      variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                                      title="Desvincular vehículo del cliente"
                                      onClick={e => { e.stopPropagation(); setUnlinkingVehicle(v); }}
                                    >
                                      <Link2Off className="w-3 h-3" />
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

            <div className="flex items-center justify-between">
              <div>
                <Label>Cliente de flota</Label>
                <p className="text-xs text-muted-foreground">
                  Habilita el registro de choferes y su asignación a cada vehículo
                </p>
              </div>
              <Switch checked={formIsFleet} onCheckedChange={setFormIsFleet} />
            </div>

            <div className="flex items-center justify-between">
              <div className="pr-3">
                <Label>Cliente externo</Label>
                <p className="text-xs text-muted-foreground">
                  Cargado a mano, no vino de una venta ni del CRM. Su vehículo puede ser nuestro
                  igual — la garantía no se toca. Al activarlo, sus vehículos también quedan
                  marcados como externos.
                </p>
              </div>
              <Switch checked={formIsManual} onCheckedChange={setFormIsManual} />
            </div>

            {formIsManual && (
              <div className="space-y-1.5 rounded-lg border p-3 bg-muted/30">
                <Label htmlFor="external-source">Convenio de origen</Label>
                <Input
                  id="external-source"
                  list="external-sources-list"
                  placeholder="Ej: Seguros Caracas, Flota Polar…"
                  value={formExternalSource}
                  onChange={e => setFormExternalSource(e.target.value)}
                />
                <datalist id="external-sources-list">
                  {externalSources.map(s => <option key={s.source} value={s.source} />)}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Con qué empresa o alianza llegó. Sirve para filtrarlos después y saber
                  cuántos trae cada convenio. Podés dejarlo vacío.
                </p>

                {/* El acceso al portal no se activa ni se provisiona: se entra con la placa
                    y el teléfono. Por eso lo único que puede fallar es que falte uno de los
                    dos, y eso hay que decirlo acá y no descubrirlo cuando el cliente llame. */}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Acceso al portal
                  </p>
                  {formPhone.trim() ? (
                    <p className="text-xs text-muted-foreground">
                      Entra en <span className="font-mono">/mi-flota</span> con la placa de su
                      vehículo y este teléfono. No hay usuario ni contraseña que crear.
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Sin teléfono no va a poder entrar: el teléfono es lo que confirma que es
                      él, porque la placa está a la vista de cualquiera. Cargalo arriba.
                    </p>
                  )}
                </div>
              </div>
            )}

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
                          <ServiceSurveyInline survey={vehicleServiceSurveys.get(h.id)} />
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
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('isManual'); setBulkIsManual(true); }}>
              <Wrench className="w-3 h-3" /> Externo
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
              {bulkAction === 'isManual' && 'Marcar como clientes externos'}
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
            {bulkAction === 'isManual' && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-3">
                  <p className="text-sm font-medium">{bulkIsManual ? 'Cliente externo' : 'Cliente propio'}</p>
                  <p className="text-xs text-muted-foreground">
                    Externo = cargado a mano. Sus vehículos se marcan junto con él. La garantía
                    no se toca.
                  </p>
                </div>
                <Switch checked={bulkIsManual} onCheckedChange={setBulkIsManual} />
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

      <AlertDialog open={!!unlinkingVehicle} onOpenChange={open => !open && setUnlinkingVehicle(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular este vehículo del cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkingVehicle && (
                <>
                  {unlinkingVehicle.vehicle_models?.brand} {unlinkingVehicle.vehicle_models?.name} {unlinkingVehicle.year}
                  {unlinkingVehicle.plate ? ` · ${unlinkingVehicle.plate}` : ''} dejará de estar afiliado a este
                  cliente y desaparecerá de su ficha. El vehículo NO se elimina — sigue existiendo
                  en el sistema, sin cliente asignado. Esta acción no se puede deshacer desde aquí.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkVehicle}
              disabled={unlinkSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinkSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Desvincular'}
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
              <div className="space-y-2 col-span-2">
                <Label>Modelo *</Label>
                <Select value={vFormModelId} onValueChange={handleVFormModelChange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                  <SelectContent>
                    {/* FIRST, not last: the catalog holds 269 active models, so at the bottom
                        this option was effectively invisible. */}
                    <SelectItem value={MANUAL_MODEL_VALUE} className="font-medium">Otro / escribir manualmente</SelectItem>
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.brand} {m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {vFormModelId === MANUAL_MODEL_VALUE && (
                <div className="col-span-2 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Vehículo de un tercero (no vendido por nosotros). Se registrará <strong>sin garantía</strong>: solo queda constancia del servicio realizado.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Marca *</Label>
                      <Input value={vFormManualBrand} onChange={e => setVFormManualBrand(e.target.value)} placeholder="Ej: Toyota" />
                    </div>
                    <div className="space-y-1">
                      <Label>Modelo *</Label>
                      <Input value={vFormManualModel} onChange={e => setVFormManualModel(e.target.value)} placeholder="Ej: Corolla" />
                    </div>
                  </div>
                </div>
              )}
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
            {vFormModelId === MANUAL_MODEL_VALUE ? (
              <p className="text-xs text-muted-foreground">Sin garantía (vehículo de tercero)</p>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <Label>Garantía Activa</Label>
                  <p className="text-xs text-muted-foreground">El vehículo tiene garantía vigente</p>
                </div>
                <Switch checked={vFormWarranty} onCheckedChange={setVFormWarranty} />
              </div>
            )}
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
      )}

      <TabsContent value="satisfaccion">
        {/* Dos encuestas distintas, dos paneles distintos, y por una razón que no es de
            estilo: los números no son sumables. La de venta son cinco aspectos con escala
            1..5 y sus respuestas viven en `satisfaction_responses`; la de postventa son ocho
            preguntas cerradas y las suyas viven en `service_survey_responses`. Mezclarlas en
            una sola vista es lo que hacía que la de postventa apareciera como "enviada y
            nunca respondida" — por eso hasta hoy estaba filtrada afuera y no se veía en
            ningún lado. */}
        <Tabs defaultValue="venta" className="space-y-4">
          <TabsList>
            <TabsTrigger value="venta">Entrega de Vehículo</TabsTrigger>
            <TabsTrigger value="postservicio">Post Servicio</TabsTrigger>
          </TabsList>
          <TabsContent value="venta">
            <SatisfactionOverview onSelectClient={openClientFromSurvey} />
          </TabsContent>
          <TabsContent value="postservicio">
            {/* Mismo handler que la tabla de ventas: la fila abre la ficha del cliente. */}
            <ServiceSatisfactionOverview onSelectClient={openClientFromSurvey} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* Client Detail Preview Dialog (Info / Vehículos / Choferes / Encuestas).
          Rendered OUTSIDE <TabsContent> on purpose: Radix unmounts inactive tab panels, so
          keeping it inside "clientes" meant opening a client from the Satisfacción tab
          rendered nothing at all. */}
      <ClientDetailDialog
        client={detailClient}
        open={!!detailClient}
        onOpenChange={(o) => {
          if (!o) {
            setDetailClient(null);
            setSurveyTabOnOpen(false);
            // Clear/normalize the deep-link params on close so a back-navigation
            // does not immediately reopen the dialog.
            if (clientParam || tabParam) setSearchParams({}, { replace: true });
          }
        }}
        models={models}
        // `tab=postservicio` abre la ficha en Encuestas con la sub-pestaña de taller ya
        // seleccionada: es adonde apunta el listado del panel Post Servicio.
        defaultTab={
          tabParam === 'postservicio'
            ? 'postservicio'
            : surveyTabOnOpen || tabParam === 'encuestas'
              ? 'encuesta'
              : undefined
        }
      />
    </Tabs>
  );
};

export default AdminClientes;
