import { Card, CardContent } from '@/components/ui/card';
import { concesionarios, reservasMock, vehiculosMock } from '@/data/mockData';
import { CalendarDays, ClipboardList, BarChart3, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const AdminDashboard = () => {
  const totalReservas = reservasMock.length;
  const reservasPendientes = reservasMock.filter(r => r.estado === 'pendiente').length;
  const reservasHoy = reservasMock.filter(r => r.fecha === '2025-02-14').length;

  const stats = [
    { label: 'Total Reservas', value: totalReservas, icon: CalendarDays, color: 'text-primary' },
    { label: 'Pendientes', value: reservasPendientes, icon: ClipboardList, color: 'text-yellow-600' },
    { label: 'Reservas Hoy', value: reservasHoy, icon: BarChart3, color: 'text-blue-600' },
    { label: 'Concesionarios', value: concesionarios.length, icon: MapPin, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen general del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
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
    </div>
  );
};

export default AdminDashboard;
