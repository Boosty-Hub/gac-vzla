import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays, ClipboardList, Users, TrendingUp, UserCheck,
  MapPin, Trophy, Target, ArrowUpRight, ArrowDownRight, Medal,
  Star, Wrench, Building2, BarChart2, LayoutGrid, Sparkles, Smile, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { useIsMobile } from '@/hooks/use-mobile';
import CustomWidgetsSection from '@/components/dashboard/CustomWidgetsSection';
import ChartCard from '@/components/dashboard/ChartCard';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { DashboardDateRange, rangeDescription } from '@/components/DashboardDateRange';
import SatisfactionDashboard from '@/components/satisfaction/SatisfactionDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { isPartsRequest } from '@/lib/serviceTypes';

/**
 * Orden POR DEFECTO de los reportes estándar. Solo se usa cuando el usuario nunca movió
 * nada; a partir de ahí manda `dashboard_layout_prefs`.
 *
 * Las claves son contrato con la base: cambiar una equivale a un gráfico nuevo y el
 * usuario pierde dónde lo había puesto. Agregar al final es seguro.
 */
const DASHBOARD_CHART_KEYS = [
  'citas_concesionario',
  'tipos_servicio',
  'satisfaccion_concesionario',
  'prospectos_conversion',
  'ranking_vendedores',
  'prospectos_canal',
  'prospectos_estado',
  'contacto_vendedor',
  'tendencia_diaria',
  'eventos',
];

/**
 * Permiso que exige cada reporte. Un asesor de servicio no tiene `prospectos.view`, así que
 * el tablero deja de mostrarle el ranking de vendedores o los canales de captación: son datos
 * de ventas que no puede ver en ninguna otra pantalla, y que acá se le colaban.
 *
 * Una clave sin entrada acá se muestra siempre. Al agregar un reporte nuevo, agregá también
 * su permiso o quedará visible para todos.
 */
const DASHBOARD_CHART_PERMISSIONS: Record<string, string> = {
  citas_concesionario: 'reservas.view',
  tipos_servicio: 'reservas.view',
  satisfaccion_concesionario: 'reservas.view',
  prospectos_conversion: 'prospectos.view',
  ranking_vendedores: 'prospectos.view',
  prospectos_canal: 'prospectos.view',
  prospectos_estado: 'prospectos.view',
  contacto_vendedor: 'prospectos.view',
  tendencia_diaria: 'prospectos.view',
  eventos: 'prospectos.view',
};

interface Prospect {
  id: string;
  status: string;
  source: string;
  salesperson: string | null;
  created_at: string;
  dealership_id: string;
  event_name: string | null;
}

interface Reservation {
  id: string;
  status: string;
  reservation_date: string;
  service_type: string;
  dealership_id: string;
  created_at: string;
  satisfaction_rating: number | null;
}

interface Dealership {
  id: string;
  name: string;
  is_service_center: boolean | null;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(45, 90%, 50%)',
  'hsl(0, 70%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
];

