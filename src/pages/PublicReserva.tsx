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
import { Separator } from '@/components/ui/separator';
import { Car, Search, MapPin, Phone, Clock, CalendarDays, Check, ArrowLeft, Wrench, Hash, ShieldCheck, ShieldX, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VehicleResult {
  id: string;
  plate: string;
  year: number;
  color: string | null;
  mileage: number;
  vin: string | null;
  warranty_active: boolean;
  vehicle_models: { name: string; brand: string } | null;
  clients: { id: string; full_name: string; phone: string | null; email: string | null } | null;
}

interface Dealership {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  address: string | null;
}

interface ServiceType {
  id: number;
  name: string;
  duration_minutes: number;
}

const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
});

const PublicReserva = () => {
  // Step management
  const [step, setStep] = useState<'plate' | 'form' | 'confirm' | 'success'>('plate');

  // Plate search
  const [plate, setPlate] = useState('');
  const [searching, setSearching] = useState(false);
  const [plateError, setPlateError] = useState('');
  const [vehicle, setVehicle] = useState<VehicleResult | null>(null);

  // Form data
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [selectedDealership, setSelectedDealership] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const searchPlate = async () => {
    const cleanPlate = plate.trim().toUpperCase();
    if (!cleanPlate) { setPlateError('Ingrese una placa'); return; }
    setSearching(true);
    setPlateError('');

    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate, year, color, mileage, vin, warranty_active, vehicle_models(name, brand), clients(id, full_name, phone, email)')
      .ilike('plate', cleanPlate)
      .eq('is_active', true)
      .limit(1);

    if (error) {
      console.error(error);
      setPlateError('Error al buscar. Intente de nuevo.');
    } else if (!data || data.length === 0) {
      setPlateError('No se encontró un vehículo con esta placa. Verifique e intente de nuevo.');
    } else {
      setVehicle(data[0] as VehicleResult);
      // Load dealerships and service types
      const [{ data: deals }, { data: stData }] = await Promise.all([
        supabase.from('dealerships').select('id, name, city, state, phone, address').eq('is_active', true).order('name'),
        supabase.from('service_types').select('id, name, duration_minutes').eq('is_active', true).order('name'),
      ]);
      setDealerships((deals || []) as Dealership[]);
      setServiceTypes((stData || []) as ServiceType[]);
      setMileage(String(data[0].mileage || ''));
      setStep('form');
    }
    setSearching(false);
  };

  const handleConfirm = () => {
    if (!selectedDealership) { toast.error('Seleccione un concesionario'); return; }
    if (!selectedService) { toast.error('Seleccione un tipo de servicio'); return; }
    if (!selectedDate) { toast.error('Seleccione una fecha'); return; }
    if (!selectedTime) { toast.error('Seleccione una hora'); return; }
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!vehicle) return;
    setSaving(true);

    const { error } = await supabase.from('reservations').insert({
      dealership_id: selectedDealership,
      client_id: vehicle.clients?.id || null,
      vehicle_id: vehicle.id,
      reservation_date: format(selectedDate!, 'yyyy-MM-dd'),
      reservation_time: selectedTime,
      service_type: selectedService,
      current_mileage: parseInt(mileage) || 0,
      status: 'pendiente',
      notes: notes.trim() || null,
    });

    if (error) {
      toast.error('Error al crear la reserva. Intente de nuevo.');
      console.error(error);
    } else {
      setStep('success');
    }
    setSaving(false);
  };

  const reset = () => {
    setStep('plate');
    setPlate('');
    setPlateError('');
    setVehicle(null);
    setSelectedDealership('');
    setSelectedService('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setMileage('');
    setNotes('');
  };

  const selectedDealershipData = dealerships.find(d => d.id === selectedDealership);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="gac-gradient px-4 py-4 text-center">
        <h1 className="text-xl font-display font-bold text-primary-foreground tracking-tight">GAC Motor Venezuela</h1>
        <p className="text-xs text-primary-foreground/70">Agenda tu cita de servicio</p>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">

        {/* STEP 1: Plate Search */}
        {step === 'plate' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Car className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-lg font-display font-bold">Reserva tu Cita</h2>
              <p className="text-sm text-muted-foreground">Ingresa la placa de tu vehículo para comenzar</p>
            </div>

            <Card className="gac-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Placa del Vehículo</Label>
                  <div className="flex gap-2">
                    <Input
                      value={plate}
                      onChange={e => { setPlate(e.target.value.toUpperCase()); setPlateError(''); }}
                      placeholder="Ej: ABC123"
                      className="h-12 text-lg font-mono font-bold text-center tracking-widest uppercase"
                      onKeyDown={e => e.key === 'Enter' && searchPlate()}
                      maxLength={10}
                    />
                    <Button onClick={searchPlate} disabled={searching} className="h-12 px-6 gac-gradient">
                      {searching ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                  {plateError && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-md p-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{plateError}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <p className="text-[10px] text-center text-muted-foreground">
              Solo vehículos registrados en la red de concesionarios GAC Motor pueden agendar citas por este medio.
            </p>
          </div>
        )}

        {/* STEP 2: Reservation Form */}
        {step === 'form' && vehicle && (
          <div className="space-y-4">
            <button onClick={() => { setStep('plate'); setVehicle(null); }} className="flex items-center gap-1 text-sm text-primary">
              <ArrowLeft className="w-4 h-4" /> Cambiar placa
            </button>

            {/* Vehicle info */}
            <Card className="gac-shadow border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Car className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{vehicle.vehicle_models?.brand} {vehicle.vehicle_models?.name} {vehicle.year}</p>
                    <p className="text-xs text-muted-foreground">{vehicle.plate}{vehicle.color ? ` · ${vehicle.color}` : ''} · {vehicle.mileage.toLocaleString()} km</p>
                    {vehicle.clients && <p className="text-xs text-muted-foreground">{vehicle.clients.full_name}</p>}
                  </div>
                  {vehicle.warranty_active && (
                    <Badge className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0 flex items-center gap-0.5">
                      <ShieldCheck className="w-3 h-3" /> Garantía
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dealership selection */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Concesionario</h3>
                <div className="grid gap-2">
                  {dealerships.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDealership(d.id)}
                      className={cn(
                        "text-left p-3 rounded-lg border transition-all",
                        selectedDealership === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50"
                      )}
                    >
                      <p className="font-medium text-sm">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{[d.city, d.state].filter(Boolean).join(', ')}</p>
                      {d.address && <p className="text-xs text-muted-foreground">{d.address}</p>}
                      {d.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{d.phone}</p>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Service type */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /> Tipo de Servicio</h3>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map(s => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name} <span className="text-muted-foreground">({s.duration_minutes} min)</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Date & Time */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Fecha y Hora</h3>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={es}
                  disabled={(date) => date < new Date() || date.getDay() === 0}
                  className="rounded-md border mx-auto"
                />
                {selectedDate && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Hora disponible</Label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {TIME_SLOTS.map(t => (
                        <button
                          key={t}
                          onClick={() => setSelectedTime(t)}
                          className={cn(
                            "py-1.5 rounded-md text-xs font-medium border transition-all",
                            selectedTime === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mileage & Notes */}
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Hash className="w-4 h-4 text-primary" /> Información Adicional</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Kilometraje actual</Label>
                  <Input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="Ej: 25000" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm" placeholder="Describe brevemente el motivo de la cita..." />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleConfirm} className="w-full h-12 gac-gradient text-base font-semibold">
              Revisar y Confirmar
            </Button>
          </div>
        )}

        {/* STEP 3: Confirmation */}
        {step === 'confirm' && vehicle && (
          <div className="space-y-4">
            <button onClick={() => setStep('form')} className="flex items-center gap-1 text-sm text-primary">
              <ArrowLeft className="w-4 h-4" /> Volver al formulario
            </button>

            <div className="text-center space-y-1">
              <h2 className="text-lg font-display font-bold">Confirma tu Cita</h2>
              <p className="text-sm text-muted-foreground">Revisa los datos antes de confirmar</p>
            </div>

            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">{vehicle.vehicle_models?.brand} {vehicle.vehicle_models?.name} {vehicle.year}</p>
                    <p className="text-xs text-muted-foreground">{vehicle.plate}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground shrink-0" /><span>{selectedDealershipData?.name} — {[selectedDealershipData?.city, selectedDealershipData?.state].filter(Boolean).join(', ')}</span></div>
                  <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-muted-foreground shrink-0" /><span>{selectedService}</span></div>
                  <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" /><span>{selectedDate ? format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es }) : ''}</span></div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground shrink-0" /><span>{selectedTime}</span></div>
                  {mileage && <div className="flex items-center gap-2"><Hash className="w-4 h-4 text-muted-foreground shrink-0" /><span>{parseInt(mileage).toLocaleString()} km</span></div>}
                  {notes.trim() && <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 mt-1">{notes}</div>}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSubmit} disabled={saving} className="w-full h-12 gac-gradient text-base font-semibold">
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5 mr-2" /> Confirmar Cita
                </>
              )}
            </Button>
          </div>
        )}

        {/* STEP 4: Success */}
        {step === 'success' && (
          <div className="text-center space-y-6 py-8">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-bold text-green-700">¡Cita Agendada!</h2>
              <p className="text-sm text-muted-foreground">Tu cita ha sido registrada exitosamente. El concesionario se pondrá en contacto contigo para confirmarla.</p>
            </div>

            <Card className="gac-shadow text-left">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2"><Car className="w-4 h-4 text-muted-foreground" /><span>{vehicle?.vehicle_models?.brand} {vehicle?.vehicle_models?.name} — {vehicle?.plate}</span></div>
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{selectedDealershipData?.name}</span></div>
                <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-muted-foreground" /><span>{selectedService}</span></div>
                <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" /><span>{selectedDate ? format(selectedDate, "d 'de' MMMM, yyyy", { locale: es }) : ''} a las {selectedTime}</span></div>
              </CardContent>
            </Card>

            <Button onClick={reset} variant="outline" className="mt-4">
              Agendar otra cita
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} GAC Motor Venezuela. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

export default PublicReserva;
