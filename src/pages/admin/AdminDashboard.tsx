import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarDays, ClipboardList, Users, TrendingUp, UserCheck,
  MapPin, Trophy, Target, ArrowUpRight, ArrowDownRight, Medal,
  Star, Wrench, Building2, BarChart2, LayoutGrid, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { useIsMobile } from '@/hooks/use-mobile';
import CustomWidgetsSection from '@/components/dashboard/CustomWidgetsSection';

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
  const isMobile = useIsMobile();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range filter — default últimos 30 días
  const defaultDesde = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
  const defaultHasta = new Date().toISOString().slice(0, 10);
  const [fechaDesde, setFechaDesde] = useState<string>(defaultDesde);
  const [fechaHasta, setFechaHasta] = useState<string>(defaultHasta);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const isDefaultRange = fechaDesde === defaultDesde && fechaHasta === defaultHasta;

  const applyLast30 = () => { setFechaDesde(defaultDesde); setFechaHasta(defaultHasta); };
  const applyThisMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setFechaDesde(new Date(y, m, 1).toISOString().slice(0, 10));
    setFechaHasta(new Date(y, m + 1, 0).toISOString().slice(0, 10));
  };
  const applyLastMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setFechaDesde(new Date(y, m - 1, 1).toISOString().slice(0, 10));
    setFechaHasta(new Date(y, m, 0).toISOString().slice(0, 10));
  };
  const applyYTD = () => {
    const y = new Date().getFullYear();
    setFechaDesde(`${y}-01-01`);
    setFechaHasta(defaultHasta);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = fechaDesde ? `${fechaDesde}T00:00:00` : undefined;
      const until = fechaHasta ? `${fechaHasta}T23:59:59` : undefined;

      let pq: any = supabase.from('prospects').select('id, status, source, salesperson, created_at, dealership_id, event_name');
      let rq: any = supabase.from('reservations').select('id, status, reservation_date, service_type, dealership_id, created_at, satisfaction_rating');
      if (since) { pq = pq.gte('created_at', since); rq = rq.gte('created_at', since); }
      if (until) { pq = pq.lte('created_at', until); rq = rq.lte('created_at', until); }

      const [pRes, rRes, dRes] = await Promise.all([
        pq,
        rq,
        supabase.from('dealerships').select('id, name, is_service_center').eq('is_active', true),
      ]);

      setProspects((pRes.data || []) as Prospect[]);
      setReservations((rRes.data || []) as unknown as Reservation[]);
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
    reservations.forEach(r => { map[r.service_type] = (map[r.service_type] || 0) + 1; });
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
  const salespersonRanking = useMemo(() => {
    const filtered = rankingDealership === 'todos' ? prospects : prospects.filter(p => p.dealership_id === rankingDealership);
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
  }, [prospects, rankingDealership]);

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

  // ─── 10. Eventos ───
  const eventBreakdown = useMemo(() => {
    const map: Record<string, { total: number; ganados: number }> = {};
    prospects.forEach(p => {
      if (p.source === 'evento' && p.event_name) {
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

  const rangeLabel = isDefaultRange
    ? 'Últimos 30 días'
    : `${new Date(fechaDesde + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(fechaHasta + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{rangeLabel} — Resumen general del sistema</p>
        </div>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-xs gap-1.5", !isDefaultRange && "border-primary text-primary")}>
              <CalendarDays className="w-3.5 h-3.5" />
              {isDefaultRange ? 'Últimos 30 días' : `${new Date(fechaDesde + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} – ${new Date(fechaHasta + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 space-y-3" align="end">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyLast30}>Últimos 30 días</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyThisMonth}>Este mes</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyLastMonth}>Mes pasado</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={applyYTD}>Año actual</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Desde</span>
                <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Hasta</span>
                <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            {!isDefaultRange && (
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full text-muted-foreground gap-1" onClick={applyLast30}>
                <X className="w-3 h-3" />Restablecer (30 días)
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* ╔════ SECCIÓN: VISTA GENERAL ════╗ */}
      <div className="flex items-center gap-2 pb-1 border-b border-border/60">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-display font-semibold">Vista general</h2>
        <span className="text-[10px] text-muted-foreground">indicadores y reportes estándar</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={CalendarDays} label="Citas Reservadas" value={totalReservations} color="text-primary" sub={`${reservasCompletadas} completadas · ${reservasPendientes} pendientes`} />
        <KpiCard icon={Users} label="Prospectos" value={totalProspects} color="text-blue-600" />
        <KpiCard icon={Target} label="Tasa Conversión" value={`${conversionRate}%`} color="text-green-600" sub={`${ganados} ganados de ${totalProspects}`} />
        <KpiCard icon={Star} label="Satisfacción Gral." value={satisfactionByDealership.ratedAll > 0 ? `${satisfactionByDealership.avgAll}/5` : 'N/A'} color="text-amber-500" sub={satisfactionByDealership.ratedAll > 0 ? `${satisfactionByDealership.ratedAll} respuestas` : 'Sin calificaciones'} />
      </div>

      {/* ── 1. Citas por concesionario / centro de servicio ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" /> Citas por Concesionario / Centro de Servicio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reservasByDealership.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {reservasByDealership.map((d, i) => (
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
        </CardContent>
      </Card>

      {/* ── 2. Tipos de servicios ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" /> Tipos de Servicio
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* ── 3. Satisfacción del cliente por concesionario ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Satisfacción del Cliente por Concesionario
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* ── 4 & 5. Prospectos y % conversión por concesionario ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" /> Prospectos y Conversión por Concesionario
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {prospectsByDealership.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <div className="divide-y divide-border">
              {prospectsByDealership.map(d => (
                <div key={d.name} className="flex items-center gap-3 px-4 py-2.5">
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
        </CardContent>
      </Card>

      {/* ── 6, 7 & 8. Leads por asesor / Rendimiento / % conversión ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Leads · Rendimiento · Conversión por Vendedor
            </CardTitle>
            <select value={rankingDealership} onChange={e => setRankingDealership(e.target.value)}
              className="text-[10px] border rounded-md px-2 py-1 bg-background text-foreground h-7">
              <option value="todos">Todos los concesionarios</option>
              {dealerships.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {salespersonRanking.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos</p>
          ) : (
            <>
              <div className="grid grid-cols-4 text-[10px] font-semibold text-muted-foreground px-4 py-1.5 border-b">
                <span>Vendedor</span><span className="text-center">Leads</span><span className="text-center">Ganados</span><span className="text-right">Conversión</span>
              </div>
              <div className="divide-y divide-border">
                {salespersonRanking.map((sp, i) => (
                  <div key={sp.name} className="flex items-center gap-3 px-4 py-2.5">
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
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 9. Prospectos por canal ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="gac-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" /> Prospectos por Canal
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Prospectos por estado (pie) */}
        <Card className="gac-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-muted-foreground" /> Prospectos por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* ── Tipo de contacto por vendedor (stacked) ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-muted-foreground" /> Tipo de Contacto por Vendedor
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* ── Tendencia diaria ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" /> Tendencia Diaria (30 días)
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* ── 10. Captación por evento ── */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-violet-500" /> Eventos — Captación de Leads
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {eventBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No hay prospectos registrados desde eventos</p>
          ) : (
            <div className="divide-y divide-border">
              {eventBreakdown.map(ev => (
                <div key={ev.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-violet-50 text-violet-600 shrink-0">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{ev.name}</p>
                      <p className="text-[10px] text-muted-foreground">Evento</p>
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
        </CardContent>
      </Card>

      {/* ╔════ SECCIÓN: WIDGETS PERSONALIZADOS ════╗ */}
      <div className="pt-4 mt-4 border-t-2 border-dashed border-primary/30 space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border/60">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-semibold">Widgets personalizados</h2>
          <span className="text-[10px] text-muted-foreground">indicadores configurables por administrador</span>
        </div>
        <CustomWidgetsSection dealerships={dealerships.map(d => ({ id: d.id, name: d.name }))} />
      </div>
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
