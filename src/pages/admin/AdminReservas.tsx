import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Search, CalendarDays, LayoutGrid, List, ChevronLeft, ChevronRight, Plus, Pencil, AlertCircle, MessageCircle, ClipboardCheck, Settings, Trash2, Car, User, FileText, MapPin, Gauge, StickyNote, Star, X, Clock, UserPlus } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { WarrantyChip } from '@/components/WarrantyChip';
import ExternalClientBadge from '@/components/ExternalClientBadge';
import { listExternalSources } from '@/lib/externalSources';
import ModelCombobox, { MANUAL_MODEL_VALUE } from '@/components/vehicles/ModelCombobox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildWhatsAppReservationUrl } from '@/lib/whatsapp';
import { resolveAutoVehicle } from '@/lib/vehicleSelection';
import { resolveReservationAssignment, createOrReuseManualEntities } from '@/lib/reservationAssignment';
import { createKommoReservation, updateKommoReservationStage, updateKommoReservationFields } from '@/lib/kommo';
import { useIsMobile } from '@/hooks/use-mobile';
import { MonthlyReservationsCalendar } from '@/components/MonthlyReservationsCalendar';
import { computeSlotOccupancy, formatMinuteLabel, type CapacityReservation } from '@/lib/reservationCapacity';
import { isPartsRequest, PLANT_DEALERSHIP_ID } from '@/lib/serviceTypes';
import {
  RESERVATION_STATUS_LABELS as STATUS_LABELS,
  RESERVATION_STATUS_COLORS as STATUS_COLORS,
  ARCHIVED_RESERVATION_STATUSES,
  reservationStatusStyle,
} from '@/lib/reservationStatus';
import { VENEZUELA_STATES } from '@/lib/venezuelaStates';

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  bays: number;
}

interface ServiceType {
  id: number;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  requires_description: boolean;
}

interface ClientOption {
  id: string;
  full_name: string;
  cedula: string | null;
}

interface VehicleOption {
  id: string;
  plate: string | null;
  year: number;
  vehicle_models: { name: string; brand: string } | null;
}

interface VehicleModelOption {
  id: string;
  name: string;
  brand: string;
}

interface Reservation {
  id: string;
  dealership_id: string;
  client_id: string | null;
  vehicle_id: string | null;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  internal_notes: string | null;
  service_notes: string | null;
  technical_report_url: string | null;
  satisfaction_rating: number | null;
  /** Client-visible follow-up recommendation, filled when the service is completed. Not in generated Supabase types yet. */
  recommendation: string | null;
  // Legacy walk-in fields: some older dealership reservations stored client/vehicle
  // as free text instead of FKs. Read them so those rows render instead of blank.
  walkin_client_name: string | null;
  walkin_client_phone: string | null;
  walkin_plate: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  kommo_lead_id: number | null;
  state: string | null;
  dealerships: { id: string; name: string; city: string | null; state: string | null } | null;
  // `is_manual` / `external_source`: cliente externo y de qué convenio vino. Se muestran acá
  // para que el mostrador sepa a quién está atendiendo sin abrir la ficha. Ver 20260811130000.
  clients: {
    full_name: string; cedula: string | null; phone: string | null; state: string | null;
    is_manual: boolean | null; external_source: string | null;
  } | null;
  vehicles: { plate: string | null; year: number; vehicle_models: { name: string; brand: string } | null } | null;
}

const HOURS = [
  '08:00', '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
];

const HOUR_LABELS: Record<string, string> = {
  '08:00': '8:00 AM', '09:00': '9:00 AM', '10:00': '10:00 AM', '11:00': '11:00 AM',
  '13:00': '1:00 PM', '14:00': '2:00 PM', '15:00': '3:00 PM',
  '16:00': '4:00 PM', '17:00': '5:00 PM',
};

// An incidencia is still a reservation: same table, same status column, same CHECK
// constraint. It used to render its own `agendada` / `culminado` vocabulary, which the
// database rejected on every save — see src/lib/reservationStatus.ts.
const INCIDENCIA_TYPES = new Set(['Incidencia', 'Falla o Desperfecto']);

const AR_LS_KEY = 'admin_reservas_create_form';
const getArLS = () => { try { return JSON.parse(localStorage.getItem(AR_LS_KEY) || '{}'); } catch { return {}; } };

