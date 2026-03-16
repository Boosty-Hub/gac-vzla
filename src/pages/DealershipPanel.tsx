import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, Plus, LogOut, ClipboardList, Search, CheckCircle, Car, User, AlertCircle, Users, Phone, Mail, ClipboardCheck, Clock, MapPin, Wrench, FileText, Shield, Hash, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { toast } from 'sonner';

interface Dealership {
  id: string;
  name: string;
  city: string | null;
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
  walkin_client_name: string | null;
  walkin_client_phone: string | null;
  walkin_plate: string | null;
  service_notes: string | null;
  completed_at: string | null;
  created_at: string;
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
  vehicles: { plate: string | null; year: number; vehicle_models: { name: string; brand: string } | null } | null;
}

interface Prospect {
  id: string;
  dealership_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  model_interest: string | null;
  source: string;
  status: string;
  notes: string | null;
  created_at: string;
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
  completed_at: string | null;
  dealerships: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const PROSPECT_SOURCES = [
  { value: 'concesionario', label: 'Concesionario' },
  { value: 'visita', label: 'Visita' },
  { value: 'evento', label: 'Evento' },
  { value: 'referido', label: 'Referido' },
  { value: 'pagina_web', label: 'Página Web' },
  { value: 'redes_sociales', label: 'Redes Sociales' },
];

const PROSPECT_STATUSES = [
  { value: 'nuevo', label: 'Nuevo', color: 'bg-blue-100 text-blue-800' },
  { value: 'contactado', label: 'Contactado', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'interesado', label: 'Interesado', color: 'bg-purple-100 text-purple-800' },
  { value: 'cotizado', label: 'Cotizado', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'negociacion', label: 'Negociación', color: 'bg-orange-100 text-orange-800' },
  { value: 'ganado', label: 'Ganado', color: 'bg-green-100 text-green-800' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-100 text-red-800' },
];

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
});

