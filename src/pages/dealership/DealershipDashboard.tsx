import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, ClipboardList, Users } from 'lucide-react';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';

const DealershipDashboard = () => {
  const { selectedDealership, loading: loadingAccess } = useDealershipAccess();
  const [stats, setStats] = useState({ total: 0, hoy: 0, pendientes: 0, enProceso: 0, prospectos: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedDealership) return;
    const fetchStats = async () => {
      setLoading(true);
      const hoy = new Date().toISOString().split('T')[0];

      const [resResult, prosResult] = await Promise.all([
        supabase.from('reservations').select('id, status, reservation_date').eq('dealership_id', selectedDealership),
        supabase.from('prospects').select('id').eq('dealership_id', selectedDealership),
      ]);

      const reservations = resResult.data || [];
      setStats({
        total: reservations.length,
        hoy: reservations.filter(r => r.reservation_date === hoy).length,
        pendientes: reservations.filter(r => r.status === 'pendiente').length,
        enProceso: reservations.filter(r => r.status === 'en_proceso').length,
        prospectos: prosResult.data?.length || 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [selectedDealership]);

  const cards = [
    { label: 'Total Reservas', value: stats.total, icon: CalendarDays, color: 'text-primary' },
    { label: 'Reservas Hoy', value: stats.hoy, icon: CalendarDays, color: 'text-blue-600' },
    { label: 'Pendientes', value: stats.pendientes, icon: ClipboardList, color: 'text-yellow-600' },
    { label: 'En Proceso', value: stats.enProceso, icon: ClipboardList, color: 'text-purple-600' },
    { label: 'Prospectos', value: stats.prospectos, icon: Users, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-display font-bold">Inicio</h1>
        <p className="text-sm text-muted-foreground">Resumen general del concesionario</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {cards.map(c => (
            <Card key={c.label} className="gac-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-muted ${c.color}`}>
                  <c.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-display font-bold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DealershipDashboard;