const AdminReservas = () => {
  const isMobile = useIsMobile();
  const { hasPermission, role, profile } = useAuth();
  const canCreate = hasPermission('reservas.create');
  const canEdit = hasPermission('reservas.edit');
  const canDelete = hasPermission('reservas.delete');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'status' | 'service' | 'dealership' | 'date' | 'time' | 'mileage' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkStatus, setBulkStatus] = useState('pendiente');
  const [bulkService, setBulkService] = useState('');
  const [bulkDealership, setBulkDealership] = useState('');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkTime, setBulkTime] = useState('08:00');
  const [bulkMileage, setBulkMileage] = useState('');
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Detail dialog
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [view, setView] = useState<'table' | 'matrix'>('table');
  const [reservationTab, setReservationTab] = useState<'citas' | 'repuestos'>('citas');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [capacityWarning, setCapacityWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroConc, setFiltroConc] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // CRUD dialog
  const [dialogOpen, setDialogOpen] = useState<boolean>(() => getArLS().dialogOpen === true);
  const [saving, setSaving] = useState(false);
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);

  // Complete dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completingRes, setCompletingRes] = useState<Reservation | null>(null);
  const [serviceNotes, setServiceNotes] = useState('');
  const [technicalReportUrl, setTechnicalReportUrl] = useState<string | null>(null);
  const [satisfactionRating, setSatisfactionRating] = useState<number | null>(null);
  const [completeInternalNotes, setCompleteInternalNotes] = useState('');
  const [completeRecommendation, setCompleteRecommendation] = useState('');
  const [completing, setCompleting] = useState(false);

  // Service manager dialog
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcName, setSvcName] = useState('');
  const [svcDuration, setSvcDuration] = useState('60');
  const [svcRequiresDesc, setSvcRequiresDesc] = useState(false);
  const [svcEditing, setSvcEditing] = useState<ServiceType | null>(null);
  const [svcSaving, setSvcSaving] = useState(false);

  // Form (initialized from localStorage to survive page refresh)
  const [fDealership, setFDealership] = useState<string>(() => getArLS().fDealership || '');
  const [fClientSearch, setFClientSearch] = useState<string>(() => getArLS().fClientSearch || '');
  const [fClientId, setFClientId] = useState<string>(() => getArLS().fClientId || '');
  const [fVehicleId, setFVehicleId] = useState<string>(() => getArLS().fVehicleId || '');
  const [fDate, setFDate] = useState<string>(() => getArLS().fDate || new Date().toISOString().split('T')[0]);
  const [fTime, setFTime] = useState<string>(() => getArLS().fTime || '08:00');
  const [fService, setFService] = useState<string>(() => getArLS().fService || '');
  const [fMileage, setFMileage] = useState<string>(() => getArLS().fMileage || '0');
  const [fStatus, setFStatus] = useState<string>(() => getArLS().fStatus || 'pendiente');
  const [fNotes, setFNotes] = useState<string>(() => getArLS().fNotes || '');
  const [fObs, setFObs] = useState<string>('');
  // Estado de Venezuela: '' means "inherit from the dealership" (persists as null).
  const [fState, setFState] = useState<string>(() => getArLS().fState || '');
  const isRepuestos = isPartsRequest(fService);

  // Manual entry (creates real client + vehicle): toggle + extra fields.
  const [manualMode, setManualMode] = useState<boolean>(() => getArLS().manualMode === true);
  // Editing a LEGACY walk-in row (no FK client/vehicle, only walkin_* text). This is
  // distinct from manual entry: editing keeps it as free-text walk-in (updates the
  // walkin_* columns) instead of creating real client/vehicle entities, so repeated
  // edits never duplicate data.
  const [editingLegacyWalkin, setEditingLegacyWalkin] = useState(false);
  const [mName, setMName] = useState<string>(() => getArLS().mName || '');
  const [mPhone, setMPhone] = useState<string>(() => getArLS().mPhone || '');
  const [mCedula, setMCedula] = useState<string>(() => getArLS().mCedula || '');
  const [mModelId, setMModelId] = useState<string>(() => getArLS().mModelId || '');
  // "Otro / escribir manualmente": the vehicle is not in the commercial catalog
  // (e.g. a third-party car that only came in for a one-off service). Reveals
  // Marca/Modelo text inputs instead of the catalog Select.
  const [mUseManualModel, setMUseManualModel] = useState<boolean>(() => getArLS().mUseManualModel === true);
  const [mManualBrand, setMManualBrand] = useState<string>(() => getArLS().mManualBrand || '');
  const [mManualModelName, setMManualModelName] = useState<string>(() => getArLS().mManualModelName || '');
  const [mPlate, setMPlate] = useState<string>(() => getArLS().mPlate || '');
  const [mYear, setMYear] = useState<string>(() => getArLS().mYear || '');
  // Convenio del cliente externo + las etiquetas ya usadas, para sugerirlas y que no se
  // multipliquen escritas de diez formas. Ver 20260811130000_external_source.sql.
  const [mExternalSource, setMExternalSource] = useState<string>(() => getArLS().mExternalSource || '');
  const [externalSources, setExternalSources] = useState<string[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModelOption[]>([]);

  // Client/vehicle lookup
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [clientVehicles, setClientVehicles] = useState<VehicleOption[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  // Si YA corrió una búsqueda. Sin esto no se puede distinguir "todavía no buscaste" de
  // "buscamos y no está", y ofrecer el cliente de un solo uso antes de buscar empuja a
  // duplicar gente que sí existe en la base.
  const [clientSearched, setClientSearched] = useState(false);
  // Carries the raw search term typed before selectClient overwrites fClientSearch,
  // so the vehicle-fetch effect can use it to auto-select the matching vehicle.
  const plateHintRef = useRef<string>('');

  const fetchDealerships = async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, city, state, bays')
      .eq('is_active', true)
      .order('name');
    if (data) setDealerships(data);
  };

  const fetchServiceTypes = async () => {
    const { data } = await supabase
      .from('service_types')
      .select('id, name, duration_minutes, is_active, requires_description')
      .order('name');
    if (data) setServiceTypes(data as unknown as ServiceType[]);
  };

  const fetchVehicleModels = async () => {
    // `is_manual` is not in the generated types.ts yet (new column, no regen) — cast
    // to `any` for this call, matching this project's established convention for
    // un-typed columns (see SatisfactionOverview.tsx:13-14). Manual models are
    // excluded from this catalog picker: they're only reachable via the "Otro /
    // escribir manualmente" typed path, so they don't accumulate here over time.
    const { data } = await (supabase as any)
      .from('vehicle_models')
      .select('id, name, brand')
      .eq('is_active', true)
      .eq('is_manual', false)
      .order('brand')
      .order('name');
    if (data) setVehicleModels(data as VehicleModelOption[]);
  };

  // Convenios ya usados, para sugerirlos al cargar un cliente de un solo uso.
  const fetchExternalSources = async () => {
    setExternalSources((await listExternalSources()).map(s => s.source));
  };

  const fetchReservations = async () => {
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('*, kommo_lead_id, dealerships(id, name, city, state), clients(full_name, cedula, phone, state, is_manual, external_source), vehicles(plate, year, vehicle_models(name, brand)), created_by_name, created_by_role');

    if (view === 'matrix') {
      // Fetch reservations within the calendar month range
      const [y, m] = calendarMonth.split('-').map(Number);
      const firstDay = `${calendarMonth}-01`;
      const lastDayDate = new Date(y, m, 0); // day 0 of next month = last day of current
      const lastDay = `${calendarMonth}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      query = query.gte('reservation_date', firstDay).lte('reservation_date', lastDay);
    }

    if (filtroConc !== 'todos') {
      query = query.eq('dealership_id', filtroConc);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reservations:', error);
    } else {
      setReservations((data || []) as Reservation[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDealerships();
    fetchServiceTypes();
    fetchVehicleModels();
    fetchExternalSources();
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [view, selectedDate, calendarMonth, filtroConc]);

  // Parts requests have no meaningful time slot, so only the table view applies to them
  useEffect(() => {
    if (reservationTab === 'repuestos') setView('table');
  }, [reservationTab]);

  // Persist create-form to localStorage so a page refresh restores the dialog
  useEffect(() => {
    if (!dialogOpen || editingRes) {
      if (!dialogOpen) { try { localStorage.removeItem(AR_LS_KEY); } catch {} }
      return;
    }
    try {
      localStorage.setItem(AR_LS_KEY, JSON.stringify({ dialogOpen: true, fDealership, fClientSearch, fClientId, fVehicleId, fDate, fTime, fService, fMileage, fStatus, fNotes, fState, manualMode, mName, mPhone, mCedula, mModelId, mUseManualModel, mManualBrand, mManualModelName, mPlate, mYear, mExternalSource }));
    } catch {}
  }, [dialogOpen, editingRes, fDealership, fClientSearch, fClientId, fVehicleId, fDate, fTime, fService, fMileage, fStatus, fNotes, fState, manualMode, mName, mPhone, mCedula, mModelId, mUseManualModel, mManualBrand, mManualModelName, mPlate, mYear, mExternalSource]);

  // Client search with debounce (by name, cedula, or vehicle plate)
  useEffect(() => {
    if (fClientSearch.trim().length < 2) { setClientResults([]); setClientSearched(false); return; }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      const fullTerm = fClientSearch.trim();
      const words = fullTerm.split(/\s+/).filter(Boolean);

      // Build name query: each word must appear somewhere in full_name (AND logic)
      let nameQuery = supabase.from('clients').select('id, full_name, cedula');
      for (const w of words) nameQuery = nameQuery.ilike('full_name', `%${w}%`);

      const [{ data: byName }, { data: byCedula }, { data: vehicleMatches }] = await Promise.all([
        nameQuery.limit(15),
        supabase.from('clients').select('id, full_name, cedula').ilike('cedula', `%${fullTerm}%`).limit(10),
        supabase.from('vehicles').select('client_id, plate, clients(id, full_name, cedula)').ilike('plate', `%${fullTerm}%`).limit(10),
      ]);

      const results = new Map<string, ClientOption>();
      (byName || []).forEach(c => results.set(c.id, c));
      (byCedula || []).forEach(c => results.set(c.id, c));
      (vehicleMatches || []).forEach((v: any) => { if (v.clients) results.set(v.clients.id, v.clients); });

      const upperFull = fullTerm.toUpperCase();
      const upperFirst = words[0].toUpperCase();
      // rank 0: name starts with the full phrase ("LUIS LOPEZ ...")
      // rank 1: name starts with the first word ("LUIS JOSE ...") or phrase matches mid-name ("JOSE LUIS LOPEZ")
      // rank 2: words are scattered across the name
      const rank = (name: string) => {
        const n = name.toUpperCase();
        if (n.startsWith(upperFull)) return 0;
        if (n.startsWith(upperFirst) || n.includes(' ' + upperFull)) return 1;
        return 2;
      };
      setClientResults(Array.from(results.values()).sort((a, b) => rank(a.full_name) - rank(b.full_name)));
      setSearchingClients(false);
      setClientSearched(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [fClientSearch]);

  // Fetch vehicles when client changes
  useEffect(() => {
    if (!fClientId) { setClientVehicles([]); return; }
    (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, vehicle_models(name, brand)')
        .eq('client_id', fClientId)
        .eq('is_active', true);
      const fetched = (data || []) as VehicleOption[];
      setClientVehicles(fetched);
      // Auto-select vehicle: exact plate match wins; otherwise pick the only vehicle.
      const hint = plateHintRef.current;
      plateHintRef.current = '';
      const autoMatch = resolveAutoVehicle(
        fetched.map((v) => ({ id: v.id, plate: v.plate })),
        hint,
      );
      if (autoMatch) setFVehicleId(autoMatch.id);
    })();
  }, [fClientId]);

  const getServiceDuration = (serviceName: string): number => {
    const st = serviceTypes.find(s => s.name === serviceName);
    return st ? st.duration_minutes : 60;
  };

  const checkCapacity = async (dealershipId: string, date: string, time: string, serviceName: string, excludeReservationId?: string) => {
    setCapacityWarning('');
    if (!dealershipId || !date || !time || !serviceName) return true;

    const dealer = dealerships.find(d => d.id === dealershipId);
    if (!dealer) return true;

    const duration = getServiceDuration(serviceName);

    // Fetch all non-cancelled reservations for this dealership on this date
    let query = supabase
      .from('reservations')
      .select('id, reservation_time, service_type')
      .eq('dealership_id', dealershipId)
      .eq('reservation_date', date)
      .neq('status', 'cancelada');

    if (excludeReservationId) {
      query = query.neq('id', excludeReservationId);
    }

    const { data: dayReservations } = await query;
    if (!dayReservations) return true;

    // Delegate the minute-by-minute overlap count to the shared capacity helper so
    // every reservation-creation flow enforces the same rule.
    const result = computeSlotOccupancy({
      existingReservations: dayReservations as CapacityReservation[],
      startTime: time,
      durationMinutes: duration,
      bays: dealer.bays,
      resolveDuration: getServiceDuration,
    });
    if (result.full && result.firstFullMinute !== null) {
      setCapacityWarning(
        `Sin disponibilidad: las ${result.capacity} bahía(s) están ocupadas a las ${formatMinuteLabel(result.firstFullMinute)}. Servicio de ${duration} min no cabe en este horario.`
      );
      return false;
    }
    return true;
  };

  // Day's non-cancelled reservations for the selected dealership+date, loaded so the
  // incidencia time picker can flag full slots the same way DealershipReservas/PublicReserva do.
  const [daySlotReservations, setDaySlotReservations] = useState<Array<CapacityReservation & { id: string }>>([]);

  useEffect(() => {
    if (!dialogOpen || isRepuestos || !fDealership || !fDate) {
      setDaySlotReservations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('reservations')
        .select('id, reservation_time, service_type')
        .eq('dealership_id', fDealership)
        .eq('reservation_date', fDate)
        .neq('status', 'cancelada');
      if (!cancelled) setDaySlotReservations((data || []) as Array<CapacityReservation & { id: string }>);
    })();
    return () => { cancelled = true; };
  }, [dialogOpen, isRepuestos, fDealership, fDate]);

  // Bay occupancy for a candidate slot in the create/edit dialog. Excludes the
  // reservation being edited so it never conflicts with its own current slot.
  const getSlotOccupancy = (slot: string) => {
    const existing = editingRes ? daySlotReservations.filter(r => r.id !== editingRes.id) : daySlotReservations;
    return computeSlotOccupancy({
      existingReservations: existing,
      startTime: slot,
      durationMinutes: getServiceDuration(fService),
      bays: dealerships.find(d => d.id === fDealership)?.bays,
      resolveDuration: getServiceDuration,
    });
  };

  const resetManualFields = () => {
    setManualMode(false);
    setEditingLegacyWalkin(false);
    setMName(''); setMPhone(''); setMCedula(''); setMModelId(''); setMPlate(''); setMYear('');
    setMUseManualModel(false); setMManualBrand(''); setMManualModelName('');
    setMExternalSource('');
  };

  const openCreate = () => {
    setEditingRes(null);
    setFDealership(''); setFClientSearch(''); setFClientId(''); setFVehicleId('');
    setFDate(new Date().toISOString().split('T')[0]); setFTime('08:00');
    setFService(''); setFMileage('0'); setFStatus('pendiente'); setFNotes(''); setFObs('');
    setFState('');
    setClientResults([]); setClientVehicles([]);
    resetManualFields();
    setCapacityWarning('');
    setTechnicalReportUrl(null);
    setDialogOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredReservations.length > 0 && filteredReservations.every(r => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReservations.map(r => r.id)));
    }
  };

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];

    // Only scheduling changes (date/time/dealership/service) can overbook a bay.
    // Status/mileage-only updates skip the capacity check entirely.
    const affectsSchedule = ['reservation_date', 'reservation_time', 'dealership_id', 'service_type']
      .some(k => k in payload);

    if (!affectsSchedule) {
      const { error } = await supabase.from('reservations').update(payload).in('id', ids);
      if (error) toast.error('Error al actualizar reservas');
      else { toast.success(`${ids.length} reserva(s) actualizadas`); setSelectedIds(new Set()); setBulkAction(null); fetchReservations(); }
      setBulkLoading(false);
      return;
    }

    // Capacity-aware path: run the same overlap check per affected reservation and
    // skip the ones that would exceed the target dealership's bays.
    const idSet = new Set(ids);
    const selected = reservations.filter(r => idSet.has(r.id));
    // Existing non-cancelled reservations per "dealership|date", excluding the batch
    // itself (those rows are being moved, so their old slots must not count).
    const dayCache = new Map<string, CapacityReservation[]>();
    // Reservations already placed by THIS batch, so several moves into the same slot
    // still compete for bays with each other.
    const placed = new Map<string, CapacityReservation[]>();
    const okIds: string[] = [];
    const skipped: string[] = [];

    for (const r of selected) {
      const dealershipId = (payload.dealership_id as string) ?? r.dealership_id;
      const date = (payload.reservation_date as string) ?? r.reservation_date;
      const time = ((payload.reservation_time as string) ?? r.reservation_time).slice(0, 5);
      const service = (payload.service_type as string) ?? r.service_type;
      const dealer = dealerships.find(d => d.id === dealershipId);
      const key = `${dealershipId}|${date}`;

      if (!dayCache.has(key)) {
        const { data } = await supabase
          .from('reservations')
          .select('id, reservation_time, service_type')
          .eq('dealership_id', dealershipId)
          .eq('reservation_date', date)
          .neq('status', 'cancelada');
        dayCache.set(key, ((data || []) as Array<CapacityReservation & { id: string }>).filter(x => !idSet.has(x.id)));
        placed.set(key, []);
      }

      const existing = [...dayCache.get(key)!, ...placed.get(key)!];
      const result = computeSlotOccupancy({
        existingReservations: existing,
        startTime: time,
        durationMinutes: getServiceDuration(service),
        bays: dealer?.bays,
        resolveDuration: getServiceDuration,
      });

      if (result.full) {
        skipped.push(r.clients?.full_name || r.walkin_client_name || r.reservation_date);
      } else {
        okIds.push(r.id);
        placed.get(key)!.push({ reservation_time: time, service_type: service });
      }
    }

    if (okIds.length > 0) {
      const { error } = await supabase.from('reservations').update(payload).in('id', okIds);
      if (error) {
        toast.error('Error al actualizar reservas');
        setBulkLoading(false);
        return;
      }
    }

    if (skipped.length > 0 && okIds.length > 0) {
      toast.warning(`${okIds.length} actualizada(s). ${skipped.length} omitida(s) por falta de disponibilidad.`);
    } else if (skipped.length > 0) {
      toast.error(`Sin disponibilidad: ${skipped.length} reserva(s) exceden la capacidad de bahías y no se actualizaron.`);
    } else {
      toast.success(`${okIds.length} reserva(s) actualizadas`);
    }

    setSelectedIds(new Set());
    setBulkAction(null);
    fetchReservations();
    setBulkLoading(false);
  };

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('reservations').delete().in('id', ids);
    if (error) toast.error('Error al eliminar reservas');
    else { toast.success(`${ids.length} reserva(s) eliminadas`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchReservations(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'status': payload = { status: bulkStatus }; break;
      case 'service': if (!bulkService) return; payload = { service_type: bulkService }; break;
      case 'dealership': if (!bulkDealership) return; payload = { dealership_id: bulkDealership }; break;
      case 'date': if (!bulkDate) return; payload = { reservation_date: bulkDate }; break;
      case 'time': payload = { reservation_time: bulkTime + ':00' }; break;
      case 'mileage': if (!bulkMileage) return; payload = { current_mileage: parseInt(bulkMileage) || 0 }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('reservations').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar la reserva'); console.error(error); }
    else { toast.success('Reserva eliminada'); setDeleteTarget(null); fetchReservations(); }
    setDeleting(false);
  };

  const openEdit = (r: Reservation) => {
    try { localStorage.removeItem(AR_LS_KEY); } catch {}
    setEditingRes(r);
    setFDealership(r.dealership_id);
    setFClientId(r.client_id || '');
    setFClientSearch(r.clients?.full_name || '');
    setFVehicleId(r.vehicle_id || '');
    setFDate(r.reservation_date);
    setFTime(r.reservation_time.substring(0, 5));
    setFService(r.service_type);
    setFMileage(String(r.current_mileage));
    setFStatus(r.status);
    setFNotes(r.notes || ''); setFObs(r.internal_notes || '');
    setFState(r.state || '');
    setTechnicalReportUrl(r.technical_report_url || null);
    setClientResults([]);
    // Legacy walk-in row (no FK client/vehicle): edit the free-text walk-in fields
    // in place. Do NOT enable manualMode here — that would create real entities on
    // save and duplicate data on every edit. editingLegacyWalkin persists back to
    // the walkin_* columns instead (legacy behavior preserved).
    if (!r.client_id && !r.vehicle_id && r.walkin_client_name) {
      setManualMode(false);
      setEditingLegacyWalkin(true);
      setMName(r.walkin_client_name);
      setMPhone(r.walkin_client_phone || '');
      setMCedula('');
      setMModelId('');
      setMUseManualModel(false); setMManualBrand(''); setMManualModelName('');
      setMPlate(r.walkin_plate || '');
      setMYear('');
      setClientVehicles([]);
    } else {
      resetManualFields();
      // Trigger vehicle fetch
      if (r.client_id) {
        supabase
          .from('vehicles')
          .select('id, plate, year, vehicle_models(name, brand)')
          .eq('client_id', r.client_id)
          .eq('is_active', true)
          .then(({ data }) => setClientVehicles((data || []) as VehicleOption[]));
      } else {
        setClientVehicles([]);
      }
    }
    setDialogOpen(true);
  };

  const selectClient = (c: ClientOption) => {
    // Preserve the typed search term before overwriting it with the client name,
    // so the vehicle-fetch effect can use it as a plate hint for auto-selection.
    plateHintRef.current = fClientSearch;
    setFClientId(c.id);
    setFClientSearch(c.full_name);
    setClientResults([]);
    setFVehicleId('');
  };

  const handleSave = async () => {
    // Manual entry replaces the client+vehicle pickers, so the FK guard is relaxed
    // to allow it; the normal path still requires an existing client + vehicle.
    // Solicitud de Repuestos is auto-assigned to the plant, so the dealership picker
    // is not required from the user.
    if (!fDate || !fService || (!isRepuestos && !fDealership)) {
      toast.error('Completa los campos requeridos'); return;
    }
    if (manualMode) {
      if (!mName.trim()) { toast.error('El nombre del cliente es requerido'); return; }
      if (mUseManualModel) {
        if (!mManualBrand.trim() || !mManualModelName.trim()) {
          toast.error('Indique la marca y el modelo del vehículo'); return;
        }
      } else if (!mModelId) {
        toast.error('Seleccione el modelo del vehículo'); return;
      }
    } else if (editingLegacyWalkin) {
      // Legacy walk-in edit: only the name is required; model is NOT, since we keep
      // it as free-text walk-in and never create a vehicle entity.
      if (!mName.trim()) { toast.error('El nombre del cliente es requerido'); return; }
    } else if (!fClientId || !fVehicleId) {
      toast.error('Completa los campos requeridos'); return;
    }
    setSaving(true);

    // Validate capacity — parts requests don't occupy a bay/time slot, so skip.
    const hasCapacity = isRepuestos ? true : await checkCapacity(fDealership, fDate, fTime, fService, editingRes?.id);
    if (!hasCapacity) {
      setSaving(false);
      return;
    }

    // Resolve how the reservation gets its client/vehicle/walk-in columns. Three paths:
    //  - manualMode (NEW manual entry): create/reuse REAL entities, FKs set, walkin_* nulled.
    //  - editingLegacyWalkin: keep as free-text walk-in, persist walkin_* columns, FKs nulled.
    //  - normal: an existing client + vehicle were picked, FKs set, walkin_* nulled.
    let assignClientId: string | null = fClientId || null;
    let assignVehicleId: string | null = fVehicleId || null;
    let walkinName: string | null = null;
    let walkinPhone: string | null = null;
    let walkinPlate: string | null = null;
    if (manualMode) {
      try {
        const { vehicle } = await createOrReuseManualEntities(supabase, {
          clientName: mName,
          clientCedula: mCedula,
          clientPhone: mPhone,
          modelId: mModelId,
          manualModel: mUseManualModel ? { brand: mManualBrand, modelName: mManualModelName } : null,
          plate: mPlate,
          year: mYear,
          externalSource: mExternalSource,
        });
        const assign = resolveReservationAssignment({
          vehicle, clientId: null, walkinName: '', walkinPhone: '', walkinPlate: '',
        });
        // Real FKs now own the row: clear any stale walk-in text (W-g).
        assignClientId = assign.client_id;
        assignVehicleId = assign.vehicle_id;
        walkinName = null; walkinPhone = null; walkinPlate = null;
      } catch (err) {
        console.error(err);
        toast.error('Error al registrar el cliente o vehículo manual');
        setSaving(false);
        return;
      }
    } else if (editingLegacyWalkin) {
      // Legacy walk-in: stays free-text, no entity creation, no model required.
      assignClientId = null;
      assignVehicleId = null;
      walkinName = mName.trim() || null;
      walkinPhone = mPhone.trim() || null;
      walkinPlate = mPlate.trim().toUpperCase() || null;
    }

    const payload: any = {
      dealership_id: isRepuestos ? PLANT_DEALERSHIP_ID : fDealership,
      client_id: assignClientId,
      vehicle_id: assignVehicleId,
      walkin_client_name: walkinName,
      walkin_client_phone: walkinPhone,
      walkin_plate: walkinPlate,
      reservation_date: fDate,
      reservation_time: isRepuestos ? '00:00:00' : fTime + ':00',
      service_type: fService,
      current_mileage: parseInt(fMileage) || 0,
      status: fStatus,
      notes: fNotes.trim() || null,
      internal_notes: fObs.trim() || null,
      state: fState || null,
      technical_report_url: technicalReportUrl || null,
    };

    if (editingRes) {
      const { error } = await supabase.from('reservations').update(payload).eq('id', editingRes.id);
      if (error) { toast.error('Error al actualizar reserva'); console.error(error); }
      else {
        toast.success('Reserva actualizada'); setDialogOpen(false); fetchReservations();
        if (editingRes.kommo_lead_id) updateKommoReservationFields(editingRes.id, editingRes.kommo_lead_id).catch(console.error);
      }
    } else {
      payload.created_by_name = profile?.full_name || role?.name || 'Admin';
      payload.created_by_role = role?.name || 'admin';
      payload.created_by_profile_id = profile?.id || null;
      const { data: adminInserted, error } = await supabase.from('reservations').insert(payload).select('id').single();
      if (error) { toast.error('Error al crear reserva'); console.error(error); }
      else {
        toast.success('Reserva creada'); setDialogOpen(false); fetchReservations();
        if (adminInserted?.id) createKommoReservation(adminInserted.id).catch(console.error);
      }
    }
    setSaving(false);
  };

  const openSvcCreate = () => { setSvcEditing(null); setSvcName(''); setSvcDuration('60'); setSvcRequiresDesc(false); setSvcOpen(true); };
  const openSvcEdit = (s: ServiceType) => { setSvcEditing(s); setSvcName(s.name); setSvcDuration(String(s.duration_minutes)); setSvcRequiresDesc(s.requires_description); setSvcOpen(true); };
  const handleSvcSave = async () => {
    if (!svcName.trim()) { toast.error('El nombre es requerido'); return; }
    setSvcSaving(true);
    const payload = { name: svcName.trim(), duration_minutes: parseInt(svcDuration) || 60, requires_description: svcRequiresDesc };
    if (svcEditing) {
      const { error } = await supabase.from('service_types').update(payload).eq('id', svcEditing.id);
      if (error) toast.error('Error al actualizar'); else { toast.success('Servicio actualizado'); setSvcOpen(false); fetchServiceTypes(); }
    } else {
      const { error } = await supabase.from('service_types').insert({ ...payload, is_active: true });
      if (error) toast.error('Error al crear'); else { toast.success('Servicio creado'); setSvcOpen(false); fetchServiceTypes(); }
    }
    setSvcSaving(false);
  };
  const handleSvcToggle = async (s: ServiceType) => {
    await supabase.from('service_types').update({ is_active: !s.is_active }).eq('id', s.id);
    fetchServiceTypes();
  };
  const handleSvcDelete = async (s: ServiceType) => {
    const { error } = await supabase.from('service_types').delete().eq('id', s.id);
    if (error) toast.error('No se puede eliminar, puede tener reservas asociadas');
    else { toast.success('Servicio eliminado'); fetchServiceTypes(); }
  };

  const openComplete = (r: Reservation) => {
    setCompletingRes(r);
    setServiceNotes(r.service_notes || '');
    setTechnicalReportUrl(r.technical_report_url || null);
    setSatisfactionRating(r.satisfaction_rating || null);
    setCompleteInternalNotes(r.internal_notes || '');
    setCompleteRecommendation(r.recommendation || '');
    setCompleteOpen(true);
  };

  const handleComplete = async () => {
    if (!completingRes) return;
    if (!serviceNotes.trim()) { toast.error('Describe lo que se realizó en el servicio'); return; }
    setCompleting(true);
    // `.select()` is required, not cosmetic: when an RLS policy rejects the row PostgREST
    // updates zero rows and returns 204 with no error. Without reading the affected rows
    // back, an unauthorized user gets a green "Servicio completado" toast on an
    // appointment that never actually closed.
    const { data: updated, error } = await supabase.from('reservations').update({
      status: 'completada',
      service_notes: serviceNotes.trim(),
      technical_report_url: technicalReportUrl || null,
      satisfaction_rating: satisfactionRating,
      completed_at: new Date().toISOString(),
      internal_notes: completeInternalNotes.trim() || null,
      // `recommendation` isn't in generated Supabase types yet (see migration 20260721140000).
      recommendation: completeRecommendation.trim() || null,
    } as any).eq('id', completingRes.id).select('id');
    if (error) { toast.error('Error al completar'); console.error(error); }
    else if (!updated || updated.length === 0) {
      toast.error('No se pudo cerrar la cita: tu usuario no tiene permisos sobre este concesionario. Contacta a un administrador.');
    }
    else {
      toast.success('Servicio completado'); setCompleteOpen(false); fetchReservations();
      if (completingRes.kommo_lead_id)
        updateKommoReservationStage(completingRes.id, completingRes.kommo_lead_id, 'completada').catch(console.error);
      else createKommoReservation(completingRes.id).catch(console.error);
    }
    setCompleting(false);
  };

  const vendedores = [...new Set(reservations.filter(r => r.created_by_name).map(r => r.created_by_name!))].sort();

  const partsRequestsCount = reservations.filter(r => isPartsRequest(r.service_type)).length;

  const ARCHIVED_STATUSES = ARCHIVED_RESERVATION_STATUSES;
  const filteredReservations = reservations.filter(r => {
    // Split into "Citas" vs "Solicitudes de Repuestos" tabs
    if (reservationTab === 'repuestos') {
      if (!isPartsRequest(r.service_type)) return false;
    } else if (isPartsRequest(r.service_type)) return false;
    // Hide archived (completada/cancelada/culminado) unless explicitly filtered
    if (filtroEstado === 'todos' && ARCHIVED_STATUSES.has(r.status)) return false;
    if (filtroEstado !== 'todos' && r.status !== filtroEstado) return false;
    if (filtroServicio !== 'todos' && r.service_type !== filtroServicio) return false;
    if (filtroVendedor !== 'todos' && r.created_by_name !== filtroVendedor) return false;
    if (fechaDesde && r.reservation_date < fechaDesde) return false;
    if (fechaHasta && r.reservation_date > fechaHasta) return false;
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      if (
        !(r.clients?.full_name || '').toLowerCase().includes(q) &&
        !(r.vehicles?.plate || '').toLowerCase().includes(q) &&
        !r.service_type.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${h12}:${m} ${ampm}`;
  };

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Matrix: group reservations by dealership + hour
  const getMatrixCell = (dealershipId: string, hour: string) => {
    return reservations.filter(r => {
      const rHour = r.reservation_time.substring(0, 5);
      return r.dealerships?.id === dealershipId && rHour === hour;
    });
  };

  // Dealerships to show in matrix
  const matrixDealerships = filtroConc !== 'todos'
    ? dealerships.filter(d => d.id === filtroConc)
    : dealerships;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-display font-bold whitespace-nowrap">Reservas / Servicios</h1>
          <Badge variant="outline" className="gap-1 text-xs shrink-0">
            <CalendarDays className="w-3 h-3" /> {reservations.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tabs value={view} onValueChange={v => { setView(v as 'table' | 'matrix'); setSelectedIds(new Set()); }}>
            <TabsList className="h-8">
              <TabsTrigger value="table" className="gap-1 text-xs h-7 px-2"><List className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Tabla</span></TabsTrigger>
              {reservationTab === 'citas' && (
                <TabsTrigger value="matrix" className="gap-1 text-xs h-7 px-2"><LayoutGrid className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Matriz</span></TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={() => { fetchServiceTypes(); setSvcOpen(true); setSvcEditing(null); setSvcName(''); setSvcDuration('60'); setSvcRequiresDesc(false); }} className="gap-1 text-xs">
            <Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Servicios</span>
          </Button>
          {canCreate && (
            <Button size="sm" onClick={openCreate} className="gac-gradient">
              <Plus className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline"> Nueva</span>
            </Button>
          )}
        </div>
      </div>

      <Tabs value={reservationTab} onValueChange={v => { setReservationTab(v as 'citas' | 'repuestos'); setSelectedIds(new Set()); }}>
        <TabsList className="h-8">
          <TabsTrigger value="citas" className="text-xs h-7 px-3">Citas</TabsTrigger>
          <TabsTrigger value="repuestos" className="gap-1.5 text-xs h-7 px-3">
            Solicitudes de Repuestos
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{partsRequestsCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-2">
        {/* Row 1: search / date picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {view === 'table' && (
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar cliente, placa..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
          )}
          {view === 'matrix' && (
            <div className="text-xs text-muted-foreground">Vista mensual — usa los controles del calendario para navegar.</div>
          )}
        </div>
        {/* Row 2: filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filtroConc} onValueChange={v => { setFiltroConc(v); setSelectedIds(new Set()); }}>
            <SelectTrigger className="w-full sm:w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los concesionarios</SelectItem>
              {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {view === 'table' && (
            <>
              <Select value={filtroEstado} onValueChange={v => { setFiltroEstado(v); setSelectedIds(new Set()); }}>
                <SelectTrigger className="flex-1 sm:w-[120px] sm:flex-none h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroServicio} onValueChange={v => { setFiltroServicio(v); setSelectedIds(new Set()); }}>
                <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none h-8 text-xs"><SelectValue placeholder="Servicio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los servicios</SelectItem>
                  {serviceTypes.filter(s => s.is_active).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {vendedores.length > 0 && (
                <Select value={filtroVendedor} onValueChange={v => { setFiltroVendedor(v); setSelectedIds(new Set()); }}>
                  <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none h-8 text-xs"><SelectValue placeholder="Registrado por" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los vendedores</SelectItem>
                    {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>
        {view === 'table' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground shrink-0">Desde</span>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground shrink-0">Hasta</span>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            </div>
            {(fechaDesde || fechaHasta || filtroEstado !== 'todos' || filtroServicio !== 'todos' || filtroVendedor !== 'todos') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroEstado('todos'); setFiltroServicio('todos'); setFiltroVendedor('todos'); }}>
                Limpiar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* TABLE / CARD VIEW */}
      {view === 'table' && (
        loading ? (
          <Card className="gac-shadow">
            <CardContent className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando reservas...</p>
            </CardContent>
          </Card>
        ) : filteredReservations.length === 0 ? (
          <Card className="gac-shadow">
            <CardContent className="p-8 text-center">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay reservas registradas</p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          /* ── MOBILE CARDS ── */
          <div className="space-y-2">
            {filteredReservations.map(r => (
              <Card key={r.id} className={cn("gac-shadow cursor-pointer", selectedIds.has(r.id) && "ring-1 ring-primary/40 bg-primary/5")} onClick={() => setDetailRes(r)}>
                <CardContent className="p-3 space-y-2">
                  {/* Row 1: date + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div onClick={e => e.stopPropagation()} className="shrink-0 pt-0.5">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold">{formatDate(r.reservation_date)} · {formatTime(r.reservation_time)}</p>
                        <p className="text-[11px] text-muted-foreground">{r.dealerships?.name || '-'}</p>
                      </div>
                    </div>
                    {canEdit ? (
                      <Select value={r.status} onValueChange={val => {
                        if (val === 'completada') { openComplete(r); }
                        else {
                          supabase.from('reservations').update({ status: val }).eq('id', r.id).then(() => {
                            fetchReservations();
                            if (r.kommo_lead_id) updateKommoReservationStage(r.id, r.kommo_lead_id, val).catch(console.error);
                            else createKommoReservation(r.id).catch(console.error);
                          });
                        }
                      }}>
                        <SelectTrigger className={cn('h-6 text-[10px] px-1.5 py-0 border-0 font-medium w-[108px] shrink-0', STATUS_COLORS[r.status] || 'bg-muted')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={cn('text-[10px] px-1.5 py-0 shrink-0', STATUS_COLORS[r.status] || 'bg-muted')}>
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    )}
                  </div>
                  {/* Row 2: client + vehicle */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0">
                      <User className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium text-foreground">{r.clients?.full_name || r.walkin_client_name || '-'}</span>
                      <ExternalClientBadge isExternal={r.clients?.is_manual} source={r.clients?.external_source} />
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0">
                      <Car className="w-3 h-3 shrink-0" />
                      <span className="truncate">{r.vehicles ? `${r.vehicles.vehicle_models?.brand || ''} ${r.vehicles.vehicle_models?.name || ''} ${r.vehicles.year}` : (r.walkin_plate || '-')}</span>
                    </div>
                    <div className="text-muted-foreground pl-4">{r.vehicles?.plate || r.walkin_plate || '-'}</div>
                    <div className="text-muted-foreground pl-4">{r.current_mileage.toLocaleString()} km</div>
                  </div>
                  {/* Row 3: service + actions */}
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-[60%]">{r.service_type}</Badge>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {r.status === 'confirmada' && r.clients?.phone && (() => {
                        const waUrl = buildWhatsAppReservationUrl({
                          phone: r.clients.phone,
                          clientName: r.clients.full_name,
                          date: r.reservation_date,
                          time: r.reservation_time,
                          serviceType: r.service_type,
                          vehicleBrand: r.vehicles?.vehicle_models?.brand,
                          vehicleModel: r.vehicles?.vehicle_models?.name,
                          vehicleYear: r.vehicles?.year,
                          vehiclePlate: r.vehicles?.plate || undefined,
                          dealershipName: r.dealerships?.name || undefined,
                          mileage: r.current_mileage,
                          notes: r.notes || undefined,
                        });
                        return waUrl ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" asChild>
                            <a href={waUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /></a>
                          </Button>
                        ) : null;
                      })()}
                      {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-3.5 h-3.5" /></Button>}
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
                  <TableHead className="w-8 pl-3">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer"
                      checked={filteredReservations.length > 0 && filteredReservations.every(r => selectedIds.has(r.id))}
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Fecha / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado (Vzla)</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead>Concesionario</TableHead>
                  <TableHead>Km</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.map(r => (
                  <TableRow key={r.id} className={cn("[&>td]:py-1.5 cursor-pointer hover:bg-muted/50", selectedIds.has(r.id) && "bg-primary/5")} onClick={() => setDetailRes(r)}>
                    <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatDate(r.reservation_date)}
                      <br />
                      <span className="text-muted-foreground">{formatTime(r.reservation_time)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span>{r.clients?.full_name || r.walkin_client_name || '-'}</span>
                        <ExternalClientBadge isExternal={r.clients?.is_manual} source={r.clients?.external_source} />
                      </div>
                    </TableCell>
                    <TableCell>{INCIDENCIA_TYPES.has(r.service_type) ? (r.dealerships?.state || '-') : (r.clients?.state || '-')}</TableCell>
                    <TableCell>
                      {r.vehicles
                        ? `${r.vehicles.vehicle_models?.brand || ''} ${r.vehicles.vehicle_models?.name || ''} ${r.vehicles.year}`
                        : (r.walkin_plate || '-')}
                      <br />
                      <span className="text-muted-foreground">{r.vehicles?.plate || r.walkin_plate || '-'}</span>
                    </TableCell>
                    <TableCell>{r.service_type}</TableCell>
                    <TableCell>
                      {r.created_by_name ? (
                        <div>
                          <div>{r.created_by_name}</div>
                          {r.created_by_role && <span className="text-[10px] text-muted-foreground">{r.created_by_role}</span>}
                        </div>
                      ) : INCIDENCIA_TYPES.has(r.service_type) ? (
                        <div>
                          <div>Cliente</div>
                          <span className="text-[10px] text-muted-foreground">Portal</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{r.dealerships?.name || '-'}</TableCell>
                    <TableCell>{r.current_mileage.toLocaleString()}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()} className="text-right">
                      <div className="flex items-center gap-1">
                        {canEdit ? (
                          <Select
                            value={r.status}
                            onValueChange={val => {
                              if (val === 'completada') { openComplete(r); }
                              else {
                                supabase.from('reservations').update({ status: val }).eq('id', r.id).then(() => {
                                  fetchReservations();
                                  if (r.kommo_lead_id) updateKommoReservationStage(r.id, r.kommo_lead_id, val).catch(console.error);
                            else createKommoReservation(r.id).catch(console.error);
                                });
                              }
                            }}
                          >
                            <SelectTrigger className={cn('h-6 text-[10px] px-1.5 py-0 border-0 font-medium w-[110px]', STATUS_COLORS[r.status] || 'bg-muted')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_COLORS[r.status] || 'bg-muted')}>
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        )}
                        {r.status === 'confirmada' && r.clients?.phone && (() => {
                          const waUrl = buildWhatsAppReservationUrl({
                            phone: r.clients.phone,
                            clientName: r.clients.full_name,
                            date: r.reservation_date,
                            time: r.reservation_time,
                            serviceType: r.service_type,
                            vehicleBrand: r.vehicles?.vehicle_models?.brand,
                            vehicleModel: r.vehicles?.vehicle_models?.name,
                            vehicleYear: r.vehicles?.year,
                            vehiclePlate: r.vehicles?.plate || undefined,
                            dealershipName: r.dealerships?.name || undefined,
                            mileage: r.current_mileage,
                            notes: r.notes || undefined,
                          });
                          return waUrl ? (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:text-green-700 shrink-0" asChild>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          ) : null;
                        })()}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => openEdit(r)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
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
        )
      )}

      {/* MATRIX VIEW — monthly calendar */}
      {view === 'matrix' && (
        <Card className="gac-shadow p-3">
          {loading ? (
            <CardContent className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando calendario...</p>
            </CardContent>
          ) : (
            <MonthlyReservationsCalendar
              reservations={reservations as any}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onReservationClick={(r) => setDetailRes(r as any)}
              statusColors={STATUS_COLORS}
            />
          )}
        </Card>
      )}

      {/* Floating bulk action bar */}
      {view === 'table' && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background border shadow-lg rounded-full px-4 py-2 overflow-x-auto max-w-[95vw]">
          <span className="text-xs font-medium text-muted-foreground shrink-0">{selectedIds.size} sel.</span>
          <div className="w-px h-4 bg-border shrink-0" />
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkStatus('pendiente'); setBulkAction('status'); }}>
            <CalendarDays className="w-3 h-3" /> Estado
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkService(''); setBulkAction('service'); }}>
            <Settings className="w-3 h-3" /> Servicio
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkDealership(''); setBulkAction('dealership'); }}>
            <MapPin className="w-3 h-3" /> Concesionario
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkDate(''); setBulkAction('date'); }}>
            <CalendarDays className="w-3 h-3" /> Fecha
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkTime('08:00'); setBulkAction('time'); }}>
            <Clock className="w-3 h-3" /> Hora
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => { setBulkMileage(''); setBulkAction('mileage'); }}>
            <Gauge className="w-3 h-3" /> Km
          </Button>
          {canDelete && (
            <Button variant="destructive" size="sm" className="h-7 text-xs shrink-0 whitespace-nowrap gap-1" onClick={() => setBulkConfirmDeleteOpen(true)}>
              <Trash2 className="w-3 h-3" /> Eliminar
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Bulk action dialog */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) setBulkAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">
              Acción masiva — {selectedIds.size} reserva(s)
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            {bulkAction === 'status' && (
              <div className="space-y-2">
                <Label>Nuevo estado</Label>
                <Select value={bulkStatus} onValueChange={setBulkStatus}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'service' && (
              <div className="space-y-2">
                <Label>Tipo de servicio</Label>
                <Select value={bulkService} onValueChange={setBulkService}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.filter(s => s.is_active).map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'dealership' && (
              <div className="space-y-2">
                <Label>Concesionario</Label>
                <Select value={bulkDealership} onValueChange={setBulkDealership}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                  <SelectContent>
                    {dealerships.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}{d.city ? ` — ${d.city}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'date' && (
              <div className="space-y-2">
                <Label>Nueva fecha</Label>
                <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} autoFocus />
              </div>
            )}
            {bulkAction === 'time' && (
              <div className="space-y-2">
                <Label>Nueva hora</Label>
                <Select value={bulkTime} onValueChange={setBulkTime}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => <SelectItem key={h} value={h}>{HOUR_LABELS[h]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'mileage' && (
              <div className="space-y-2">
                <Label>Kilometraje</Label>
                <Input type="number" min={0} value={bulkMileage} onChange={e => setBulkMileage(e.target.value)} placeholder="Ej: 15000" autoFocus />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)}>Cancelar</Button>
            <Button
              onClick={handleBulkApply}
              disabled={bulkLoading || (bulkAction === 'service' && !bulkService) || (bulkAction === 'dealership' && !bulkDealership) || (bulkAction === 'date' && !bulkDate) || (bulkAction === 'mileage' && !bulkMileage)}
              className="gac-gradient"
            >
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} reserva(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente las reservas seleccionadas. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {bulkLoading ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CREATE/EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingRes ? (INCIDENCIA_TYPES.has(editingRes.service_type) ? 'Editar Incidencia' : 'Editar Reserva') : (INCIDENCIA_TYPES.has(fService) ? 'Nueva Incidencia' : 'Nueva Reserva')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Concesionario — no aplica a Solicitud de Repuestos (auto-asignada a planta) */}
            <div className="space-y-2">
              <Label>Concesionario{!isRepuestos && ' *'}</Label>
              {isRepuestos ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  Concesionario encargado: <span className="font-semibold">DFSK &amp; GAC Centro de Servicio</span> (planta)
                </div>
              ) : (
                <Select
                  value={fDealership}
                  onValueChange={v => {
                    setFDealership(v);
                    // Auto-fill Estado de Venezuela from the picked dealership. Only fires
                    // on this explicit user action, so it never fights a manual override.
                    setFState(dealerships.find(d => d.id === v)?.state || '');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                  <SelectContent>
                    {dealerships.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name} — {d.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Estado de Venezuela — auto-filled from the dealership above; the user
                can override it, or explicitly choose to keep inheriting. */}
            <div className="space-y-2">
              <Label>Estado de Venezuela</Label>
              <Select value={fState || '__none'} onValueChange={v => setFState(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Usar estado del concesionario</SelectItem>
                  {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Cliente: búsqueda existente o ingreso manual (crea cliente + vehículo) */}
            <div className="flex items-center justify-between gap-2">
              <Label>{editingLegacyWalkin ? 'Cliente walk-in' : manualMode ? 'Ingreso manual' : 'Cliente *'}</Label>
              {/* The manual/existing toggle is hidden while editing a legacy walk-in:
                  that row stays free-text and must not be converted to entities here. */}
              {!editingLegacyWalkin && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => {
                    if (manualMode) {
                      resetManualFields();
                    } else {
                      setManualMode(true);
                      setFClientId(''); setFVehicleId(''); setFClientSearch(''); setClientResults([]); setClientVehicles([]);
                    }
                  }}
                >
                  {manualMode ? 'Buscar cliente existente' : 'Ingresar manualmente'}
                </Button>
              )}
            </div>

            {/* Cliente search (modo normal) */}
            {!manualMode && !editingLegacyWalkin && (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    value={fClientSearch}
                    onChange={e => { setFClientSearch(e.target.value); if (fClientId) { setFClientId(''); setFVehicleId(''); } }}
                    placeholder="Buscar por nombre, cédula o placa..."
                  />
                  {clientResults.length > 0 && !fClientId && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-40 overflow-y-auto">
                      {clientResults.map(c => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                          onClick={() => selectClient(c)}
                        >
                          <span>{c.full_name}</span>
                          <span className="text-xs text-muted-foreground">{c.cedula}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchingClients && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Buscando...</span>}
                </div>

                {/* Buscamos y no está: ahí recién se ofrece cargarlo como cliente de un solo
                    uso. Antes esto vivía sólo detrás del botón "Ingresar manualmente", que
                    hay que saber que existe; el pedido fue que la opción aparezca sola al
                    escribir un nombre que no está registrado. */}
                {clientSearched && !searchingClients && clientResults.length === 0 && !fClientId && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <p className="text-xs text-amber-900">
                      No encontramos a <span className="font-semibold">«{fClientSearch.trim()}»</span> en la base.
                      Si viene de un convenio o es una atención suelta, cargalo como cliente de un solo uso:
                      queda registrado con su vehículo y su historial, sin mezclarse con la cartera propia.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setManualMode(true);
                        setMName(fClientSearch.trim());
                        setFClientId(''); setFVehicleId(''); setClientResults([]); setClientVehicles([]);
                      }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Usar cliente de un solo uso
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Vehículo (modo normal) */}
            {!manualMode && fClientId && (
              <div className="space-y-2">
                <Label>Vehículo *</Label>
                {clientVehicles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Este cliente no tiene vehículos registrados</p>
                ) : (
                  <>
                    <Select value={fVehicleId} onValueChange={setFVehicleId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar vehículo" /></SelectTrigger>
                      <SelectContent>
                        {clientVehicles.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year} {v.plate ? `· ${v.plate}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fVehicleId && <WarrantyChip vehicleId={fVehicleId} />}
                  </>
                )}
              </div>
            )}

            {/* Ingreso manual NUEVO: crea cliente + vehículo reales.
                Edición de walk-in LEGACY: edita texto libre (sin crear entidades). */}
            {(manualMode || editingLegacyWalkin) && (
              <div className="space-y-2">
                <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    {editingLegacyWalkin ? (
                      <>
                        <p className="font-semibold text-amber-800">Cliente walk-in (sin registrar)</p>
                        <p className="text-amber-700">Se actualizan solo los datos de texto del walk-in. No se crea cliente ni vehículo.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-amber-800">Ingreso manual</p>
                        <p className="text-amber-700">Se creará un cliente y un vehículo nuevos con estos datos.</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Nombre *</Label><Input value={mName} onChange={e => setMName(e.target.value)} placeholder="Nombre del cliente" /></div>
                  <div className="space-y-1"><Label>Teléfono</Label><Input value={mPhone} onChange={e => setMPhone(e.target.value)} placeholder="+58 412..." /></div>
                  {/* Cédula / Modelo / Año only make sense when creating real entities. */}
                  {!editingLegacyWalkin && (
                    <>
                      <div className="space-y-1"><Label>Cédula</Label><Input value={mCedula} onChange={e => setMCedula(e.target.value)} placeholder="V-12345678" /></div>
                      <div className="space-y-1">
                        <Label>Marca / Modelo *</Label>
                        {/* Searchable: 269 active models make a plain Select unusable. */}
                        <ModelCombobox
                          models={vehicleModels}
                          value={mUseManualModel ? MANUAL_MODEL_VALUE : mModelId}
                          onChange={v => {
                            if (v === MANUAL_MODEL_VALUE) { setMUseManualModel(true); setMModelId(''); }
                            else { setMUseManualModel(false); setMModelId(v); }
                          }}
                        />
                      </div>
                      {mUseManualModel && (
                        <>
                          <div className="space-y-1"><Label>Marca *</Label><Input value={mManualBrand} onChange={e => setMManualBrand(e.target.value)} placeholder="Ej: Toyota" /></div>
                          <div className="space-y-1"><Label>Modelo *</Label><Input value={mManualModelName} onChange={e => setMManualModelName(e.target.value)} placeholder="Ej: Corolla" /></div>
                          <div className="col-span-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-amber-700">
                              Este vehículo se registrará como unidad de tercero (no vendida por nosotros), <strong>sin garantía</strong>,
                              y el cliente <strong>no</strong> se registrará como cliente comercial.
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  <div className="space-y-1"><Label>Placa</Label><Input value={mPlate} onChange={e => setMPlate(e.target.value.toUpperCase())} placeholder="Ej: ABC123" className="uppercase" /></div>
                  {!editingLegacyWalkin && (
                    <div className="space-y-1"><Label>Año</Label><Input type="number" value={mYear} onChange={e => setMYear(e.target.value)} placeholder={String(new Date().getFullYear())} /></div>
                  )}
                  {/* Etiqueta del convenio. Sólo se guarda si el cliente se crea acá: si ya
                      existía, su origen es el que tenga cargado y no se pisa. */}
                  {!editingLegacyWalkin && (
                    <div className="space-y-1 col-span-2">
                      <Label>Convenio de origen</Label>
                      <Input
                        list="ar-external-sources"
                        value={mExternalSource}
                        onChange={e => setMExternalSource(e.target.value)}
                        placeholder="Ej: Seguros Caracas — opcional"
                      />
                      <datalist id="ar-external-sources">
                        {externalSources.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fecha y Hora — Solicitud de Repuestos no ocupa horario */}
            <div className={isRepuestos ? 'space-y-2' : 'grid grid-cols-2 gap-4'}>
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
              {!isRepuestos && (
                <div className="space-y-2">
                  <Label>Hora *</Label>
                  {INCIDENCIA_TYPES.has(fService) ? (
                    // Incidencia/Falla también ocupa una bahía (duration_minutes en service_types),
                    // así que usa el mismo picker gateado por capacidad que dealership/public.
                    <Select value={fTime} onValueChange={setFTime}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HOURS.map(h => {
                          const occ = getSlotOccupancy(h);
                          return (
                            <SelectItem
                              key={h}
                              value={h}
                              disabled={occ.full}
                              className={occ.full ? 'line-through text-muted-foreground' : ''}
                            >
                              {HOUR_LABELS[h]} · {occ.occupied}/{occ.capacity}{occ.full ? ' (lleno)' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={fTime} onValueChange={setFTime}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HOURS.map(h => (
                          <SelectItem key={h} value={h}>{HOUR_LABELS[h]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* Servicio */}
            <div className="space-y-2">
              <Label>Tipo de Servicio *</Label>
              <Select value={fService} onValueChange={v => {
                const wasRepuestos = isPartsRequest(fService);
                const nowRepuestos = isPartsRequest(v);
                setFService(v); setCapacityWarning(''); setFNotes('');
                if (wasRepuestos !== nowRepuestos) {
                  // The effective dealership changes (forced to the plant, or back to the
                  // picked one), so Estado de Venezuela must follow it, not the stale value.
                  setFState(nowRepuestos ? '' : (dealerships.find(d => d.id === fDealership)?.state || ''));
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.filter(s => s.is_active).map(s => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name} ({s.duration_minutes >= 60 ? `${Math.floor(s.duration_minutes / 60)}h${s.duration_minutes % 60 > 0 ? ` ${s.duration_minutes % 60}min` : ''}` : `${s.duration_minutes}min`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isRepuestos && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-amber-700">La Solicitud de Repuestos no ocupa un lugar en la bahía ni un horario.</p>
              </div>
            )}

            {/* Capacity warning */}
            {capacityWarning && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{capacityWarning}</span>
              </div>
            )}

            {/* Km y Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kilometraje actual</Label>
                <Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descripción de la incidencia / servicio — siempre visible */}
            <div className="space-y-2">
              <Label>Descripción de la incidencia</Label>
              <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Describa la falla, desperfecto o tipo de servicio solicitado..." rows={3} />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas Internas</Label>
              <Textarea value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Notas internas del equipo GAC (no visibles para el cliente)..." rows={2} />
            </div>

            {/* Archivo adjunto */}
            <div className="space-y-2">
              <Label>Archivo adjunto</Label>
              <TechnicalReportUploader
                reservationId={editingRes?.id}
                value={technicalReportUrl}
                onChange={setTechnicalReportUrl}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingRes ? 'Guardar' : isRepuestos ? 'Crear Solicitud' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* COMPLETE SERVICE DIALOG */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> Completar Servicio
            </DialogTitle>
          </DialogHeader>
          {completingRes && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-1">
                <p><span className="font-semibold">Cliente:</span> {completingRes.clients?.full_name || completingRes.walkin_client_name || '-'}</p>
                <p><span className="font-semibold">Vehículo:</span> {completingRes.vehicles ? `${completingRes.vehicles.vehicle_models?.brand} ${completingRes.vehicles.vehicle_models?.name} ${completingRes.vehicles.year}` : (completingRes.walkin_plate || '-')}</p>
                <p><span className="font-semibold">Placa:</span> {completingRes.vehicles?.plate || completingRes.walkin_plate || '-'}</p>
                <p><span className="font-semibold">Servicio:</span> {completingRes.service_type}</p>
                <p><span className="font-semibold">Km:</span> {completingRes.current_mileage.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                <Label>¿Qué se realizó en el servicio? *</Label>
                <Textarea
                  value={serviceNotes}
                  onChange={e => setServiceNotes(e.target.value)}
                  rows={4}
                  placeholder="Describa los trabajos realizados, repuestos cambiados, observaciones..."
                />
              </div>
              <div className="space-y-2">
                <Label>Informe Técnico (PDF)</Label>
                <TechnicalReportUploader
                  reservationId={completingRes.id}
                  value={technicalReportUrl}
                  onChange={setTechnicalReportUrl}
                />
              </div>
              <div className="space-y-2">
                <Label>Satisfacción del Cliente (1–5)</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSatisfactionRating(satisfactionRating === star ? null : star)}
                      className={cn(
                        'text-2xl transition-transform hover:scale-110',
                        satisfactionRating !== null && star <= satisfactionRating ? 'text-amber-400' : 'text-muted-foreground/30'
                      )}
                    >★</button>
                  ))}
                  {satisfactionRating && <span className="text-xs text-muted-foreground ml-1">{satisfactionRating}/5</span>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recomendación (opcional)</Label>
                <Textarea
                  value={completeRecommendation}
                  onChange={e => setCompleteRecommendation(e.target.value)}
                  rows={3}
                  placeholder="Recomendaciones de seguimiento visibles para el cliente..."
                />
              </div>
              <div className="space-y-2">
                <Label>Notas internas (solo equipo GAC)</Label>
                <Textarea
                  value={completeInternalNotes}
                  onChange={e => setCompleteInternalNotes(e.target.value)}
                  rows={3}
                  placeholder="Observaciones internas, no visibles para el cliente..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button onClick={handleComplete} disabled={completing} className="gac-gradient">
              {completing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Marcar como Completado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* SERVICE MANAGER DIALOG */}
      <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Settings className="w-4 h-4" /> Gestionar Tipos de Servicio
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Form */}
            <div className="border rounded-md p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground">{svcEditing ? 'Editar servicio' : 'Nuevo servicio'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={svcName} onChange={e => setSvcName(e.target.value)} className="h-8 text-xs" placeholder="Nombre del servicio" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Duración (min)</Label>
                  <Input type="number" value={svcDuration} onChange={e => setSvcDuration(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer pb-1">
                    <input type="checkbox" checked={svcRequiresDesc} onChange={e => setSvcRequiresDesc(e.target.checked)} className="w-4 h-4 rounded" />
                    Requiere descripción
                  </label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                {svcEditing && <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setSvcEditing(null); setSvcName(''); setSvcDuration('60'); setSvcRequiresDesc(false); }}>Cancelar edición</Button>}
                <Button size="sm" onClick={handleSvcSave} disabled={svcSaving} className="gac-gradient text-xs">
                  {svcSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                  {svcEditing ? 'Guardar cambios' : 'Agregar'}
                </Button>
              </div>
            </div>

            {/* List */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Servicios ({serviceTypes.length})</p>
              {serviceTypes.map(s => (
                <div key={s.id} className={cn("flex items-center justify-between rounded-md border px-3 py-2 text-xs", !s.is_active && "opacity-50")}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.name}</p>
                    <p className="text-muted-foreground">
                      {s.duration_minutes >= 60 ? `${Math.floor(s.duration_minutes / 60)}h${s.duration_minutes % 60 > 0 ? ` ${s.duration_minutes % 60}min` : ''}` : `${s.duration_minutes}min`}
                      {s.requires_description && <span className="ml-2 text-blue-600">· Requiere descripción</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 cursor-pointer" onClick={() => handleSvcToggle(s)}>
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openSvcEdit(s)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleSvcDelete(s)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={!!detailRes} onOpenChange={open => { if (!open) setDetailRes(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {detailRes && INCIDENCIA_TYPES.has(detailRes.service_type)
                ? <><AlertCircle className="w-4 h-4 text-amber-500" /> Detalle de Incidencia</>
                : <><FileText className="w-4 h-4" /> Detalle de Reserva</>}
            </DialogTitle>
          </DialogHeader>
          {detailRes && (
            <div className="space-y-4 py-1">
              {/* Status badge */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {(() => {
                  const st = reservationStatusStyle(detailRes.status);
                  return <Badge className={cn('text-xs px-2 py-0.5', st.color)}>{st.label}</Badge>;
                })()}
                <span className="text-xs text-muted-foreground break-words">{formatDate(detailRes.reservation_date)} · {formatTime(detailRes.reservation_time)}</span>
              </div>
              {INCIDENCIA_TYPES.has(detailRes.service_type) && (
                <p className="text-[11px] text-muted-foreground">Registrado por: <span className="font-medium">{detailRes.created_by_name || 'Cliente'}</span>{` · ${detailRes.created_by_role || 'Portal'}`}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {/* Client */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{detailRes.clients?.full_name || detailRes.walkin_client_name || '-'}</span>
                    <ExternalClientBadge isExternal={detailRes.clients?.is_manual} source={detailRes.clients?.external_source} size="md" />
                  </div>
                  {detailRes.clients?.cedula && <p className="text-xs text-muted-foreground pl-5">CI: {detailRes.clients.cedula}</p>}
                  {(detailRes.clients?.phone || detailRes.walkin_client_phone) && <p className="text-xs text-muted-foreground pl-5">{detailRes.clients?.phone || detailRes.walkin_client_phone}</p>}
                </div>

                {/* Dealership */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Concesionario</p>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{detailRes.dealerships?.name || '-'}</span>
                  </div>
                  {detailRes.dealerships?.city && <p className="text-xs text-muted-foreground pl-5">{detailRes.dealerships.city}</p>}
                </div>

                {/* Vehicle */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Vehículo</p>
                  <div className="flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{detailRes.vehicles ? `${detailRes.vehicles.vehicle_models?.brand || ''} ${detailRes.vehicles.vehicle_models?.name || ''} ${detailRes.vehicles.year}` : (detailRes.walkin_plate || '-')}</span>
                  </div>
                  {(detailRes.vehicles?.plate || detailRes.walkin_plate) && <p className="text-xs text-muted-foreground pl-5">Placa: {detailRes.vehicles?.plate || detailRes.walkin_plate}</p>}
                </div>

                {/* Service */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Servicio</p>
                  <div className="flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{detailRes.service_type}</span>
                  </div>
                </div>

                {/* Mileage */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Kilometraje</p>
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{detailRes.current_mileage.toLocaleString()} km</span>
                  </div>
                </div>

                {/* Satisfaction */}
                {detailRes.satisfaction_rating && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Satisfacción</p>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={cn('w-3.5 h-3.5', i <= (detailRes.satisfaction_rating ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground')} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{detailRes.satisfaction_rating}/5</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Descripción de la incidencia o de la solicitud de repuestos */}
              {detailRes.notes && (INCIDENCIA_TYPES.has(detailRes.service_type) || isPartsRequest(detailRes.service_type)) && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                    {isPartsRequest(detailRes.service_type) ? 'Descripción de la solicitud' : 'Descripción de la falla'}
                  </p>
                  <div className="flex gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs bg-muted rounded p-2 flex-1 min-w-0 break-words whitespace-pre-wrap">{detailRes.notes}</p>
                  </div>
                </div>
              )}

              {/* Recomendación (visible para el cliente) */}
              {detailRes.recommendation && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Recomendación</p>
                  <div className="bg-green-50 border border-green-200 rounded-md p-2 flex gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-green-800 flex-1 whitespace-pre-wrap">{detailRes.recommendation}</p>
                  </div>
                </div>
              )}

              {/* Notas Internas (solo equipo GAC) */}
              {detailRes.internal_notes && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Notas Internas</p>
                  <div className="flex gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs bg-muted rounded p-2 flex-1 min-w-0 break-words whitespace-pre-wrap">{detailRes.internal_notes}</p>
                  </div>
                </div>
              )}

              {/* Service notes */}
              {detailRes.service_notes && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Notas de servicio</p>
                  <div className="flex gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs bg-muted rounded p-2 flex-1 min-w-0 break-words whitespace-pre-wrap">{detailRes.service_notes}</p>
                  </div>
                </div>
              )}

              {/* Technical report */}
              {detailRes.technical_report_url && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Archivos Adjuntos</p>
                  <TechnicalReportUploader value={detailRes.technical_report_url} onChange={() => {}} readonly />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            {detailRes && canEdit && (
              <Button variant="outline" size="sm" onClick={() => { openEdit(detailRes); setDetailRes(null); }}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
              </Button>
            )}
            {detailRes && canDelete && (
              <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => { setDeleteTarget(detailRes); setDetailRes(null); }}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
              </Button>
            )}
            <Button size="sm" onClick={() => setDetailRes(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget && INCIDENCIA_TYPES.has(deleteTarget.service_type) ? '¿Eliminar esta incidencia?' : '¿Eliminar esta reserva?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-semibold">{deleteTarget.clients?.full_name || deleteTarget.walkin_client_name || '-'}</span>
                  {' — '}{deleteTarget.service_type}
                  {' — '}{deleteTarget.reservation_date} {deleteTarget.reservation_time.substring(0, 5)}
                  <br />
                  <span className="text-destructive">Esta acción no se puede deshacer.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminReservas;