const DealershipPanel = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { salesperson: currentSalesperson, isSalesperson } = useCurrentSalesperson();

  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [selectedDealership, setSelectedDealership] = useState<string>('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [vehicleHistory, setVehicleHistory] = useState<HistoryRecord[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Complete dialog
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completingRes, setCompletingRes] = useState<Reservation | null>(null);
  const [serviceNotes, setServiceNotes] = useState('');
  const [completing, setCompleting] = useState(false);

  // Create reservation dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Plate search
  const [plateSearch, setPlateSearch] = useState('');
  const [plateResult, setPlateResult] = useState<PlateResult | null>(null);
  const [plateSearched, setPlateSearched] = useState(false);
  const [searchingPlate, setSearchingPlate] = useState(false);

  // Form fields
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('');
  const [fService, setFService] = useState('');
  const [fMileage, setFMileage] = useState('0');
  const [fNotes, setFNotes] = useState('');
  // Walk-in fields (when plate not found)
  const [fWalkinName, setFWalkinName] = useState('');
  const [fWalkinPhone, setFWalkinPhone] = useState('');

  // Reservations search/filter
  const [resSearch, setResSearch] = useState('');
  const [resStatusFilter, setResStatusFilter] = useState('todos');
  const [resServiceFilter, setResServiceFilter] = useState('todos');

  // Prospects
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(true);
  // Prospects search/filter
  const [prosSearch, setProsSearch] = useState('');
  const [prosStatusFilter, setProsStatusFilter] = useState('todos');
  const [prosSourceFilter, setProsSourceFilter] = useState('todos');
  const [prospectDialogOpen, setProspectDialogOpen] = useState(false);
  const [savingProspect, setSavingProspect] = useState(false);
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pModel, setPModel] = useState('');
  const [pSource, setPSource] = useState('concesionario');
  const [pStatus, setPStatus] = useState('nuevo');
  const [pNotes, setPNotes] = useState('');
  const [pEventName, setPEventName] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const fetchDealerships = async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, city')
      .eq('is_active', true)
      .order('name');
    if (data && data.length > 0) {
      setDealerships(data);
      setSelectedDealership(data[0].id);
    }
  };

  const fetchReservations = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    const { data } = await supabase
      .from('reservations')
      .select('*, clients(full_name, cedula, phone), vehicles(plate, year, vehicle_models(name, brand))')
      .eq('dealership_id', selectedDealership)
      .order('reservation_date', { ascending: false })
      .order('reservation_time', { ascending: false })
      .limit(200);
    setReservations((data || []) as Reservation[]);
    setLoading(false);
  };

  const fetchProspects = async (salespersonName?: string | null) => {
    if (!selectedDealership) return;
    setLoadingProspects(true);
    let query = supabase
      .from('prospects')
      .select('*')
      .eq('dealership_id', selectedDealership)
      .order('created_at', { ascending: false });

    // If a salesperson name is provided, filter by it
    if (salespersonName) {
      query = query.eq('salesperson', salespersonName);
    }

    const { data } = await query;
    setProspects((data || []) as Prospect[]);
    setLoadingProspects(false);
  };

  const fetchServiceTypes = async () => {
    const { data } = await supabase
      .from('service_types')
      .select('id, name, duration_minutes')
      .eq('is_active', true)
      .order('name');
    if (data) setServiceTypes(data);
  };

  useEffect(() => { fetchDealerships(); fetchServiceTypes(); }, []);
  useEffect(() => {
    if (selectedDealership) {
      fetchReservations();
      fetchProspects(isSalesperson ? currentSalesperson?.name : null);
    }
  }, [selectedDealership, currentSalesperson]);

  // Stats
  const pendientes = reservations.filter(r => r.status === 'pendiente').length;
  const enProceso = reservations.filter(r => r.status === 'en_proceso').length;
  const hoy = new Date().toISOString().split('T')[0];
  const reservasHoy = reservations.filter(r => r.reservation_date === hoy).length;

  // Filtered reservations
  const filteredReservations = reservations.filter(r => {
    if (resStatusFilter !== 'todos' && r.status !== resStatusFilter) return false;
    if (resServiceFilter !== 'todos' && r.service_type !== resServiceFilter) return false;
    if (resSearch.trim()) {
      const q = resSearch.toLowerCase();
      const client = (r.clients?.full_name || r.walkin_client_name || '').toLowerCase();
      const plate = (r.vehicles?.plate || r.walkin_plate || '').toLowerCase();
      if (!client.includes(q) && !plate.includes(q) && !r.reservation_date.includes(q)) return false;
    }
    return true;
  });

  // Filtered prospects
  const filteredProspects = prospects.filter(p => {
    if (prosStatusFilter !== 'todos' && p.status !== prosStatusFilter) return false;
    if (prosSourceFilter !== 'todos' && p.source !== prosSourceFilter) return false;
    if (prosSearch.trim()) {
      const q = prosSearch.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.phone || '').toLowerCase().includes(q) && !(p.email || '').toLowerCase().includes(q) && !(p.model_interest || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Plate search
  const handlePlateSearch = async () => {
    if (!plateSearch.trim()) return;
    setSearchingPlate(true);
    setPlateResult(null);
    setPlateSearched(true);

    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, year, color, client_id, vehicle_models(name, brand), clients(id, full_name, phone, cedula)')
      .ilike('plate', plateSearch.trim())
      .limit(1);

    if (data && data.length > 0) {
      setPlateResult(data[0] as any);
    }
    setSearchingPlate(false);
  };

  // Open create dialog
  const openCreate = () => {
    setPlateSearch('');
    setPlateResult(null);
    setPlateSearched(false);
    setFDate(hoy);
    setFTime('09:00');
    setFService('');
    setFMileage('0');
    setFNotes('');
    setFWalkinName('');
    setFWalkinPhone('');
    setCreateOpen(true);
  };

  // Save reservation
  const handleSave = async () => {
    if (!fDate || !fTime || !fService) {
      toast.error('Fecha, hora y servicio son requeridos');
      return;
    }
    if (!plateResult && !fWalkinName.trim()) {
      toast.error('Ingrese el nombre del cliente');
      return;
    }
    setSaving(true);

    const payload: any = {
      dealership_id: selectedDealership,
      reservation_date: fDate,
      reservation_time: fTime,
      service_type: fService,
      current_mileage: parseInt(fMileage) || 0,
      status: 'pendiente',
      notes: fNotes.trim() || null,
    };

    if (plateResult) {
      payload.vehicle_id = plateResult.id;
      payload.client_id = plateResult.client_id;
    } else {
      payload.walkin_client_name = fWalkinName.trim();
      payload.walkin_client_phone = fWalkinPhone.trim() || null;
      payload.walkin_plate = plateSearch.trim().toUpperCase() || null;
    }

    const { error } = await supabase.from('reservations').insert(payload);
    if (error) {
      toast.error('Error al crear reserva');
      console.error(error);
    } else {
      toast.success('Reserva creada exitosamente');
      setCreateOpen(false);
      fetchReservations();
    }
    setSaving(false);
  };

  // Update status
  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { toast.success('Estado actualizado'); fetchReservations(); }
  };

  const openDetail = async (r: Reservation) => {
    setDetailRes(r);
    setVehicleDetail(null);
    setVehicleHistory([]);
    setDetailOpen(true);

    if (r.vehicle_id) {
      setLoadingDetail(true);
      const { data: veh } = await supabase
        .from('vehicles')
        .select('id, plate, year, color, vin, mileage, warranty_active, vehicle_models(name, brand), clients(full_name, cedula, phone)')
        .eq('id', r.vehicle_id)
        .single();
      if (veh) setVehicleDetail(veh as unknown as VehicleDetail);

      const { data: history } = await supabase
        .from('reservations')
        .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, service_notes, completed_at, dealerships(name)')
        .eq('vehicle_id', r.vehicle_id)
        .neq('id', r.id)
        .order('reservation_date', { ascending: false })
        .order('reservation_time', { ascending: false })
        .limit(50);
      setVehicleHistory((history || []) as HistoryRecord[]);
      setLoadingDetail(false);
    }
  };

  const openCompleteDialog = (r: Reservation) => {
    setCompletingRes(r);
    setServiceNotes(r.service_notes || '');
    setCompleteOpen(true);
  };

  const handleCompleteService = async () => {
    if (!completingRes) return;
    if (!serviceNotes.trim()) { toast.error('Describe lo que se realizó en el servicio'); return; }
    setCompleting(true);
    const { error } = await supabase.from('reservations').update({
      status: 'completada',
      service_notes: serviceNotes.trim(),
      completed_at: new Date().toISOString(),
    }).eq('id', completingRes.id);
    if (error) { toast.error('Error al completar'); console.error(error); }
    else { toast.success('Servicio completado'); setCompleteOpen(false); fetchReservations(); }
    setCompleting(false);
  };

  // Prospects CRUD
  const openProspectDialog = () => {
    setPName(''); setPPhone(''); setPEmail(''); setPModel('');
    setPSource('concesionario'); setPStatus('nuevo'); setPNotes('');
    setPEventName('');
    setProspectDialogOpen(true);
  };

  const handleSaveProspect = async () => {
    if (!pName.trim()) { toast.error('El nombre es requerido'); return; }
    setSavingProspect(true);
    const { error } = await supabase.from('prospects').insert({
      dealership_id: selectedDealership,
      name: pName.trim(),
      phone: pPhone.trim() || null,
      email: pEmail.trim() || null,
      model_interest: pModel.trim() || null,
      source: pSource,
      status: pStatus,
      notes: pNotes.trim() || null,
      event_name: pSource === 'evento' ? (pEventName.trim() || null) : null,
    });
    if (error) { toast.error('Error al crear prospecto'); console.error(error); }
    else { toast.success('Prospecto creado'); setProspectDialogOpen(false); fetchProspects(); }
    setSavingProspect(false);
  };

  const updateProspectStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('prospects').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { fetchProspects(); }
  };

  const currentDealership = dealerships.find(d => d.id === selectedDealership);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gac-charcoal text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight">
              {currentDealership?.name || 'Panel Concesionario'}
            </h1>
            <p className="text-xs text-gac-silver">Panel del Concesionario</p>
          </div>
          {dealerships.length > 1 && (
            <Select value={selectedDealership} onValueChange={setSelectedDealership}>
              <SelectTrigger className="w-[200px] h-8 text-xs bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dealerships.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button variant="ghost" size="sm" className="text-gac-silver hover:text-primary-foreground" onClick={handleSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Salir
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="gac-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-primary"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{reservations.length}</p>
                <p className="text-xs text-muted-foreground">Total Reservas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="gac-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-blue-600"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{reservasHoy}</p>
                <p className="text-xs text-muted-foreground">Hoy</p>
              </div>
            </CardContent>
          </Card>
          <Card className="gac-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-yellow-600"><ClipboardList className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{pendientes}</p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="gac-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-purple-600"><ClipboardList className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{enProceso}</p>
                <p className="text-xs text-muted-foreground">En Proceso</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="reservas" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="reservas">Reservas ({reservations.length})</TabsTrigger>
            <TabsTrigger value="prospectos">Prospectos ({prospects.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="reservas" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold">Reservas</h2>
              <Button size="sm" onClick={openCreate} className="gac-gradient">
                <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Reserva
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Buscar cliente, placa, fecha..." className="pl-8 h-8 text-xs" value={resSearch} onChange={e => setResSearch(e.target.value)} />
              </div>
              <Select value={resStatusFilter} onValueChange={setResStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={resServiceFilter} onValueChange={setResServiceFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Servicio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los servicios</SelectItem>
                  {serviceTypes.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
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
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vehículo / Placa</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Km</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map(r => {
                      const clientName = r.clients?.full_name || r.walkin_client_name || '-';
                      const vehicleInfo = r.vehicles
                        ? `${r.vehicles.vehicle_models?.brand || ''} ${r.vehicles.vehicle_models?.name || ''} ${r.vehicles.year}`
                        : r.walkin_plate || '-';
                      const plate = r.vehicles?.plate || r.walkin_plate || '-';
                      const st = STATUS_CONFIG[r.status] || STATUS_CONFIG.pendiente;

                      return (
                        <TableRow key={r.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                          <TableCell className="font-medium">{r.reservation_date}</TableCell>
                          <TableCell>{r.reservation_time?.slice(0, 5)}</TableCell>
                          <TableCell>
                            <div>{clientName}</div>
                            {!r.clients && r.walkin_client_phone && (
                              <span className="text-[10px] text-muted-foreground">{r.walkin_client_phone}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>{vehicleInfo}</div>
                            <span className="text-[10px] text-muted-foreground">{plate}</span>
                          </TableCell>
                          <TableCell>{r.service_type}</TableCell>
                          <TableCell>{r.current_mileage.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[10px] px-1.5 py-0", st.color)}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.status === 'pendiente' && (
                                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'confirmada'); }}>
                                  Confirmar
                                </Button>
                              )}
                              {r.status === 'confirmada' && (
                                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'en_proceso'); }}>
                                  Iniciar
                                </Button>
                              )}
                              {r.status === 'en_proceso' && (
                                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 gap-1" onClick={(e) => { e.stopPropagation(); openCompleteDialog(r); }}>
                                  <ClipboardCheck className="w-3 h-3" /> Completar
                                </Button>
                              )}
                              {(r.status === 'pendiente' || r.status === 'confirmada') && (
                                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-destructive" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'cancelada'); }}>
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="prospectos" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold">Prospectos</h2>
              <Button size="sm" onClick={openProspectDialog} className="gac-gradient">
                <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo Prospecto
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Buscar nombre, teléfono, email, modelo..." className="pl-8 h-8 text-xs" value={prosSearch} onChange={e => setProsSearch(e.target.value)} />
              </div>
              <Select value={prosStatusFilter} onValueChange={setProsStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  {PROSPECT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={prosSourceFilter} onValueChange={setProsSourceFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Fuente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las fuentes</SelectItem>
                  {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card className="gac-shadow">
              {loadingProspects ? (
                <CardContent className="p-8 text-center">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Cargando prospectos...</p>
                </CardContent>
              ) : filteredProspects.length === 0 ? (
                <CardContent className="p-8 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No hay prospectos</p>
                </CardContent>
              ) : (
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                      <TableHead>Nombre</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProspects.map(p => {
                      const st = PROSPECT_STATUSES.find(s => s.value === p.status) || PROSPECT_STATUSES[0];
                      const src = PROSPECT_SOURCES.find(s => s.value === p.source);
                      return (
                        <TableRow key={p.id} className="[&>td]:py-1.5">
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            {p.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{p.phone}</div>}
                            {p.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{p.email}</div>}
                          </TableCell>
                          <TableCell>{p.model_interest || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{src?.label || p.source}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select value={p.status} onValueChange={v => updateProspectStatus(p.id, v)}>
                              <SelectTrigger className="h-6 w-[110px] text-[10px] px-1.5 py-0 border-0 bg-transparent">
                                <Badge className={cn("text-[10px] px-1.5 py-0", st.color)}>{st.label}</Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {PROSPECT_STATUSES.map(s => (
                                  <SelectItem key={s.value} value={s.value}>
                                    <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString('es-VE')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* PROSPECT DIALOG */}
      <Dialog open={prospectDialogOpen} onOpenChange={setProspectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Nuevo Prospecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Nombre *</Label>
                <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="Nombre completo" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input value={pPhone} onChange={e => setPPhone(e.target.value)} placeholder="+58 412 1234567" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="correo@ejemplo.com" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modelo de interés</Label>
                <Input value={pModel} onChange={e => setPModel(e.target.value)} placeholder="Ej: GS8, Emkoo" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de contacto</Label>
                <Select value={pSource} onValueChange={v => { setPSource(v); if (v !== 'evento') setPEventName(''); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {pSource === 'evento' && (
                <div className="space-y-1">
                  <Label className="text-xs">Nombre de evento</Label>
                  <Input value={pEventName} onChange={e => setPEventName(e.target.value)} placeholder="Ej: Expo Auto 2026" className="h-8 text-xs" />
                </div>
              )}
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Estado</Label>
                <Select value={pStatus} onValueChange={setPStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROSPECT_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea value={pNotes} onChange={e => setPNotes(e.target.value)} rows={2} className="text-xs" placeholder="Observaciones..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProspectDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveProspect} disabled={savingProspect} className="gac-gradient">
              {savingProspect ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Prospecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Detalle de Cita
            </DialogTitle>
          </DialogHeader>
          {detailRes && (() => {
            const st = STATUS_CONFIG[detailRes.status] || STATUS_CONFIG.pendiente;
            const clientName = detailRes.clients?.full_name || detailRes.walkin_client_name || '-';
            return (
              <Tabs defaultValue="cita" className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="cita" className="text-xs">Cita</TabsTrigger>
                  <TabsTrigger value="vehiculo" className="text-xs">Vehículo</TabsTrigger>
                  <TabsTrigger value="historial" className="text-xs">Historial ({vehicleHistory.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="cita" className="space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <Badge className={cn("text-xs px-2 py-0.5", st.color)}>{st.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">{detailRes.created_at ? new Date(detailRes.created_at).toLocaleDateString('es-VE') : ''}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{clientName}</span>
                      {detailRes.clients?.cedula && <span className="text-muted-foreground">· {detailRes.clients.cedula}</span>}
                      {detailRes.clients?.phone && <span className="text-muted-foreground">· {detailRes.clients.phone}</span>}
                    </div>
                    {!detailRes.clients && detailRes.walkin_client_phone && (
                      <div className="flex items-center gap-2 text-muted-foreground"><span>Tel: {detailRes.walkin_client_phone}</span></div>
                    )}
                    <div className="flex items-center gap-2"><Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>{detailRes.vehicles ? `${detailRes.vehicles.vehicle_models?.brand} ${detailRes.vehicles.vehicle_models?.name} ${detailRes.vehicles.year}` : detailRes.walkin_plate || '-'}</span>
                      <span className="text-muted-foreground">{detailRes.vehicles?.plate || detailRes.walkin_plate || ''}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.reservation_date}</span></div>
                    <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.reservation_time?.slice(0, 5)}</span></div>
                    <div className="flex items-center gap-2"><Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.service_type}</span></div>
                    <div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>{detailRes.current_mileage.toLocaleString()} km</span></div>
                  </div>
                  {detailRes.notes && (
                    <div className="bg-muted/50 rounded-md p-2.5 text-xs">
                      <p className="font-semibold mb-1">Notas</p>
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
                  <div className="flex justify-end gap-2 pt-2">
                    {detailRes.status === 'pendiente' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'confirmada'); }}>Confirmar</Button>}
                    {detailRes.status === 'confirmada' && <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'en_proceso'); }}>Iniciar</Button>}
                    {detailRes.status === 'en_proceso' && <Button size="sm" className="text-xs gac-gradient gap-1" onClick={() => { setDetailOpen(false); openCompleteDialog(detailRes); }}><ClipboardCheck className="w-3 h-3" /> Completar</Button>}
                    {(detailRes.status === 'pendiente' || detailRes.status === 'confirmada') && <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => { setDetailOpen(false); updateStatus(detailRes.id, 'cancelada'); }}>Cancelar</Button>}
                  </div>
                </TabsContent>

                <TabsContent value="vehiculo" className="space-y-3 mt-3">
                  {loadingDetail ? (
                    <div className="text-center py-6">
                      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Cargando datos del vehículo...</p>
                    </div>
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
                      {vehicleDetail.vin && (
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2 text-xs"><FileText className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-[10px] text-muted-foreground">VIN</p><p className="font-mono font-medium text-[11px]">{vehicleDetail.vin}</p></div></div>
                      )}
                      <Separator />
                      <div className="text-xs">
                        <p className="font-semibold mb-1">Propietario</p>
                        <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground" /><span>{vehicleDetail.clients?.full_name || '-'}</span></div>
                        {vehicleDetail.clients?.cedula && <p className="text-muted-foreground ml-5.5">CI: {vehicleDetail.clients.cedula}</p>}
                        {vehicleDetail.clients?.phone && <p className="text-muted-foreground ml-5.5">Tel: {vehicleDetail.clients.phone}</p>}
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
                    <div className="text-center py-6">
                      <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Cargando historial...</p>
                    </div>
                  ) : !detailRes.vehicle_id ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Sin historial (cliente walk-in)</p>
                    </div>
                  ) : vehicleHistory.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>Este vehículo no tiene servicios previos</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{vehicleHistory.length} servicio(s) previo(s)</p>
                      {vehicleHistory.map(h => {
                        const hst = STATUS_CONFIG[h.status] || STATUS_CONFIG.pendiente;
                        return (
                          <div key={h.id} className="border rounded-md p-2.5 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{h.service_type}</span>
                              <Badge className={cn("text-[10px] px-1.5 py-0", hst.color)}>{hst.label}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{h.reservation_date}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{h.reservation_time?.slice(0, 5)}</span>
                              <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{h.current_mileage.toLocaleString()} km</span>
                            </div>
                            {h.dealerships && (
                              <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{h.dealerships.name}</div>
                            )}
                            {h.notes && <p className="text-muted-foreground bg-muted/40 rounded p-1.5"><span className="font-medium text-foreground">Notas:</span> {h.notes}</p>}
                            {h.service_notes && (
                              <div className="bg-green-50 border border-green-200 rounded p-1.5">
                                <p className="font-medium text-green-800 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Trabajo realizado:</p>
                                <p className="text-green-700 whitespace-pre-wrap">{h.service_notes}</p>
                                {h.completed_at && <p className="text-green-600 text-[10px] mt-1">Completado: {new Date(h.completed_at).toLocaleString('es-VE')}</p>}
                              </div>
                            )}
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
                <p><span className="font-semibold">Vehículo:</span> {completingRes.vehicles ? `${completingRes.vehicles.vehicle_models?.brand} ${completingRes.vehicles.vehicle_models?.name} ${completingRes.vehicles.year}` : completingRes.walkin_plate || '-'}</p>
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
            <Button onClick={handleCompleteService} disabled={completing} className="gac-gradient">
              {completing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Marcar como Completado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE RESERVATION DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Nueva Reserva</DialogTitle>
          </DialogHeader>

          {/* Step 1: Plate search */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold">Buscar por placa</Label>
            <div className="flex gap-2">
              <Input
                value={plateSearch}
                onChange={e => { setPlateSearch(e.target.value.toUpperCase()); setPlateSearched(false); setPlateResult(null); }}
                placeholder="Ej: ABC123"
                className="h-8 text-xs uppercase"
                onKeyDown={e => e.key === 'Enter' && handlePlateSearch()}
              />
              <Button size="sm" variant="outline" onClick={handlePlateSearch} disabled={searchingPlate || !plateSearch.trim()}>
                <Search className="w-3.5 h-3.5 mr-1" /> Buscar
              </Button>
            </div>

            {/* Plate result */}
            {plateSearched && (
              <div className={cn(
                "rounded-md border p-3",
                plateResult ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
              )}>
                {plateResult ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-green-800">Vehículo encontrado</p>
                      <div className="flex items-center gap-2">
                        <Car className="w-3 h-3" />
                        <span>{plateResult.vehicle_models?.brand} {plateResult.vehicle_models?.name} {plateResult.year}</span>
                        {plateResult.color && <span className="text-muted-foreground">· {plateResult.color}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <span>{plateResult.clients?.full_name}</span>
                        {plateResult.clients?.cedula && <span className="text-muted-foreground">· {plateResult.clients.cedula}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-amber-800">Placa no encontrada</p>
                      <p className="text-amber-700">Puede crear la reserva ingresando los datos del cliente manualmente.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Walk-in fields (only if plate not found) */}
          {plateSearched && !plateResult && (
            <div className="space-y-3">
              <Label className="text-xs font-semibold">Datos del cliente</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={fWalkinName} onChange={e => setFWalkinName(e.target.value)} placeholder="Nombre del cliente" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={fWalkinPhone} onChange={e => setFWalkinPhone(e.target.value)} placeholder="+58 412 1234567" className="h-8 text-xs" />
                </div>
              </div>
            </div>
          )}

          {/* Reservation details */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold">Detalles de la cita</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fecha *</Label>
                <Input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hora *</Label>
                <Select value={fTime} onValueChange={setFTime}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Servicio *</Label>
                <Select value={fService} onValueChange={setFService}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kilometraje</Label>
                <Input type="number" value={fMileage} onChange={e => setFMileage(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} className="text-xs" placeholder="Observaciones adicionales..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipPanel;
