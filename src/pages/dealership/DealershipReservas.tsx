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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { buildWhatsAppReservationUrl } from '@/lib/whatsapp';

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
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
  vehicles: { plate: string | null; year: number; vehicle_models: { name: string; brand: string } | null } | null;
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
  service_notes: string | null;
  technical_report_url: string | null;
  completed_at: string | null;
  dealerships: { name: string } | null;
}

interface ClientResult {
  id: string;
  full_name: string;
}

interface VehicleResult {
  id: string;
  plate: string | null;
  year: number;
  vehicle_models: { name: string; brand: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const INCIDENCIA_STATUSES: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  agendada: { label: 'Agendada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  culminado: { label: 'Culminado', color: 'bg-green-100 text-green-800' },
};

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
}).filter(t => t !== '12:00' && t !== '12:30');

const DR_LS_KEY = 'dealership_reservas_create_form';
const getDrLS = () => { try { return JSON.parse(localStorage.getItem(DR_LS_KEY) || '{}'); } catch { return {}; } };

const DealershipReservas = () => {
  const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading: loadingAccess } = useDealershipAccess();
  const { profile, role } = useAuth();
  const { salesperson: currentSalesperson } = useCurrentSalesperson();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [completing, setCompleting] = useState(false);

  // Create dialog (initialized from localStorage to survive page refresh)
  const [createOpen, setCreateOpenRaw] = useState<boolean>(() => getDrLS().createOpen === true);
  const [saving, setSaving] = useState(false);

  // Normal reservation — search mode
  const [searchMode, setSearchMode] = useState<'placa' | 'nombre'>('nombre');

  // Normal reservation — plate search
  const [plateSearch, setPlateSearch] = useState<string>(() => getDrLS().plateSearch || '');
  const [plateResult, setPlateResult] = useState<PlateResult | null>(() => getDrLS().plateResult || null);
  const [plateSearched, setPlateSearched] = useState<boolean>(() => getDrLS().plateSearched === true);
  const [searchingPlate, setSearchingPlate] = useState(false);

  // Normal reservation — client name search
  const [normalNameSearch, setNormalNameSearch] = useState('');
  const [normalNameResults, setNormalNameResults] = useState<ClientResult[]>([]);
  const [normalNameClientId, setNormalNameClientId] = useState('');
  const [normalNameClientName, setNormalNameClientName] = useState('');
  const [normalNameDropdown, setNormalNameDropdown] = useState(false);
  const [normalNameVehicles, setNormalNameVehicles] = useState<VehicleResult[]>([]);
  const [normalNameVehicleId, setNormalNameVehicleId] = useState('');
  const [loadingNormalVehicle, setLoadingNormalVehicle] = useState(false);
  const normalNameRef = useRef<HTMLDivElement>(null);

  // Normal reservation — common fields
  const [fDate, setFDate] = useState<string>(() => getDrLS().fDate || '');
  const [fTime, setFTime] = useState<string>(() => getDrLS().fTime || '');
  const [fService, setFService] = useState<string>(() => getDrLS().fService || '');
  const [fMileage, setFMileage] = useState<string>(() => getDrLS().fMileage || '0');
  const [fNotes, setFNotes] = useState<string>(() => getDrLS().fNotes || '');
  const [fObs, setFObs] = useState<string>('');
  const [fWalkinName, setFWalkinName] = useState<string>(() => getDrLS().fWalkinName || '');
  const [fWalkinPhone, setFWalkinPhone] = useState<string>(() => getDrLS().fWalkinPhone || '');

  // Incidencia form fields
  const [fClientSearch, setFClientSearch] = useState('');
  const [fClientResults, setFClientResults] = useState<ClientResult[]>([]);
  const [fClientId, setFClientId] = useState('');
  const [fClientName, setFClientName] = useState('');
  const [fClientDropdown, setFClientDropdown] = useState(false);
  const [fIncVehicleId, setFIncVehicleId] = useState('');
  const [fIncVehicles, setFIncVehicles] = useState<VehicleResult[]>([]);
  const [fIncMediaUrls, setFIncMediaUrls] = useState<string | null>(null);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  const hoy = new Date().toISOString().split('T')[0];
  const isIncidencia = INCIDENCIA_TYPES.has(fService);

  const isVendedor = role?.name?.toLowerCase() === 'vendedor';

  const fetchReservations = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('*, clients(full_name, cedula, phone), vehicles(plate, year, vehicle_models(name, brand))')
      .eq('dealership_id', selectedDealership)
      .order('reservation_date', { ascending: false })
      .order('reservation_time', { ascending: false })
      .limit(200);
    // Vendedor sees ONLY their own reservations/incidencias
    if (isVendedor && profile?.id) {
      query = query.eq('created_by_profile_id', profile.id);
    }
    const { data } = await query;
    setReservations((data || []) as Reservation[]);
    setLoading(false);
  };

  useEffect(() => {
    if (loadingAccess) return;
    if (selectedDealership) { fetchReservations(); }
    else { setLoading(false); }
  }, [selectedDealership, loadingAccess]);

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

  // Normal form: client name autocomplete
  useEffect(() => {
    if (!normalNameSearch.trim() || normalNameClientId) {
      setNormalNameResults([]);
      setNormalNameDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .ilike('full_name', `%${normalNameSearch.trim()}%`)
        .limit(8);
      setNormalNameResults((data || []) as ClientResult[]);
      setNormalNameDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [normalNameSearch, normalNameClientId]);

  // Normal form: fetch client vehicles after client selected by name
  useEffect(() => {
    if (!normalNameClientId) { setNormalNameVehicles([]); setNormalNameVehicleId(''); return; }
    (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, vehicle_models(name, brand)')
        .eq('client_id', normalNameClientId);
      setNormalNameVehicles((data || []) as unknown as VehicleResult[]);
    })();
  }, [normalNameClientId]);

  // Incidencia form: client name autocomplete
  useEffect(() => {
    if (!fClientSearch.trim() || fClientId) {
      setFClientResults([]);
      setFClientDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .ilike('full_name', `%${fClientSearch.trim()}%`)
        .limit(8);
      setFClientResults((data || []) as ClientResult[]);
      setFClientDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [fClientSearch, fClientId]);

  // Incidencia form: fetch vehicles when client selected
  useEffect(() => {
    if (!fClientId) { setFIncVehicles([]); setFIncVehicleId(''); return; }
    (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, vehicle_models(name, brand)')
        .eq('client_id', fClientId);
      setFIncVehicles((data || []) as unknown as VehicleResult[]);
    })();
  }, [fClientId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) setFClientDropdown(false);
      if (normalNameRef.current && !normalNameRef.current.contains(e.target as Node)) setNormalNameDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setCreateOpen = (open: boolean) => {
    setCreateOpenRaw(open);
    if (!open) { try { localStorage.removeItem(DR_LS_KEY); } catch {} setEditingRes(null); }
  };

  useEffect(() => {
    if (!createOpen) return;
    try {
      localStorage.setItem(DR_LS_KEY, JSON.stringify({ createOpen: true, plateSearch, plateResult, plateSearched, fDate, fTime, fService, fMileage, fNotes, fWalkinName, fWalkinPhone }));
    } catch {}
  }, [createOpen, plateSearch, plateResult, plateSearched, fDate, fTime, fService, fMileage, fNotes, fWalkinName, fWalkinPhone]);

  const ARCHIVED_STATUSES = new Set(['completada', 'cancelada', 'culminado']);
  const filteredReservations = reservations.filter(r => {
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

  const handlePlateSearch = async () => {
    if (!plateSearch.trim()) return;
    setSearchingPlate(true); setPlateResult(null); setPlateSearched(true);
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, year, color, client_id, vehicle_models(name, brand), clients(id, full_name, phone, cedula)')
      .ilike('plate', plateSearch.trim())
      .limit(1);
    if (data && data.length > 0) setPlateResult(data[0] as any);
    setSearchingPlate(false);
  };

  // When vehicle is chosen in name-search mode, populate plateResult for reuse in save logic
  const handleNormalNameVehicleSelect = async (vehicleId: string) => {
    setLoadingNormalVehicle(true);
    setNormalNameVehicleId(vehicleId);
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, year, color, client_id, vehicle_models(name, brand), clients(id, full_name, phone, cedula)')
      .eq('id', vehicleId)
      .single();
    if (data) { setPlateResult(data as any); setPlateSearched(true); }
    setLoadingNormalVehicle(false);
  };

  const resetNameSearch = () => {
    setNormalNameSearch(''); setNormalNameResults([]); setNormalNameClientId('');
    setNormalNameClientName(''); setNormalNameDropdown(false);
    setNormalNameVehicles([]); setNormalNameVehicleId('');
    setPlateResult(null); setPlateSearched(false);
  };

  const resetIncidenciaFields = () => {
    setFClientSearch(''); setFClientResults([]); setFClientId(''); setFClientName('');
    setFClientDropdown(false); setFIncVehicleId(''); setFIncVehicles([]); setFIncMediaUrls(null);
  };

  const resetNormalFields = () => {
    setPlateSearch(''); setPlateResult(null); setPlateSearched(false);
    setFWalkinName(''); setFWalkinPhone('');
    resetNameSearch();
    setSearchMode('nombre');
  };

  const openCreate = () => {
    resetNormalFields();
    resetIncidenciaFields();
    setFDate(hoy); setFTime('09:00'); setFService(''); setFMileage('0'); setFNotes(''); setFObs('');
    setCreateTechReportUrl(null);
    setCreateOpen(true);
  };

  const selectClient = (client: ClientResult) => {
    setFClientId(client.id); setFClientName(client.full_name);
    setFClientSearch(client.full_name); setFClientDropdown(false); setFClientResults([]);
  };

  const clearClient = () => {
    setFClientId(''); setFClientName(''); setFClientSearch('');
    setFClientResults([]); setFClientDropdown(false);
    setFIncVehicleId(''); setFIncVehicles([]);
  };

  const clearNormalNameClient = () => {
    setNormalNameClientId(''); setNormalNameClientName(''); setNormalNameSearch('');
    setNormalNameResults([]); setNormalNameDropdown(false);
    setNormalNameVehicles([]); setNormalNameVehicleId('');
    setPlateResult(null); setPlateSearched(false);
  };

  const handleSave = async () => {
    if (isIncidencia) {
      if (!fDate) { toast.error('La fecha es requerida'); return; }
      if (!fNotes.trim()) { toast.error('La descripción de la falla es requerida'); return; }
      setSaving(true);
      const incPayload: Record<string, unknown> = {
        dealership_id: selectedDealership,
        client_id: fClientId || null,
        vehicle_id: fIncVehicleId || null,
        reservation_date: fDate,
        reservation_time: fTime || '08:00',
        service_type: fService,
        notes: fNotes.trim(),
        current_mileage: parseInt(fMileage) || 0,
        technical_report_url: fIncMediaUrls || null,
      };
      if (editingRes) {
        const { error } = await supabase.from('reservations').update(incPayload).eq('id', editingRes.id);
        if (error) { toast.error('Error al actualizar incidencia'); console.error(error); }
        else { toast.success('Incidencia actualizada'); setCreateOpen(false); setEditingRes(null); fetchReservations(); }
      } else {
        const creatorName = currentSalesperson?.name || profile?.full_name || null;
        const creatorRole = role?.name || null;
        incPayload.status = 'pendiente';
        incPayload.created_by_name = creatorName;
        incPayload.created_by_role = creatorRole;
        incPayload.created_by_profile_id = profile?.id || null;
        const { error } = await supabase.from('reservations').insert(incPayload);
        if (error) { toast.error('Error al crear incidencia'); console.error(error); }
        else { toast.success('Incidencia creada exitosamente'); setCreateOpen(false); fetchReservations(); }
      }
      setSaving(false);
      return;
    }

    if (!fDate || !fTime || !fService) { toast.error('Fecha, hora y servicio son requeridos'); return; }

    // Validate client/vehicle presence based on search mode
    if (searchMode === 'nombre') {
      if (!normalNameClientId) { toast.error('Busque y seleccione un cliente'); return; }
    } else {
      if (!plateResult && !fWalkinName.trim()) { toast.error('Ingrese el nombre del cliente'); return; }
    }

    setSaving(true);
    const creatorName = currentSalesperson?.name || profile?.full_name || null;
    const creatorRole = role?.name || null;
    const payload: any = {
      dealership_id: selectedDealership,
      reservation_date: fDate, reservation_time: fTime, service_type: fService,
      current_mileage: parseInt(fMileage) || 0,
      notes: [fNotes.trim(), fObs.trim()].filter(Boolean).join('\n') || null,
      status: 'pendiente',
      technical_report_url: createTechReportUrl || null,
      created_by_name: creatorName,
      created_by_role: creatorRole,
      created_by_profile_id: profile?.id || null,
    };

    if (searchMode === 'nombre') {
      if (plateResult) {
        // Vehicle selected from name search
        payload.vehicle_id = plateResult.id;
        payload.client_id = plateResult.client_id;
      } else {
        // Only client selected, no vehicle
        payload.client_id = normalNameClientId;
      }
    } else {
      // Plate mode
      if (plateResult) { payload.vehicle_id = plateResult.id; payload.client_id = plateResult.client_id; }
      else { payload.walkin_client_name = fWalkinName.trim(); payload.walkin_client_phone = fWalkinPhone.trim() || null; payload.walkin_plate = plateSearch.trim().toUpperCase() || null; }
    }

    const { error } = await supabase.from('reservations').insert(payload);
    if (error) { toast.error('Error al crear reserva'); console.error(error); }
    else { toast.success('Reserva creada exitosamente'); setCreateOpen(false); fetchReservations(); }
    setSaving(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { toast.success('Estado actualizado'); fetchReservations(); }
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
        .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, technical_report_url, completed_at, dealerships(name)')
        .eq('vehicle_id', r.vehicle_id).neq('id', r.id)
        .order('reservation_date', { ascending: false }).order('reservation_time', { ascending: false }).limit(50);
      setVehicleHistory((history || []) as unknown as HistoryRecord[]);
      setLoadingDetail(false);
    }
  };

  const openEditIncidencia = (r: Reservation) => {
    setEditingRes(r);
    setFService(r.service_type);
    setFDate(r.reservation_date);
    setFMileage(String(r.current_mileage));
    setFNotes(r.notes || '');
    setFClientId(r.client_id || '');
    setFClientName(r.clients?.full_name || '');
    setFClientSearch(r.clients?.full_name || '');
    setFIncVehicleId(r.vehicle_id || '');
    setFIncMediaUrls(r.technical_report_url || null);
    if (r.client_id) {
      supabase.from('vehicles').select('id, plate, year, vehicle_models(name, brand)')
        .eq('client_id', r.client_id).then(({ data }) => setFIncVehicles((data || []) as unknown as VehicleResult[]));
    }
    setDetailOpen(false);
    setCreateOpen(true);
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
    setTechnicalReportUrl(r.technical_report_url || null); setCompleteOpen(true);
  };

  const handleComplete = async () => {
    if (!completingRes) return;
    if (!serviceNotes.trim()) { toast.error('Describe lo que se realizó en el servicio'); return; }
    setCompleting(true);
    const { error } = await supabase.from('reservations').update({
      status: 'completada', service_notes: serviceNotes.trim(),
      technical_report_url: technicalReportUrl || null, completed_at: new Date().toISOString(),
    }).eq('id', completingRes.id);
    if (error) { toast.error('Error al completar'); console.error(error); }
    else { toast.success('Servicio completado'); setCompleteOpen(false); fetchReservations(); }
    setCompleting(false);
  };

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
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={openCreate} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Reserva
          </Button>
        </div>
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
              <SelectSeparator />
              <SelectItem value="agendada">Agendada</SelectItem>
              <SelectItem value="culminado">Culminado</SelectItem>
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
                const statusMap = isInc ? INCIDENCIA_STATUSES : STATUS_CONFIG;
                const st = statusMap[r.status] || (isInc ? INCIDENCIA_STATUSES.pendiente : STATUS_CONFIG.pendiente);
                return (
                  <TableRow key={r.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                    <TableCell className="font-medium">
                      {r.reservation_date}
                      <br />
                      <span className="text-[10px] text-muted-foreground">{r.reservation_time?.slice(0, 5) || '—'}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {dealerships.find(d => d.id === selectedDealership)?.state || '—'}
                    </TableCell>
                    <TableCell>
                      <div>{clientName}</div>
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
                      {editingKmRowId === r.id ? (
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

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {detailRes && INCIDENCIA_TYPES.has(detailRes.service_type)
                ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> Detalle de Incidencia</>
                : <><CalendarDays className="w-4 h-4" /> Detalle de Cita</>}
            </DialogTitle>
          </DialogHeader>
          {detailRes && (() => {
            const isInc = INCIDENCIA_TYPES.has(detailRes.service_type);
            const statusMap = isInc ? INCIDENCIA_STATUSES : STATUS_CONFIG;
            const st = statusMap[detailRes.status] || (isInc ? INCIDENCIA_STATUSES.pendiente : STATUS_CONFIG.pendiente);
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
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{clientName}</span>
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
                  {detailRes.notes && (
                    <div className="bg-muted/50 rounded-md p-2.5 text-xs">
                      <p className="font-semibold mb-1">{isInc ? 'Descripción de la falla' : 'Notas'}</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{detailRes.notes}</p>
                    </div>
                  )}
                  {detailRes.status === 'completada' && detailRes.service_notes && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-xs">
                      <p className="font-semibold text-green-800 mb-1 flex items-center gap-1"><ClipboardCheck className="w-3.5 h-3.5" /> Trabajo realizado</p>
                      <p className="text-green-700 whitespace-pre-wrap">{detailRes.service_notes}</p>
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
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => openEditIncidencia(detailRes)}>
                        <Pencil className="w-3 h-3" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs text-destructive gap-1" onClick={() => { setDeletingResIsInc(true); setDeletingResId(detailRes.id); }}>
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2 pt-2">
                      {detailRes.status === 'pendiente' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'confirmada'); }}>Confirmar</Button>}
                      {detailRes.status === 'confirmada' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'en_proceso'); }}>Iniciar</Button>}
                      {detailRes.status === 'en_proceso' && <Button size="sm" className="text-xs gac-gradient gap-1" onClick={() => { setDetailOpen(false); openComplete(detailRes); }}><ClipboardCheck className="w-3 h-3" /> Completar</Button>}
                      <Button size="sm" variant="ghost" className="text-xs text-destructive gap-1" onClick={() => { setDeletingResIsInc(false); setDeletingResId(detailRes.id); }}>
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </Button>
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
                        const hMap = hIsInc ? INCIDENCIA_STATUSES : STATUS_CONFIG;
                        const hst = hMap[h.status] || hMap.pendiente;
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
                            {h.notes && <p className="text-muted-foreground bg-muted/40 rounded p-1.5"><span className="font-medium text-foreground">{hIsInc ? 'Falla:' : 'Notas:'}</span> {h.notes}</p>}
                            {h.service_notes && (
                              <div className="bg-green-50 border border-green-200 rounded p-1.5">
                                <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo:</p>
                                <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                              </div>
                            )}
                            {h.technical_report_url && <TechnicalReportUploader reservationId={h.id} value={h.technical_report_url} onChange={() => {}} readonly />}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {isIncidencia
              ? <><AlertTriangle className="w-4 h-4 text-amber-500" /> {editingRes ? 'Editar Incidencia' : 'Nueva Incidencia'}</>
              : 'Nueva Reserva'}
            </DialogTitle>
          </DialogHeader>

          {/* Concesionario — siempre visible como dropdown */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Concesionario</Label>
            <Select value={selectedDealership} onValueChange={setSelectedDealership}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de servicio — siempre visible primero */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Tipo de servicio *</Label>
            <Select
              value={fService}
              onValueChange={v => {
                const wasInc = INCIDENCIA_TYPES.has(fService);
                const nowInc = INCIDENCIA_TYPES.has(v);
                setFService(v);
                setFNotes('');
                if (nowInc && !wasInc) { resetNormalFields(); setFDate(hoy); }
                if (!nowInc && wasInc) { resetIncidenciaFields(); setFDate(hoy); setFTime('09:00'); }
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
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

          <Separator />

          {/* FORMA INCIDENCIA */}
          {isIncidencia && (
            <div className="space-y-3">
              <div className="space-y-1" ref={clientSearchRef}>
                <Label className="text-xs">Cliente</Label>
                <div className="relative">
                  <div className="flex items-center gap-1">
                    <Input
                      value={fClientSearch}
                      onChange={e => { setFClientSearch(e.target.value); if (fClientId) { setFClientId(''); setFClientName(''); } }}
                      placeholder="Buscar por nombre..."
                      className="h-8 text-xs"
                      disabled={!!fClientId}
                    />
                    {fClientId && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={clearClient}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  {fClientDropdown && fClientResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                      {fClientResults.map(c => (
                        <div key={c.id} className="px-3 py-2 text-xs cursor-pointer hover:bg-accent" onMouseDown={() => selectClient(c)}>{c.full_name}</div>
                      ))}
                    </div>
                  )}
                </div>
                {fClientId && <p className="text-[10px] text-green-700 flex items-center gap-1 mt-0.5"><User className="w-3 h-3" /> {fClientName} seleccionado</p>}
              </div>

              {fClientId && (
                <div className="space-y-1">
                  <Label className="text-xs">Vehículo</Label>
                  {fIncVehicles.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">Sin vehículos registrados</p>
                  ) : (
                    <Select value={fIncVehicleId} onValueChange={setFIncVehicleId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar vehículo" /></SelectTrigger>
                      <SelectContent>
                        {fIncVehicles.map(v => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}{v.plate ? ` · ${v.plate}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fecha del reporte *</Label>
                  <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hora</Label>
                  <Select value={fTime} onValueChange={setFTime}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción de la falla *</Label>
                <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={4} placeholder="Describa la falla, desperfecto o problema observado..." className="text-xs resize-none" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kilometraje actual</Label>
                <Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} placeholder="Ej: 25000" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fotos / Videos</Label>
                <TechnicalReportUploader maxSizeMB={40} value={fIncMediaUrls} onChange={setFIncMediaUrls} />
              </div>
            </div>
          )}

          {/* FORMA RESERVA NORMAL */}
          {!isIncidencia && (
            <>
              {/* Cliente: tabs Placa / Nombre */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Buscar cliente</Label>
                <Tabs value={searchMode} onValueChange={v => { setSearchMode(v as 'placa' | 'nombre'); if (v === 'placa') resetNameSearch(); else { setPlateSearch(''); setPlateResult(null); setPlateSearched(false); } }}>
                  <TabsList className="h-7 text-xs">
                    <TabsTrigger value="placa" className="text-xs h-6 px-3">Por placa</TabsTrigger>
                    <TabsTrigger value="nombre" className="text-xs h-6 px-3">Por nombre</TabsTrigger>
                  </TabsList>

                  {/* PLACA */}
                  <TabsContent value="placa" className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <Input value={plateSearch} onChange={e => { setPlateSearch(e.target.value.toUpperCase()); setPlateSearched(false); setPlateResult(null); }} placeholder="Ej: ABC123" className="h-8 text-xs uppercase" onKeyDown={e => e.key === 'Enter' && handlePlateSearch()} />
                      <Button size="sm" variant="outline" onClick={handlePlateSearch} disabled={searchingPlate || !plateSearch.trim()}>
                        <Search className="w-3.5 h-3.5 mr-1" /> Buscar
                      </Button>
                    </div>
                    {plateSearched && (
                      <div className={cn("rounded-md border p-3", plateResult ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200")}>
                        {plateResult ? (
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                            <div className="text-xs space-y-1 flex-1 min-w-0">
                              <p className="font-semibold text-green-800">Vehículo encontrado</p>
                              <div className="flex items-center gap-2"><Car className="w-3 h-3" /><span>{plateResult.vehicle_models?.brand} {plateResult.vehicle_models?.name} {plateResult.year}</span>{plateResult.color && <span className="text-muted-foreground">· {plateResult.color}</span>}</div>
                              <div className="flex items-center gap-2"><User className="w-3 h-3" /><span>{plateResult.clients?.full_name}</span>{plateResult.clients?.cedula && <span className="text-muted-foreground">· {plateResult.clients.cedula}</span>}</div>
                              <div className="pt-1"><WarrantyChip vehicleId={plateResult.id} /></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="text-xs">
                              <p className="font-semibold text-amber-800">Placa no encontrada</p>
                              <p className="text-amber-700">Ingrese los datos del cliente manualmente abajo.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {plateSearched && !plateResult && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1"><Label className="text-xs">Nombre *</Label><Input value={fWalkinName} onChange={e => setFWalkinName(e.target.value)} placeholder="Nombre del cliente" className="h-8 text-xs" /></div>
                          <div className="space-y-1"><Label className="text-xs">Teléfono</Label><Input value={fWalkinPhone} onChange={e => setFWalkinPhone(e.target.value)} placeholder="+58 412..." className="h-8 text-xs" /></div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* NOMBRE */}
                  <TabsContent value="nombre" className="mt-2 space-y-2" ref={normalNameRef}>
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <Input
                          value={normalNameSearch}
                          onChange={e => { setNormalNameSearch(e.target.value); if (normalNameClientId) clearNormalNameClient(); }}
                          placeholder="Escriba el nombre del cliente..."
                          className="h-8 text-xs"
                          disabled={!!normalNameClientId}
                        />
                        {normalNameClientId && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={clearNormalNameClient}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      {normalNameDropdown && normalNameResults.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                          {normalNameResults.map(c => (
                            <div
                              key={c.id}
                              className="px-3 py-2 text-xs cursor-pointer hover:bg-accent"
                              onMouseDown={() => {
                                setNormalNameClientId(c.id);
                                setNormalNameClientName(c.full_name);
                                setNormalNameSearch(c.full_name);
                                setNormalNameDropdown(false);
                                setNormalNameResults([]);
                              }}
                            >{c.full_name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    {normalNameClientId && (
                      <p className="text-[10px] text-green-700 flex items-center gap-1"><User className="w-3 h-3" /> {normalNameClientName} seleccionado</p>
                    )}
                    {normalNameClientId && normalNameVehicles.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Vehículo del cliente</Label>
                        <Select value={normalNameVehicleId} onValueChange={handleNormalNameVehicleSelect} disabled={loadingNormalVehicle}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar vehículo (opcional)" /></SelectTrigger>
                          <SelectContent>
                            {normalNameVehicles.map(v => (
                              <SelectItem key={v.id} value={v.id} className="text-xs">
                                {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}{v.plate ? ` · ${v.plate}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {normalNameClientId && normalNameVehicles.length === 0 && (
                      <p className="text-[10px] text-muted-foreground">Este cliente no tiene vehículos registrados</p>
                    )}
                    {plateResult && normalNameVehicleId && (
                      <div className="rounded-md bg-green-50 border border-green-200 p-2.5 text-xs space-y-1">
                        <p className="font-semibold text-green-800 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Vehículo seleccionado</p>
                        <div className="flex items-center gap-2"><Car className="w-3 h-3" /><span>{plateResult.vehicle_models?.brand} {plateResult.vehicle_models?.name} {plateResult.year}</span></div>
                        <WarrantyChip vehicleId={plateResult.id} />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <Separator />

              {/* Detalles de la cita */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Detalles de la cita</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Fecha *</Label><Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="h-8 text-xs" /></div>
                  <div className="space-y-1"><Label className="text-xs">Hora *</Label><Select value={fTime} onValueChange={setFTime}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1 col-span-2"><Label className="text-xs">Kilometraje</Label><Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} className="h-8 text-xs" /></div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción / Motivo</Label>
                  <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3} className="text-xs" placeholder="Describa el tipo de servicio solicitado..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Textarea value={fObs} onChange={e => setFObs(e.target.value)} rows={2} className="text-xs" placeholder="Observaciones adicionales..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Archivo adjunto</Label>
                  <TechnicalReportUploader maxSizeMB={40} value={createTechReportUrl} onChange={setCreateTechReportUrl} />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : isIncidencia ? (editingRes ? 'Actualizar Incidencia' : 'Crear Incidencia') : 'Crear Reserva'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipReservas;
