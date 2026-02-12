import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { vehiculosMock, historialMock, verificarGarantia } from '@/data/mockData';
import { Car, ShieldCheck, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminGarantias = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Control de Garantías</h1>
        <p className="text-sm text-muted-foreground">Garantía: 6 años o 100,000 km · Servicios cada 5,000 km en concesionarios oficiales</p>
      </div>

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
    </div>
  );
};

export default AdminGarantias;
