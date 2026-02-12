import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { concesionarios, reservasMock, vehiculosMock, prospectosMock, modelosGAC, getEstadoColor, getEstadoLabel, type Prospecto } from '@/data/mockData';
import { CalendarDays, Users, Plus, Phone, Mail, LogOut, UserPlus, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const DealershipPanel = () => {
  const navigate = useNavigate();
  const concesionarioId = 'c1'; // Simular concesionario logueado
  const concesionario = concesionarios.find(c => c.id === concesionarioId)!;

  const reservasConcesionario = reservasMock.filter(r => r.concesionarioId === concesionarioId);
  const prospectosConcesionario = prospectosMock.filter(p => p.concesionarioId === concesionarioId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [nuevoProspecto, setNuevoProspecto] = useState({ nombre: '', telefono: '', email: '', modeloInteres: '', notas: '' });

  const pendientes = reservasConcesionario.filter(r => r.estado === 'pendiente').length;
  const enProceso = reservasConcesionario.filter(r => r.estado === 'en_proceso').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gac-charcoal text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold tracking-tight">{concesionario.nombre}</h1>
          <p className="text-xs text-gac-silver">Panel del Concesionario</p>
        </div>
        <Button variant="ghost" size="sm" className="text-gac-silver hover:text-primary-foreground" onClick={() => navigate('/')}>
          <LogOut className="w-4 h-4 mr-2" /> Salir
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="gac-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-primary"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{reservasConcesionario.length}</p>
                <p className="text-xs text-muted-foreground">Total Reservas</p>
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
              <div className="p-3 rounded-xl bg-muted text-blue-600"><Users className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{prospectosConcesionario.length}</p>
                <p className="text-xs text-muted-foreground">Prospectos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="reservas" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="reservas">Reservas</TabsTrigger>
            <TabsTrigger value="prospectos">Prospectos</TabsTrigger>
          </TabsList>

          {/* Reservas */}
          <TabsContent value="reservas">
            <Card className="gac-shadow">
              <CardHeader>
                <CardTitle className="font-display">Reservas del Concesionario</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha/Hora</TableHead>
                      <TableHead>Vehículo</TableHead>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Km</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservasConcesionario.map(r => {
                      const veh = vehiculosMock.find(v => v.id === r.vehiculoId);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.fecha}<br/><span className="text-xs text-muted-foreground">{r.hora}</span></TableCell>
                          <TableCell>{veh?.modelo} {veh?.año}<br/><span className="text-xs text-muted-foreground">{veh?.placa}</span></TableCell>
                          <TableCell className="text-sm">{r.tipoServicio}</TableCell>
                          <TableCell className="text-sm">{r.kilometrajeActual.toLocaleString()}</TableCell>
                          <TableCell><Badge className={cn("text-xs", getEstadoColor(r.estado))}>{getEstadoLabel(r.estado)}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {r.estado === 'pendiente' && <Button size="sm" variant="outline" className="text-xs h-7">Confirmar</Button>}
                              {r.estado === 'confirmada' && <Button size="sm" variant="outline" className="text-xs h-7">Iniciar</Button>}
                              {r.estado === 'en_proceso' && <Button size="sm" variant="outline" className="text-xs h-7">Completar</Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prospectos */}
          <TabsContent value="prospectos" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-semibold text-lg">Gestión de Prospectos</h3>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gac-gradient text-primary-foreground" size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Nuevo Prospecto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display">Registrar Prospecto</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div><Label>Nombre completo</Label><Input className="mt-1" value={nuevoProspecto.nombre} onChange={e => setNuevoProspecto(p => ({ ...p, nombre: e.target.value }))} /></div>
                    <div><Label>Teléfono</Label><Input className="mt-1" value={nuevoProspecto.telefono} onChange={e => setNuevoProspecto(p => ({ ...p, telefono: e.target.value }))} /></div>
                    <div><Label>Email</Label><Input className="mt-1" type="email" value={nuevoProspecto.email} onChange={e => setNuevoProspecto(p => ({ ...p, email: e.target.value }))} /></div>
                    <div>
                      <Label>Modelo de interés</Label>
                      <Select value={nuevoProspecto.modeloInteres} onValueChange={v => setNuevoProspecto(p => ({ ...p, modeloInteres: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                        <SelectContent>
                          {modelosGAC.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Notas</Label><Textarea className="mt-1" rows={3} value={nuevoProspecto.notas} onChange={e => setNuevoProspecto(p => ({ ...p, notas: e.target.value }))} /></div>
                    <Button className="w-full gac-gradient text-primary-foreground" onClick={() => setDialogOpen(false)}>
                      <UserPlus className="w-4 h-4 mr-2" /> Guardar Prospecto
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="gac-shadow">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospectosConcesionario.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" />{p.telefono}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" />{p.email}</div>
                      </TableCell>
                      <TableCell className="font-medium">{p.modeloInteres}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{p.fuente}</Badge></TableCell>
                      <TableCell><Badge className={cn("text-xs", getEstadoColor(p.estado))}>{getEstadoLabel(p.estado)}</Badge></TableCell>
                      <TableCell className="text-sm">{p.fecha}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DealershipPanel;
