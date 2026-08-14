import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, Plus, Search, CheckCircle, Car, User, AlertCircle, ClipboardCheck, Clock, MapPin, Wrench, FileText, Shield, Hash, Palette, MessageCircle, AlertTriangle, X, Pencil, Trash2 } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { WarrantyChip } from '@/components/WarrantyChip';
import ExternalClientBadge from '@/components/ExternalClientBadge';
import { listExternalSources } from '@/lib/externalSources';
import ModelCombobox, { MANUAL_MODEL_VALUE } from '@/components/vehicles/ModelCombobox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { buildWhatsAppReservationUrl } from '@/lib/whatsapp';
import { MonthlyReservationsCalendar } from '@/components/MonthlyReservationsCalendar';
import { createKommoReservation, updateKommoReservationStage, updateKommoReservationFields } from '@/lib/kommo';
import { resolveAutoVehicle } from '@/lib/vehicleSelection';
import { resolveReservationAssignment, createOrReuseManualEntities } from '@/lib/reservationAssignment';
import { computeSlotOccupancy, type CapacityReservation } from '@/lib/reservationCapacity';
import { isPartsRequest, PLANT_DEALERSHIP_ID, serviceNotesLabel } from '@/lib/serviceTypes';
import { useServiceSurveys } from '@/hooks/useServiceSurveys';
import ServiceSurveyInline from '@/components/satisfaction/ServiceSurveyInline';
import {
  RESERVATION_STATUS_CONFIG,
  ARCHIVED_RESERVATION_STATUSES,
  reservationStatusStyle,
} from '@/lib/reservationStatus';
import { VENEZUELA_STATES } from '@/lib/venezuelaStates';
import { List, LayoutGrid } from 'lucide-react';

// Service types that trigger the incidencia form
const INCIDENCIA_TYPES = new Set(['Incidencia', 'Falla o Desperfecto']);

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
  walkin_client_name: string | null;
  walkin_client_phone: string | null;
  walkin_plate: string | null;
  service_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  created_at: string;
  created_by_name: string | null;
  created_by_role: string | null;
  created_by_profile_id: string | null;
  kommo_lead_id: number | null;
  state: string | null;
  /** Client-visible follow-up recommendation, filled when the service is completed. Not in generated Supabase types yet. */
  recommendation: string | null;
  // `is_manual` / `external_source`: cliente externo y de qué convenio vino. Se muestran acá
  // para que el mostrador sepa a quién está atendiendo sin abrir la ficha. Ver 20260811130000.
  clients: {
    full_name: string; cedula: string | null; phone: string | null;
    is_manual: boolean | null; external_source: string | null;
  } | null;
  vehicles: { plate: string | null; year: number; vehicle_models: { name: string; brand: string } | null } | null;
  dealerships: { name: string; state: string | null } | null;
}

interface PlateResult {
  id: string;
  plate: string;
  year: number;
  color: string | null;
  client_id: string;
  vehicle_models: { name: string; brand: string } | null;
  clients: { id: string; full_name: string; phone: string | null; cedula: string | null } | null;
}

/**
 * Una fila del buscador unificado: o un vehículo resuelto por placa, o un cliente.
 * El cliente arrastra cédula y teléfono porque la búsqueda ahora también matchea por
 * esos campos — sin mostrarlos, dos homónimos son indistinguibles en el desplegable.
 */
type UnifiedResult =
  | { kind: 'vehicle'; data: PlateResult }
  | { kind: 'client'; id: string; full_name: string; cedula: string | null; phone: string | null; is_manual: boolean };

interface ServiceType {
  id: number;
  name: string;
  duration_minutes: number;
  requires_description: boolean;
}

interface VehicleDetail {
  id: string;
  plate: string | null;
  year: number;
  color: string | null;
  vin: string | null;
  mileage: number;
  warranty_active: boolean;
  vehicle_models: { name: string; brand: string } | null;
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
}

interface HistoryRecord {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  internal_notes: string | null;
  service_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  dealerships: { name: string } | null;
}

interface ClientResult {
  id: string;
  full_name: string;
}

interface VehicleModelOption {
  id: string;
  name: string;
  brand: string;
}

interface VehicleResult {
  id: string;
  plate: string | null;
  year: number;
  vehicle_models: { name: string; brand: string } | null;
}

// Statuses come from src/lib/reservationStatus.ts so this view, AdminReservas and the
// advisor panel cannot drift apart again. The incidencia-only `agendada` / `culminado`
// pair that used to live here was rejected by the database on every save.
const STATUS_CONFIG = RESERVATION_STATUS_CONFIG;

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
}).filter(t => t !== '12:00' && t !== '12:30');

const DR_LS_KEY = 'dealership_reservas_create_form';
const getDrLS = () => { try { return JSON.parse(localStorage.getItem(DR_LS_KEY) || '{}'); } catch { return {}; } };

