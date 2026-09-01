import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wrench, ClipboardList, AlertTriangle, Gauge, MessageSquare, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSatisfactionLevel } from '@/lib/satisfaction';
import {
  computeServiceSurveyStats,
  computeQuestionBreakdown,
  type ServiceSurveyLike,
} from '@/lib/serviceSatisfactionStats';

/**
 * Panel de resultados de la encuesta de POSTVENTA / SERVICIO.
 *
 * Por qué existe: hasta hoy esta encuesta no tenía panel. `SatisfactionOverview` y
 * `SatisfactionDashboard` filtran `origin IN ('won','repurchase')` a propósito — las
 * respuestas de postventa viven en `service_survey_responses`, así que entrar por ese camino
 * las mostraba como ventas enviadas y jamás respondidas. El único lugar donde se veía una
 * respuesta de taller era dentro del historial de UN vehículo, de a una por vez: servía para
 * revisar un caso, nunca para saber cómo viene el taller.
 *
 * Se mide 8 de 128 respondidas (~6%) contra el ~29% de la encuesta de venta. Ese número no se
 * podía ver en ninguna pantalla, y es justamente el que decide si la encuesta sirve.
 */

interface ServiceSurveyRow extends ServiceSurveyLike {
  id: string;
  /** Null en encuestas viejas creadas antes de que esta tabla tuviera `client_id`. Esas
   *  filas se listan igual pero no se pueden abrir: no hay a quien abrir. */
  client_id: string | null;
  client_name: string | null;
  sold_plate: string | null;
  created_at: string | null;
  responded_at: string | null;
  dealership_id: string | null;
  dealerships: { name: string } | null;
  reservations: { service_type: string | null; reservation_date: string | null } | null;
}

const ALL = '__all__';

interface ServiceSatisfactionOverviewProps {
  /**
   * Se llama con el `client_id` de la fila cliqueada. Sin esta prop las filas quedan
   * inertes, asi que el componente sirve igual donde no haya una ficha de cliente que
   * abrir. Es el mismo contrato que `SatisfactionOverview`.
   */
  onSelectClient?: (clientId: string) => void;
  /**
   * Igual que en `SatisfactionDashboard`: acota la consulta a un solo concesionario y oculta
   * el selector "Todos los concesionarios" (quedaría siempre en una sola opción posible).
   * `undefined` deja el panel global, tal como lo usa `AdminDashboard`.
   */
  dealershipId?: string;
}

