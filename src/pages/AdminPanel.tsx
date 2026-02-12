import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { concesionarios, reservasMock, vehiculosMock, historialMock, verificarGarantia, getEstadoColor, getEstadoLabel } from '@/data/mockData';
import { CalendarDays, Car, MapPin, ShieldCheck, ShieldX, Search, LogOut, BarChart3, ClipboardList, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const navigate = useNavigate();
  const [filtroConc, setFiltroConc] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');

  const reservasFiltradas = reservasMock.filter(r => {
    const matchConc = filtroConc === 'todos' || r.concesionarioId === filtroConc;
    const veh = vehiculosMock.find(v => v.id === r.vehiculoId);
    const matchBusqueda = !busqueda || 
      veh?.placa.toLowerCase().includes(busqueda.toLowerCase()) ||
      veh?.modelo.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.tipoServicio.toLowerCase().includes(busqueda.toLowerCase());
    return matchConc && matchBusqueda;
  });

  const totalReservas = reservasMock.length;
  const reservasPendientes = reservasMock.filter(r => r.estado === 'pendiente').length;
  const reservasHoy = reservasMock.filter(r => r.fecha === '2025-02-14').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar-style header */}
      <header className="bg-gac-dark text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight">GAC Motor Admin</h1>
            <p className="text-xs text-gac-silver">Panel de Administración</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-gac-silver hover:text-primary-foreground" onClick={() => navigate('/')}>
          <LogOut className="w-4 h-4 mr-2" /> Salir
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Reservas', value: totalReservas, icon: CalendarDays, color: 'text-primary' },
            { label: 'Pendientes', value: reservasPendientes, icon: ClipboardList, color: 'text-yellow-600' },
            { label: 'Reservas Hoy', value: reservasHoy, icon: BarChart3, color: 'text-blue-600' },
            { label: 'Concesionarios', value: concesionarios.length, icon: MapPin, color: 'text-green-600' },
          ].map(s => (
            <Card key={s.label} className="gac-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={cn("p-3 rounded-xl bg-muted", s.color)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="reservas" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="reservas">Reservas</TabsTrigger>
            <TabsTrigger value="garantias">Control de Garantías</TabsTrigger>
            <TabsTrigger value="historial">Historial de Servicios</TabsTrigger>
          </TabsList>

          {/* Tab: Reservas */}
          <TabsContent value="reservas" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por placa, modelo o servicio..." className="pl-9" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>
              <Select value={filtroConc} onValueChange={setFiltroConc}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los concesionarios</SelectItem>
                  {concesionarios.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="gac-shadow">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Vehículo</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Concesionario</TableHead>
                    <TableHead>Km</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservasFiltradas.map(r => {
                    const veh = vehiculosMock.find(v => v.id === r.vehiculoId);
                    const conc = concesionarios.find(c => c.id === r.concesionarioId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.fecha}<br/><span className="text-xs text-muted-foreground">{r.hora}</span></TableCell>
                        <TableCell>{veh?.modelo} {veh?.año}<br/><span className="text-xs text-muted-foreground">{veh?.placa}</span></TableCell>
                        <TableCell className="text-sm">{r.tipoServicio}</TableCell>
                        <TableCell className="text-sm">{conc?.ciudad}</TableCell>
                        <TableCell className="text-sm">{r.kilometrajeActual.toLocaleString()}</TableCell>
                        <TableCell><Badge className={cn("text-xs", getEstadoColor(r.estado))}>{getEstadoLabel(r.estado)}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Tab: Garantías */}
          <TabsContent value="garantias" className="space-y-4">
            <Card className="gac-shadow">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Control de Garantías</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Garantía: 6 años o 100,000 km · Servicios cada 5,000 km en concesionarios oficiales
                </p>
                <div className="space-y-4">
                  {vehiculosMock.map(v => {
                    const garantia = verificarGarantia(v, historialMock);
                    return (
                      <Card key={v.id} className={cn("border-l-4", garantia.activa ? "border-l-green-500" : "border-l-red-500")}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Car className="w-8 h-8 text-muted-foreground" />
                              <div>
                                <h4 className="font-semibold">{v.modelo} {v.año}</h4>
                                <p className="text-xs text-muted-foreground">{v.placa} · VIN: {v.vin}</p>
                                <p className="text-xs text-muted-foreground">Compra: {v.fechaCompra} · {v.kilometraje.toLocaleString()} km</p>
                              </div>
                            </div>
                            <Badge className={cn("text-xs flex items-center gap-1", garantia.activa ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                              {garantia.activa ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                              {garantia.activa ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                            <div className="bg-muted rounded-lg p-2">
                              <p className="text-lg font-bold">{garantia.serviciosRealizados}</p>
                              <p className="text-xs text-muted-foreground">Realizados</p>
                            </div>
                            <div className="bg-muted rounded-lg p-2">
                              <p className="text-lg font-bold">{garantia.serviciosEsperados}</p>
                              <p className="text-xs text-muted-foreground">Esperados</p>
                            </div>
                            <div className="bg-muted rounded-lg p-2">
                              <p className="text-lg font-bold">{garantia.proximoServicioKm > 0 ? `${(garantia.proximoServicioKm / 1000).toFixed(0)}k` : '-'}</p>
                              <p className="text-xs text-muted-foreground">Próximo (km)</p>
                            </div>
                          </div>
                          {!garantia.activa && garantia.razon && (
                            <p className="mt-2 text-xs text-red-600 font-medium">⚠ {garantia.razon}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Historial */}
          <TabsContent value="historial">
            <Card className="gac-shadow">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Vehículo</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Km</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Garantía</TableHead>
                    <TableHead>Costo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historialMock.map(h => {
                    const veh = vehiculosMock.find(v => v.id === h.vehiculoId);
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{h.fecha}</TableCell>
                        <TableCell>{veh?.modelo} {veh?.año}<br/><span className="text-xs text-muted-foreground">{veh?.placa}</span></TableCell>
                        <TableCell className="text-sm">{h.tipoServicio}</TableCell>
                        <TableCell className="text-sm">{h.kilometraje.toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{h.tecnico}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", h.garantiaCubierta ? "bg-green-100 text-green-800" : "bg-muted")}>
                            {h.garantiaCubierta ? 'Cubierta' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">${h.costo}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminPanel;
