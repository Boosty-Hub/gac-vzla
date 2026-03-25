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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Search, CalendarDays, LayoutGrid, List, ChevronLeft, ChevronRight, Plus, Pencil, AlertCircle, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildWhatsAppReservationUrl } from '@/lib/whatsapp';

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
  dealerships: { id: string; name: string; city: string | null } | null;
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
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


const AdminReservas = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('reservas.create');
  const canEdit = hasPermission('reservas.edit');
  const [view, setView] = useState<'table' | 'matrix'>('table');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [capacityWarning, setCapacityWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroConc, setFiltroConc] = useState('todos');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  // CRUD dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);

  // Form
  const [fDealership, setFDealership] = useState('');
  const [fClientSearch, setFClientSearch] = useState('');
  const [fClientId, setFClientId] = useState('');
  const [fVehicleId, setFVehicleId] = useState('');
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('08:00');
  const [fService, setFService] = useState('');
  const [fMileage, setFMileage] = useState('0');
  const [fStatus, setFStatus] = useState('pendiente');
  const [fNotes, setFNotes] = useState('');

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
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setServiceTypes(data);
  };

  const fetchReservations = async () => {
    setLoading(true);
    let query = supabase
      .from('reservations')
      .select('*, dealerships(id, name, city), clients(full_name, cedula, phone), vehicles(plate, year, vehicle_models(name, brand))');

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

  // Client search with debounce (by name, cedula, or vehicle plate)
  useEffect(() => {
    if (fClientSearch.trim().length < 2) { setClientResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      // Search by name or cedula
      const { data: directClients } = await supabase
        .from('clients')
        .select('id, full_name, cedula')
        .or(`full_name.ilike.%${fClientSearch}%,cedula.ilike.%${fClientSearch}%`)
        .limit(10);

      // Search by vehicle plate
      const { data: vehicleMatches } = await supabase
        .from('vehicles')
        .select('client_id, plate, clients(id, full_name, cedula)')
        .ilike('plate', `%${fClientSearch}%`)
        .limit(10);

      const results = new Map<string, ClientOption>();
      (directClients || []).forEach(c => results.set(c.id, c));
      (vehicleMatches || []).forEach((v: any) => {
        if (v.clients) results.set(v.clients.id, v.clients);
      });

      setClientResults(Array.from(results.values()));
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
    setFService(''); setFMileage('0'); setFStatus('pendiente'); setFNotes('');
    setClientResults([]); setClientVehicles([]);
    setCapacityWarning('');
    setDialogOpen(true);
  };

  const openEdit = (r: Reservation) => {
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
    setFNotes(r.notes || '');
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
      notes: fNotes.trim() || null,
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

  const filteredReservations = reservations.filter(r => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      (r.clients?.full_name || '').toLowerCase().includes(q) ||
      (r.vehicles?.plate || '').toLowerCase().includes(q) ||
      r.service_type.toLowerCase().includes(q)
    );
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Reservas</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <CalendarDays className="w-3 h-3" /> {reservations.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as 'table' | 'matrix')}>
            <TabsList className="h-8">
              <TabsTrigger value="table" className="gap-1 text-xs h-7"><List className="w-3.5 h-3.5" /> Tabla</TabsTrigger>
              <TabsTrigger value="matrix" className="gap-1 text-xs h-7"><LayoutGrid className="w-3.5 h-3.5" /> Matriz</TabsTrigger>
            </TabsList>
          </Tabs>
          {canCreate && (
            <Button size="sm" onClick={openCreate} className="gac-gradient">
              <Plus className="w-3.5 h-3.5 mr-1" /> Nueva
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {view === 'table' && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar cliente, placa o servicio..." className="pl-8 h-8 text-xs" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        )}
        {view === 'matrix' && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeDate(-1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="h-8 text-xs w-[140px]"
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeDate(1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs font-medium ml-1">{formatDate(selectedDate)}</span>
          </div>
        )}
        <Select value={filtroConc} onValueChange={setFiltroConc}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los concesionarios</SelectItem>
            {dealerships.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <Card className="gac-shadow">
          {loading ? (
            <CardContent className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando reservas...</p>
            </CardContent>
          ) : filteredReservations.length === 0 ? (
            <CardContent className="p-8 text-center">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay reservas registradas</p>
            </CardContent>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead>Fecha / Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Concesionario</TableHead>
                  <TableHead>Km</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acc.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.map(r => (
                  <TableRow key={r.id} className="[&>td]:py-1.5">
                    <TableCell className="font-medium">
                      {formatDate(r.reservation_date)}
                      <br />
                      <span className="text-muted-foreground">{formatTime(r.reservation_time)}</span>
                    </TableCell>
                    <TableCell>{r.clients?.full_name || '-'}</TableCell>
                    <TableCell>
                      {r.vehicles?.vehicle_models?.brand} {r.vehicles?.vehicle_models?.name} {r.vehicles?.year}
                      <br />
                      <span className="text-muted-foreground">{r.vehicles?.plate || '-'}</span>
                    </TableCell>
                    <TableCell>{r.service_type}</TableCell>
                    <TableCell>{r.dealerships?.name || '-'}</TableCell>
                    <TableCell>{r.current_mileage.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[r.status] || 'bg-muted')}>
                        {STATUS_LABELS[r.status] || r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
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
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600 hover:text-green-700" asChild>
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp de confirmación">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          ) : null;
                        })()}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(r)}>
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
              <Select value={fService} onValueChange={v => { setFService(v); setCapacityWarning(''); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.map(s => (
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

            {/* Notas */}
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Observaciones adicionales..." rows={2} />
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
    </div>
  );
};

export default AdminReservas;
