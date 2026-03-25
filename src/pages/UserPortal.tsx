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
import { MapPin, Phone, Clock, Car, CalendarDays, Check, ArrowLeft, User, LogOut, Mail, IdCard, Building } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
  vehicle_models: { name: string; brand: string } | null;
}

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  address: string | null;
}

interface Reservation {
  id: string;
  reservation_date: string;
  reservation_time: string;
  service_type: string;
  current_mileage: number;
  status: string;
  notes: string | null;
  dealerships: { name: string } | null;
  vehicles: { plate: string; year: number; vehicle_models: { name: string; brand: string } | null } | null;
}

const SERVICE_TYPES = [
  'Mantenimiento Preventivo', 'Mantenimiento Correctivo', 'Revisión General',
  'Cambio de Aceite', 'Alineación y Balanceo', 'Diagnóstico', 'Garantía', 'Otro',
];

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
}).filter(t => t !== '12:00' && t !== '12:30');

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmada: { label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  completada: { label: 'Completada', color: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
};

const UserPortal = () => {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Views
  const [vista, setVista] = useState<'inicio' | 'reservar' | 'mis-reservas' | 'perfil'>('inicio');

  // Reservation flow
  const [paso, setPaso] = useState(1);
  const [reservaConfirmada, setReservaConfirmada] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDealership, setSelectedDealership] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
    finally { navigate('/login'); }
  };

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
          .select('id, plate, year, color, mileage, vin, warranty_active, vehicle_models(name, brand)')
          .eq('client_id', clientId)
          .eq('is_active', true)
          .order('year', { ascending: false });
        setVehicles((vehs || []) as Vehicle[]);

        // Fetch reservations for this client
        const { data: res } = await supabase
          .from('reservations')
          .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, dealerships(name), vehicles(plate, year, vehicle_models(name, brand))')
          .eq('client_id', clientId)
          .order('reservation_date', { ascending: false })
          .limit(50);
        setReservations((res || []) as Reservation[]);
      }

      // Fetch dealerships
      const { data: deals } = await supabase
        .from('dealerships')
        .select('id, name, city, state, phone, address')
        .eq('is_active', true)
        .order('name');
      setDealerships((deals || []) as Dealership[]);

      setLoading(false);
    };
    load();
  }, [user]);

  const iniciarReserva = (dealershipId: string) => {
    setSelectedDealership(dealershipId);
    setSelectedVehicle('');
    setSelectedService('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setMileage('');
    setNotes('');
    setReservaConfirmada(false);
    setPaso(1);
    setVista('reservar');
  };

  const confirmarReserva = async () => {
    if (!clientData || !selectedVehicle || !selectedDealership || !selectedDate || !selectedTime || !selectedService) return;
    setSaving(true);
    const { error } = await supabase.from('reservations').insert({
      dealership_id: selectedDealership,
      client_id: clientData.id,
      vehicle_id: selectedVehicle,
      reservation_date: format(selectedDate, 'yyyy-MM-dd'),
      reservation_time: selectedTime,
      service_type: selectedService,
      current_mileage: parseInt(mileage) || 0,
      status: 'pendiente',
      notes: notes.trim() || null,
    });
    if (error) { toast.error('Error al crear reserva'); console.error(error); }
    else {
      setReservaConfirmada(true);
      setPaso(4);
      // Refresh reservations
      const { data: res } = await supabase
        .from('reservations')
        .select('id, reservation_date, reservation_time, service_type, current_mileage, status, notes, dealerships(name), vehicles(plate, year, vehicle_models(name, brand))')
        .eq('client_id', clientData.id)
        .order('reservation_date', { ascending: false })
        .limit(50);
      setReservations((res || []) as Reservation[]);
    }
    setSaving(false);
  };

  const volverInicio = () => {
    setVista('inicio');
    setReservaConfirmada(false);
    setPaso(1);
  };

  const selectedDealershipData = dealerships.find(d => d.id === selectedDealership);
  const selectedVehicleData = vehicles.find(v => v.id === selectedVehicle);

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
      <header className="sticky top-0 z-50 gac-gradient px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {vista !== 'inicio' && (
            <button onClick={volverInicio} className="text-primary-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-display font-bold text-primary-foreground tracking-tight">GAC Motor</h1>
            <p className="text-xs text-primary-foreground/70">
              {clientData ? clientData.full_name : profile?.full_name || 'Portal Cliente'}
            </p>
          </div>
        </div>
        <button onClick={handleSignOut} className="p-2 rounded-lg text-primary-foreground/70 hover:bg-white/10">
          <LogOut className="w-5 h-5 text-primary-foreground" />
        </button>
      </header>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t z-50 flex">
        {[
          { id: 'inicio' as const, label: 'Agendar', icon: MapPin },
          { id: 'mis-reservas' as const, label: 'Mis Citas', icon: CalendarDays },
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
        {vista === 'inicio' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-display font-bold">Agendar Servicio</h2>
              <p className="text-sm text-muted-foreground">Selecciona un concesionario</p>
            </div>

            {vehicles.length === 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4 text-xs text-amber-800">
                  <p className="font-semibold">No tienes vehículos registrados</p>
                  <p>Contacta a tu concesionario para vincular tus vehículos.</p>
                </CardContent>
              </Card>
            )}

            {dealerships.map(d => (
              <Card key={d.id} className="overflow-hidden gac-shadow hover:gac-shadow-lg transition-shadow cursor-pointer" onClick={() => vehicles.length > 0 && iniciarReserva(d.id)}>
                <div className="h-24 bg-gac-charcoal flex items-center justify-center">
                  <Car className="w-10 h-10 text-gac-silver" />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-base">{d.name}</h3>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {d.city && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-primary shrink-0" />{d.city}{d.state ? `, ${d.state}` : ''}</div>}
                    {d.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-primary shrink-0" />{d.phone}</div>}
                  </div>
                  <Button className="w-full mt-3 gac-gradient text-primary-foreground" size="sm" disabled={vehicles.length === 0}>
                    Agendar Servicio
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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
                <div>
                  <Label>Vehículo</Label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona tu vehículo" /></SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year} - {v.plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Servicio</Label>
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona el servicio" /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kilometraje Actual</Label>
                  <Input className="mt-1" type="number" placeholder="Ej: 20000" value={mileage} onChange={e => setMileage(e.target.value)} />
                </div>
                <Button className="w-full gac-gradient text-primary-foreground" disabled={!selectedVehicle || !selectedService || !mileage} onClick={() => setPaso(2)}>
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
                      onSelect={setSelectedDate}
                      locale={es}
                      disabled={(date) => date < new Date() || date.getDay() === 0}
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
                    <div className="grid grid-cols-4 gap-2">
                      {TIME_SLOTS.map(h => (
                        <button
                          key={h}
                          onClick={() => setSelectedTime(h)}
                          className={cn(
                            "py-2 px-1 text-sm rounded-lg border transition-all font-medium",
                            selectedTime === h ? "gac-gradient text-primary-foreground border-transparent" : "hover:border-primary"
                          )}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
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
                <div>
                  <Label>Notas adicionales (opcional)</Label>
                  <Textarea className="mt-1" placeholder="Describe cualquier detalle adicional..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>
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
                  <Card key={r.id} className="gac-shadow">
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
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Perfil */}
        {vista === 'perfil' && (
          <div className="space-y-4">
            <h2 className="text-xl font-display font-bold">Mi Perfil</h2>

            {/* Client info */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">{clientData?.full_name || profile?.full_name || 'Sin nombre'}</h3>
                  <p className="text-sm text-muted-foreground">{clientData?.email || profile?.email}</p>
                </div>
                {clientData && (
                  <div className="space-y-2 pt-2 border-t text-sm">
                    {clientData.cedula && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IdCard className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{clientData.cedula}</span>
                      </div>
                    )}
                    {clientData.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{clientData.phone}</span>
                      </div>
                    )}
                    {clientData.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{clientData.email}</span>
                      </div>
                    )}
                    {(clientData.city || clientData.state) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{[clientData.city, clientData.state].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {clientData.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{clientData.address}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vehicles */}
            <Card className="gac-shadow">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Mis Vehículos ({vehicles.length})</h3>
                {vehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes vehículos registrados</p>
                ) : (
                  vehicles.map(v => (
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
                      {v.warranty_active && (
                        <Badge className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0">Garantía</Badge>
                      )}
                    </div>
                  ))
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