const ServiceSatisfactionOverview = ({ onSelectClient, dealershipId }: ServiceSatisfactionOverviewProps) => {
  const [rows, setRows] = useState<ServiceSurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dealership, setDealership] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  useEffect(() => {
    if (dealershipId === '') { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      // `satisfaction_surveys` / `service_survey_responses` no están en el types.ts generado
      // (tablas nuevas, sin regenerar) — `as any`, igual que el resto del módulo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('satisfaction_surveys')
        .select(
          'id, client_id, client_name, sold_plate, status, suppressed_reason, created_at, responded_at, ' +
          'dealership_id, dealerships(name), reservations(service_type, reservation_date), ' +
          'response:service_survey_responses(*)',
        )
        // El espejo exacto del filtro de las otras dos vistas. Acá sólo postventa.
        .eq('origin', 'service');
      if (dealershipId) query = query.eq('dealership_id', dealershipId);
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Error al cargar las encuestas de postventa');
        setLoading(false);
        return;
      }

      setRows((data || []) as ServiceSurveyRow[]);
      setLoading(false);
    };
    load();
  }, [dealershipId]);

  const dealershipOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(r => {
      if (r.dealership_id && r.dealerships?.name) seen.set(r.dealership_id, r.dealerships.name);
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      if (dealership !== ALL && r.dealership_id !== dealership) return false;
      if (status === 'responded' && !r.response) return false;
      if (status === 'pending' && r.response) return false;
      if (status === 'low' && !r.response?.has_low_score) return false;
      if (!term) return true;
      return [r.client_name, r.sold_plate, r.reservations?.service_type]
        .some(v => String(v ?? '').toLowerCase().includes(term));
    });
  }, [rows, search, dealership, status]);

  const stats = useMemo(() => computeServiceSurveyStats(filtered), [filtered]);
  const breakdown = useMemo(() => computeQuestionBreakdown(filtered), [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando encuestas de postventa...</p>
        </div>
      </div>
    );
  }

  const avgLevel = stats.avgOverall != null ? getSatisfactionLevel(Math.round(stats.avgOverall)) : null;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, placa o servicio..."
            className="pl-8 h-9 text-sm"
          />
        </div>
        {/* Con dealershipId ya viene fijado desde arriba (una sola opción posible) — el
            selector no aporta nada y solo confundiría a un usuario de concesionario. */}
        {dealershipId === undefined && (
          <Select value={dealership} onValueChange={setDealership}>
            <SelectTrigger className="h-9 w-[190px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los concesionarios</SelectItem>
              {dealershipOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            <SelectItem value="responded">Respondidas</SelectItem>
            <SelectItem value="pending">Sin responder</SelectItem>
            <SelectItem value="low">Con alerta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ClipboardList className="w-3.5 h-3.5" /> Encuestas
            </p>
            <p className="text-2xl font-semibold">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">{stats.pending} sin responder</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5" /> Tasa de respuesta
            </p>
            <p className="text-2xl font-semibold">{stats.responseRate.toFixed(0)}%</p>
            <p className="text-[11px] text-muted-foreground">{stats.responded} respondidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5" /> Promedio general
            </p>
            <p className="text-2xl font-semibold flex items-center gap-1.5">
              {stats.avgOverall != null ? stats.avgOverall.toFixed(1) : '—'}
              {avgLevel && <span className="text-lg">{avgLevel.emoji}</span>}
            </p>
            <p className="text-[11px] text-muted-foreground">sobre 5</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Con alerta
            </p>
            <p className={cn('text-2xl font-semibold', stats.lowScoreCount > 0 && 'text-red-600')}>
              {stats.lowScoreCount}
            </p>
            <p className="text-[11px] text-muted-foreground">{stats.commentCount} con comentario</p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose por pregunta. El promedio general esconde el problema puntual; esto no. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Respuestas por pregunta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.responded === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Todavía no hay respuestas para mostrar.
            </p>
          ) : (
            breakdown.map(q => {
              const level = q.avgScore != null ? getSatisfactionLevel(Math.round(q.avgScore)) : null;
              return (
                <div key={q.column} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{q.title}</span>
                    <span
                      className="font-semibold shrink-0 text-xs"
                      style={level ? { color: `hsl(${level.color})` } : undefined}
                    >
                      {q.avgScore != null ? `${q.avgScore.toFixed(1)} ${level!.emoji}` : '—'}
                    </span>
                  </div>
                  {/* Barra apilada: cada opción con su propio color según cuánto vale. */}
                  <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                    {q.options.map(o => (
                      <div
                        key={o.value}
                        style={{
                          width: `${o.percent}%`,
                          backgroundColor: `hsl(${getSatisfactionLevel(o.score).color})`,
                        }}
                        title={`${o.label}: ${o.count} (${o.percent.toFixed(0)}%)`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {q.options.map(o => (
                      <span key={o.value}>
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                          style={{ backgroundColor: `hsl(${getSatisfactionLevel(o.score).color})` }}
                        />
                        {o.label}: {o.count} ({o.percent.toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Listado. Incluye las no respondidas a propósito: el silencio también es información
          y es lo que explica la diferencia entre "Encuestas" y "respondidas" de arriba. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Encuestas de postventa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Placa</TableHead>
                  <TableHead className="text-xs">Servicio</TableHead>
                  <TableHead className="text-xs">Concesionario</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      No hay encuestas de postventa que coincidan con el filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(r => {
                    const score = r.response ? Number(r.response.overall_score) : null;
                    const level = score != null && Number.isFinite(score)
                      ? getSatisfactionLevel(Math.round(score))
                      : null;
                    const when = r.responded_at || r.created_at;
                    const clickable = Boolean(onSelectClient && r.client_id);
                    return (
                      <TableRow
                        key={r.id}
                        className={clickable ? 'cursor-pointer hover:bg-muted/50' : undefined}
                        onClick={clickable ? () => onSelectClient!(r.client_id!) : undefined}
                      >
                        <TableCell className="text-xs font-medium">
                          {clickable ? (
                            <span className="inline-flex items-center gap-1 text-primary hover:underline">
                              {r.client_name || 'Sin nombre'}
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          ) : (
                            r.client_name || '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.sold_plate || '—'}</TableCell>
                        <TableCell className="text-xs">{r.reservations?.service_type || '—'}</TableCell>
                        <TableCell className="text-xs">{r.dealerships?.name || '—'}</TableCell>
                        <TableCell className="text-xs">
                          {when ? format(new Date(when), 'dd/MM/yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.suppressed_reason ? (
                            <Badge variant="outline" className="text-[10px]">Retirada</Badge>
                          ) : !r.response ? (
                            <Badge variant="outline" className="text-[10px]">Sin responder</Badge>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className="text-[10px] border-0"
                                style={level ? {
                                  backgroundColor: `hsl(${level.color} / 0.15)`,
                                  color: `hsl(${level.color})`,
                                } : undefined}
                              >
                                {score!.toFixed(1)} {level?.emoji}
                              </Badge>
                              {r.response.has_low_score && (
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              )}
                              {String(r.response.comment ?? '').trim() !== '' && (
                                // El comentario completo es lo más valioso de la encuesta; acá
                                // se asoma sin abrir nada. El `title` va en el span porque el
                                // icono de lucide no acepta esa prop.
                                <span title={String(r.response.comment)} className="inline-flex">
                                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ServiceSatisfactionOverview;
