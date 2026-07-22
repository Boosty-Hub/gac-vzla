import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { MapPin, Clock, Car, CalendarDays, Check, ArrowLeft, User, LogOut, Building, Wrench, ClipboardList, ShieldCheck, ShieldX, Hash, ChevronRight, Pencil, XCircle, FileText, ExternalLink, Search, KeyRound, Eye, EyeOff } from 'lucide-react';
import gacLogo from '@/assets/gac-logo.png';
import dfskLogo from '@/assets/dfsk-logo.png';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { createKommoReservation } from '@/lib/kommo';
import { resolveWarrantyCondition, evaluateWarranty, formatServiceCount, type WarrantyConditionRef } from '@/lib/warranty';
import { computeSlotOccupancy, type CapacityReservation } from '@/lib/reservationCapacity';
import { isInternalServiceType } from '@/lib/serviceTypes';

interface ClientData {
  id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface Vehicle {
  id: string;
  plate: string;
  year: number;
  color: string | null;
  mileage: number;
  vin: string | null;
  warranty_active: boolean;
  purchase_date: string | null;
  vehicle_models: { name: string; brand: string; warranty_km: number | null; warranty_months: number | null; warranty_service_interval_km: number | null } | null;
}

interface VehicleServiceRecord {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  service_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  /** Client-visible follow-up recommendation. Staff-only `internal_notes` is deliberately NOT selected/exposed here. */
  recommendation: string | null;
  dealerships: { name: string } | null;
}

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  is_service_center: boolean;
  opening_hour: number;
  closing_hour: number;
  bays: number | null;
}

interface ServiceType {
  id: number;
  name: string;
  duration_minutes: number;
  requires_description: boolean;
}

interface Reservation {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  service_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  /** Client-visible follow-up recommendation. Staff-only `internal_notes` is deliberately NOT selected/exposed here. */
  recommendation: string | null;
  dealerships: { name: string } | null;
  vehicles: { plate: string; year: number; vehicle_models: { name: string; brand: string } | null } | null;
}


// Genera bloques de hora según la duración del servicio y el horario del concesionario.
// openingHour: hora de apertura (ej. 8 = 08:00). closingHour: hora de cierre (ej. 16 = 16:00).
// El último bloque disponible inicia exactamente en closingHour:00.
const generateTimeSlots = (durationMinutes: number, openingHour = 8, closingHour = 17): string[] => {
  const slots: string[] = [];
  const step = Math.max(durationMinutes, 30); // mínimo 30 min de intervalo
  const lastSlotMin = closingHour * 60;
  for (let min = openingHour * 60; min <= lastSlotMin; min += step) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 12) continue; // omitir hora de almuerzo
    slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
  return slots;
};


// Retorna la fecha de hoy en la zona horaria de Venezuela (UTC-4)
const getTodayVzla = () => {
  const now = new Date();
  const vzla = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  return new Date(vzla.getFullYear(), vzla.getMonth(), vzla.getDate());
};

