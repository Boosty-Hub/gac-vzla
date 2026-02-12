import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { concesionarios, vehiculosMock, tiposServicio, horasDisponibles, reservasMock, getEstadoColor, getEstadoLabel } from '@/data/mockData';
import { MapPin, Phone, Clock, Car, CalendarDays, ChevronLeft, Check, ArrowLeft, User, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const UserPortal = () => {
  const navigate = useNavigate();
  const [vista, setVista] = useState<'concesionarios' | 'reservar' | 'mis-reservas' | 'perfil'>('concesionarios');
  const [concesionarioSeleccionado, setConcesionarioSeleccionado] = useState<string | null>(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date | undefined>(undefined);
  const [horaSeleccionada, setHoraSeleccionada] = useState<string>('');
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<string>('');
  const [tipoServicioSeleccionado, setTipoServicioSeleccionado] = useState<string>('');
  const [kilometrajeActual, setKilometrajeActual] = useState('');
  const [notas, setNotas] = useState('');
  const [reservaConfirmada, setReservaConfirmada] = useState(false);
  const [paso, setPaso] = useState(1);

  const misVehiculos = vehiculosMock.filter(v => v.propietarioId === 'u1');
  const misReservas = reservasMock.filter(r => r.usuarioId === 'u1');

  const concesionarioActual = concesionarios.find(c => c.id === concesionarioSeleccionado);

  // Simular horas ocupadas
  const horasOcupadas = ['10:00', '14:00', '15:30'];
  const horasLibres = horasDisponibles.filter(h => !horasOcupadas.includes(h));

  const iniciarReserva = (concesionarioId: string) => {
    setConcesionarioSeleccionado(concesionarioId);
    setVista('reservar');
    setPaso(1);
    setReservaConfirmada(false);
  };

  const confirmarReserva = () => {
    setReservaConfirmada(true);
    setPaso(4);
  };

  const volverInicio = () => {
    setVista('concesionarios');
    setConcesionarioSeleccionado(null);
    setFechaSeleccionada(undefined);
    setHoraSeleccionada('');
    setVehiculoSeleccionado('');
    setTipoServicioSeleccionado('');
    setKilometrajeActual('');
    setNotas('');
    setReservaConfirmada(false);
    setPaso(1);
  };

  return (
    <div className="min-h-screen bg-background max-w-md mx-auto relative">
      {/* Header */}
      <header className="sticky top-0 z-50 gac-gradient px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {vista !== 'concesionarios' && (
            <button onClick={volverInicio} className="text-primary-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-display font-bold text-primary-foreground tracking-tight">GAC Motor</h1>
            <p className="text-xs text-primary-foreground/70">Servicio Venezuela</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVista('mis-reservas')}
            className={cn("p-2 rounded-lg transition-colors", vista === 'mis-reservas' ? 'bg-white/20' : 'text-primary-foreground/70 hover:bg-white/10')}
          >
            <CalendarDays className="w-5 h-5 text-primary-foreground" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg text-primary-foreground/70 hover:bg-white/10"
          >
            <LogOut className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>
      </header>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t z-50 flex">
        {[
          { id: 'concesionarios' as const, label: 'Concesionarios', icon: MapPin },
          { id: 'mis-reservas' as const, label: 'Mis Reservas', icon: CalendarDays },
          { id: 'perfil' as const, label: 'Perfil', icon: User },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setVista(tab.id); if (tab.id === 'concesionarios') volverInicio(); }}
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
        {/* Lista de Concesionarios */}
        {vista === 'concesionarios' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-display font-bold">Concesionarios</h2>
              <p className="text-sm text-muted-foreground">Selecciona uno para agendar tu servicio</p>
            </div>
            {concesionarios.map(c => (
              <Card key={c.id} className="overflow-hidden gac-shadow hover:gac-shadow-lg transition-shadow cursor-pointer" onClick={() => iniciarReserva(c.id)}>
                <div className="h-32 bg-gac-charcoal flex items-center justify-center">
                  <Car className="w-12 h-12 text-gac-silver" />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-base">{c.nombre}</h3>
                  <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-primary" />{c.ciudad}, {c.estado}</div>
                    <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-primary" />{c.horario}</div>
                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-primary" />{c.telefono}</div>
                  </div>
                  <Button className="w-full mt-3 gac-gradient text-primary-foreground" size="sm">
                    Agendar Servicio
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Flujo de Reserva */}
        {vista === 'reservar' && concesionarioActual && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-display font-bold">Reservar Servicio</h2>
              <p className="text-sm text-muted-foreground">{concesionarioActual.nombre}</p>
            </div>

            {/* Progress steps */}
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
                  <Select value={vehiculoSeleccionado} onValueChange={setVehiculoSeleccionado}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona tu vehículo" /></SelectTrigger>
                    <SelectContent>
                      {misVehiculos.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.modelo} {v.año} - {v.placa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Servicio</Label>
                  <Select value={tipoServicioSeleccionado} onValueChange={setTipoServicioSeleccionado}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona el servicio" /></SelectTrigger>
                    <SelectContent>
                      {tiposServicio.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kilometraje Actual</Label>
                  <Input className="mt-1" type="number" placeholder="Ej: 20000" value={kilometrajeActual} onChange={e => setKilometrajeActual(e.target.value)} />
                </div>
                <Button
                  className="w-full gac-gradient text-primary-foreground"
                  disabled={!vehiculoSeleccionado || !tipoServicioSeleccionado || !kilometrajeActual}
                  onClick={() => setPaso(2)}
                >
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
                      selected={fechaSeleccionada}
                      onSelect={setFechaSeleccionada}
                      locale={es}
                      disabled={(date) => date < new Date() || date.getDay() === 0}
                      className="rounded-lg border p-3 pointer-events-auto"
                    />
                  </div>
                </div>
                {fechaSeleccionada && (
                  <div>
                    <Label className="text-base font-semibold">Hora disponible</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      {format(fechaSeleccionada, "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {horasDisponibles.map(h => {
                        const ocupada = horasOcupadas.includes(h);
                        return (
                          <button
                            key={h}
                            disabled={ocupada}
                            onClick={() => setHoraSeleccionada(h)}
                            className={cn(
                              "py-2 px-1 text-sm rounded-lg border transition-all font-medium",
                              ocupada && "bg-muted text-muted-foreground/40 cursor-not-allowed line-through",
                              !ocupada && horaSeleccionada === h && "gac-gradient text-primary-foreground border-transparent",
                              !ocupada && horaSeleccionada !== h && "hover:border-primary"
                            )}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaso(1)}>Atrás</Button>
                  <Button className="flex-1 gac-gradient text-primary-foreground" disabled={!fechaSeleccionada || !horaSeleccionada} onClick={() => setPaso(3)}>
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
                      <div className="flex justify-between"><span className="text-muted-foreground">Concesionario</span><span className="font-medium">{concesionarioActual.nombre}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Vehículo</span><span className="font-medium">{misVehiculos.find(v => v.id === vehiculoSeleccionado)?.modelo} {misVehiculos.find(v => v.id === vehiculoSeleccionado)?.año}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Servicio</span><span className="font-medium">{tipoServicioSeleccionado}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span className="font-medium">{fechaSeleccionada && format(fechaSeleccionada, "d 'de' MMMM, yyyy", { locale: es })}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Hora</span><span className="font-medium">{horaSeleccionada}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Kilometraje</span><span className="font-medium">{Number(kilometrajeActual).toLocaleString()} km</span></div>
                    </div>
                  </CardContent>
                </Card>
                <div>
                  <Label>Notas adicionales (opcional)</Label>
                  <Textarea className="mt-1" placeholder="Describe cualquier detalle adicional..." value={notas} onChange={e => setNotas(e.target.value)} rows={3} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaso(2)}>Atrás</Button>
                  <Button className="flex-1 gac-gradient text-primary-foreground" onClick={confirmarReserva}>
                    Confirmar Reserva
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
                <p className="text-sm text-muted-foreground">Recibirás una notificación de confirmación. Te esperamos en {concesionarioActual.nombre}.</p>
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
            <h2 className="text-xl font-display font-bold">Mis Reservas</h2>
            {misReservas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No tienes reservas aún</p>
              </div>
            ) : (
              misReservas.map(r => {
                const conc = concesionarios.find(c => c.id === r.concesionarioId);
                const veh = vehiculosMock.find(v => v.id === r.vehiculoId);
                return (
                  <Card key={r.id} className="gac-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-sm">{r.tipoServicio}</h3>
                        <Badge className={cn("text-xs", getEstadoColor(r.estado))}>{getEstadoLabel(r.estado)}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p><span className="font-medium text-foreground">{veh?.modelo} {veh?.año}</span> - {veh?.placa}</p>
                        <p>{conc?.nombre}</p>
                        <p>{r.fecha} a las {r.hora}</p>
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
            <Card className="gac-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">Juan Pérez</h3>
                  <p className="text-sm text-muted-foreground">juan@email.com</p>
                </div>
              </CardContent>
            </Card>
            <Card className="gac-shadow">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Mis Vehículos</h3>
                {misVehiculos.map(v => (
                  <div key={v.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <Car className="w-8 h-8 text-primary" />
                    <div>
                      <p className="font-medium text-sm">{v.modelo} {v.año}</p>
                      <p className="text-xs text-muted-foreground">{v.placa} · {v.kilometraje.toLocaleString()} km</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default UserPortal;