const AdminDashboard = () => {
  const { statuses: PROSPECT_STATUSES } = useProspectStatuses();
  const { hasPermission } = useAuth();
  const canSeeProspects = hasPermission('prospectos.view');
  const canSeeReservations = hasPermission('reservas.view');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Cómo se ve y dónde está cada gráfico, guardado por usuario.
  const layout = useDashboardLayout();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range filter — default TODO EL HISTORIAL (empty range = sin filtro de fecha)
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = fechaDesde ? `${fechaDesde}T00:00:00` : undefined;
      const until = fechaHasta ? `${fechaHasta}T23:59:59` : undefined;

      // PostgREST devuelve como mucho 1000 filas por pedido. Sin paginar, el tablero
      // empezaba a truncar en silencio al pasar ese número y los totales quedaban cortos
      // sin ningún aviso. Se pide de a 1000 hasta que una página venga incompleta.
      const fetchAll = async (
        build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>,
      ): Promise<unknown[]> => {
        const PAGE = 1000;
        const acc: unknown[] = [];
        for (let page = 0; ; page++) {
          const { data } = await build(page * PAGE, page * PAGE + PAGE - 1);
          const rows = data || [];
          acc.push(...rows);
          if (rows.length < PAGE) break;
        }
        return acc;
      };

      const [pRows, rRows, dRes] = await Promise.all([
        fetchAll((from, to) => {
          let q: any = supabase.from('prospects')
            .select('id, status, source, salesperson, created_at, dealership_id, event_name');
          if (since) q = q.gte('created_at', since);
          if (until) q = q.lte('created_at', until);
          return q.order('created_at', { ascending: true }).range(from, to);
        }),
        fetchAll((from, to) => {
          let q: any = supabase.from('reservations')
            .select('id, status, reservation_date, service_type, dealership_id, created_at, satisfaction_rating');
          // El rango se aplica sobre `reservation_date`, la fecha DE LA CITA, no sobre
          // `created_at`, que es cuándo se cargó. Con `created_at` una cita agendada para
          // el mes que viene contaba en el mes actual: 17 citas completadas tienen esas dos
          // fechas en meses distintos, y eran parte del "el total no corresponde".
          if (since) q = q.gte('reservation_date', since.slice(0, 10));
          if (until) q = q.lte('reservation_date', until.slice(0, 10));
          return q.order('reservation_date', { ascending: true }).range(from, to);
        }),
        // Sin filtrar por `is_active`: las citas de un concesionario dado de baja siguen
        // existiendo, y filtrarlo acá las hacía desaparecer del gráfico mientras seguían
        // contando en el KPI de arriba.
        supabase.from('dealerships').select('id, name, is_service_center'),
      ]);

      setProspects(pRows as Prospect[]);
      setReservations(rRows as unknown as Reservation[]);
      setDealerships((dRes.data || []) as unknown as Dealership[]);
      setLoading(false);
    };
    load();
  }, [fechaDesde, fechaHasta]);

  // ─── KPIs ───
  const totalProspects = prospects.length;
  const totalReservations = reservations.length;

  const prospectsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    prospects.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return map;
  }, [prospects]);

  const ganados = prospectsByStatus['ganado'] || 0;
  const conversionRate = totalProspects > 0 ? Math.round((ganados / totalProspects) * 100) : 0;
  const reservasPendientes = reservations.filter(r => r.status === 'pendiente').length;
  const reservasCompletadas = reservations.filter(r => r.status === 'completada').length;
  const reservasCanceladas = reservations.filter(r => r.status === 'cancelada').length;
  // El subtítulo del KPI decía "N completadas · M pendientes" bajo un total que incluye los
  // cinco estados: quedaban 88 citas sin explicar y parecía que el total estaba mal. Se
  // muestran las abiertas — que es además lo accionable — y así los tres números cierran.
  const reservasAbiertas = totalReservations - reservasCompletadas - reservasCanceladas;

  // ─── 1. Citas por concesionario / centro de servicio ───
  const reservasByDealership = useMemo(() => {
    const map: Record<string, number> = {};
    reservations.forEach(r => { map[r.dealership_id] = (map[r.dealership_id] || 0) + 1; });
    return dealerships
      .map(d => ({
        name: d.name,
        value: map[d.id] || 0,
        isServiceCenter: d.is_service_center,
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [reservations, dealerships]);

  // ─── 2. Tipos de servicio ───
  const serviceTypeData = useMemo(() => {
    const map: Record<string, number> = {};
    // Sin "Solicitud de Repuestos": es un pedido interno a planta, no una cita, y la pantalla
    // de Reservas la separa en otra pestaña. Contarla acá inflaba el gráfico rotulado "Citas".
    reservations
      .filter(r => !isPartsRequest(r.service_type))
      .forEach(r => { map[r.service_type] = (map[r.service_type] || 0) + 1; });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [reservations]);

  // ─── 3. Satisfacción del cliente por concesionario ───
  const satisfactionByDealership = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    reservations.forEach(r => {
      if (r.satisfaction_rating) {
        if (!map[r.dealership_id]) map[r.dealership_id] = { sum: 0, count: 0 };
        map[r.dealership_id].sum += r.satisfaction_rating;
        map[r.dealership_id].count++;
      }
    });
    const ratedAll = reservations.filter(r => r.satisfaction_rating).length;
    const avgAll = ratedAll > 0
      ? (reservations.reduce((s, r) => s + (r.satisfaction_rating || 0), 0) / ratedAll)
      : 0;
    const byDealer = dealerships
      .filter(d => map[d.id])
      .map(d => {
        const avg = Math.round((map[d.id].sum / map[d.id].count) * 10) / 10;
        return {
          name: d.name,
          avg,
          count: map[d.id].count,
          pct: Math.round(avg / 5 * 100),
        };
      })
      .sort((a, b) => b.avg - a.avg);
    return { byDealer, avgAll: Math.round(avgAll * 10) / 10, ratedAll };
  }, [reservations, dealerships]);

  // ─── 4. Prospectos por concesionario ───
  const prospectsByDealership = useMemo(() => {
    const map: Record<string, { total: number; ganados: number }> = {};
    prospects.forEach(p => {
      if (!map[p.dealership_id]) map[p.dealership_id] = { total: 0, ganados: 0 };
      map[p.dealership_id].total++;
      if (p.status === 'ganado') map[p.dealership_id].ganados++;
    });
    return dealerships
      .filter(d => map[d.id])
      .map(d => ({
        name: d.name,
        total: map[d.id].total,
        ganados: map[d.id].ganados,
        conversion: map[d.id].total > 0 ? Math.round((map[d.id].ganados / map[d.id].total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [prospects, dealerships]);

  // ─── 5-8. Salesperson ranking (leads, performance, conversion) ───
  const [rankingDealership, setRankingDealership] = useState('todos');
  const [rankingSource, setRankingSource] = useState('todos');
  const salespersonRanking = useMemo(() => {
    let filtered = rankingDealership === 'todos' ? prospects : prospects.filter(p => p.dealership_id === rankingDealership);
    if (rankingSource !== 'todos') filtered = filtered.filter(p => p.source === rankingSource);
    const map: Record<string, { total: number; ganados: number; perdidos: number }> = {};
    filtered.forEach(p => {
      const sp = p.salesperson || 'Sin asignar';
      if (!map[sp]) map[sp] = { total: 0, ganados: 0, perdidos: 0 };
      map[sp].total++;
      if (p.status === 'ganado') map[sp].ganados++;
      if (p.status === 'perdido') map[sp].perdidos++;
    });
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        total: data.total,
        ganados: data.ganados,
        perdidos: data.perdidos,
        conversion: data.total > 0 ? Math.round((data.ganados / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.ganados - a.ganados || b.total - a.total);
  }, [prospects, rankingDealership, rankingSource]);

  // ─── 9. Prospectos por canal ───
  const SOURCE_LABELS: Record<string, string> = {
    concesionario: 'Concesionario', visita: 'Visita', evento: 'Evento',
    referido: 'Referido', pagina_web: 'Página Web', redes_sociales: 'Redes Sociales',
    presencial: 'Presencial', telefono: 'Teléfono', web: 'Web', otro: 'Otro',
  };
  const prospectsBySource = useMemo(() => {
    const map: Record<string, number> = {};
    prospects.forEach(p => { map[p.source] = (map[p.source] || 0) + 1; });
    return Object.entries(map)
      .map(([key, value]) => ({ name: SOURCE_LABELS[key] || key, value }))
      .sort((a, b) => b.value - a.value);
  }, [prospects]);

  // ─── 10. Eventos — captación por evento ───
  const [eventFilter, setEventFilter] = useState('todos');

  const eventBreakdown = useMemo(() => {
    const map: Record<string, { total: number; ganados: number }> = {};
    prospects.forEach(p => {
      if (p.event_name) {
        if (!map[p.event_name]) map[p.event_name] = { total: 0, ganados: 0 };
        map[p.event_name].total++;
        if (p.status === 'ganado') map[p.event_name].ganados++;
      }
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, total: d.total, ganados: d.ganados }))
      .sort((a, b) => b.total - a.total);
  }, [prospects]);

  // ─── Trend ───
  const dailyTrend = useMemo(() => {
    const days: Record<string, { date: string; prospectos: number; reservas: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = { date: `${d.getDate()}/${d.getMonth() + 1}`, prospectos: 0, reservas: 0 };
    }
    prospects.forEach(p => { const key = p.created_at.split('T')[0]; if (days[key]) days[key].prospectos++; });
    reservations.forEach(r => { const key = r.created_at.split('T')[0]; if (days[key]) days[key].reservas++; });
    return Object.values(days);
  }, [prospects, reservations]);

  // ─── Prospect status pie ───
  const prospectStatusPie = useMemo(() => {
    return PROSPECT_STATUSES.filter(s => prospectsByStatus[s.name]).map(s => ({
      name: s.label, value: prospectsByStatus[s.name] || 0,
    }));
  }, [PROSPECT_STATUSES, prospectsByStatus]);

  // ─── Stacked contact type by salesperson ───
  const contactTypeBySalesperson = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const sourceSet = new Set<string>();
    prospects.forEach(p => {
      const sp = p.salesperson || 'Sin asignar';
      if (!map[sp]) map[sp] = {};
      const srcLabel = SOURCE_LABELS[p.source] || p.source;
      map[sp][srcLabel] = (map[sp][srcLabel] || 0) + 1;
      sourceSet.add(srcLabel);
    });
    const sources = Array.from(sourceSet);
    const data = Object.entries(map)
      .map(([name, srcs]) => ({ name, ...srcs }))
      .sort((a, b) => {
        const tA = Object.values(a).reduce((s: number, v) => typeof v === 'number' ? s + v : s, 0);
        const tB = Object.values(b).reduce((s: number, v) => typeof v === 'number' ? s + v : s, 0);
        return (tB as number) - (tA as number);
      });
    return { data, sources };
  }, [prospects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando analíticas...</p>
        </div>
      </div>
    );
  }

  // Cada tarjeta del tablero, con la clave con la que se guarda su preferencia. `span`
  // conserva la grilla actual: las dos de prospectos siguen lado a lado, el resto a lo
  // ancho. La vista original va como `children` — varias muestran más que un conteo
  // (conversión, satisfacción, tendencia) y reducirlas a nombre+número perdería datos.
  const chartBlocks: Record<string, { span: 'full' | 'half'; node: React.ReactNode }> = {
    citas_concesionario: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="citas_concesionario" title="Citas por Concesionario / Centro de Servicio"
          icon={Building2} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={reservasByDealership.map(d => ({ name: d.name, value: d.value }))}
        >
          {reservasByDealership.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {reservasByDealership.map(d => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="w-28 sm:w-40 text-xs truncate text-right text-muted-foreground shrink-0">{d.name}</div>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", d.isServiceCenter ? "bg-orange-400" : "bg-primary")}
                      style={{ width: `${reservasByDealership[0].value > 0 ? Math.round((d.value / reservasByDealership[0].value) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-bold w-6 text-right">{d.value}</span>
                    {d.isServiceCenter && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600">CS</Badge>}
                  </div>
                </div>
              ))}
              <div className="flex gap-4 pt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" /> Concesionario</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Centro de Servicio</span>
              </div>
            </div>
          )}
        </ChartCard>
      ),
    },

    tipos_servicio: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="tipos_servicio" title="Tipos de Servicio"
          icon={Wrench} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={serviceTypeData}
        >
          {serviceTypeData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, serviceTypeData.length * 36)}>
              <BarChart data={serviceTypeData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" name="Citas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      ),
    },

    satisfaccion_concesionario: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="satisfaccion_concesionario" title="Satisfacción del Cliente por Concesionario"
          icon={Star} iconClass="text-amber-500" layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={satisfactionByDealership.byDealer.map(d => ({ name: d.name, value: d.avg }))}
          showPercent={false} unit="/5" color="hsl(45, 90%, 45%)"
          emptyText="Sin calificaciones registradas"
        >
          {satisfactionByDealership.byDealer.length === 0 ? (
            <div className="text-center py-8 space-y-1">
              <p className="text-xs text-muted-foreground">Sin calificaciones registradas</p>
              <p className="text-[10px] text-muted-foreground/70">Las calificaciones se registran al completar una reserva (campo satisfacción 1–5)</p>
            </div>
          ) : (
            <div className="space-y-3">
              {satisfactionByDealership.byDealer.map(d => (
                <div key={d.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{d.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground text-[10px]">{d.count} resp.</span>
                      <span className={cn("font-bold", d.avg >= 4 ? "text-green-600" : d.avg >= 3 ? "text-amber-600" : "text-red-500")}>{d.avg}/5</span>
                      <span className="text-muted-foreground">{d.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", d.avg >= 4 ? "bg-green-500" : d.avg >= 3 ? "bg-amber-400" : "bg-red-400")} style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      ),
    },

    prospectos_conversion: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="prospectos_conversion" title="Prospectos y Conversión por Concesionario"
          icon={Users} iconClass="text-blue-500" layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={prospectsByDealership.map(d => ({ name: d.name, value: d.total }))}
          color="hsl(220, 70%, 55%)"
        >
          {prospectsByDealership.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {prospectsByDealership.map(d => (
                <div key={d.name} className="flex items-center gap-3 px-6 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{d.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${prospectsByDealership[0].total > 0 ? Math.round((d.total / prospectsByDealership[0].total) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{d.total} leads</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-green-300 text-green-700">
                      <ArrowUpRight className="w-2.5 h-2.5" />{d.ganados}
                    </Badge>
                    <span className={cn("text-xs font-bold w-9 text-right", d.conversion >= 50 ? "text-green-600" : d.conversion >= 20 ? "text-amber-600" : "text-muted-foreground")}>
                      {d.conversion}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      ),
    },

    ranking_vendedores: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="ranking_vendedores" title="Leads · Rendimiento · Conversión por Vendedor"
          icon={Trophy} iconClass="text-amber-500" layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={salespersonRanking.map(sp => ({ name: sp.name, value: sp.total }))}
          headerExtra={
            <div className="flex items-center gap-2 flex-wrap">
              <select value={rankingSource} onChange={e => setRankingSource(e.target.value)}
                className="text-[10px] border rounded-md px-2 py-1 bg-background text-foreground h-7">
                <option value="todos">Todos los canales</option>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={rankingDealership} onChange={e => setRankingDealership(e.target.value)}
                className="text-[10px] border rounded-md px-2 py-1 bg-background text-foreground h-7">
                <option value="todos">Todos los concesionarios</option>
                {dealerships.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          }
        >
          {salespersonRanking.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="-mx-6">
              <div className="grid grid-cols-4 text-[10px] font-semibold text-muted-foreground px-6 py-1.5 border-b">
                <span>Vendedor</span><span className="text-center">Leads</span><span className="text-center">Ganados</span><span className="text-right">Conversión</span>
              </div>
              <div className="divide-y divide-border">
                {salespersonRanking.map((sp, i) => (
                  <div
                    key={sp.name}
                    className="flex items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/admin/prospectos?salesperson=${encodeURIComponent(sp.name)}${rankingSource !== 'todos' ? `&source=${rankingSource}` : ''}${rankingDealership !== 'todos' ? `&dealership=${rankingDealership}` : ''}&fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`)}
                    title={`Ver ${sp.total} prospectos de ${sp.name}`}
                  >
                    <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-800 ring-1 ring-amber-400" :
                      i === 1 ? "bg-gray-100 text-gray-700 ring-1 ring-gray-300" :
                      i === 2 ? "bg-orange-100 text-orange-700 ring-1 ring-orange-300" : "bg-muted text-muted-foreground")}>
                      {i < 3 ? <Medal className="w-3 h-3" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{sp.name}</p>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                        <div className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${salespersonRanking[0]?.total > 0 ? Math.round((sp.total / salespersonRanking[0].total) * 100) : 0}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="w-8 text-center font-medium">{sp.total}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-green-300 text-green-700">
                        <ArrowUpRight className="w-2.5 h-2.5" />{sp.ganados}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-red-300 text-red-600">
                        <ArrowDownRight className="w-2.5 h-2.5" />{sp.perdidos}
                      </Badge>
                      <span className={cn("font-bold w-9 text-right", sp.conversion >= 50 ? "text-green-600" : sp.conversion >= 20 ? "text-amber-600" : "text-muted-foreground")}>
                        {sp.conversion}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      ),
    },

    prospectos_canal: {
      span: 'half',
      node: (
        <ChartCard
          chartKey="prospectos_canal" title="Prospectos por Canal"
          icon={MapPin} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={prospectsBySource} color="hsl(220, 70%, 55%)"
        >
          {prospectsBySource.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, prospectsBySource.length * 36)}>
              <BarChart data={prospectsBySource} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" name="Prospectos" fill="hsl(220, 70%, 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      ),
    },

    prospectos_estado: {
      span: 'half',
      node: (
        <ChartCard
          chartKey="prospectos_estado" title="Prospectos por Estado"
          icon={BarChart2} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={prospectStatusPie}
        >
          {prospectStatusPie.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width={isMobile ? 160 : 180} height={160}>
                <PieChart>
                  <Pie data={prospectStatusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={2}>
                    {prospectStatusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, 'Prospectos']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center sm:flex-col sm:gap-1">
                {prospectStatusPie.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      ),
    },

    contacto_vendedor: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="contacto_vendedor" title="Tipo de Contacto por Vendedor"
          icon={UserCheck} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={contactTypeBySalesperson.data.map(row => ({
            name: String(row.name),
            // Lista y torta necesitan UN número por vendedor, así que se suman sus canales.
            // La vista original sigue mostrando el desglose apilado.
            value: contactTypeBySalesperson.sources.reduce(
              (acc, src) => acc + (Number((row as Record<string, unknown>)[src]) || 0), 0),
          }))}
        >
          {contactTypeBySalesperson.data.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, contactTypeBySalesperson.data.length * 40)}>
              <BarChart data={contactTypeBySalesperson.data} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {contactTypeBySalesperson.sources.map((src, i) => (
                  <Bar key={src} dataKey={src} stackId="a" fill={COLORS[i % COLORS.length]}
                    radius={i === contactTypeBySalesperson.sources.length - 1 ? [0, 4, 4, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      ),
    },

    tendencia_diaria: {
      span: 'full',
      // Sin `series`: es una serie de tiempo con DOS métricas. Aplanarla a nombre+número
      // perdería la mitad, así que esta tarjeta se mueve pero no cambia de vista.
      node: (
        <ChartCard
          chartKey="tendencia_diaria" title="Tendencia Diaria (30 días)"
          icon={TrendingUp} layout={layout} allKeys={DASHBOARD_CHART_KEYS}
        >
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
            <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={isMobile ? 4 : 2} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="prospectos" name="Prospectos" stroke="hsl(220, 70%, 55%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reservas" name="Reservas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ),
    },

    eventos: {
      span: 'full',
      node: (
        <ChartCard
          chartKey="eventos" title="Eventos — Captación de Leads"
          icon={CalendarDays} iconClass="text-violet-500" layout={layout} allKeys={DASHBOARD_CHART_KEYS}
          series={eventBreakdown.map(ev => ({ name: ev.name, value: ev.total }))}
          color="hsl(280, 60%, 55%)"
          emptyText="No hay prospectos registrados desde eventos"
          headerExtra={eventBreakdown.length > 0 ? (
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="Todos los eventos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los eventos</SelectItem>
                {eventBreakdown.map(ev => (
                  <SelectItem key={ev.name} value={ev.name}>{ev.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined}
        >
          {eventBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No hay prospectos registrados desde eventos</p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {(eventFilter === 'todos' ? eventBreakdown : eventBreakdown.filter(ev => ev.name === eventFilter)).map(ev => (
                <div
                  key={ev.name}
                  className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/admin/prospectos?event_name=${encodeURIComponent(ev.name)}&fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`)}
                  title={`Ver ${ev.total} prospectos del evento`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-violet-50 text-violet-600 shrink-0">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{ev.name}</p>
                      <p className="text-[10px] text-muted-foreground">Haz clic para ver prospectos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold">{ev.total}</p>
                      <p className="text-[10px] text-muted-foreground">leads captados</p>
                    </div>
                    {ev.ganados > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-green-300 text-green-700">
                        <ArrowUpRight className="w-2.5 h-2.5" />{ev.ganados} ganados
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      ),
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">{rangeDescription(fechaDesde, fechaHasta)}</span> — Resumen general del sistema
          </p>
        </div>
        <DashboardDateRange
          desde={fechaDesde}
          hasta={fechaHasta}
          onChange={(d, h) => { setFechaDesde(d); setFechaHasta(h); }}
        />
      </div>

      <Tabs defaultValue="resumen" className="space-y-6">
        <TabsList>
          <TabsTrigger value="resumen" className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Resumen</TabsTrigger>
          <TabsTrigger value="satisfaccion" className="gap-1.5"><Smile className="w-3.5 h-3.5" /> Satisfacción</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
      {/* ╔════ SECCIÓN: VISTA GENERAL ════╗ */}
      <div className="flex items-center gap-2 pb-1 border-b border-border/60">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-display font-semibold">Vista general</h2>
        {layout.hasCustomLayout && (
          <Button
            variant="ghost" size="sm"
            className="h-6 text-[10px] text-muted-foreground gap-1 ml-auto"
            onClick={layout.reset}
            title="Vuelve al orden y las vistas de fábrica"
          >
            <RotateCcw className="w-3 h-3" /> Restablecer tablero
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground">indicadores y reportes estándar</span>
      </div>

      {/* KPI Cards — cada uno detrás de su permiso: un asesor de servicio no ve indicadores
          de ventas. Ver DASHBOARD_CHART_PERMISSIONS para los reportes de abajo. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {canSeeReservations && (
          <KpiCard icon={CalendarDays} label="Citas Reservadas" value={totalReservations} color="text-primary" sub={`${reservasCompletadas} completadas · ${reservasAbiertas} abiertas · ${reservasCanceladas} canceladas`} />
        )}
        {canSeeProspects && (
          <KpiCard icon={Users} label="Leads Captados" value={totalProspects} color="text-blue-600" sub={`${ganados} ganados · ${prospectsByStatus['perdido'] || 0} perdidos`} />
        )}
        {canSeeProspects && (
          <KpiCard icon={Target} label="Tasa Conversión" value={`${conversionRate}%`} color="text-green-600" sub={`${ganados} ganados de ${totalProspects}`} />
        )}
        {canSeeReservations && (
          <KpiCard icon={Star} label="Satisfacción Gral." value={satisfactionByDealership.ratedAll > 0 ? `${satisfactionByDealership.avgAll}/5` : 'N/A'} color="text-amber-500" sub={satisfactionByDealership.ratedAll > 0 ? `${satisfactionByDealership.ratedAll} respuestas` : 'Sin calificaciones'} />
        )}
      </div>

      {/* ── Reportes estándar ──────────────────────────────────────────────────
          Cada tarjeta se puede reordenar y cambiar de vista; la elección se guarda
          por usuario en `dashboard_layout_prefs`. Se arman como un diccionario y se
          renderizan en el orden que devuelve el hook: sin eso, "moverlo" implicaría
          reescribir el JSX. La vista original de cada una va como `children`. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {layout.order(DASHBOARD_CHART_KEYS).map(key => {
          const block = chartBlocks[key];
          if (!block) return null;
          const required = DASHBOARD_CHART_PERMISSIONS[key];
          if (required && !hasPermission(required)) return null;
          return (
            <div key={key} className={block.span === 'full' ? 'md:col-span-2' : ''}>
              {block.node}
            </div>
          );
        })}
      </div>

      {/* ╔════ SECCIÓN: WIDGETS PERSONALIZADOS ════╗ */}
      <div className="pt-4 mt-4 border-t-2 border-dashed border-primary/30 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border/60">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-semibold">Widgets personalizados</h2>
          <span className="text-[10px] text-muted-foreground">indicadores configurables por administrador</span>
        </div>
        <CustomWidgetsSection dealerships={dealerships.map(d => ({ id: d.id, name: d.name }))} />
      </div>
        </TabsContent>

        <TabsContent value="satisfaccion">
          <SatisfactionDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── KPI Card Component ───
function KpiCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <Card className="gac-shadow">
      <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
        <div className={cn("p-2.5 sm:p-3 rounded-xl bg-muted shrink-0", color)}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-display font-bold">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminDashboard;
