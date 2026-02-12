import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vehiculosMock, historialMock } from '@/data/mockData';
import { cn } from '@/lib/utils';

const AdminHistorial = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Historial de Servicios</h1>
        <p className="text-sm text-muted-foreground">Registro completo de todos los servicios realizados</p>
      </div>

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
                  <TableCell>{veh?.modelo} {veh?.año}<br /><span className="text-xs text-muted-foreground">{veh?.placa}</span></TableCell>
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
    </div>
  );
};

export default AdminHistorial;