const DealershipReservas = () => {
  const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading: loadingAccess } = useDealershipAccess();
  const { profile, role, hasPermission } = useAuth();
  const canCreate = hasPermission('reservas.create');
  const canEdit = hasPermission('reservas.edit');
  const canDelete = hasPermission('reservas.delete');
  const { salesperson: currentSalesperson } = useCurrentSalesperson();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'matrix'>('matrix');
  const [reservationTab, setReservationTab] = useState<'citas' | 'repuestos'>('citas');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Parts requests have no meaningful time slot, so only the table view applies to them
  useEffect(() => {
    if (reservationTab === 'repuestos') setView('table');
  }, [reservationTab]);

  // Search/filter
  const [resSearch, setResSearch] = useState('');
  const [resStatusFilter, setResStatusFilter] = useState('todos');
  const [resServiceFilter, setResServiceFilter] = useState('todos');
  const [resFechaDesde, setResFechaDesde] = useState('');
  const [resFechaHasta, setResFechaHasta] = useState('');

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [vehicleHistory, setVehicleHistory] = useState<HistoryRecord[]>([]);
  // Encuestas de postventa del historial abierto, en una sola consulta para toda la lista.
  const { surveys: historySurveys } = useServiceSurveys(vehicleHistory.map(h => h.id));
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit incidencia
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [deletingResId, setDeletingResId] = useState<string | null>(null);
  const [deletingResIsInc, setDeletingResIsInc] = useState(false);

  // Inline Km edit per row
  const [editingKmRowId, setEditingKmRowId] = useState<string | null>(null);
  const [editingKmValue, setEditingKmValue] = useState('');
  const [savingKm, setSavingKm] = useState(false);

  // Complete dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completingRes, setCompletingRes] = useState<Reservation | null>(null);
  const [serviceNotes, setServiceNotes] = useState('');
  const [technicalReportUrl, setTechnicalReportUrl] = useState<string | null>(null);
  const [createTechReportUrl, setCreateTechReportUrl] = useState<string | null>(null);
  const [completeInternalNotes, setCompleteInternalNotes] = useState('');
  const [completeRecommendation, setCompleteRecommendation] = useState('');
  /** Valores que tenía la cita al abrir "Completar servicio". Ver handleComplete. */
  const [completeSnapshot, setCompleteSnapshot] = useState({ internal_notes: '', recommendation: '' });
  const [completing, setCompleting] = useState(false);

  // Create dialog (initialized from localStorage to survive page refresh)
  const [createOpen, setCreateOpenRaw] = useState<boolean>(() => getDrLS().createOpen === true);
  const [saving, setSaving] = useState(false);
  // Non-cancelled reservations for the selected dealership + date, used to compute
  // per-slot bay availability in the time picker.
  const [daySlotReservations, setDaySlotReservations] = useState<Array<CapacityReservation & { id: string }>>([]);

  // Normal reservation — unified search (name or plate)
  const [unifiedSearch, setUnifiedSearch] = useState<string>(() => getDrLS().unifiedSearch || '');
  const [plateResult, setPlateResult] = useState<PlateResult | null>(() => getDrLS().plateResult || null);
  const [plateSearched, setPlateSearched] = useState<boolean>(() => getDrLS().plateSearched === true);
  const [unifiedResults, setUnifiedResults] = useState<UnifiedResult[]>([]);
  const [unifiedDropdown, setUnifiedDropdown] = useState(false);
  const [unifiedSearching, setUnifiedSearching] = useState(false);
  const [unifiedSearched, setUnifiedSearched] = useState(false);
  const [unifiedClientId, setUnifiedClientId] = useState('');
  const [unifiedClientName, setUnifiedClientName] = useState('');
  const [unifiedClientVehicles, setUnifiedClientVehicles] = useState<VehicleResult[]>([]);
  const [unifiedClientVehicleId, setUnifiedClientVehicleId] = useState('');
  const [loadingUnifiedVehicle, setLoadingUnifiedVehicle] = useState(false);
  const unifiedRef = useRef<HTMLDivElement>(null);

  // Normal reservation — common fields
  const [fDate, setFDate] = useState<string>(() => getDrLS().fDate || '');
  const [fTime, setFTime] = useState<string>(() => getDrLS().fTime || '');
  const [fService, setFService] = useState<string>(() => getDrLS().fService || '');
  const [fMileage, setFMileage] = useState<string>(() => getDrLS().fMileage || '0');
  const [fNotes, setFNotes] = useState<string>(() => getDrLS().fNotes || '');
  const [fObs, setFObs] = useState<string>('');
  // Estado de Venezuela: '' means "inherit from the dealership" (persists as null).
  const [fState, setFState] = useState<string>(() => getDrLS().fState || '');
  const [fWalkinName, setFWalkinName] = useState<string>(() => getDrLS().fWalkinName || '');
  const [fWalkinPhone, setFWalkinPhone] = useState<string>(() => getDrLS().fWalkinPhone || '');
  const [fWalkinPlate, setFWalkinPlate] = useState<string>(() => getDrLS().fWalkinPlate || '');
  // Manual entry (creates real client + vehicle): extra fields + explicit toggle.
  const [manualMode, setManualMode] = useState<boolean>(() => getDrLS().manualMode === true);
  // Editing a LEGACY walk-in row (only walkin_* text, no FK client/vehicle). Distinct
  // from manual entry: editing keeps it as free-text walk-in (updates walkin_* columns),
  // never creating entities, so repeated edits don't duplicate data.
  const [editingLegacyWalkin, setEditingLegacyWalkin] = useState(false);
  const [fWalkinCedula, setFWalkinCedula] = useState<string>(() => getDrLS().fWalkinCedula || '');
  const [fWalkinModelId, setFWalkinModelId] = useState<string>(() => getDrLS().fWalkinModelId || '');
  // "Otro / escribir manualmente": the vehicle is not in the commercial catalog
  // (e.g. a third-party car that only came in for a one-off service). Reveals
  // Marca/Modelo text inputs instead of the catalog Select.
  const [fWalkinUseManualModel, setFWalkinUseManualModel] = useState<boolean>(() => getDrLS().fWalkinUseManualModel === true);
  const [fWalkinManualBrand, setFWalkinManualBrand] = useState<string>(() => getDrLS().fWalkinManualBrand || '');
  const [fWalkinManualModelName, setFWalkinManualModelName] = useState<string>(() => getDrLS().fWalkinManualModelName || '');
  const [fWalkinYear, setFWalkinYear] = useState<string>(() => getDrLS().fWalkinYear || '');
  // Convenio del cliente externo + las etiquetas ya usadas. Ver 20260811130000_external_source.sql.
  const [fWalkinExternalSource, setFWalkinExternalSource] = useState<string>(() => getDrLS().fWalkinExternalSource || '');
  const [externalSources, setExternalSources] = useState<string[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModelOption[]>([]);
  // True while prefilling an edit, to suppress implicit single-vehicle auto-select.
  const prefillingEditRef = useRef(false);
  // Caches the full client-vehicle rows returned by staff_lookup_client_vehicles
  // so selecting one builds plateResult without a direct (RLS-blocked) SELECT.
  const clientVehiclesRawRef = useRef<any[]>([]);

  // Incidencia form fields (client/vehicle now come from the shared unified search)
  const [fIncMediaUrls, setFIncMediaUrls] = useState<string | null>(null);

  const hoy = new Date().toISOString().split('T')[0];
  const isIncidencia = INCIDENCIA_TYPES.has(fService);
  const isRepuestos = isPartsRequest(fService);

  const isVendedor = role?.name?.toLowerCase() === 'vendedor';

  // Single source of truth for "manual entry that CREATES real entities": either the
  // explicit toggle is on, OR (only while creating) a search returned no results so no
  // vehicle/client was picked. The SAME flag drives BOTH the visibility of the manual
  // fields AND the save branch that creates real client/vehicle entities — so the UI
  // promise always matches persistence (C4). The legacy-walk-in edit path is mutually
  // exclusive with this (it never sets manualMode) and persists walkin_* text instead.
  const manualActiveForCreate =
    !editingLegacyWalkin &&
    (manualMode || (!editingRes && unifiedSearched && unifiedResults.length === 0 && !plateResult && !unifiedClientId));

  const fetchReservations = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('*, kommo_lead_id, clients(full_name, cedula, phone, is_manual, external_source), vehicles(plate, year, vehicle_models(name, brand)), dealerships(name, state)')
      .order('created_at', { ascending: false })
      .limit(view === 'matrix' ? 1000 : 300);
    // "__all" → no dealership filter, traer de todos
    if (selectedDealership !== '__all') {
      query = query.eq('dealership_id', selectedDealership);
    }
    // Vendedor sees ONLY their own reservations/incidencias
    if (isVendedor && profile?.id) {
      query = query.eq('created_by_profile_id', profile.id);
    }
    // Matrix mode: fetch only the displayed month
    if (view === 'matrix') {
      const [y, m] = calendarMonth.split('-').map(Number);
      const firstDay = `${calendarMonth}-01`;
      const lastDayDate = new Date(y, m, 0);
      const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      query = query.gte('reservation_date', firstDay).lte('reservation_date', lastDay);
    }
    const { data } = await query;
    setReservations((data || []) as Reservation[]);
    setLoading(false);
  };

  useEffect(() => {
    if (loadingAccess) return;
    if (selectedDealership) { fetchReservations(); }
    else { setLoading(false); }
  }, [selectedDealership, loadingAccess, view, calendarMonth]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('service_types')
        .select('id, name, duration_minutes, requires_description')
        .eq('is_active', true)
        .order('name');
      if (data) setServiceTypes(data as unknown as ServiceType[]);
    })();
  }, []);

  // Convenios ya usados, para sugerirlos al cargar un cliente de un solo uso.
  useEffect(() => {
    (async () => {
      setExternalSources((await listExternalSources()).map(s => s.source));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      // `is_manual` is not in the generated types.ts yet (new column, no regen) —
      // cast to `any` for this call, matching this project's established
      // convention for un-typed columns (see SatisfactionOverview.tsx:13-14).
      // Manual models are excluded from this catalog picker: they're only
      // reachable via the "Otro / escribir manualmente" typed path.
      const { data } = await (supabase as any)
        .from('vehicle_models')
        .select('id, name, brand')
        .eq('is_active', true)
        .eq('is_manual', false)
        .order('brand')
        .order('name');
      if (data) setVehicleModels(data as VehicleModelOption[]);
    })();
  }, []);

  // Normal form: client name autocomplete
  // Normal reservation — unified debounced search: plate + name
  useEffect(() => {
    // Manual mode owns the client/vehicle inputs: never let the debounced search
    // run (it would clear results and re-hide the manual section while editing).
    if (manualMode) {
      setUnifiedResults([]);
      setUnifiedDropdown(false);
      return;
    }
    if (!unifiedSearch.trim() || plateResult || unifiedClientId) {
      setUnifiedResults([]);
      setUnifiedDropdown(false);
      return;
    }
    setUnifiedSearched(false);
    const q = unifiedSearch.trim();
    const timer = setTimeout(async () => {
      setUnifiedSearching(true);
      const [vehicleRes, clientRes] = await Promise.all([
        // RLS: el staff ya no puede hacer SELECT directo de vehículos por placa;
        // se usa la RPC staff_lookup_vehicle_by_plate (gateada a rol staff). Devuelve array → [0].
        supabase.rpc('staff_lookup_vehicle_by_plate', { p_plate: q }),
        // RLS: el SELECT directo de clients solo devuelve clientes con reserva en
        // el concesionario (oculta ~83% de la base, sobre todo flotas). La RPC
        // staff_search_clients (gateada a rol staff) busca en toda la base.
        //
        // Antes era staff_search_clients_by_name, que miraba SOLO full_name: buscar por
        // cedula o telefono no devolvia nada aunque el cliente existiera, y de ahi salia
        // el "el cliente esta en nuestra base pero no se puede vincular". Ver
        // 20260806120000_staff_client_search_cedula_phone.sql.
        supabase.rpc('staff_search_clients', { p_query: q }),
      ]);
      const results: UnifiedResult[] = [];
      const vehicleRow = ((vehicleRes.data || []) as any[])[0];
      if (vehicleRow) {
        const pr: PlateResult = {
          id: vehicleRow.vehicle_id,
          plate: vehicleRow.plate,
          year: vehicleRow.year,
          color: vehicleRow.color ?? null,
          client_id: vehicleRow.client_id,
          vehicle_models: vehicleRow.model_name
            ? { name: vehicleRow.model_name, brand: vehicleRow.model_brand }
            : null,
          clients: {
            id: vehicleRow.client_id,
            full_name: vehicleRow.client_full_name,
            phone: vehicleRow.client_phone ?? null,
            cedula: vehicleRow.client_cedula ?? null,
          },
        };
        results.push({ kind: 'vehicle', data: pr });
      }
      (clientRes.data || []).forEach((c: { client_id: string; full_name: string; cedula: string | null; phone: string | null; is_manual: boolean }) =>
        results.push({
          kind: 'client',
          id: c.client_id,
          full_name: c.full_name,
          cedula: c.cedula ?? null,
          phone: c.phone ?? null,
          is_manual: !!c.is_manual,
        }));
      setUnifiedResults(results);
      setUnifiedDropdown(results.length > 0);
      setUnifiedSearched(true);
      setUnifiedSearching(false);
      // On create, when nothing matches, the typed term is the walk-in plate.
      if (results.length === 0 && !editingRes) setFWalkinPlate(q.toUpperCase());
    }, 300);
    return () => clearTimeout(timer);
  }, [unifiedSearch, plateResult, unifiedClientId, manualMode]);

  // Normal reservation — fetch vehicles after client selected by name
  useEffect(() => {
    if (!unifiedClientId) { setUnifiedClientVehicles([]); setUnifiedClientVehicleId(''); clientVehiclesRawRef.current = []; return; }
    (async () => {
      // RLS: el SELECT directo de vehicles solo devuelve los que ya tienen reserva
      // en el concesionario, así que una flota se veía recortada y el sistema
      // autoseleccionaba el único visible. La RPC staff_lookup_client_vehicles trae
      // TODA la flota del cliente (gateada a rol staff).
      const { data } = await supabase.rpc('staff_lookup_client_vehicles', { p_client_id: unifiedClientId });
      const rows = (data || []) as Array<{ vehicle_id: string; plate: string | null; year: number; model_name: string | null; model_brand: string | null }>;
      clientVehiclesRawRef.current = rows;
      const fetched: VehicleResult[] = rows.map(r => ({
        id: r.vehicle_id,
        plate: r.plate,
        year: r.year,
        vehicle_models: r.model_name ? { name: r.model_name, brand: r.model_brand as string } : null,
      }));
      setUnifiedClientVehicles(fetched);
      // When prefilling an edit of a reservation that had no vehicle, never attach one implicitly.
      if (prefillingEditRef.current) { prefillingEditRef.current = false; return; }
      const autoMatch = resolveAutoVehicle(
        (fetched as Array<{ id: string; plate?: string | null }>),
        null,
      );
      if (autoMatch) handleUnifiedClientVehicleSelect(autoMatch.id);
    })();
  }, [unifiedClientId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (unifiedRef.current && !unifiedRef.current.contains(e.target as Node)) setUnifiedDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load the day's non-cancelled reservations so the time picker can flag full slots.
  useEffect(() => {
    if (!createOpen || !selectedDealership || selectedDealership === '__all' || !fDate) {
      setDaySlotReservations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('reservations')
        .select('id, reservation_time, service_type')
        .eq('dealership_id', selectedDealership)
        .eq('reservation_date', fDate)
        .neq('status', 'cancelada');
      if (!cancelled) setDaySlotReservations((data || []) as Array<CapacityReservation & { id: string }>);
    })();
    return () => { cancelled = true; };
  }, [createOpen, selectedDealership, fDate]);

  const getSlotDuration = (name: string) => serviceTypes.find(s => s.name === name)?.duration_minutes ?? 60;

  // Bay occupancy for a candidate slot in the create/edit dialog. Excludes the
  // reservation being edited so it never conflicts with its own current slot.
  const getSlotOccupancy = (slot: string) => {
    const existing = editingRes ? daySlotReservations.filter(r => r.id !== editingRes.id) : daySlotReservations;
    return computeSlotOccupancy({
      existingReservations: existing,
      startTime: slot,
      durationMinutes: getSlotDuration(fService),
      bays: dealerships.find(d => d.id === selectedDealership)?.bays,
      resolveDuration: getSlotDuration,
    });
  };

  const setCreateOpen = (open: boolean) => {
    setCreateOpenRaw(open);
    if (!open) { try { localStorage.removeItem(DR_LS_KEY); } catch {} setEditingRes(null); }
  };

  // Solo persistir en localStorage cuando es modo CREACIÓN (no edición de incidencia).
  // En edición, editingRes vive solo en memoria React; si el usuario navega sin guardar,
  // el diálogo NO se reabre para evitar crear duplicados al volver y hacer clic en Guardar.
  useEffect(() => {
    if (!createOpen || editingRes) {
      try { localStorage.removeItem(DR_LS_KEY); } catch {}
      return;
    }
    try {
      localStorage.setItem(DR_LS_KEY, JSON.stringify({ createOpen: true, unifiedSearch, plateResult, plateSearched, fDate, fTime, fService, fMileage, fNotes, fState, fWalkinName, fWalkinPhone, fWalkinPlate, manualMode, fWalkinCedula, fWalkinModelId, fWalkinUseManualModel, fWalkinManualBrand, fWalkinManualModelName, fWalkinYear, fWalkinExternalSource }));
    } catch {}
  }, [createOpen, editingRes, unifiedSearch, plateResult, plateSearched, fDate, fTime, fService, fMileage, fNotes, fState, fWalkinName, fWalkinPhone, fWalkinPlate, manualMode, fWalkinCedula, fWalkinModelId, fWalkinUseManualModel, fWalkinManualBrand, fWalkinManualModelName, fWalkinYear, fWalkinExternalSource]);

  const ARCHIVED_STATUSES = ARCHIVED_RESERVATION_STATUSES;
  const filteredReservations = reservations.filter(r => {
    // Split into "Citas" vs "Solicitudes de Repuestos" tabs
    if (reservationTab === 'repuestos') {
      if (!isPartsRequest(r.service_type)) return false;
    } else if (isPartsRequest(r.service_type)) return false;
    // Hide archived (completada/cancelada/culminado) unless explicitly filtered
    if (resStatusFilter === 'todos' && ARCHIVED_STATUSES.has(r.status)) return false;
    if (resStatusFilter !== 'todos' && r.status !== resStatusFilter) return false;
    if (resServiceFilter !== 'todos' && r.service_type !== resServiceFilter) return false;
    if (resFechaDesde && r.reservation_date < resFechaDesde) return false;
    if (resFechaHasta && r.reservation_date > resFechaHasta) return false;
    if (resSearch.trim()) {
      const q = resSearch.toLowerCase();
      const client = (r.clients?.full_name || r.walkin_client_name || '').toLowerCase();
      const plate = (r.vehicles?.plate || r.walkin_plate || '').toLowerCase();
      if (!client.includes(q) && !plate.includes(q) && !r.reservation_date.includes(q)) return false;
    }
    return true;
  });

  // When vehicle is chosen in client-name path, populate plateResult for save logic
  const handleUnifiedClientVehicleSelect = (vehicleId: string) => {
    setLoadingUnifiedVehicle(true);
    setUnifiedClientVehicleId(vehicleId);
    // The full client-vehicle rows were already fetched via staff_lookup_client_vehicles
    // and cached, so build plateResult from the cached row instead of a direct SELECT
    // (which RLS would block for vehicles without a reservation at this dealership).
    const row = clientVehiclesRawRef.current.find(r => r.vehicle_id === vehicleId);
    if (row) {
      setPlateResult({
        id: row.vehicle_id,
        plate: row.plate,
        year: row.year,
        color: row.color ?? null,
        client_id: row.client_id,
        vehicle_models: row.model_name ? { name: row.model_name, brand: row.model_brand } : null,
        clients: {
          id: row.client_id,
          full_name: row.client_full_name,
          phone: row.client_phone ?? null,
          cedula: row.client_cedula ?? null,
        },
      });
      setPlateSearched(true);
    }
    setLoadingUnifiedVehicle(false);
  };

  const clearUnifiedSearch = () => {
    setUnifiedSearch(''); setUnifiedResults([]); setUnifiedDropdown(false);
    setUnifiedSearched(false); setUnifiedClientId(''); setUnifiedClientName('');
    setUnifiedClientVehicles([]); setUnifiedClientVehicleId('');
    setPlateResult(null); setPlateSearched(false);
  };

  const resetIncidenciaFields = () => {
    setFIncMediaUrls(null);
  };

  const resetNormalFields = () => {
    setUnifiedSearch(''); setUnifiedResults([]); setUnifiedDropdown(false);
    setUnifiedSearched(false); setUnifiedSearching(false);
    setUnifiedClientId(''); setUnifiedClientName('');
    setUnifiedClientVehicles([]); setUnifiedClientVehicleId('');
    setLoadingUnifiedVehicle(false);
    setPlateResult(null); setPlateSearched(false);
    setFWalkinName(''); setFWalkinPhone(''); setFWalkinPlate('');
    setManualMode(false); setEditingLegacyWalkin(false);
    setFWalkinCedula(''); setFWalkinModelId(''); setFWalkinYear('');
    setFWalkinUseManualModel(false); setFWalkinManualBrand(''); setFWalkinManualModelName('');
    setFWalkinExternalSource('');
    prefillingEditRef.current = false;
  };

  // Switch to manual entry: clear any prior client/vehicle selection so the
  // manual fields are the single source of truth and stay visible.
  const enableManualEntry = () => {
    setUnifiedSearch(''); setUnifiedResults([]); setUnifiedDropdown(false);
    setUnifiedClientId(''); setUnifiedClientName('');
    setUnifiedClientVehicles([]); setUnifiedClientVehicleId('');
    setPlateResult(null); setPlateSearched(false);
    setManualMode(true); setUnifiedSearched(true);
  };

  const disableManualEntry = () => {
    setManualMode(false);
    setFWalkinName(''); setFWalkinPhone(''); setFWalkinPlate('');
    setFWalkinCedula(''); setFWalkinModelId(''); setFWalkinYear('');
    setFWalkinUseManualModel(false); setFWalkinManualBrand(''); setFWalkinManualModelName('');
    setFWalkinExternalSource('');
    setUnifiedSearched(false);
  };

  const openCreate = () => {
    // En modo "Todos los concesionarios", elegir el primero para poder crear
    if (selectedDealership === '__all' && dealerships.length > 0) {
      setSelectedDealership(dealerships[0].id);
      toast.info(`Creando en ${dealerships[0].name}. Puede cambiar el concesionario después.`);
    }
    resetNormalFields();
    resetIncidenciaFields();
    setFDate(hoy); setFTime('09:00'); setFService(''); setFMileage('0'); setFNotes(''); setFObs('');
    // Fresh create: service type resets to '' above, so the effective dealership is
    // always the page-level selection (never the plant) at this point.
    setFState(dealerships.find(d => d.id === selectedDealership)?.state || '');
    setCreateTechReportUrl(null);
    setCreateOpen(true);
  };

  // In manual mode, create (or reuse) the real client + vehicle and return a
  // vehicle selection for resolveReservationAssignment. Returns null on error
  // (a toast is already shown) so the caller can abort the save.
  const resolveManualVehicle = async (): Promise<{ id: string; client_id: string } | null> => {
    if (!fWalkinName.trim()) { toast.error('El nombre del cliente es requerido'); return null; }
    if (fWalkinUseManualModel) {
      if (!fWalkinManualBrand.trim() || !fWalkinManualModelName.trim()) {
        toast.error('Indique la marca y el modelo del vehículo'); return null;
      }
    } else if (!fWalkinModelId) {
      toast.error('Seleccione el modelo del vehículo'); return null;
    }
    try {
      const { vehicle } = await createOrReuseManualEntities(supabase, {
        clientName: fWalkinName,
        clientCedula: fWalkinCedula,
        clientPhone: fWalkinPhone,
        modelId: fWalkinModelId,
        manualModel: fWalkinUseManualModel
          ? { brand: fWalkinManualBrand, modelName: fWalkinManualModelName }
          : null,
        plate: fWalkinPlate,
        year: fWalkinYear,
        externalSource: fWalkinExternalSource,
      });
      return vehicle;
    } catch (err) {
      console.error(err);
      toast.error('Error al registrar el cliente o vehículo manual');
      return null;
    }
  };

  const handleSave = async () => {
    // Defense-in-depth: even though full slots are disabled in the picker, a stale
    // selection (localStorage restore or a service change) could still be full.
    if (fDate && fTime && selectedDealership && selectedDealership !== '__all' && !isRepuestos) {
      const occ = getSlotOccupancy(fTime);
      if (occ.full) {
        toast.error(`Sin disponibilidad: las ${occ.capacity} bahía(s) están ocupadas en ese horario. Elegí otra hora.`);
        return;
      }
    }
    if (isIncidencia) {
      if (!fDate) { toast.error('La fecha es requerida'); return; }
      if (!fNotes.trim()) { toast.error('La descripción de la falla es requerida'); return; }
      setSaving(true);
      let incVehicle = plateResult ? { id: plateResult.id, client_id: plateResult.client_id } : null;
      // Manual NEW entry (create): build real client + vehicle. Editing a legacy
      // walk-in falls through to resolveReservationAssignment's walk-in text branch.
      if (manualActiveForCreate) {
        const manual = await resolveManualVehicle();
        if (!manual) { setSaving(false); return; }
        incVehicle = manual;
      }
      const incAssign = resolveReservationAssignment({
        vehicle: incVehicle,
        clientId: manualActiveForCreate ? null : (unifiedClientId || null),
        walkinName: fWalkinName, walkinPhone: fWalkinPhone, walkinPlate: fWalkinPlate,
      });
      // Vehicle is mandatory: no incidencia without a real vehicle or a walk-in plate.
      if (!incAssign.vehicle_id && !incAssign.walkin_plate) {
        toast.error('La incidencia debe tener un vehículo. Elegí la placa/vehículo del cliente o cargalo manualmente.');
        setSaving(false);
        return;
      }
      const incPayload: Record<string, unknown> = {
        dealership_id: selectedDealership,
        ...incAssign,
        reservation_date: fDate,
        reservation_time: fTime || '08:00',
        service_type: fService,
        notes: fNotes.trim(),
        current_mileage: parseInt(fMileage) || 0,
        state: fState || null,
        technical_report_url: fIncMediaUrls || null,
      };
      if (editingRes) {
        const { error } = await supabase.from('reservations').update(incPayload).eq('id', editingRes.id);
        if (error) { toast.error('Error al actualizar incidencia'); console.error(error); }
        else {
          toast.success('Incidencia actualizada'); setCreateOpen(false); setEditingRes(null); fetchReservations();
          if (editingRes.kommo_lead_id) updateKommoReservationFields(editingRes.id, editingRes.kommo_lead_id).catch(console.error);
        }
      } else {
        const creatorName = currentSalesperson?.name || profile?.full_name || null;
        const creatorRole = role?.name || null;
        incPayload.status = 'pendiente';
        incPayload.created_by_name = creatorName;
        incPayload.created_by_role = creatorRole;
        incPayload.created_by_profile_id = profile?.id || null;
        const { data: incInserted, error } = await supabase.from('reservations').insert(incPayload).select('id').single();
        if (error) { toast.error('Error al crear incidencia'); console.error(error); }
        else {
          toast.success('Incidencia creada exitosamente'); setCreateOpen(false); fetchReservations();
          if (incInserted?.id) createKommoReservation(incInserted.id).catch(console.error);
        }
      }
      setSaving(false);
      return;
    }

    if (!fDate || !fService || (!isRepuestos && !fTime)) { toast.error('Fecha, hora y servicio son requeridos'); return; }

    if (!plateResult && !unifiedClientId && !manualActiveForCreate && !editingLegacyWalkin && !fWalkinName.trim()) { toast.error('Busque y seleccione un cliente'); return; }

    setSaving(true);

    // Manual NEW entry (create): create/reuse real client + vehicle so the reservation
    // gets FKs. The visibility flag (manualActiveForCreate) is the SAME condition that
    // shows the manual fields, so the UI promise and persistence always agree (C4).
    // Editing a legacy walk-in falls through to the walk-in text branch below.
    let resolvedVehicle = plateResult ? { id: plateResult.id, client_id: plateResult.client_id } : null;
    if (manualActiveForCreate) {
      const manual = await resolveManualVehicle();
      if (!manual) { setSaving(false); return; }
      resolvedVehicle = manual;
    }

    // Resolved client/vehicle assignment, shared by create and edit. When real FKs are
    // resolved (vehicle set), resolveReservationAssignment nulls walkin_* so no stale
    // text is left behind; the legacy-walk-in edit path keeps the walkin_* text.
    const assign = resolveReservationAssignment({
      vehicle: resolvedVehicle,
      clientId: manualActiveForCreate ? null : (unifiedClientId || null),
      walkinName: fWalkinName, walkinPhone: fWalkinPhone, walkinPlate: fWalkinPlate,
    });

    // Vehicle is mandatory: block the client-only path that used to save vehicle_id = null
    // (and reached Kommo with no vehicle). A real FK or a walk-in plate must be present.
    if (!assign.vehicle_id && !assign.walkin_plate) {
      toast.error('La reserva debe tener un vehículo. Elegí la placa/vehículo del cliente o cargalo manualmente.');
      setSaving(false);
      return;
    }

    if (editingRes) {
      const updatePayload: Record<string, unknown> = {
        dealership_id: isRepuestos ? PLANT_DEALERSHIP_ID : selectedDealership,
        reservation_date: fDate, reservation_time: isRepuestos ? '00:00:00' : fTime, service_type: fService,
        current_mileage: parseInt(fMileage) || 0,
        notes: fNotes.trim() || null,
        internal_notes: fObs.trim() || null,
        state: fState || null,
        technical_report_url: createTechReportUrl || null,
        ...assign,
      };
      // Los dos campos de texto libre no viajan si no cambiaron. `editingRes` sale de la lista
      // en pantalla, que puede tener horas: sin esto, abrir Editar para corregir la hora y
      // guardar revierte la nota que otro escribió mientras tanto, sin haberla tocado.
      const sinCambios = (valor: string, original: string | null) => valor.trim() === (original || '').trim();
      if (sinCambios(fNotes, editingRes.notes)) delete updatePayload.notes;
      if (sinCambios(fObs, editingRes.internal_notes)) delete updatePayload.internal_notes;

      const { error } = await supabase.from('reservations').update(updatePayload).eq('id', editingRes.id);
      if (error) { toast.error('Error al actualizar reserva'); console.error(error); }
      else {
        toast.success('Reserva actualizada'); setCreateOpen(false); setEditingRes(null); fetchReservations();
        if (editingRes.kommo_lead_id) updateKommoReservationFields(editingRes.id, editingRes.kommo_lead_id).catch(console.error);
      }
      setSaving(false);
      return;
    }

    const creatorName = currentSalesperson?.name || profile?.full_name || null;
    const creatorRole = role?.name || null;
    const payload: any = {
      dealership_id: isRepuestos ? PLANT_DEALERSHIP_ID : selectedDealership,
      reservation_date: fDate, reservation_time: isRepuestos ? '00:00:00' : fTime, service_type: fService,
      current_mileage: parseInt(fMileage) || 0,
      notes: fNotes.trim() || null,
      internal_notes: fObs.trim() || null,
      state: fState || null,
      status: 'pendiente',
      technical_report_url: createTechReportUrl || null,
      created_by_name: creatorName,
      created_by_role: creatorRole,
      created_by_profile_id: profile?.id || null,
      ...assign,
    };

    const { data: resInserted, error } = await supabase.from('reservations').insert(payload).select('id').single();
    if (error) { toast.error('Error al crear reserva'); console.error(error); }
    else {
      toast.success('Reserva creada exitosamente'); setCreateOpen(false); fetchReservations();
      if (resInserted?.id) createKommoReservation(resInserted.id).catch(console.error);
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else {
      toast.success('Estado actualizado'); fetchReservations();
      const res = reservations.find(r => r.id === id);
      if (res?.kommo_lead_id) updateKommoReservationStage(id, res.kommo_lead_id, newStatus).catch(console.error);
      else if (res?.id) createKommoReservation(res.id).catch(console.error);
    }
  };

  const startKmEdit = (r: Reservation) => {
    setEditingKmRowId(r.id);
    setEditingKmValue(String(r.current_mileage || 0));
  };

  const cancelKmEdit = () => {
    setEditingKmRowId(null);
    setEditingKmValue('');
  };

  const saveKmEdit = async (rowId: string) => {
    const km = parseInt(editingKmValue) || 0;
    setSavingKm(true);
    const { error } = await supabase.from('reservations').update({ current_mileage: km }).eq('id', rowId);
    if (error) { toast.error('Error al actualizar Km'); console.error(error); }
    else {
      toast.success('Km actualizado');
      setReservations(prev => prev.map(x => x.id === rowId ? { ...x, current_mileage: km } : x));
      if (detailRes?.id === rowId) setDetailRes({ ...detailRes, current_mileage: km });
      cancelKmEdit();
    }
    setSavingKm(false);
  };

  const openDetail = async (r: Reservation) => {
    setDetailRes(r); setVehicleDetail(null); setVehicleHistory([]); setDetailOpen(true);
    if (r.vehicle_id) {
      setLoadingDetail(true);
      const { data: veh } = await supabase
        .from('vehicles')
        .select('id, plate, year, color, vin, mileage, warranty_active, vehicle_models(name, brand), clients(full_name, cedula, phone)')
        .eq('id', r.vehicle_id).single();
      if (veh) setVehicleDetail(veh as unknown as VehicleDetail);
      const { data: history } = await supabase
        .from('reservations')
        .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, internal_notes, service_notes, technical_report_url, completed_at, dealerships(name)')
        .eq('vehicle_id', r.vehicle_id).neq('id', r.id)
        .order('reservation_date', { ascending: false }).order('reservation_time', { ascending: false }).limit(50);
      setVehicleHistory((history || []) as unknown as HistoryRecord[]);
      setLoadingDetail(false);
    }
  };

  const openEditIncidencia = async (r: Reservation) => {
    // Limpiar cualquier estado de creación guardado para evitar confusión
    try { localStorage.removeItem(DR_LS_KEY); } catch {}
    resetNormalFields();
    resetIncidenciaFields();
    setEditingRes(r);
    setFService(r.service_type);
    setFDate(r.reservation_date);
    setFTime(r.reservation_time?.slice(0, 5) || '09:00');
    setFMileage(String(r.current_mileage || 0));
    setFNotes(r.notes || '');
    setFObs(r.internal_notes || '');
    setFState(r.state || '');
    setFIncMediaUrls(r.technical_report_url || null);
    setDetailOpen(false);
    setCreateOpen(true);
    // Prefill the unified client/vehicle search the same way as a normal reservation edit.
    if (r.vehicle_id) {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, color, client_id, vehicle_models(name, brand), clients(id, full_name, phone, cedula)')
        .eq('id', r.vehicle_id)
        .single();
      if (data) { setPlateResult(data as any); setPlateSearched(true); setUnifiedSearch((data as any).plate || ''); }
    } else if (r.client_id) {
      prefillingEditRef.current = true;
      setUnifiedClientId(r.client_id);
      setUnifiedClientName(r.clients?.full_name || '');
      setUnifiedSearch(r.clients?.full_name || '');
    } else if (r.walkin_client_name) {
      // Legacy walk-in: edit free text in place, do NOT create entities on save.
      setEditingLegacyWalkin(true);
      setFWalkinName(r.walkin_client_name);
      setFWalkinPhone(r.walkin_client_phone || '');
      setFWalkinPlate(r.walkin_plate || '');
      setUnifiedSearched(true);
    }
  };

  const openEditReservation = async (r: Reservation) => {
    // Limpiar cualquier estado de creación guardado para evitar confusión
    try { localStorage.removeItem(DR_LS_KEY); } catch {}
    resetNormalFields();
    resetIncidenciaFields();
    setEditingRes(r);
    setFService(r.service_type);
    setFDate(r.reservation_date);
    setFTime(r.reservation_time?.slice(0, 5) || '09:00');
    setFMileage(String(r.current_mileage || 0));
    setFNotes(r.notes || '');
    setFObs(r.internal_notes || '');
    setFState(r.state || '');
    setCreateTechReportUrl(r.technical_report_url || null);
    // Open the dialog up front so it reacts instantly, even if the vehicle fetch is slow.
    setDetailOpen(false);
    setCreateOpen(true);
    if (r.vehicle_id) {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, color, client_id, vehicle_models(name, brand), clients(id, full_name, phone, cedula)')
        .eq('id', r.vehicle_id)
        .single();
      if (data) { setPlateResult(data as any); setPlateSearched(true); setUnifiedSearch((data as any).plate || ''); }
    } else if (r.client_id) {
      // Skip the single-vehicle auto-select: this reservation deliberately had no vehicle.
      prefillingEditRef.current = true;
      setUnifiedClientId(r.client_id);
      setUnifiedClientName(r.clients?.full_name || '');
      setUnifiedSearch(r.clients?.full_name || '');
    } else if (r.walkin_client_name) {
      // Walk-in legacy: keep the plate in its own field, do NOT push it into the
      // search box (that would re-trigger the search and hide the prefilled fields).
      // editingLegacyWalkin keeps the walk-in section visible AND persists back to
      // the walkin_* columns on save — it does NOT create client/vehicle entities,
      // so editing a legacy walk-in never duplicates data.
      setEditingLegacyWalkin(true);
      setFWalkinName(r.walkin_client_name);
      setFWalkinPhone(r.walkin_client_phone || '');
      setFWalkinPlate(r.walkin_plate || '');
      setUnifiedSearched(true);
    }
  };

  const deleteReservation = async (id: string) => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); }
    else { toast.success(deletingResIsInc ? 'Incidencia eliminada' : 'Reserva eliminada'); setDetailOpen(false); fetchReservations(); }
    setDeletingResId(null);
    setDeletingResIsInc(false);
  };

  const openComplete = (r: Reservation) => {
    setCompletingRes(r); setServiceNotes(r.service_notes || '');
    setTechnicalReportUrl(r.technical_report_url || null);
    setCompleteInternalNotes(r.internal_notes || '');
    setCompleteRecommendation(r.recommendation || '');
    // Snapshot de lo que había al abrir. Ver handleComplete: sirve para no reescribir campos
    // que este diálogo no tocó.
    setCompleteSnapshot({ internal_notes: r.internal_notes || '', recommendation: r.recommendation || '' });
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
    // Sólo se escriben los campos que ESTE diálogo cambió.
    //
    // `completingRes` sale de la lista cargada en pantalla, que puede tener minutos u horas.
    // Si otra persona escribió la nota interna después de ese fetch, mandarla igual la pisa
    // con el valor viejo — y como el valor viejo suele ser vacío, la nota se pierde. Ese es
    // el reporte de "las notas internas desaparecen al pasar a completada": no las borra la
    // base (verificado forzando la transición con todos los triggers y el webhook activos),
    // las borra este UPDATE con una foto vencida.
    const completePayload: Record<string, unknown> = {
      status: 'completada', service_notes: serviceNotes.trim(),
      technical_report_url: technicalReportUrl || null, completed_at: new Date().toISOString(),
    };
    if (completeInternalNotes.trim() !== completeSnapshot.internal_notes.trim()) {
      completePayload.internal_notes = completeInternalNotes.trim() || null;
    }
    // `recommendation` isn't in generated Supabase types yet (see migration 20260721140000).
    if (completeRecommendation.trim() !== completeSnapshot.recommendation.trim()) {
      completePayload.recommendation = completeRecommendation.trim() || null;
    }

    const { data: updated, error } = await supabase.from('reservations').update(
      completePayload as any,
    ).eq('id', completingRes.id).select('id');
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

  const calendarStatusColors: Record<string, string> = Object.fromEntries(
    Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.color]),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Reservas / Servicios</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <CalendarDays className="w-3 h-3" /> {reservations.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {showSelector && (
            <Select value={selectedDealership} onValueChange={setSelectedDealership}>
              <SelectTrigger className="w-[210px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los concesionarios</SelectItem>
                <SelectSeparator />
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center border rounded-md overflow-hidden">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 rounded-none px-2.5 border-0"
              onClick={() => setView('table')}
              title="Vista lista"
            >
              <List className="w-3.5 h-3.5" />
            </Button>
            {reservationTab === 'citas' && (
              <>
                <div className="w-px h-5 bg-border" />
                <Button
                  variant={view === 'matrix' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-none px-2.5 border-0"
                  onClick={() => setView('matrix')}
                  title="Vista calendario mensual"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
          {canCreate && (
            <Button size="sm" onClick={openCreate} className="gac-gradient">
              <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Reserva
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center border rounded-md overflow-hidden w-fit">
        <Button
          variant={reservationTab === 'citas' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 rounded-none px-3 border-0 text-xs"
          onClick={() => setReservationTab('citas')}
        >
          Citas
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button
          variant={reservationTab === 'repuestos' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 rounded-none px-3 border-0 text-xs gap-1.5"
          onClick={() => setReservationTab('repuestos')}
        >
          Solicitudes de Repuestos
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {reservations.filter(r => isPartsRequest(r.service_type)).length}
          </Badge>
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar cliente, placa..." className="pl-8 h-8 text-xs" value={resSearch} onChange={e => setResSearch(e.target.value)} />
          </div>
          <Select value={resStatusFilter} onValueChange={setResStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs shrink-0"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resServiceFilter} onValueChange={setResServiceFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs shrink-0"><SelectValue placeholder="Servicio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los servicios</SelectItem>
              {serviceTypes.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground shrink-0">Desde</span>
            <Input type="date" value={resFechaDesde} onChange={e => setResFechaDesde(e.target.value)} className="h-8 text-xs w-[140px]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground shrink-0">Hasta</span>
            <Input type="date" value={resFechaHasta} onChange={e => setResFechaHasta(e.target.value)} className="h-8 text-xs w-[140px]" />
          </div>
          {(resFechaDesde || resFechaHasta || resStatusFilter !== 'todos' || resServiceFilter !== 'todos') && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setResFechaDesde(''); setResFechaHasta(''); setResStatusFilter('todos'); setResServiceFilter('todos'); setResSearch(''); }}>
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {view === 'matrix' ? (
        <div className="border rounded-lg p-3 bg-card gac-shadow">
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando reservas...</p>
            </div>
          ) : (
            <MonthlyReservationsCalendar
              reservations={reservations}
              month={calendarMonth}
              onMonthChange={m => setCalendarMonth(m)}
              onReservationClick={r => openDetail(r as Reservation)}
              statusColors={calendarStatusColors}
            />
          )}
        </div>
      ) : (
      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando reservas...</p>
          </CardContent>
        ) : filteredReservations.length === 0 ? (
          <CardContent className="p-8 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay reservas</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
          <Table className="text-xs min-w-[700px]">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Fecha / Hora</TableHead>
                <TableHead>Estado Vzla</TableHead>
                {selectedDealership === '__all' && <TableHead>Concesionario</TableHead>}
                <TableHead>Cliente</TableHead>
                <TableHead>Vehículo / Placa</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead>Km</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map(r => {
                const clientName = r.clients?.full_name || r.walkin_client_name || '-';
                const vehicleInfo = r.vehicles
                  ? `${r.vehicles.vehicle_models?.brand || ''} ${r.vehicles.vehicle_models?.name || ''} ${r.vehicles.year}`
                  : r.walkin_plate || '-';
                const plate = r.vehicles?.plate || r.walkin_plate || '-';
                const isInc = INCIDENCIA_TYPES.has(r.service_type);
                const st = reservationStatusStyle(r.status);
                return (
                  <TableRow key={r.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                    <TableCell className="font-medium">
                      {r.reservation_date}
                      <br />
                      <span className="text-[10px] text-muted-foreground">{r.reservation_time?.slice(0, 5) || '—'}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {r.dealerships?.state || dealerships.find(d => d.id === r.dealership_id)?.state || '—'}
                    </TableCell>
                    {selectedDealership === '__all' && (
                      <TableCell className="text-muted-foreground text-[11px]">
                        {r.dealerships?.name || dealerships.find(d => d.id === r.dealership_id)?.name || '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span>{clientName}</span>
                        <ExternalClientBadge isExternal={r.clients?.is_manual} source={r.clients?.external_source} />
                      </div>
                      {!r.clients && r.walkin_client_phone && <span className="text-[10px] text-muted-foreground">{r.walkin_client_phone}</span>}
                    </TableCell>
                    <TableCell>
                      <div>{vehicleInfo}</div>
                      <span className="text-[10px] text-muted-foreground">{plate}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isInc && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span>{r.service_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.created_by_name ? (
                        <div>
                          <div>{r.created_by_name}</div>
                          {r.created_by_role && <span className="text-[10px] text-muted-foreground">{r.created_by_role}</span>}
                        </div>
                      ) : isInc ? (
                        <div>
                          <div>Cliente</div>
                          <span className="text-[10px] text-muted-foreground">Portal</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {!canEdit ? (
                        <span>{r.current_mileage > 0 ? r.current_mileage.toLocaleString() : '—'}</span>
                      ) : editingKmRowId === r.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editingKmValue}
                            onChange={e => setEditingKmValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveKmEdit(r.id); if (e.key === 'Escape') cancelKmEdit(); }}
                            className="h-6 text-[11px] w-20 px-1.5"
                            autoFocus
                          />
                          <button onClick={() => saveKmEdit(r.id)} disabled={savingKm} className="text-green-600 hover:text-green-700 text-[10px] font-semibold" title="Guardar">✓</button>
                          <button onClick={cancelKmEdit} className="text-muted-foreground hover:text-foreground text-[10px]" title="Cancelar">✕</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startKmEdit(r)}
                          className="text-left hover:bg-muted/60 rounded px-1.5 py-0.5 -mx-1.5 transition-colors inline-flex items-center gap-1 group"
                          title="Click para editar Km"
                        >
                          <span>{r.current_mileage > 0 ? r.current_mileage.toLocaleString() : '—'}</span>
                          <Pencil className="w-2.5 h-2.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canEdit ? (
                          <Select
                            value={r.status}
                            onValueChange={val => {
                              if (!isInc && val === 'completada') { openComplete(r); }
                              else { updateStatus(r.id, val); }
                            }}
                          >
                            <SelectTrigger className={cn('h-6 text-[10px] px-1.5 py-0 border-0 font-medium w-[110px]', st.color)}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(statusMap).map(([k, v]) => (
                                <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn('h-6 text-[10px] px-2 py-0 font-medium', st.color)}>{st.label}</Badge>
                        )}
                        {!isInc && r.status === 'confirmada' && (r.clients?.phone || r.walkin_client_phone) && (() => {
                          const phone = r.clients?.phone || r.walkin_client_phone || '';
                          const name = r.clients?.full_name || r.walkin_client_name || 'Cliente';
                          const dealerName = dealerships.find(d => d.id === selectedDealership)?.name;
                          const waUrl = buildWhatsAppReservationUrl({
                            phone, clientName: name, date: r.reservation_date, time: r.reservation_time, serviceType: r.service_type,
                            vehicleBrand: r.vehicles?.vehicle_models?.brand, vehicleModel: r.vehicles?.vehicle_models?.name,
                            vehicleYear: r.vehicles?.year, vehiclePlate: r.vehicles?.plate || r.walkin_plate || undefined,
                            dealershipName: dealerName, mileage: r.current_mileage, notes: r.notes || undefined,
                          });
                          return waUrl ? (
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600 hover:text-green-700 shrink-0" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp"><MessageCircle className="w-3.5 h-3.5" /></a>
                            </Button>
                          ) : null;
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        {/* Vista previa del asesor: 7 datos + hasta 5 bloques de texto + acciones. */}
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {detailRes && INCIDENCIA_TYPES.has(detailRes.service_type)
                ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Detalle de Incidencia</>
                : <><CalendarDays className="w-4 h-4" /> Detalle de Cita</>}
            </DialogTitle>
          </DialogHeader>
          {detailRes && (() => {
            const isInc = INCIDENCIA_TYPES.has(detailRes.service_type);
            const st = reservationStatusStyle(detailRes.status);
            const clientName = detailRes.clients?.full_name || detailRes.walkin_client_name || '-';
            return (
              <Tabs defaultValue="cita" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="cita" className="text-xs">{isInc ? 'Incidencia' : 'Cita'}</TabsTrigger>
                  <TabsTrigger value="vehiculo" className="text-xs">Vehículo</TabsTrigger>
                  <TabsTrigger value="historial" className="text-xs">Historial ({vehicleHistory.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="cita" className="space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <Badge className={cn("text-xs px-2 py-0.5", st.color)}>{st.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">{detailRes.created_at ? new Date(detailRes.created_at).toLocaleDateString('es-VE') : ''}</span>
                  </div>
                  {isInc && (
                    <p className="text-[11px] text-muted-foreground">Registrado por: <span className="font-medium">{detailRes.created_by_name || 'Cliente'}</span>{` · ${detailRes.created_by_role || 'Portal'}`}</p>
                  )}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap"><User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{clientName}</span>
                      <ExternalClientBadge isExternal={detailRes.clients?.is_manual} source={detailRes.clients?.external_source} />
                      {detailRes.clients?.cedula && <span className="text-muted-foreground">· {detailRes.clients.cedula}</span>}
                      {detailRes.clients?.phone && <span className="text-muted-foreground">· {detailRes.clients.phone}</span>}
                    </div>
                    {!detailRes.clients && detailRes.walkin_client_phone && <div className="flex items-center gap-2 text-muted-foreground"><span>Tel: {detailRes.walkin_client_phone}</span></div>}
                    <div className="flex items-center gap-2"><Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{detailRes.vehicles ? `${detailRes.vehicles.vehicle_models?.brand} ${detailRes.vehicles.vehicle_models?.name} ${detailRes.vehicles.year}` : detailRes.walkin_plate || '-'}</span>
                      <span className="text-muted-foreground">{detailRes.vehicles?.plate || detailRes.walkin_plate || ''}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.reservation_date}</span></div>
                    {!isInc && <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.reservation_time?.slice(0, 5)}</span></div>}
                    <div className="flex items-center gap-2"><Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.service_type}</span></div>
                    {detailRes.current_mileage > 0 && <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.current_mileage.toLocaleString()} km</span></div>}
                  </div>
                  {/* Motivo del ingreso, para cualquier tipo de servicio. Ver serviceTypes.ts. */}
                  {detailRes.notes && (
                    <div className="bg-muted/50 rounded-md p-2.5 text-xs">
                      <p className="font-semibold mb-1">{serviceNotesLabel(detailRes.service_type)}</p>
                      <p className="text-muted-foreground min-w-0 break-words whitespace-pre-wrap">{detailRes.notes}</p>
                    </div>
                  )}
                  {detailRes.recommendation && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-xs">
                      <p className="font-semibold text-green-800 mb-1 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Recomendación</p>
                      <p className="text-green-700 min-w-0 break-words whitespace-pre-wrap">{detailRes.recommendation}</p>
                    </div>
                  )}
                  {detailRes.internal_notes && (
                    <div className="bg-muted/50 rounded-md p-2.5 text-xs">
                      <p className="font-semibold mb-1">Notas Internas</p>
                      <p className="text-muted-foreground min-w-0 break-words whitespace-pre-wrap">{detailRes.internal_notes}</p>
                    </div>
                  )}
                  {detailRes.status === 'completada' && detailRes.service_notes && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-xs">
                      <p className="font-semibold text-green-800 mb-1 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Trabajo realizado</p>
                      <p className="text-green-700 min-w-0 break-words whitespace-pre-wrap">{detailRes.service_notes}</p>
                      {detailRes.completed_at && <p className="text-green-600 mt-1.5 text-[10px]">Completado: {new Date(detailRes.completed_at).toLocaleString('es-VE')}</p>}
                    </div>
                  )}
                  {detailRes.technical_report_url && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-600" /> {isInc ? 'Archivos adjuntos' : 'Informe Técnico'}</p>
                      <TechnicalReportUploader reservationId={detailRes.id} value={detailRes.technical_report_url} onChange={() => {}} readonly />
                    </div>
                  )}
                  {isInc ? (
                    <div className="flex justify-end gap-2 pt-2">
                      {canEdit && (
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEditIncidencia(detailRes)}>
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="text-xs text-destructive gap-1" onClick={() => { setDeletingResIsInc(true); setDeletingResId(detailRes.id); }}>
                          <Trash2 className="w-3 h-3" /> Eliminar
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2 pt-2">
                      {canEdit && (
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEditReservation(detailRes)}>
                          <Pencil className="w-3 h-3" /> Editar
                        </Button>
                      )}
                      {canEdit && detailRes.status === 'pendiente' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'confirmada'); }}>Confirmar</Button>}
                      {canEdit && detailRes.status === 'confirmada' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'en_proceso'); }}>Iniciar</Button>}
                      {canEdit && detailRes.status === 'en_proceso' && <Button size="sm" className="text-xs gac-gradient gap-1" onClick={() => { setDetailOpen(false); openComplete(detailRes); }}><ClipboardCheck className="w-3 h-3" /> Completar</Button>}
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="text-xs text-destructive gap-1" onClick={() => { setDeletingResIsInc(false); setDeletingResId(detailRes.id); }}>
                          <Trash2 className="w-3 h-3" /> Eliminar
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="vehiculo" className="space-y-3 mt-3">
                  {loadingDetail ? (
                    <div className="text-center py-6"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" /><p className="text-xs text-muted-foreground">Cargando...</p></div>
                  ) : vehicleDetail ? (
                    <div className="space-y-3">
                      <div className="text-center pb-2">
                        <Car className="w-10 h-10 text-primary mx-auto mb-1" />
                        <h3 className="font-display font-bold text-sm">{vehicleDetail.vehicle_models?.brand} {vehicleDetail.vehicle_models?.name}</h3>
                        <p className="text-xs text-muted-foreground">{vehicleDetail.year}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Hash className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Placa</p><p className="font-medium">{vehicleDetail.plate || '-'}</p></div></div>
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Palette className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Color</p><p className="font-medium">{vehicleDetail.color || '-'}</p></div></div>
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Kilometraje</p><p className="font-medium">{vehicleDetail.mileage.toLocaleString()} km</p></div></div>
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2"><Shield className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">Garantía</p><p className={cn("font-medium", vehicleDetail.warranty_active ? "text-green-700" : "text-red-600")}>{vehicleDetail.warranty_active ? 'Activa' : 'Vencida'}</p></div></div>
                      </div>
                      {vehicleDetail.vin && <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 text-xs"><FileText className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">VIN</p><p className="font-mono font-medium text-[11px]">{vehicleDetail.vin}</p></div></div>}
                      <Separator />
                      <div className="text-xs">
                        <p className="font-semibold mb-1">Propietario</p>
                        <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><span>{vehicleDetail.clients?.full_name || '-'}</span></div>
                        {vehicleDetail.clients?.cedula && <p className="text-muted-foreground ml-5">CI: {vehicleDetail.clients.cedula}</p>}
                        {vehicleDetail.clients?.phone && <p className="text-muted-foreground ml-5">Tel: {vehicleDetail.clients.phone}</p>}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <Car className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>No hay datos del vehículo registrado</p>
                      {detailRes.walkin_plate && <p className="mt-1">Placa walk-in: <strong>{detailRes.walkin_plate}</strong></p>}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="historial" className="space-y-3 mt-3">
                  {loadingDetail ? (
                    <div className="text-center py-6"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" /></div>
                  ) : !detailRes.vehicle_id ? (
                    <div className="text-center py-6 text-xs text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Sin historial (cliente walk-in)</p></div>
                  ) : vehicleHistory.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Sin servicios previos</p></div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{vehicleHistory.length} servicio(s) previo(s)</p>
                      {vehicleHistory.map(h => {
                        const hIsInc = INCIDENCIA_TYPES.has(h.service_type);
                        const hst = reservationStatusStyle(h.status);
                        return (
                          <div key={h.id} className="border rounded-md p-2.5 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold flex items-center gap-1">
                                {hIsInc && <AlertTriangle className="w-3 h-3 text-amber-500" />}{h.service_type}
                              </span>
                              <Badge className={cn("text-[10px] px-1.5 py-0", hst.color)}>{hst.label}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{h.reservation_date}</span>
                              {!hIsInc && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{h.reservation_time?.slice(0, 5)}</span>}
                              <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{h.current_mileage.toLocaleString()} km</span>
                            </div>
                            {h.dealerships && <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{h.dealerships.name}</div>}
                            {/* El motivo del ingreso, para cualquier tipo — antes sólo salía en incidencias. */}
                            {h.notes && <p className="text-muted-foreground bg-muted/40 rounded p-1.5"><span className="font-medium text-foreground">{serviceNotesLabel(h.service_type)}:</span> {h.notes}</p>}
                            {h.internal_notes && <p className="text-muted-foreground bg-muted/40 rounded p-1.5"><span className="font-medium text-foreground">Notas Internas:</span> {h.internal_notes}</p>}
                            {h.service_notes && (
                              <div className="bg-green-50 border border-green-200 rounded p-1.5">
                                <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo:</p>
                                <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                              </div>
                            )}
                            {h.technical_report_url && <TechnicalReportUploader reservationId={h.id} value={h.technical_report_url} onChange={() => {}} readonly />}
                            <ServiceSurveyInline survey={historySurveys.get(h.id)} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* DELETE RESERVATION/INCIDENCIA CONFIRMATION */}
      <AlertDialog open={!!deletingResId} onOpenChange={open => { if (!open) { setDeletingResId(null); setDeletingResIsInc(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deletingResIsInc ? '¿Eliminar esta incidencia?' : '¿Eliminar esta reserva?'}</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingResId && deleteReservation(deletingResId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* COMPLETE SERVICE DIALOG */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Completar Servicio</DialogTitle></DialogHeader>
          {completingRes && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-1">
                <p><span className="font-semibold">Cliente:</span> {completingRes.clients?.full_name || completingRes.walkin_client_name || '-'}</p>
                <p><span className="font-semibold">Vehículo:</span> {completingRes.vehicles ? `${completingRes.vehicles.vehicle_models?.brand} ${completingRes.vehicles.vehicle_models?.name} ${completingRes.vehicles.year}` : completingRes.walkin_plate || '-'}</p>
                <p><span className="font-semibold">Servicio:</span> {completingRes.service_type}</p>
                <p><span className="font-semibold">Km:</span> {completingRes.current_mileage.toLocaleString()}</p>
              </div>
              <div className="space-y-2"><Label>¿Qué se realizó? *</Label><Textarea value={serviceNotes} onChange={e => setServiceNotes(e.target.value)} rows={4} placeholder="Trabajos realizados, repuestos, observaciones..." /></div>
              <div className="space-y-2"><Label>Informe Técnico</Label><TechnicalReportUploader maxSizeMB={40} reservationId={completingRes.id} value={technicalReportUrl} onChange={setTechnicalReportUrl} /></div>
              <div className="space-y-2"><Label>Recomendación (opcional)</Label><Textarea value={completeRecommendation} onChange={e => setCompleteRecommendation(e.target.value)} rows={3} placeholder="Recomendaciones de seguimiento visibles para el cliente..." /></div>
              <div className="space-y-2"><Label>Notas internas (solo equipo GAC)</Label><Textarea value={completeInternalNotes} onChange={e => setCompleteInternalNotes(e.target.value)} rows={3} placeholder="Observaciones internas, no visibles para el cliente..." /></div>
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

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {isIncidencia
              ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> {editingRes ? 'Editar Incidencia' : 'Nueva Incidencia'}</>
              : (editingRes ? 'Editar Reserva' : 'Nueva Reserva')}
            </DialogTitle>
          </DialogHeader>

          {/* Concesionario — siempre visible como dropdown, salvo Solicitud de Repuestos */}
          <div className="space-y-1">
            <Label className="text-[13px] sm:text-xs font-semibold">Concesionario</Label>
            {isRepuestos ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                Concesionario encargado: <span className="font-semibold">DFSK &amp; GAC Centro de Servicio</span> (planta)
              </div>
            ) : (
              <Select
                value={selectedDealership}
                onValueChange={v => {
                  setSelectedDealership(v);
                  // Auto-fill Estado de Venezuela from the picked dealership. Only fires
                  // on this explicit user action, so it never fights a manual override.
                  setFState(dealerships.find(d => d.id === v)?.state || '');
                }}
              >
                <SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tipo de servicio — siempre visible primero */}
          <div className="space-y-1">
            <Label className="text-[13px] sm:text-xs font-semibold">Tipo de servicio *</Label>
            <Select
              value={fService}
              onValueChange={v => {
                const wasInc = INCIDENCIA_TYPES.has(fService);
                const nowInc = INCIDENCIA_TYPES.has(v);
                const wasRepuestos = isPartsRequest(fService);
                const nowRepuestos = isPartsRequest(v);
                setFService(v);
                setFNotes('');
                if (nowInc && !wasInc) { resetNormalFields(); setFDate(hoy); }
                if (!nowInc && wasInc) { resetIncidenciaFields(); setFDate(hoy); setFTime('09:00'); }
                if (wasRepuestos !== nowRepuestos) {
                  // The effective dealership changes (forced to the plant, or back to the
                  // page-level selection), so Estado de Venezuela must follow it.
                  setFState(nowRepuestos ? '' : (dealerships.find(d => d.id === selectedDealership)?.state || ''));
                }
              }}
            >
              <SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
              <SelectContent>
                {serviceTypes.map(s => (
                  <SelectItem key={s.id} value={s.name}>
                    <span className="flex items-center gap-1.5">
                      {INCIDENCIA_TYPES.has(s.name) && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                      {s.name}
                    </span>
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

          <Separator />

          {/* Buscar cliente/vehículo — unificado por nombre o placa (reserva e incidencia) */}
          {(
            <>
              {/* Buscar cliente — unificado por nombre o placa */}
              <div className="space-y-2" ref={unifiedRef}>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[13px] sm:text-xs font-semibold">{editingLegacyWalkin ? 'Cliente walk-in' : manualMode ? 'Ingreso manual' : 'Buscar cliente'}</Label>
                  {/* The toggle is hidden while editing a legacy walk-in: that row stays
                      free-text and must not be converted to real entities here. */}
                  {!editingLegacyWalkin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-primary"
                    onClick={() => manualMode ? disableManualEntry() : enableManualEntry()}
                  >
                    {manualMode ? 'Buscar cliente existente' : 'Ingresar manualmente'}
                  </Button>
                  )}
                </div>
                {!manualMode && !editingLegacyWalkin && (
                <>
                <div className="relative">
                  <div className="flex items-center gap-1">
                    <Input
                      value={unifiedSearch}
                      onChange={e => { setUnifiedSearch(e.target.value); if (plateResult || unifiedClientId) clearUnifiedSearch(); }}
                      placeholder="Buscar por nombre o placa..."
                      className="h-9 text-sm sm:h-8 sm:text-xs"
                      disabled={!!(plateResult || unifiedClientId)}
                    />
                    {(plateResult || unifiedClientId) && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={clearUnifiedSearch}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {unifiedSearching && <Search className="w-3.5 h-3.5 text-muted-foreground animate-pulse shrink-0" />}
                  </div>
                  {unifiedDropdown && unifiedResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                      {unifiedResults.map(r =>
                        r.kind === 'vehicle' ? (
                          <div
                            key={`v-${r.data.id}`}
                            className="px-3 py-2 text-xs cursor-pointer hover:bg-accent flex items-start gap-2"
                            onMouseDown={() => {
                              setPlateResult(r.data);
                              setPlateSearched(true);
                              setUnifiedSearch(r.data.plate);
                              setUnifiedDropdown(false);
                              setUnifiedResults([]);
                            }}
                          >
                            <Car className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                            <div>
                              <span className="font-medium">{r.data.plate}</span>
                              <span className="text-muted-foreground ml-1">· {r.data.vehicle_models?.brand} {r.data.vehicle_models?.name} {r.data.year}</span>
                              <br />
                              <span className="text-muted-foreground">{r.data.clients?.full_name}</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={`c-${r.id}`}
                            className="px-3 py-2 text-xs cursor-pointer hover:bg-accent flex items-center gap-2"
                            onMouseDown={() => {
                              setUnifiedClientId(r.id);
                              setUnifiedClientName(r.full_name);
                              setUnifiedSearch(r.full_name);
                              setUnifiedDropdown(false);
                              setUnifiedResults([]);
                            }}
                          >
                            <User className="w-3 h-3 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <span>{r.full_name}</span>
                              {r.is_manual && (
                                <Badge className="ml-1 text-[9px] px-1 py-0 bg-amber-100 text-amber-800" title="Cliente externo">
                                  Externo
                                </Badge>
                              )}
                              {(r.cedula || r.phone) && (
                                <span className="block text-muted-foreground text-[10px] truncate">
                                  {[r.cedula, r.phone].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Vehículo resuelto */}
                {plateResult && (
                  <div className="rounded-md bg-green-50 border border-green-200 p-3 text-xs space-y-1">
                    <p className="font-semibold text-green-800 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Vehículo encontrado</p>
                    <div className="flex items-center gap-2"><Car className="w-3 h-3" /><span>{plateResult.vehicle_models?.brand} {plateResult.vehicle_models?.name} {plateResult.year}</span>{plateResult.color && <span className="text-muted-foreground">· {plateResult.color}</span>}</div>
                    <div className="flex items-center gap-2"><User className="w-3 h-3" /><span>{plateResult.clients?.full_name}</span>{plateResult.clients?.cedula && <span className="text-muted-foreground">· {plateResult.clients.cedula}</span>}</div>
                    <div className="pt-1"><WarrantyChip vehicleId={plateResult.id} /></div>
                  </div>
                )}

                {/* Cliente seleccionado sin vehículo → mostrar selector */}
                {unifiedClientId && !plateResult && (
                  <>
                    <p className="text-[10px] text-green-700 flex items-center gap-1"><User className="w-3 h-3" /> {unifiedClientName} seleccionado</p>
                    {unifiedClientVehicles.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[13px] sm:text-xs">Vehículo del cliente</Label>
                        <Select value={unifiedClientVehicleId} onValueChange={handleUnifiedClientVehicleSelect} disabled={loadingUnifiedVehicle}>
                          <SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue placeholder="Seleccionar vehículo (opcional)" /></SelectTrigger>
                          <SelectContent>
                            {unifiedClientVehicles.map(v => (
                              <SelectItem key={v.id} value={v.id} className="text-xs">
                                {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}{v.plate ? ` · ${v.plate}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {unifiedClientVehicles.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">Este cliente no tiene vehículos registrados</p>
                    )}
                  </>
                )}
                </>
                )}

                {/* Ingreso manual NUEVO: crea cliente + vehículo reales (toggle o búsqueda sin
                    resultados). Edición de walk-in LEGACY: edita texto libre, sin crear entidades.
                    El flag manualActiveForCreate es la MISMA condición que dispara la creación
                    de entidades al guardar, así la UI y la persistencia coinciden (C4). */}
                {(manualActiveForCreate || editingLegacyWalkin) && (
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Nombre *</Label><Input value={fWalkinName} onChange={e => setFWalkinName(e.target.value)} placeholder="Nombre del cliente" className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                      <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Teléfono</Label><Input value={fWalkinPhone} onChange={e => setFWalkinPhone(e.target.value)} placeholder="+58 412..." className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                      {/* Cédula / Modelo / Año only apply when creating real entities. */}
                      {!editingLegacyWalkin && (
                        <>
                          <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Cédula</Label><Input value={fWalkinCedula} onChange={e => setFWalkinCedula(e.target.value)} placeholder="V-12345678" className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                          <div className="space-y-1">
                            <Label className="text-[13px] sm:text-xs">Marca / Modelo *</Label>
                            {/* Searchable: 269 active models make a plain Select unusable. */}
                            <ModelCombobox
                              className="h-9 text-sm sm:h-8 sm:text-xs"
                              models={vehicleModels}
                              value={fWalkinUseManualModel ? MANUAL_MODEL_VALUE : fWalkinModelId}
                              onChange={v => {
                                if (v === MANUAL_MODEL_VALUE) { setFWalkinUseManualModel(true); setFWalkinModelId(''); }
                                else { setFWalkinUseManualModel(false); setFWalkinModelId(v); }
                              }}
                            />
                          </div>
                          {fWalkinUseManualModel && (
                            <>
                              <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Marca *</Label><Input value={fWalkinManualBrand} onChange={e => setFWalkinManualBrand(e.target.value)} placeholder="Ej: Toyota" className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                              <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Modelo *</Label><Input value={fWalkinManualModelName} onChange={e => setFWalkinManualModelName(e.target.value)} placeholder="Ej: Corolla" className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                              <div className="col-span-1 sm:col-span-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs flex items-start gap-2">
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
                      <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Placa</Label><Input value={fWalkinPlate} onChange={e => setFWalkinPlate(e.target.value.toUpperCase())} placeholder="Ej: ABC123" className="h-9 text-sm sm:h-8 sm:text-xs uppercase" /></div>
                      {!editingLegacyWalkin && (
                        <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Año</Label><Input type="number" value={fWalkinYear} onChange={e => setFWalkinYear(e.target.value)} placeholder={String(new Date().getFullYear())} className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                      )}
                      {/* Etiqueta del convenio. Sólo se guarda si el cliente se crea acá: si
                          ya existía, su origen es el que tenga cargado y no se pisa. */}
                      {!editingLegacyWalkin && (
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[13px] sm:text-xs">Convenio de origen</Label>
                          <Input
                            list="dr-external-sources"
                            value={fWalkinExternalSource}
                            onChange={e => setFWalkinExternalSource(e.target.value)}
                            placeholder="Ej: Seguros Caracas — opcional"
                            className="h-9 text-sm sm:h-8 sm:text-xs"
                          />
                          <datalist id="dr-external-sources">
                            {externalSources.map(s => <option key={s} value={s} />)}
                          </datalist>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Incidencia: campos propios */}
              {isIncidencia && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Fecha del reporte *</Label>
                      <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="h-9 text-sm sm:h-8 sm:text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Hora</Label>
                      <Select value={fTime} onValueChange={setFTime}><SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIME_SLOTS.map(t => { const occ = getSlotOccupancy(t); return <SelectItem key={t} value={t} disabled={occ.full}>{t} · {occ.occupied}/{occ.capacity}{occ.full ? ' (lleno)' : ''}</SelectItem>; })}</SelectContent></Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Estado de Venezuela</Label>
                      <Select value={fState || '__none'} onValueChange={v => setFState(v === '__none' ? '' : v)}>
                        <SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Usar estado del concesionario</SelectItem>
                          {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[13px] sm:text-xs">Descripción de la falla *</Label>
                    <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={4} placeholder="Describa la falla, desperfecto o problema observado..." className="text-sm sm:text-xs resize-none" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[13px] sm:text-xs">Kilometraje actual</Label>
                    <Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} placeholder="Ej: 25000" className="h-9 text-sm sm:h-8 sm:text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[13px] sm:text-xs">Fotos / Videos</Label>
                    <TechnicalReportUploader maxSizeMB={40} value={fIncMediaUrls} onChange={setFIncMediaUrls} />
                  </div>
                </div>
              )}

              {/* Reserva normal: detalles de la cita */}
              {!isIncidencia && (
                <>
                  <Separator />

                  <div className="space-y-3">
                    <Label className="text-[13px] sm:text-xs font-semibold">Detalles de la cita</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Fecha *</Label><Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                      {!isRepuestos && (
                        <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Hora *</Label><Select value={fTime} onValueChange={setFTime}><SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIME_SLOTS.map(t => { const occ = getSlotOccupancy(t); return <SelectItem key={t} value={t} disabled={occ.full}>{t} · {occ.occupied}/{occ.capacity}{occ.full ? ' (lleno)' : ''}</SelectItem>; })}</SelectContent></Select></div>
                      )}
                      <div className="space-y-1"><Label className="text-[13px] sm:text-xs">Kilometraje</Label><Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} className="h-9 text-sm sm:h-8 sm:text-xs" /></div>
                      <div className="space-y-1">
                        <Label className="text-[13px] sm:text-xs">Estado de Venezuela</Label>
                        <Select value={fState || '__none'} onValueChange={v => setFState(v === '__none' ? '' : v)}>
                          <SelectTrigger className="h-9 text-sm sm:h-8 sm:text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Usar estado del concesionario</SelectItem>
                            {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Descripción / Motivo</Label>
                      <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} className="text-sm sm:text-xs" placeholder="Describa el tipo de servicio solicitado..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Notas Internas</Label>
                      <Textarea value={fObs} onChange={e => setFObs(e.target.value)} rows={2} className="text-sm sm:text-xs" placeholder="Notas internas del equipo GAC (no visibles para el cliente)..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[13px] sm:text-xs">Archivo adjunto</Label>
                      <TechnicalReportUploader maxSizeMB={40} value={createTechReportUrl} onChange={setCreateTechReportUrl} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : isIncidencia ? (editingRes ? 'Actualizar Incidencia' : 'Crear Incidencia') : (editingRes ? 'Actualizar Reserva' : isRepuestos ? 'Crear Solicitud' : 'Crear Reserva')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipReservas;
