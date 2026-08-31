import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  externalPortalLogin, externalPortalFleet, externalPortalHistory,
  type FleetVehicle, type ServiceRow,
} from '@/lib/externalPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wrench, Car, CalendarPlus, LogOut, AlertCircle, Loader2, ChevronDown, ChevronRight, Gauge,
} from 'lucide-react';

/**
 * Portal del cliente externo: entra con su placa y su teléfono, ve su flota y su historial
 * de servicio, y desde ahí pide una cita.
 *
 * Pide placa Y teléfono, no sólo placa, porque la placa está a la vista en la calle. Es la
 * misma decisión que ya había tomado el proyecto: `lookup_vehicle_by_plate` (la del alta
 * pública de citas) devuelve el nombre enmascarado — "Manuel R." — justo para que una foto
 * de un parachoques no identifique al dueño. Abrir la flota y el historial con la placa sola
 * habría deshecho eso.
 *
 * Reservar NO se reimplementa: se enlaza a /reservar, que ya resuelve horarios y capacidad.
 * Ver supabase/migrations/20260811150000_external_portal.sql.
 */

const TOKEN_KEY = 'external_portal_token';

// Los códigos vienen de la RPC; el texto vive acá para no hardcodear frases en la base.
const ERROR_TEXT: Record<string, string> = {
  datos_incompletos: 'Ingresá la placa y el teléfono completo.',
  demasiados_intentos: 'Demasiados intentos con esta placa. Esperá 15 minutos e intentá de nuevo.',
  no_encontrado: 'No encontramos un vehículo con esa placa y ese teléfono. Verificá los datos.',
  // Interruptor de Configuración -> Portal Mi Flota. No se cuenta como intento fallido.
  portal_deshabilitado: 'El portal está deshabilitado temporalmente. Intentá más tarde.',
};

