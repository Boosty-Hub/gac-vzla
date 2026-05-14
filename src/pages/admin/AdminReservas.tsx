import { useEffect, useState } from 'react';
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
import { Search, CalendarDays, LayoutGrid, List, ChevronLeft, ChevronRight, Plus, Pencil, AlertCircle, MessageCircle, ClipboardCheck, Settings, Trash2, Car, User, FileText, MapPin, Gauge, StickyNote, Star, X, Clock } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { WarrantyChip } from '@/components/WarrantyChip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildWhatsAppReservationUrl } from '@/lib/whatsapp';
import { useIsMobile } from '@/hooks/use-mobile';

interface Dealership {
  id: string;
  name: string;
  city: string | null;
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

interface Reservation {
  id: string;
  dealership_id: string;
  client_id: string;
  vehicle_id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  service_notes: string | null;
  technical_report_url: string | null;
  satisfaction_rating: number | null;
  dealerships: { id: string; name: string; city: string | null } | null;
  clients: { full_name: string; cedula: string | null; phone: string | null; state: string | null } | null;
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

const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-blue-100 text-blue-800',
  en_proceso: 'bg-orange-100 text-orange-800',
  completada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_proceso: 'En Proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};


const AR_LS_KEY = 'admin_reservas_create_form';
const getArLS = () => { try { return JSON.parse(localStorage.getItem(AR_LS_KEY) || '{}'); } catch { return {}; } };

const AdminReservas = () => {
  const isMobile = useIsMobile();
  const { hasPermission, role } = useAuth();
  const canCreate = hasPermission('reservas.create');
  const canEdit = hasPermission('reservas.edit');
  const canDelete = role?.name === 'superadmin' || role?.name === 'admin';

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
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [capacityWarning, setCapacityWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroConc, setFiltroConc] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
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

  // Client/vehicle lookup
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [clientVehicles, setClientVehicles] = useState<VehicleOption[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);

  const fetchDealerships = async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, city, bays')
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

  const fetchReservations = async () => {
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('*, dealerships(id, name, city), clients(full_name, cedula, phone, state), vehicles(plate, year, vehicle_models(name, brand))');

    if (view === 'matrix') {
      query = query.eq('reservation_date', selectedDate);
    }

    if (filtroConc !== 'todos') {
      query = query.eq('dealership_id', filtroConc);
    }

    const { data, error } = await query.order('reservation_date', { ascending: false }).order('reservation_time');

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
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [view, selectedDate, filtroConc]);

  // Persist create-form to localStorage so a page refresh restores the dialog
  useEffect(() => {
    if (!dialogOpen || editingRes) {
      if (!dialogOpen) { try { localStorage.removeItem(AR_LS_KEY); } catch {} }
      return;
    }
    try {
      localStorage.setItem(AR_LS_KEY, JSON.stringify({ dialogOpen: true, fDealership, fClientSearch, fClientId, fVehicleId, fDate, fTime, fService, fMileage, fStatus, fNotes }));
    } catch {}
  }, [dialogOpen, editingRes, fDealership, fClientSearch, fClientId, fVehicleId, fDate, fTime, fService, fMileage, fStatus, fNotes]);

  // Client search with debounce (by name, cedula, or vehicle plate)
  useEffect(() => {
    if (fClientSearch.trim().length < 2) { setClientResults([]); return; }
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
      setClientVehicles((data || []) as VehicleOption[]);
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
    const [startH, startM] = time.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = startMin + duration;

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

    // For each minute in the new reservation's range, count how many bays are occupied
    for (let m = startMin; m < endMin; m++) {
      let occupied = 0;
      for (const r of dayReservations) {
        const [rH, rM] = r.reservation_time.split(':').map(Number);
        const rStart = rH * 60 + rM;
        const rDuration = getServiceDuration(r.service_type);
        const rEnd = rStart + rDuration;
        if (m >= rStart && m < rEnd) {
          occupied++;
        }
      }
      if (occupied >= dealer.bays) {
        const conflictHour = Math.floor(m / 60);
        const conflictMin = m % 60;
        const ampm = conflictHour >= 12 ? 'PM' : 'AM';
        const h12 = conflictHour > 12 ? conflictHour - 12 : conflictHour === 0 ? 12 : conflictHour;
        setCapacityWarning(
          `Sin disponibilidad: las ${dealer.bays} bahía(s) están ocupadas a las ${h12}:${String(conflictMin).padStart(2, '0')} ${ampm}. Servicio de ${duration} min no cabe en este horario.`
        );
        return false;
      }
    }
    return true;
  };

  const openCreate = () => {
    setEditingRes(null);
    setFDealership(''); setFClientSearch(''); setFClientId(''); setFVehicleId('');
    setFDate(new Date().toISOString().split('T')[0]); setFTime('08:00');
    setFService(''); setFMileage('0'); setFStatus('pendiente'); setFNotes(''); setFObs('');
    setClientResults([]); setClientVehicles([]);
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
    const { error } = await supabase.from('reservations').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar reservas');
    else { toast.success(`${ids.length} reserva(s) actualizadas`); setSelectedIds(new Set()); setBulkAction(null); fetchReservations(); }
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
    setFClientId(r.client_id);
    setFClientSearch(r.clients?.full_name || '');
    setFVehicleId(r.vehicle_id);
    setFDate(r.reservation_date);
    setFTime(r.reservation_time.substring(0, 5));
    setFService(r.service_type);
    setFMileage(String(r.current_mileage));
    setFStatus(r.status);
    setFNotes(r.notes || ''); setFObs('');
    setTechnicalReportUrl(r.technical_report_url || null);
    setClientResults([]);
    // Trigger vehicle fetch
    supabase
      .from('vehicles')
      .select('id, plate, year, vehicle_models(name, brand)')
      .eq('client_id', r.client_id)
      .eq('is_active', true)
      .then(({ data }) => setClientVehicles((data || []) as VehicleOption[]));
    setDialogOpen(true);
  };

  const selectClient = (c: ClientOption) => {
    setFClientId(c.id);
    setFClientSearch(c.full_name);
    setClientResults([]);
    setFVehicleId('');
  };

  const handleSave = async () => {
    if (!fDealership || !fClientId || !fVehicleId || !fDate || !fService) {
      toast.error('Completa los campos requeridos'); return;
    }
    setSaving(true);

    // Validate capacity
    const hasCapacity = await checkCapacity(fDealership, fDate, fTime, fService, editingRes?.id);
    if (!hasCapacity) {
      setSaving(false);
      return;
    }

    const payload = {
      dealership_id: fDealership,
      client_id: fClientId,
      vehicle_id: fVehicleId,
      reservation_date: fDate,
      reservation_time: fTime + ':00',
      service_type: fService,
      current_mileage: parseInt(fMileage) || 0,
      status: fStatus,
      notes: [fNotes.trim(), fObs.trim()].filter(Boolean).join('\n') || null,
      technical_report_url: technicalReportUrl || null,
    };

    if (editingRes) {
      const { error } = await supabase.from('reservations').update(payload).eq('id', editingRes.id);
      if (error) { toast.error('Error al actualizar reserva'); console.error(error); }
      else { toast.success('Reserva actualizada'); setDialogOpen(false); fetchReservations(); }
    } else {
      const { error } = await supabase.from('reservations').insert(payload);
      if (error) { toast.error('Error al crear reserva'); console.error(error); }
      else { toast.success('Reserva creada'); setDialogOpen(false); fetchReservations(); }
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
    setCompleteOpen(true);
  };

  const handleComplete = async () => {
    if (!completingRes) return;
    if (!serviceNotes.trim()) { toast.error('Describe lo que se realizó en el servicio'); return; }
    setCompleting(true);
    const { error } = await supabase.from('reservations').update({
      status: 'completada',
      service_notes: serviceNotes.trim(),
      technical_report_url: technicalReportUrl || null,
      satisfaction_rating: satisfactionRating,
      completed_at: new Date().toISOString(),
    }).eq('id', completingRes.id);
    if (error) { toast.error('Error al completar'); console.error(error); }
    else { toast.success('Servicio completado'); setCompleteOpen(false); fetchReservations(); }
    setCompleting(false);
  };

  const filteredReservations = reservations.filter(r => {
    if (filtroEstado !== 'todos' && r.status !== filtroEstado) return false;
    if (filtroServicio !== 'todos' && r.service_type !== filtroServicio) return false;
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
              <TabsTrigger value="matrix" className="gap-1 text-xs h-7 px-2"><LayoutGrid className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Matriz</span></TabsTrigger>
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
            <div className="flex items-center gap-1 flex-1">
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => changeDate(-1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => changeDate(1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-medium ml-1 hidden sm:inline shrink-0">{formatDate(selectedDate)}</span>
            </div>
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
            {(fechaDesde || fechaHasta || filtroEstado !== 'todos' || filtroServicio !== 'todos') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroEstado('todos'); setFiltroServicio('todos'); }}>
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
                        else { supabase.from('reservations').update({ status: val }).eq('id', r.id).then(() => fetchReservations()); }
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
                      <span className="truncate font-medium text-foreground">{r.clients?.full_name || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground min-w-0">
                      <Car className="w-3 h-3 shrink-0" />
                      <span className="truncate">{r.vehicles?.vehicle_models?.brand} {r.vehicles?.vehicle_models?.name} {r.vehicles?.year}</span>
                    </div>
                    <div className="text-muted-foreground pl-4">{r.vehicles?.plate || '-'}</div>
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
                    <TableCell>{r.clients?.full_name || '-'}</TableCell>
                    <TableCell>{r.clients?.state || '-'}</TableCell>
                    <TableCell>
                      {r.vehicles?.vehicle_models?.brand} {r.vehicles?.vehicle_models?.name} {r.vehicles?.year}
                      <br />
                      <span className="text-muted-foreground">{r.vehicles?.plate || '-'}</span>
                    </TableCell>
                    <TableCell>{r.service_type}</TableCell>
                    <TableCell>{r.dealerships?.name || '-'}</TableCell>
                    <TableCell>{r.current_mileage.toLocaleString()}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()} className="text-right">
                      <div className="flex items-center gap-1">
                        {canEdit ? (
                          <Select
                            value={r.status}
                            onValueChange={val => {
                              if (val === 'completada') { openComplete(r); }
                              else { supabase.from('reservations').update({ status: val }).eq('id', r.id).then(() => fetchReservations()); }
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

      {/* MATRIX VIEW */}
      {view === 'matrix' && (
        <Card className="gac-shadow overflow-auto">
          {loading ? (
            <CardContent className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando matriz...</p>
            </CardContent>
          ) : matrixDealerships.length === 0 ? (
            <CardContent className="p-8 text-center">
              <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay concesionarios activos</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concesionario</TableHead>
                  {HOURS.map(h => (
                    <TableHead key={h} className="text-center min-w-[130px]">{HOUR_LABELS[h]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrixDealerships.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium border-r">
                      <div>{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.city}</div>
                    </TableCell>
                    {HOURS.map(h => {
                      const cellReservations = getMatrixCell(d.id, h);
                      return (
                        <TableCell key={h} className="p-1 align-top border-r">
                          {cellReservations.length === 0 ? (
                            <div className="h-16 rounded bg-muted/30 flex items-center justify-center">
                              <span className="text-xs text-muted-foreground/50">—</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {cellReservations.map(r => (
                                <div
                                  key={r.id}
                                  className={cn(
                                    "rounded-md px-2 py-1.5 text-xs cursor-default",
                                    STATUS_COLORS[r.status] || 'bg-muted'
                                  )}
                                  title={`${r.clients?.full_name} - ${r.service_type}`}
                                >
                                  <div className="font-semibold truncate">{r.clients?.full_name || 'Cliente'}</div>
                                  <div className="truncate opacity-80">{r.service_type}</div>
                                  <div className="truncate opacity-60">
                                    {r.vehicles?.vehicle_models?.brand} {r.vehicles?.vehicle_models?.name}
                                    {r.vehicles?.plate ? ` · ${r.vehicles.plate}` : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingRes ? 'Editar Reserva' : 'Nueva Reserva'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Concesionario */}
            <div className="space-y-2">
              <Label>Concesionario *</Label>
              <Select value={fDealership} onValueChange={setFDealership}>
                <SelectTrigger><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                <SelectContent>
                  {dealerships.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name} — {d.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cliente search */}
            <div className="space-y-2">
              <Label>Cliente *</Label>
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
            </div>

            {/* Vehículo */}
            {fClientId && (
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

            {/* Fecha y Hora */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha *</Label>
                <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora *</Label>
                <Select value={fTime} onValueChange={setFTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => (
                      <SelectItem key={h} value={h}>{HOUR_LABELS[h]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Servicio */}
            <div className="space-y-2">
              <Label>Tipo de Servicio *</Label>
              <Select value={fService} onValueChange={v => { setFService(v); setCapacityWarning(''); setFNotes(''); }}>
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
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Descripción de la incidencia */}
            <div className="space-y-2">
              <Label>Descripción de la incidencia</Label>
              <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Describa la falla, desperfecto o tipo de servicio solicitado..." rows={3} />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Observaciones adicionales..." rows={2} />
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
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingRes ? 'Guardar' : 'Crear'}
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
                <p><span className="font-semibold">Cliente:</span> {completingRes.clients?.full_name || '-'}</p>
                <p><span className="font-semibold">Vehículo:</span> {completingRes.vehicles ? `${completingRes.vehicles.vehicle_models?.brand} ${completingRes.vehicles.vehicle_models?.name} ${completingRes.vehicles.year}` : '-'}</p>
                <p><span className="font-semibold">Placa:</span> {completingRes.vehicles?.plate || '-'}</p>
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
              <FileText className="w-4 h-4" /> Detalle de Reserva
            </DialogTitle>
          </DialogHeader>
          {detailRes && (
            <div className="space-y-4 py-1">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <Badge className={cn('text-xs px-2 py-0.5', STATUS_COLORS[detailRes.status] || 'bg-muted')}>
                  {STATUS_LABELS[detailRes.status] || detailRes.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(detailRes.reservation_date)} · {formatTime(detailRes.reservation_time)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {/* Client */}
                <div className="space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cliente</p>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{detailRes.clients?.full_name || '-'}</span>
                  </div>
                  {detailRes.clients?.cedula && <p className="text-xs text-muted-foreground pl-5">CI: {detailRes.clients.cedula}</p>}
                  {detailRes.clients?.phone && <p className="text-xs text-muted-foreground pl-5">{detailRes.clients.phone}</p>}
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
                    <span>{detailRes.vehicles?.vehicle_models?.brand} {detailRes.vehicles?.vehicle_models?.name} {detailRes.vehicles?.year}</span>
                  </div>
                  {detailRes.vehicles?.plate && <p className="text-xs text-muted-foreground pl-5">Placa: {detailRes.vehicles.plate}</p>}
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

              {/* Notes */}
              {detailRes.notes && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Notas de reserva</p>
                  <div className="flex gap-1.5">
                    <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs bg-muted rounded p-2 flex-1">{detailRes.notes}</p>
                  </div>
                </div>
              )}

              {/* Service notes */}
              {detailRes.service_notes && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Notas de servicio</p>
                  <div className="flex gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs bg-muted rounded p-2 flex-1">{detailRes.service_notes}</p>
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
            <AlertDialogTitle>¿Eliminar esta reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-semibold">{deleteTarget.clients?.full_name || '-'}</span>
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