// Retorna la hora actual en Venezuela como string "HH:MM"
const getNowTimeVzla = () => {
  const now = new Date();
  const vzla = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const h = vzla.getHours().toString().padStart(2, '0');
  const m = vzla.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

// True si el slot de hora ya pasó en el día de hoy Venezuela
const isSlotPast = (slot: string, selectedDate: Date | undefined) => {
  if (!selectedDate) return false;
  const todayVzla = getTodayVzla();
  const sel = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  if (sel.getTime() !== todayVzla.getTime()) return false;
  return slot <= getNowTimeVzla();
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

// Minimum active vehicles required to switch "Mis Vehículos" into the enhanced
// fleet-control view (search, filters, prioritization). Change to 3 in one line.
const FLEET_VIEW_MIN_VEHICLES = 2;

// A service is considered "due soon" when the vehicle is within this many km
// below its next projected service mileage.
const SERVICE_PROXIMITY_KM = 1500;

type ServiceStatus = 'vencido' | 'proximo' | 'al_dia';

const SERVICE_STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string }> = {
  vencido: { label: 'Servicio vencido', color: 'bg-red-100 text-red-800' },
  proximo: { label: 'Servicio próximo', color: 'bg-yellow-100 text-yellow-800' },
  al_dia: { label: 'Servicio al día', color: 'bg-green-100 text-green-800' },
};

const UP_LS_KEY = 'userportal_reserva_flow';
const getUpLS = () => { try { return JSON.parse(localStorage.getItem(UP_LS_KEY) || '{}'); } catch { return {}; } };

const UserPortal = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);

  // Edit reservation
  const [editOpen, setEditOpen] = useState(false);
  const [editRes, setEditRes] = useState<Reservation | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editTime, setEditTime] = useState('');
  const [editService, setEditService] = useState('');
  const [editMileage, setEditMileage] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Cancel reservation
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Warranty & vehicle history
  const [warrantyConditions, setWarrantyConditions] = useState<WarrantyConditionRef[]>([]);
  const [selectedVehDetail, setSelectedVehDetail] = useState<Vehicle | null>(null);
  const [vehHistory, setVehHistory] = useState<VehicleServiceRecord[]>([]);
  const [loadingVehHistory, setLoadingVehHistory] = useState(false);
  const [vehServiceCounts, setVehServiceCounts] = useState<Record<string, number>>({});

  // PIN de acceso (gestionado sobre profiles.pin_code del propio usuario)
  const [pinSaved, setPinSaved] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Views
  const validVistas = ['inicio', 'reservar', 'mis-reservas', 'mis-vehiculos', 'perfil'] as const;
  type Vista = typeof validVistas[number];
  const storedVista = localStorage.getItem('userportal_vista') as Vista | null;
  const [vista, setVistaState] = useState<Vista>(storedVista && validVistas.includes(storedVista) ? storedVista : 'inicio');
  const setVista = (v: Vista) => { setVistaState(v); localStorage.setItem('userportal_vista', v); };

  // Reservation flow (initialized from localStorage to survive page refresh)
  const [paso, setPaso] = useState<number>(() => { const ls = getUpLS(); return (ls.paso && ls.paso < 4) ? ls.paso : 1; });
  const [reservaConfirmada, setReservaConfirmada] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [selectedDealership, setSelectedDealership] = useState<string>(() => getUpLS().selectedDealership || '');
  const [selectedVehicle, setSelectedVehicle] = useState<string>(() => getUpLS().selectedVehicle || '');
  const [selectedService, setSelectedService] = useState<string>(() => getUpLS().selectedService || '');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => { const d = getUpLS().selectedDate; return d ? new Date(d) : undefined; });
  const [selectedTime, setSelectedTime] = useState<string>(() => getUpLS().selectedTime || '');
  const [mileage, setMileage] = useState<string>(() => getUpLS().mileage || '');
  const [notes, setNotes] = useState<string>(() => getUpLS().notes || '');
  const [reservaReportUrl, setReservaReportUrl] = useState<string | null>(null);
  // Raw non-cancelled reservations for the chosen dealership + date; a slot is only
  // full when concurrent bookings reach the dealership's bay capacity.
  const [dayReservations, setDayReservations] = useState<CapacityReservation[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Fleet-control view (enhanced "Mis Vehículos" when client has multiple vehicles)
  const [fleetSearch, setFleetSearch] = useState('');
  const [fleetServiceFilter, setFleetServiceFilter] = useState<'todos' | 'vencido' | 'proximo' | 'al_dia'>('todos');
  const [fleetWarrantyFilter, setFleetWarrantyFilter] = useState<'todas' | 'activa' | 'vencida'>('todas');

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
    finally { navigate('/login'); }
  };

  // Persist reservation flow to localStorage so a page refresh restores progress
  useEffect(() => {
    if (vista !== 'reservar' || reservaConfirmada) return;
    try {
      localStorage.setItem(UP_LS_KEY, JSON.stringify({
        paso, selectedDealership, selectedVehicle, selectedService,
        selectedDate: selectedDate ? selectedDate.toISOString() : null,
        selectedTime, mileage, notes,
      }));
    } catch {}
  }, [vista, reservaConfirmada, paso, selectedDealership, selectedVehicle, selectedService, selectedDate, selectedTime, mileage, notes]);

  const sortDealerships = (deals: Dealership[]) => {
    return [...deals].sort((a, b) => {
      const aIsCentro = a.name.toLowerCase().includes('centro de servicio');
      const bIsCentro = b.name.toLowerCase().includes('centro de servicio');
      if (aIsCentro && !bIsCentro) return 1;
      if (!aIsCentro && bIsCentro) return -1;
      return a.name.localeCompare(b.name);
    });
  };

  const fetchOccupiedTimes = async (dealershipId: string, date: Date) => {
    if (!dealershipId || !date) return;
    setLoadingTimes(true);
    setDayReservations([]);
    setSelectedTime('');

    const dateStr = format(date, 'yyyy-MM-dd');
    // Security: read taken slots through the security-definer RPC (no direct
    // SELECT on reservations). The RPC returns time + service_type, which feeds the
    // bay-capacity computation (re2) without exposing any client data.
    const { data } = await supabase.rpc('get_taken_reservation_times', {
      p_dealership_id: dealershipId,
      p_date: dateStr,
    });

    if (data) setDayReservations(data as unknown as CapacityReservation[]);
    setLoadingTimes(false);
  };

  const getServiceDuration = (name: string) =>
    serviceTypes.find(s => s.name === name)?.duration_minutes ?? 60;

  const handleDateSelectReserva = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedTime('');
    if (date && selectedDealership) {
      fetchOccupiedTimes(selectedDealership, date);
    }
  };

  // On mount: re-fetch occupied times if a date+dealership were restored from LS
  useEffect(() => {
    if (selectedDate && selectedDealership) {
      fetchOccupiedTimes(selectedDealership, selectedDate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve client from profile
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      // Try direct profile_id link first, then client_users
      let clientId: string | null = null;
      const { data: directClient } = await supabase
        .from('clients')
        .select('*')
        .eq('profile_id', user.id)
        .limit(1);

      if (directClient && directClient.length > 0) {
        setClientData(directClient[0] as any);
        clientId = directClient[0].id;
      } else {
        // Try client_users
        const { data: links } = await supabase
          .from('client_users')
          .select('client_id, clients(*)')
          .eq('profile_id', user.id)
          .limit(1);
        if (links && links.length > 0) {
          setClientData((links[0] as any).clients);
          clientId = links[0].client_id;
        }
      }

      // Fetch vehicles
      if (clientId) {
        const { data: vehs } = await supabase
          .from('vehicles')
          .select('id, plate, year, color, mileage, vin, warranty_active, purchase_date, vehicle_models(name, brand, warranty_km, warranty_months, warranty_service_interval_km)')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('year', { ascending: false });
        setVehicles((vehs || []) as Vehicle[]);

        // Fetch reservations for this client
        const { data: res } = await supabase
          .from('reservations')
          .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, recommendation, dealerships(name), vehicles(plate, year, vehicle_models(name, brand))')
          .eq('client_id', clientId)
          .order('reservation_date', { ascending: false })
          .limit(50);
        setReservations((res || []) as unknown as Reservation[]);
      }

      // Fetch dealerships
      const { data: deals } = await supabase
        .from('dealerships')
        .select('id, name, city, state, phone, address, google_maps_url, is_service_center, opening_hour, closing_hour, bays')
        .eq('is_active', true)
        .eq('is_service_center', true);
      setDealerships(sortDealerships((deals || []) as Dealership[]));

      // Fetch service types
      const { data: stData } = await supabase
        .from('service_types')
        .select('id, name, duration_minutes, requires_description')
        .eq('is_active', true)
        .order('name');
      setServiceTypes(((stData || []) as unknown as ServiceType[]).filter(s => !isInternalServiceType(s.name)));

      // Fetch warranty conditions (full active set for the shared warranty lib)
      const { data: wcData } = await supabase
        .from('warranty_conditions')
        .select('id, name, max_km, max_months, service_interval_km, is_active')
        .eq('is_active', true);
      setWarrantyConditions((wcData || []) as WarrantyConditionRef[]);

      setLoading(false);
    };
    load();
  }, [user]);

  // Cargar el PIN de acceso actual del propio usuario
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('pin_code').eq('id', user.id).maybeSingle()
      .then(({ data }) => setPinSaved(((data?.pin_code as string | null) || null)));
  }, [user]);

  const savePin = async () => {
    if (!user) return;
    if (!/^\d{4}$/.test(pinInput)) { toast.error('El PIN debe ser de 4 dígitos'); return; }
    setPinSaving(true);
    const { error } = await supabase.from('profiles').update({ pin_code: pinInput }).eq('id', user.id);
    setPinSaving(false);
    if (error) {
      toast.error((error as { code?: string }).code === '23505'
        ? 'Ese PIN ya está en uso, elige otro'
        : 'No se pudo guardar el PIN');
      return;
    }
    setPinSaved(pinInput);
    setPinInput('');
    setShowPin(false);
    toast.success('PIN guardado');
  };

  const removePin = async () => {
    if (!user) return;
    setPinSaving(true);
    const { error } = await supabase.from('profiles').update({ pin_code: null }).eq('id', user.id);
    setPinSaving(false);
    if (error) { toast.error('No se pudo quitar el PIN'); return; }
    setPinSaved(null);
    setPinInput('');
    setShowPin(false);
    toast.success('PIN eliminado');
  };

  // Fetch completed service counts per vehicle for warranty evaluation
  useEffect(() => {
    if (vehicles.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('reservations')
        .select('vehicle_id')
        .eq('status', 'completada')
        .in('vehicle_id', vehicles.map(v => v.id));
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.vehicle_id] = (counts[r.vehicle_id] || 0) + 1; });
      setVehServiceCounts(counts);
    })();
  }, [vehicles]);

  // Warranty evaluation delegates to the shared @/lib/warranty module (same logic
  // as WarrantyChip). Service count is informational only and no longer voids the
  // warranty. Uses per-model overrides with global-condition fallback.
  const evaluateVehicleWarranty = (v: Vehicle) => {
    const resolved = resolveWarrantyCondition(v.vehicle_models, warrantyConditions);
    const result = evaluateWarranty(
      { mileage: v.mileage, warranty_active: v.warranty_active, purchase_date: v.purchase_date },
      resolved,
      vehServiceCounts[v.id] || 0,
    );
    return {
      active: result.active,
      reason: result.reasons.join(' · '),
      monthsRemaining: result.monthsRemaining,
      kmRemaining: result.kmRemaining,
      servicesExpected: result.servicesExpected,
      servicesCompleted: result.servicesCompleted,
      nextServiceKm: result.nextServiceKm,
    };
  };

  // Plates of vehicles that already have an open service reservation.
  const pendingServicePlates = new Set(
    reservations
      .filter(r => ['pendiente', 'confirmada', 'en_proceso'].includes(r.status))
      .map(r => (r.vehicles?.plate || '').toLowerCase())
      .filter(Boolean),
  );

  // Derive a per-vehicle service status from the already-loaded warranty projection
  // (expected vs completed services, nextServiceKm) and the client's pending
  // reservations. Purely client-side — no extra Supabase calls.
  const getServiceStatus = (
    v: Vehicle,
    w: { nextServiceKm: number; servicesExpected: number; servicesCompleted: number },
  ): ServiceStatus => {
    // A scheduled reservation means the service is already being handled.
    if (pendingServicePlates.has((v.plate || '').toLowerCase())) return 'proximo';
    // Behind on services for the driven mileage -> overdue.
    if (w.servicesExpected > w.servicesCompleted) return 'vencido';
    // Close to the next projected service milestone -> due soon.
    if (w.nextServiceKm > 0 && w.nextServiceKm - v.mileage <= SERVICE_PROXIMITY_KM) return 'proximo';
    return 'al_dia';
  };

  // Shared vehicle card used by both the simple list and the fleet-control view.
  // Passing showService renders the service-status badge (fleet view only).
  const renderVehicleCard = (v: Vehicle, showService = false) => {
    const w = evaluateVehicleWarranty(v);
    const serviceStatus = showService ? getServiceStatus(v, w) : null;
    return (
      <Card key={v.id} className={cn("gac-shadow border-l-4 cursor-pointer hover:shadow-md transition-shadow", w.active ? "border-l-green-500" : "border-l-red-500")} onClick={() => openVehicleDetail(v)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Car className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</p>
                <p className="text-xs text-muted-foreground">{v.plate} · {v.mileage.toLocaleString()} km{v.color ? ` · ${v.color}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-1", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                {w.active ? 'Activa' : 'Inactiva'}
              </Badge>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
          {serviceStatus && (
            <div className="mt-2.5">
              <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit", SERVICE_STATUS_CONFIG[serviceStatus].color)}>
                <Wrench className="w-3 h-3" /> {SERVICE_STATUS_CONFIG[serviceStatus].label}
              </Badge>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted rounded-lg p-1.5">
              <p className="text-sm font-bold">{w.servicesCompleted}</p>
              <p className="text-[10px] text-muted-foreground">Servicios</p>
              <p className="text-[10px] text-muted-foreground/80">Sugeridos por km: {w.servicesExpected}</p>
            </div>
            <div className="bg-muted rounded-lg p-1.5">
              <p className="text-sm font-bold">{w.kmRemaining > 0 ? `${(w.kmRemaining / 1000).toFixed(0)}k` : '0'}</p>
              <p className="text-[10px] text-muted-foreground">Km rest.</p>
            </div>
            <div className="bg-muted rounded-lg p-1.5">
              <p className="text-sm font-bold">{w.monthsRemaining > 0 ? `${w.monthsRemaining}m` : '0'}</p>
              <p className="text-[10px] text-muted-foreground">Meses rest.</p>
            </div>
          </div>
          {!w.active && w.reason && (
            <p className="mt-2 text-[10px] text-red-600 font-medium">⚠ {w.reason}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  const openVehicleDetail = async (v: Vehicle) => {
    setSelectedVehDetail(v);
    setVehHistory([]);
    setLoadingVehHistory(true);
    const { data } = await supabase
      .from('reservations')
      .select('id, reservation_date, reservation_time, service_type, current_mileage, status, service_notes, technical_report_url, completed_at, recommendation, dealerships(name)')
      .eq('vehicle_id', v.id)
      .order('reservation_date', { ascending: false })
      .limit(50);
    setVehHistory((data || []) as unknown as VehicleServiceRecord[]);
    setLoadingVehHistory(false);
  };

  const iniciarReserva = (dealershipId: string) => {
    try { localStorage.removeItem(UP_LS_KEY); } catch {}
    setSelectedDealership(dealershipId);
    setSelectedVehicle('');
    setSelectedService('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setMileage('');
    setNotes('');
    setDayReservations([]);
    setVehicleSearch('');
    setReservaConfirmada(false);
    setPaso(1);
    setVista('reservar');
  };

  const confirmarReserva = async () => {
    if (!clientData || !selectedVehicle || !selectedDealership || !selectedDate || !selectedTime || !selectedService) return;
    // Defense-in-depth: a stale selection (service change / localStorage restore) could now be full.
    const slotDuration = serviceTypes.find(s => s.name === selectedService)?.duration_minutes ?? 30;
    const occ = computeSlotOccupancy({
      existingReservations: dayReservations,
      startTime: selectedTime,
      durationMinutes: slotDuration,
      bays: selectedDealershipData?.bays,
      resolveDuration: getServiceDuration,
    });
    if (occ.full) {
      toast.error(`Sin disponibilidad: las ${occ.capacity} bahía(s) ya están ocupadas en ese horario.`);
      return;
    }
    setSaving(true);
    const { data: clientInserted, error } = await supabase.from('reservations').insert({
      dealership_id: selectedDealership,
      client_id: clientData.id,
      vehicle_id: selectedVehicle,
      reservation_date: format(selectedDate, 'yyyy-MM-dd'),
      reservation_time: selectedTime,
      service_type: selectedService,
      current_mileage: parseInt(mileage) || 0,
      status: 'pendiente',
      notes: notes.trim() || null,
      technical_report_url: reservaReportUrl || null,
      created_by_name: clientData.full_name || 'Cliente',
      created_by_role: 'Cliente',
      created_by_profile_id: user?.id || null,
    }).select('id').single();
    if (error) { toast.error('Error al crear reserva'); console.error(error); }
    else {
      if (clientInserted?.id) createKommoReservation(clientInserted.id).catch(console.error);
      try { localStorage.removeItem(UP_LS_KEY); } catch {}
      setReservaConfirmada(true);
      setPaso(4);
      // Refresh reservations
      const { data: res } = await supabase
        .from('reservations')
        .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, recommendation, dealerships(name), vehicles(plate, year, vehicle_models(name, brand))')
        .eq('client_id', clientData.id)
        .order('reservation_date', { ascending: false })
        .limit(50);
      setReservations((res || []) as unknown as Reservation[]);
    }
    setSaving(false);
  };

  const volverInicio = () => {
    try { localStorage.removeItem(UP_LS_KEY); } catch {}
    setVista('inicio');
    setReservaConfirmada(false);
    setPaso(1);
    setReservaReportUrl(null);
  };

  const refreshReservations = async () => {
    if (!clientData) return;
    const { data: res } = await supabase
      .from('reservations')
      .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, recommendation, dealerships(name), vehicles(plate, year, vehicle_models(name, brand))')
      .eq('client_id', clientData.id)
      .order('reservation_date', { ascending: false })
      .limit(50);
    setReservations((res || []) as unknown as Reservation[]);
  };

  const openEditReservation = (r: Reservation) => {
    setEditRes(r);
    setEditDate(new Date(r.reservation_date + 'T12:00:00'));
    setEditTime(r.reservation_time?.slice(0, 5) || '');
    setEditService(r.service_type);
    setEditMileage(String(r.current_mileage || 0));
    setEditNotes(r.notes || '');
    setDetailRes(null);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editRes || !editDate || !editTime || !editService) return;
    setEditSaving(true);
    const { error } = await supabase.from('reservations').update({
      reservation_date: format(editDate, 'yyyy-MM-dd'),
      reservation_time: editTime,
      service_type: editService,
      current_mileage: parseInt(editMileage) || 0,
      // notes are internal-only — the client never edits them, so do not overwrite.
    }).eq('id', editRes.id);
    if (error) { toast.error('Error al actualizar la cita'); console.error(error); }
    else { toast.success('Cita actualizada'); setEditOpen(false); refreshReservations(); }
    setEditSaving(false);
  };

  const openCancelConfirm = (r: Reservation) => {
    setCancelTarget(r);
    setDetailRes(null);
    setCancelOpen(true);
  };

  const handleCancelReservation = async () => {
    if (!cancelTarget || !clientData) return;
    setCancelling(true);

    const { error, count } = await supabase
      .from('reservations')
      .update({ status: 'cancelada' })
      .eq('id', cancelTarget.id)
      .select('id', { count: 'exact', head: true });

    if (error || count === 0) {
      toast.error('No se pudo cancelar la cita. Por favor contacta al concesionario.');
      console.error('Cancel error:', error, 'rows updated:', count);
      setCancelling(false);
      return;
    }

    // Fan-out de notificaciones (a admins + concesionario) server-side
    await supabase.rpc('notify_reservation_cancellation', { p_reservation_id: cancelTarget.id });

    toast.success('Tu cita ha sido cancelada. El bloque de horario quedó liberado.', { duration: 5000 });
    setCancelOpen(false);
    setCancelTarget(null);
    setCancelling(false);
    refreshReservations();
  };

  const selectedDealershipData = dealerships.find(d => d.id === selectedDealership);
  const selectedVehicleData = vehicles.find(v => v.id === selectedVehicle);
  const editDealershipData = editRes ? dealerships.find(d => d.name === editRes.dealerships?.name) : undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gac-charcoal px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {vista !== 'inicio' && (
            <button onClick={volverInicio} className="text-white/70 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            {(() => {
              const brands = Array.from(new Set(vehicles.map(v => v.vehicle_models?.brand).filter(Boolean) as string[]));
              const hasGac = brands.some(b => b.toUpperCase() === 'GAC');
              const hasDfsk = brands.some(b => b.toUpperCase() === 'DFSK');
              if (!hasGac && !hasDfsk) return null;
              return (
                <div className="flex items-center gap-2 h-8">
                  {hasGac && (
                    <img src={gacLogo} alt="GAC" className="h-7 w-auto object-contain brightness-0 invert" />
                  )}
                  {hasGac && hasDfsk && (
                    <div className="w-px h-5 bg-white/30 self-center" />
                  )}
                  {hasDfsk && (
                    <img src={dfskLogo} alt="DFSK" className="h-7 w-auto object-contain brightness-0 invert" />
                  )}
                </div>
              );
            })()}
            <p className="text-xs text-white/60 leading-tight">
              {clientData ? clientData.full_name : profile?.full_name || 'Portal Cliente'}
            </p>
          </div>
        </div>
        <button onClick={handleSignOut} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t z-50 flex">
        {[
          { id: 'inicio' as const, label: 'Agendar', icon: MapPin },
          { id: 'mis-reservas' as const, label: 'Mis Citas', icon: CalendarDays },
          { id: 'mis-vehiculos' as const, label: 'Vehículos', icon: Car },
          { id: 'perfil' as const, label: 'Mi Perfil', icon: User },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setVista(tab.id); if (tab.id === 'inicio') volverInicio(); }}
            className={cn(
              "flex-1 flex flex-col items-center py-2.5 text-xs transition-colors",
              vista === tab.id ? "text-primary font-medium" : "text-muted-foreground"
            )}
          >
            <tab.icon className="w-5 h-5 mb-0.5" />
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="pb-20 px-4 pt-4">
        {/* Inicio: Lista de Concesionarios */}
        {vista === 'inicio' && (() => {
          const states = Array.from(new Set(dealerships.map(d => d.state).filter(Boolean) as string[])).sort();
          const cities = Array.from(new Set(
            dealerships
              .filter(d => !filterState || d.state === filterState)
              .map(d => d.city)
              .filter(Boolean) as string[]
          )).sort();
          const filteredDealerships = dealerships.filter(d => {
            if (filterState && d.state !== filterState) return false;
            if (filterCity && d.city !== filterCity) return false;
            return true;
          });

          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-display font-bold">Agendar Servicio</h2>
                <p className="text-sm text-muted-foreground">Selecciona tu ubicación y concesionario</p>
              </div>

              {vehicles.length === 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-4 text-xs text-amber-800">
                    <p className="font-semibold">No tienes vehículos registrados</p>
                    <p>Contacta a tu concesionario para vincular tus vehículos.</p>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <Select value={filterState} onValueChange={v => { setFilterState(v === '__all' ? '' : v); setFilterCity(''); }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todos los estados</SelectItem>
                      {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ciudad</Label>
                  <Select value={filterCity} onValueChange={v => setFilterCity(v === '__all' ? '' : v)} disabled={cities.length === 0}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todas las ciudades" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Todas las ciudades</SelectItem>
                      {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredDealerships.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No hay concesionarios en esta ubicación</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filteredDealerships.map(d => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-border gac-shadow hover:shadow-md transition-shadow">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-sm leading-tight truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {d.city}{d.state ? `, ${d.state}` : ''}
                        </p>
                      </div>
                      {/* Acciones */}
                      <div className="flex items-center gap-2 shrink-0">
                        {d.google_maps_url ? (
                          <a
                            href={d.google_maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                            title="Ver en Google Maps"
                          >
                            <MapPin className="w-4 h-4" />
                          </a>
                        ) : (
                          <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground/40 cursor-default" title="Sin ubicación">
                            <MapPin className="w-4 h-4" />
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="gac-gradient text-primary-foreground h-9 px-4 text-sm font-medium"
                          disabled={vehicles.length === 0}
                          onClick={() => iniciarReserva(d.id)}
                        >
                          Agendar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Flujo de Reserva */}
        {vista === 'reservar' && selectedDealershipData && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-display font-bold">Reservar Servicio</h2>
              <p className="text-sm text-muted-foreground">{selectedDealershipData.name}</p>
            </div>

            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className={cn("flex-1 h-1.5 rounded-full transition-colors", paso >= s ? "gac-gradient" : "bg-muted")} />
              ))}
            </div>

            {/* Paso 1: Vehículo y tipo */}
            {paso === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vehículo</Label>
                  {/* Barra de búsqueda por placa */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por placa (ej: AH9630D)..."
                      className="pl-9 h-9 text-sm"
                      value={vehicleSearch}
                      onChange={e => {
                        setVehicleSearch(e.target.value);
                        setSelectedVehicle('');
                      }}
                    />
                    {vehicleSearch && (
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => { setVehicleSearch(''); setSelectedVehicle(''); }}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Resultados inline al buscar, dropdown normal si no hay búsqueda */}
                  {vehicleSearch.trim() ? (
                    (() => {
                      const q = vehicleSearch.trim().toLowerCase();
                      const filtered = vehicles.filter(v =>
                        (v.plate || '').toLowerCase().includes(q) ||
                        (v.vehicle_models?.name || '').toLowerCase().includes(q) ||
                        (v.vehicle_models?.brand || '').toLowerCase().includes(q)
                      );
                      return filtered.length === 0 ? (
                        <div className="border rounded-md px-3 py-4 text-center text-xs text-muted-foreground">
                          No se encontraron vehículos con placa "{vehicleSearch}"
                        </div>
                      ) : (
                        <div className="border rounded-md divide-y overflow-hidden">
                          {filtered.map(v => (
                            <button
                              key={v.id}
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2"
                              onClick={() => { setSelectedVehicle(v.id); setVehicleSearch(''); }}
                            >
                              <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{v.plate || 'Sin placa'}</span>
                              <span className="text-muted-foreground">— {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tu vehículo" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year} — {v.plate || 'Sin placa'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Tipo de Servicio</Label>
                  <Select value={selectedService} onValueChange={v => { setSelectedService(v); setNotes(''); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona el servicio" /></SelectTrigger>
                    <SelectContent>
                      {serviceTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedService && serviceTypes.find(s => s.name === selectedService)?.requires_description && (
                    <>
                      <div className="mt-3">
                        <Label className="text-sm">Descripción de la incidencia *</Label>
                        <Textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          rows={3}
                          className="mt-1"
                          placeholder="Describa la falla, desperfecto o tipo de servicio que solicita..."
                        />
                      </div>
                      <div className="mt-3">
                        <Label className="text-sm">Fotos / Videos (opcional)</Label>
                        <p className="text-[11px] text-muted-foreground mb-1.5">Adjunta evidencia: fotos del daño, videos, sonidos, etc.</p>
                        <TechnicalReportUploader
                          reservationId={`tmp-${clientData?.id || 'cli'}`}
                          value={reservaReportUrl}
                          onChange={setReservaReportUrl}
                          maxSizeMB={40}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <Label>Kilometraje Actual</Label>
                  <Input className="mt-1" type="number" placeholder="Ej: 20000" value={mileage} onChange={e => setMileage(e.target.value)} />
                </div>
                <Button className="w-full gac-gradient text-primary-foreground" disabled={!selectedVehicle || !selectedService || !mileage || (!!serviceTypes.find(s => s.name === selectedService)?.requires_description && !notes.trim())} onClick={() => setPaso(2)}>
                  Continuar
                </Button>
              </div>
            )}

            {/* Paso 2: Fecha y hora */}
            {paso === 2 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Selecciona la fecha</Label>
                  <div className="mt-2 flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelectReserva}
                      locale={es}
                      disabled={(date) => {
                        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                        return d < getTodayVzla() || date.getDay() === 0;
                      }}
                      className="rounded-lg border p-3 pointer-events-auto"
                    />
                  </div>
                </div>
                {selectedDate && (
                  <div>
                    <Label className="text-base font-semibold">Hora</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                    {loadingTimes ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="ml-2 text-xs text-muted-foreground">Verificando disponibilidad...</span>
                      </div>
                    ) : (
                      (() => {
                        const slotDuration = serviceTypes.find(s => s.name === selectedService)?.duration_minutes ?? 30;
                        const slots = generateTimeSlots(slotDuration, selectedDealershipData?.opening_hour ?? 8, selectedDealershipData?.closing_hour ?? 17)
                          .map(h => ({
                            h,
                            occ: computeSlotOccupancy({
                              existingReservations: dayReservations,
                              startTime: h,
                              durationMinutes: slotDuration,
                              bays: selectedDealershipData?.bays,
                              resolveDuration: getServiceDuration,
                            }),
                          }));
                        const anyFull = slots.some(s => s.occ.full);
                        return (
                      <>
                        {anyFull && (
                          <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Las horas en rojo ya no tienen cupo
                          </p>
                        )}
                        <div className="grid grid-cols-4 gap-2">
                          {slots.map(({ h, occ }) => {
                            const isOccupied = occ.full;
                            const isPast = isSlotPast(h, selectedDate);
                            const isUnavailable = isOccupied || isPast;
                            return (
                              <button
                                key={h}
                                onClick={() => !isUnavailable && setSelectedTime(h)}
                                disabled={isUnavailable}
                                className={cn(
                                  "py-2 px-1 text-sm rounded-lg border transition-all font-medium",
                                  isUnavailable
                                    ? "border-red-200 bg-red-50 text-red-400 cursor-not-allowed line-through"
                                    : selectedTime === h
                                      ? "gac-gradient text-primary-foreground border-transparent"
                                      : "hover:border-primary"
                                )}
                              >
                                {h}
                              </button>
                            );
                          })}
                        </div>
                      </>
                        );
                      })()
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaso(1)}>Atrás</Button>
                  <Button className="flex-1 gac-gradient text-primary-foreground" disabled={!selectedDate || !selectedTime} onClick={() => setPaso(3)}>
                    Continuar
                  </Button>
                </div>
              </div>
            )}

            {/* Paso 3: Confirmación */}
            {paso === 3 && (
              <div className="space-y-4">
                <Card className="gac-shadow">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-display font-semibold text-base">Resumen de Reserva</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Concesionario</span><span className="font-medium">{selectedDealershipData.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Vehículo</span><span className="font-medium">{selectedVehicleData?.vehicle_models?.brand} {selectedVehicleData?.vehicle_models?.name} {selectedVehicleData?.year}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Placa</span><span className="font-medium">{selectedVehicleData?.plate}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Servicio</span><span className="font-medium">{selectedService}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span className="font-medium">{selectedDate && format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Hora</span><span className="font-medium">{selectedTime}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Kilometraje</span><span className="font-medium">{Number(mileage).toLocaleString()} km</span></div>
                    </div>
                  </CardContent>
                </Card>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaso(2)}>Atrás</Button>
                  <Button className="flex-1 gac-gradient text-primary-foreground" onClick={confirmarReserva} disabled={saving}>
                    {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirmar Reserva'}
                  </Button>
                </div>
              </div>
            )}

            {/* Paso 4: Éxito */}
            {paso === 4 && reservaConfirmada && (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full gac-gradient mx-auto flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-display font-bold">¡Reserva Confirmada!</h3>
                <p className="text-sm text-muted-foreground">Tu cita ha sido registrada. Te esperamos en {selectedDealershipData.name}.</p>
                <Button className="gac-gradient text-primary-foreground" onClick={volverInicio}>
                  Volver al Inicio
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Mis Reservas */}
        {vista === 'mis-reservas' && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">Mis Citas</h2>
            {reservations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No tienes citas aún</p>
              </div>
            ) : (
              reservations.map(r => {
                const st = STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente;
                return (
                  <Card key={r.id} className="gac-shadow cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailRes(r)}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-sm">{r.service_type}</h3>
                        <Badge className={cn("text-[10px] px-1.5 py-0", st.color)}>{st.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        {r.vehicles && (
                          <p>
                            <span className="font-medium text-foreground">
                              {r.vehicles.vehicle_models?.brand} {r.vehicles.vehicle_models?.name} {r.vehicles.year}
                            </span> - {r.vehicles.plate}
                          </p>
                        )}
                        {r.dealerships && <p>{r.dealerships.name}</p>}
                        <p>{r.reservation_date} a las {r.reservation_time?.slice(0, 5)}</p>
                        {r.status === 'completada' && r.service_notes && (
                          <p className="text-green-700 font-medium flex items-center gap-1 mt-1">
                            <ClipboardList className="w-3 h-3" /> Servicio ejecutado - toca para ver detalles
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* RESERVATION DETAIL DIALOG */}
        <Dialog open={!!detailRes} onOpenChange={() => setDetailRes(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2 text-base">
                <Wrench className="w-4 h-4" /> {detailRes?.service_type}
              </DialogTitle>
            </DialogHeader>
            {detailRes && (() => {
              const st = STATUS_CONFIG[detailRes.status] || STATUS_CONFIG.pendiente;
              return (
                <div className="space-y-4 py-1">
                  <Badge className={cn("text-xs px-2 py-0.5", st.color)}>{st.label}</Badge>

                  <div className="space-y-2.5 text-sm">
                    {detailRes.vehicles && (
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{detailRes.vehicles.vehicle_models?.brand} {detailRes.vehicles.vehicle_models?.name} {detailRes.vehicles.year} — {detailRes.vehicles.plate}</span>
                      </div>
                    )}
                    {detailRes.dealerships && (
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span>{detailRes.dealerships.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{detailRes.reservation_date} a las {detailRes.reservation_time?.slice(0, 5)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{detailRes.current_mileage.toLocaleString()} km</span>
                    </div>
                    {detailRes.status === 'completada' && detailRes.service_notes && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-xs">
                        <p className="font-semibold text-green-800 mb-1 flex items-center gap-1">
                          <ClipboardList className="w-3.5 h-3.5" /> Trabajo realizado
                        </p>
                        <p className="text-green-700 whitespace-pre-wrap">{detailRes.service_notes}</p>
                        {detailRes.completed_at && (
                          <p className="text-green-600 mt-2 text-[10px]">
                            Completado: {new Date(detailRes.completed_at).toLocaleString('es-VE')}
                          </p>
                        )}
                      </div>
                    )}
                    {detailRes.status === 'completada' && detailRes.recommendation && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-xs">
                        <p className="font-semibold text-green-800 mb-1 flex items-center gap-1">
                          <ClipboardList className="w-3.5 h-3.5" /> Recomendación
                        </p>
                        <p className="text-green-700 whitespace-pre-wrap">{detailRes.recommendation}</p>
                      </div>
                    )}
                    {detailRes.technical_report_url && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-blue-600" /> Informe Técnico
                        </p>
                        <TechnicalReportUploader
                          reservationId={detailRes.id}
                          value={detailRes.technical_report_url}
                          onChange={() => {}}
                          readonly
                        />
                      </div>
                    )}
                    {detailRes.status === 'cancelada' && (
                      <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs text-red-700">
                        Esta cita fue cancelada.
                      </div>
                    )}

                    {/* Edit/Cancel buttons for pending/confirmed reservations */}
                    {['pendiente', 'confirmada'].includes(detailRes.status) && (
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEditReservation(detailRes)}>
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => openCancelConfirm(detailRes)}>
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* EDIT RESERVATION DIALOG */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">Editar Cita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Tipo de Servicio</Label>
                <Select value={editService} onValueChange={setEditService}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fecha</Label>
                <div className="mt-1 flex justify-center">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={setEditDate}
                    locale={es}
                    disabled={(date) => {
                      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                      return d < getTodayVzla() || date.getDay() === 0;
                    }}
                    className="rounded-lg border p-2 pointer-events-auto"
                  />
                </div>
              </div>
              {editDate && (
                <div>
                  <Label className="text-xs">Hora</Label>
                  <div className="grid grid-cols-4 gap-1.5 mt-1">
                    {generateTimeSlots(serviceTypes.find(s => s.name === editService)?.duration_minutes ?? 30, editDealershipData?.opening_hour ?? 8, editDealershipData?.closing_hour ?? 17).map(h => {
                      const isPast = isSlotPast(h, editDate);
                      return (
                        <button
                          key={h}
                          onClick={() => !isPast && setEditTime(h)}
                          disabled={isPast}
                          className={cn(
                            "py-1.5 text-xs rounded-lg border transition-all font-medium",
                            isPast
                              ? "border-red-200 bg-red-50 text-red-400 cursor-not-allowed line-through"
                              : editTime === h
                                ? "gac-gradient text-primary-foreground border-transparent"
                                : "hover:border-primary"
                          )}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs">Kilometraje Actual</Label>
                <Input className="mt-1" type="number" value={editMileage} onChange={e => setEditMileage(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleEditSave} disabled={editSaving || !editDate || !editTime || !editService} className="gac-gradient text-primary-foreground">
                {editSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CANCEL CONFIRMATION */}
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
              <AlertDialogDescription>
                Se cancelará tu cita de <strong>{cancelTarget?.service_type}</strong> programada para el {cancelTarget?.reservation_date} a las {cancelTarget?.reservation_time?.slice(0, 5)}. Se notificará al concesionario y al administrador.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelReservation} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {cancelling ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sí, cancelar cita'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Mis Vehículos */}
        {vista === 'mis-vehiculos' && !selectedVehDetail && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">Mis Vehículos</h2>
            {vehicles.length === 0 ? (
              <Card className="gac-shadow">
                <CardContent className="p-8 text-center">
                  <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No tienes vehículos registrados</p>
                </CardContent>
              </Card>
            ) : vehicles.length < FLEET_VIEW_MIN_VEHICLES ? (
              // Simple card list for clients with a single vehicle (unchanged behavior)
              vehicles.map(v => renderVehicleCard(v))
            ) : (() => {
              // Enhanced fleet-control view for clients with multiple vehicles.
              const q = fleetSearch.trim().toLowerCase();
              const enriched = vehicles.map(v => {
                const w = evaluateVehicleWarranty(v);
                return { v, w, serviceStatus: getServiceStatus(v, w) };
              });
              const filtered = enriched.filter(({ v, w, serviceStatus }) => {
                if (q && !(v.plate || '').toLowerCase().includes(q)) return false;
                if (fleetServiceFilter !== 'todos' && serviceStatus !== fleetServiceFilter) return false;
                if (fleetWarrantyFilter === 'activa' && !w.active) return false;
                if (fleetWarrantyFilter === 'vencida' && w.active) return false;
                return true;
              });
              // Prioritize pending-service vehicles: vencido -> proximo -> al_dia
              const priority: Record<ServiceStatus, number> = { vencido: 0, proximo: 1, al_dia: 2 };
              filtered.sort((a, b) => priority[a.serviceStatus] - priority[b.serviceStatus]);
              // Summary counts across the whole fleet (not the filtered subset)
              const summary = enriched.reduce(
                (acc, { w, serviceStatus }) => {
                  acc[serviceStatus] += 1;
                  if (w.active) acc.warrantyActive += 1; else acc.warrantyExpired += 1;
                  return acc;
                },
                { vencido: 0, proximo: 0, al_dia: 0, warrantyActive: 0, warrantyExpired: 0 },
              );

              return (
                <div className="space-y-3">
                  {/* Summary header */}
                  <Card className="gac-shadow">
                    <CardContent className="p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold">{vehicles.length} vehículos</span>
                        <span className="flex items-center gap-1 text-red-700"><Wrench className="w-3 h-3" />{summary.vencido} vencidos</span>
                        <span className="text-yellow-700">{summary.proximo} próximos</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="flex items-center gap-1 text-green-700"><ShieldCheck className="w-3 h-3" />{summary.warrantyActive} garantías activas</span>
                        <span className="text-red-700">{summary.warrantyExpired} vencidas</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Plate search + filters */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por placa..."
                        className="pl-9 h-9 text-sm"
                        value={fleetSearch}
                        onChange={e => setFleetSearch(e.target.value)}
                      />
                      {fleetSearch && (
                        <button
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setFleetSearch('')}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={fleetServiceFilter} onValueChange={val => setFleetServiceFilter(val as typeof fleetServiceFilter)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Servicio: todos</SelectItem>
                          <SelectItem value="vencido">Servicio vencido</SelectItem>
                          <SelectItem value="proximo">Servicio próximo</SelectItem>
                          <SelectItem value="al_dia">Servicio al día</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={fleetWarrantyFilter} onValueChange={val => setFleetWarrantyFilter(val as typeof fleetWarrantyFilter)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Garantía: todas</SelectItem>
                          <SelectItem value="activa">Garantía activa</SelectItem>
                          <SelectItem value="vencida">Garantía vencida</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Prioritized vehicle list */}
                  {filtered.length === 0 ? (
                    <Card className="gac-shadow">
                      <CardContent className="p-6 text-center">
                        <Car className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-30" />
                        <p className="text-xs text-muted-foreground">No hay vehículos que coincidan con los filtros</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {filtered.map(({ v }) => renderVehicleCard(v, true))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Vehicle Detail */}
        {vista === 'mis-vehiculos' && selectedVehDetail && (() => {
          const v = selectedVehDetail;
          const w = evaluateVehicleWarranty(v);
          return (
            <div className="space-y-4">
              <button onClick={() => setSelectedVehDetail(null)} className="flex items-center gap-1 text-sm text-primary">
                <ArrowLeft className="w-4 h-4" /> Volver a mis vehículos
              </button>

              <Card className={cn("gac-shadow border-l-4", w.active ? "border-l-green-500" : "border-l-red-500")}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</h3>
                      <p className="text-xs text-muted-foreground">{v.plate}{v.vin ? ` · VIN: ${v.vin}` : ''}</p>
                    </div>
                    <Badge className={cn("text-xs flex items-center gap-1", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                      {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                      {w.active ? 'Garantía Activa' : 'Garantía Inactiva'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Kilometraje</p><p className="font-medium">{v.mileage.toLocaleString()} km</p></div></div>
                    <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Garantía</p><p className={cn("font-medium", w.active ? "text-green-700" : "text-red-600")}>{w.active ? 'Activa' : 'Vencida'}</p></div></div>
                    {v.color && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Car className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Color</p><p className="font-medium">{v.color}</p></div></div>}
                    {v.purchase_date && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Compra</p><p className="font-medium">{v.purchase_date}</p></div></div>}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-muted rounded-lg p-1.5 flex items-center justify-center">
                      <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">{formatServiceCount(w.servicesCompleted)}</Badge>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-1.5 flex items-center justify-center">
                      <p className="text-[10px] text-muted-foreground">Sugeridos por km: {w.servicesExpected}</p>
                    </div>
                    <div className="bg-muted rounded-lg p-1.5">
                      <p className="text-sm font-bold">{w.nextServiceKm > 0 ? `${(w.nextServiceKm / 1000).toFixed(0)}k` : '-'}</p>
                      <p className="text-[10px] text-muted-foreground">Próximo km</p>
                    </div>
                    <div className="bg-muted rounded-lg p-1.5">
                      <p className="text-sm font-bold">{w.monthsRemaining > 0 ? `${w.monthsRemaining}m` : '0'}</p>
                      <p className="text-[10px] text-muted-foreground">Meses rest.</p>
                    </div>
                  </div>

                  {!w.active && w.reason && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-2.5 text-xs">
                      <p className="font-semibold text-red-800 mb-1">Razón</p>
                      <p className="text-red-700">{w.reason}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <h3 className="font-semibold text-sm">Historial de Servicios</h3>
              {loadingVehHistory ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Cargando historial...</p>
                </div>
              ) : vehHistory.length === 0 ? (
                <Card className="gac-shadow">
                  <CardContent className="p-6 text-center">
                    <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-30" />
                    <p className="text-xs text-muted-foreground">Sin servicios registrados</p>
                  </CardContent>
                </Card>
              ) : (
                vehHistory.map(h => {
                  const isCompleted = h.status === 'completada';
                  return (
                    <Card key={h.id} className="gac-shadow">
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs">{h.service_type}</span>
                          <Badge className={cn("text-[10px] px-1.5 py-0", isCompleted ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>{h.status}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{h.reservation_date}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{h.reservation_time?.slice(0, 5)}</span>
                          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{h.current_mileage.toLocaleString()} km</span>
                        </div>
                        {h.dealerships && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="w-3 h-3" />{h.dealerships.name}</div>}
                        {h.service_notes && (
                          <div className="bg-green-50 border border-green-200 rounded p-2 text-xs">
                            <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Trabajo realizado:</p>
                            <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                            {h.completed_at && <p className="text-green-600 text-[10px] mt-1">Completado: {new Date(h.completed_at).toLocaleString('es-VE')}</p>}
                          </div>
                        )}
                        {h.recommendation && (
                          <div className="bg-green-50 border border-green-200 rounded p-2 text-xs">
                            <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Recomendación:</p>
                            <p className="text-green-700 whitespace-pre-wrap">{h.recommendation}</p>
                          </div>
                        )}
                        {h.technical_report_url && (
                          <TechnicalReportUploader reservationId={h.id} value={h.technical_report_url} onChange={() => {}} readonly />
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          );
        })()}

        {/* Perfil */}
        {vista === 'perfil' && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">Mi Perfil</h2>

            {/* Client info — datos sensibles ocultos: el ingreso es solo con placa */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">{clientData?.full_name || profile?.full_name || 'Sin nombre'}</h3>
                </div>
              </CardContent>
            </Card>

            {/* PIN de acceso */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">PIN de acceso</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Crea un PIN de 4 dígitos para entrar al portal sin tu placa.
                  {pinSaved ? '' : ' Aún no tienes un PIN configurado.'}
                </p>

                {pinSaved && (
                  <div className="flex items-center justify-between rounded-md bg-muted/50 p-2.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground">PIN actual</p>
                      <div className="flex items-center gap-1.5">
                        <p className="font-mono font-bold tracking-[0.3em] text-lg">
                          {showPin ? pinSaved : '•'.repeat(pinSaved.length)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowPin((v) => !v)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                        >
                          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={removePin} disabled={pinSaving}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Quitar
                    </Button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{pinSaved ? 'Cambiar PIN' : 'Nuevo PIN'}</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="font-mono tracking-[0.3em] text-lg h-10"
                    />
                  </div>
                  <Button size="sm" className="h-10" onClick={savePin} disabled={pinSaving || pinInput.length !== 4}>
                    {pinSaving ? '...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Vehicles */}
            <Card className="gac-shadow">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Mis Vehículos ({vehicles.length})</h3>
                {vehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes vehículos registrados</p>
                ) : (
                  vehicles.map(v => {
                    const w = evaluateVehicleWarranty(v);
                    return (
                    <div key={v.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Car className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.plate} · {v.mileage.toLocaleString()} km
                          {v.color ? ` · ${v.color}` : ''}
                        </p>
                      </div>
                      <Badge className={cn("text-[10px] px-1.5 py-0 flex items-center gap-1", w.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                        {w.active ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                        {w.active ? 'Garantía' : 'Vencida'}
                      </Badge>
                    </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default UserPortal;