export default function PublicMiFlota() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [clientName, setClientName] = useState('');

  const [plate, setPlate] = useState('');
  const [phone, setPhone] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');

  const [fleet, setFleet] = useState<FleetVehicle[]>([]);
  const [loadingFleet, setLoadingFleet] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ServiceRow[]>>({});

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setFleet([]);
    setHistory({});
    setClientName('');
  };

  const loadFleet = async (t: string) => {
    setLoadingFleet(true);
    let data: FleetVehicle[];
    try { data = await externalPortalFleet(t); }
    catch { setLoadingFleet(false); setError('No pudimos cargar tu flota. Intentá de nuevo.'); return; }
    setLoadingFleet(false);
    // Cero vehículos con un token que teníamos guardado significa que la sesión venció:
    // dura 8 horas. Se limpia en vez de mostrar una pantalla vacía sin explicación.
    if (data.length === 0) { logout(); return; }
    setFleet(data);
  };

  useEffect(() => {
    if (token) loadFleet(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoggingIn(true);
    let row;
    try { row = await externalPortalLogin(plate, phone); }
    catch { setLoggingIn(false); setError('No pudimos conectarnos. Intentá de nuevo.'); return; }
    setLoggingIn(false);

    if (row.error_code || !row.token) {
      setError(ERROR_TEXT[row.error_code || ''] || ERROR_TEXT.no_encontrado);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, row.token);
    setClientName(row.client_name || '');
    setToken(row.token);
  };

  const toggleHistory = async (vehicleId: string) => {
    if (expanded === vehicleId) { setExpanded(null); return; }
    setExpanded(vehicleId);
    if (history[vehicleId] || !token) return;
    try {
      const rows = await externalPortalHistory(token, vehicleId);
      setHistory(prev => ({ ...prev, [vehicleId]: rows }));
    } catch {
      // El historial es secundario: si falla, la tarjeta del vehículo sigue sirviendo.
      setHistory(prev => ({ ...prev, [vehicleId]: [] }));
    }
  };

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="gac-gradient px-6 py-8">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Wrench className="w-7 h-7 text-primary-foreground shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-primary-foreground tracking-tight truncate">
                Mi flota
              </h1>
              <p className="text-xs text-primary-foreground/80">GAC Motor Venezuela</p>
            </div>
          </div>
          {token && (
            <Button variant="secondary" size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={logout}>
              <LogOut className="w-3.5 h-3.5" /> Salir
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {!token ? (
            <Card className="gac-shadow max-w-md mx-auto">
              <CardContent className="p-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1 text-center">
                    <h2 className="font-display font-semibold">Consultá tus vehículos</h2>
                    <p className="text-xs text-muted-foreground">
                      Ingresá la placa y el teléfono con el que te registramos.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plate">Placa</Label>
                    <Input
                      id="plate"
                      value={plate}
                      onChange={e => setPlate(e.target.value.toUpperCase())}
                      placeholder="Ej: ABC123"
                      className="uppercase"
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Ej: 0412 2846405"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Pedimos el teléfono además de la placa porque la placa está a la vista de
                      cualquiera. Es para que sólo vos veas tu historial.
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <span className="text-destructive">{error}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full gac-gradient" disabled={loggingIn}>
                    {loggingIn ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando…</> : 'Entrar'}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    ¿Sos cliente GAC con cuenta? <Link to="/login" className="text-primary hover:underline">Iniciá sesión acá</Link>.
                  </p>
                </form>
              </CardContent>
            </Card>
          ) : loadingFleet ? (
            <Card className="gac-shadow">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                Cargando tu flota…
              </CardContent>
            </Card>
          ) : (
            <>
              {clientName && (
                <p className="text-sm text-muted-foreground">
                  Hola, <span className="font-semibold text-foreground">{clientName}</span>.
                  Tenés {fleet.length} {fleet.length === 1 ? 'vehículo registrado' : 'vehículos registrados'}.
                </p>
              )}

              {fleet.map(v => (
                <Card key={v.vehicle_id} className="gac-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Car className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="font-semibold text-sm">
                            {v.model_brand} {v.model_name} {v.year}
                          </span>
                          {v.warranty_active ? (
                            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">En garantía</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sin garantía</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 pl-6">
                          Placa {v.plate || '—'}{v.color ? ` · ${v.color}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground pl-6 flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          {v.mileage.toLocaleString('es-VE')} km
                          {v.last_service_date && ` · último servicio ${fmtDate(v.last_service_date)}`}
                        </p>
                      </div>
                      {v.plate && (
                        <Button asChild size="sm" className="h-8 text-xs gap-1 shrink-0">
                          <Link to={`/reservar?placa=${encodeURIComponent(v.plate)}`}>
                            <CalendarPlus className="w-3.5 h-3.5" /> Pedir cita
                          </Link>
                        </Button>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 -ml-2"
                      onClick={() => toggleHistory(v.vehicle_id)}
                    >
                      {expanded === v.vehicle_id
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      Historial de servicio ({v.services_count})
                    </Button>

                    {expanded === v.vehicle_id && (
                      <div className="border-t pt-3">
                        {!history[v.vehicle_id] ? (
                          <p className="text-xs text-muted-foreground">Cargando…</p>
                        ) : history[v.vehicle_id].length === 0 ? (
                          <p className="text-xs text-muted-foreground">Todavía no hay visitas registradas.</p>
                        ) : (
                          <ul className="space-y-2">
                            {history[v.vehicle_id].map((h, i) => (
                              <li key={i} className="text-xs border-l-2 border-primary/30 pl-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{fmtDate(h.reservation_date)}</span>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{h.status}</Badge>
                                </div>
                                <p className="text-muted-foreground">
                                  {h.service_type}
                                  {h.dealership_name && ` · ${h.dealership_name}`}
                                  {h.current_mileage > 0 && ` · ${h.current_mileage.toLocaleString('es-VE')} km`}
                                </p>
                                {h.service_notes && <p className="text-muted-foreground italic mt-0.5">{h.service_notes}</p>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
