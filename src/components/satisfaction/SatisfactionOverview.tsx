import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smile, ThumbsUp, ClipboardList, AlertTriangle, Gauge, Search, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SATISFACTION_ASPECTS, getSatisfactionLevel } from '@/lib/satisfaction';
import { computeSurveyStats, computeFunnel, type SurveyResponseLike } from '@/lib/satisfactionStats';
import {
  ALL_VALUE,
  DEFAULT_TABLE_FILTERS,
  SCORE_BUCKETS,
  STATUS_FILTERS,
  deriveDealershipFacets,
  deriveSalespersonFacets,
  filterSurveyTable,
  hasActiveFilters,
  type ScoreBucket,
  type StatusFilter,
  type SurveyTableFilterState,
} from './surveyTableFilters';

// `satisfaction_surveys` / `satisfaction_responses` are not in the generated
// `types.ts` yet (new tables, no regen) — all Supabase calls below use `as any`,
// matching this project's established convention for un-typed tables.

interface SurveyRow {
  id: string;
  /** Null on legacy surveys created before `client_id` existed on this table. Those rows
   *  render normally but cannot be opened — there is nothing to open. */
  client_id?: string | null;
  client_name: string | null;
  salesperson: string | null;
  sold_plate: string | null;
  status: string;
  /** Optional: the dashboard passes it, this component's own fetch adds it. Used as the
   *  date shown for a survey that has not been answered yet. */
  created_at?: string | null;
  responded_at: string | null;
  dealerships: { name: string } | null;
  // PostgREST returns this as a single object (or null), not an array: the
  // relationship is to-one because satisfaction_responses.survey_id is UNIQUE.
  response: SurveyResponseLike | null;
}

interface SatisfactionOverviewProps {
  /**
   * When true, renders a condensed view: no page header and no
   * "Encuestas respondidas" table — only KPI cards + per-aspect breakdown.
   * Used when this component is embedded inside another section (e.g. the
   * main Admin Dashboard) that already provides its own heading.
   */
  compact?: boolean;
  /**
   * When provided, the component renders this data instead of performing its
   * own fetch (design.md D8). Used by the admin Dashboard's "Satisfacción"
   * tab, which owns one RLS-scoped fetch and applies brand/model/month
   * filters before handing rows down here. When absent, the component keeps
   * fetching independently exactly as before — `AdminClientes.tsx`'s own
   * "Satisfacción" tab keeps working unchanged (uncontrolled fallback).
   */
  surveys?: SurveyRow[];
  /**
   * Called with the survey's `client_id` when a row in "Encuestas respondidas" is clicked.
   * When omitted the rows stay inert, so this component keeps working anywhere it is
   * embedded without a client-detail surface to open.
   */
  onSelectClient?: (clientId: string) => void;
}

const SatisfactionOverview = ({ compact, surveys: controlledSurveys, onSelectClient }: SatisfactionOverviewProps) => {
  const isControlled = controlledSurveys !== undefined;
  const [fetchedSurveys, setFetchedSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(!isControlled);
  const [filters, setFilters] = useState<SurveyTableFilterState>(DEFAULT_TABLE_FILTERS);

  useEffect(() => {
    if (isControlled) return; // parent owns the data — skip the internal fetch entirely
    const fetchSurveys = async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('satisfaction_surveys')
        .select('id, client_id, client_name, salesperson, sold_plate, status, created_at, responded_at, dealerships(name), response:satisfaction_responses(*)')
        // SALE surveys only — same reason as SatisfactionDashboard: a postventa survey's
        // answers live in `service_survey_responses`, so it would arrive with a null
        // `response` and be counted below as an unanswered sale survey.
        .in('origin', ['won', 'repurchase'])
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Error al cargar las encuestas de satisfacción');
        setLoading(false);
        return;
      }

      setFetchedSurveys((data || []) as SurveyRow[]);
      setLoading(false);
    };

    fetchSurveys();
  }, [isControlled]);

  const surveys = isControlled ? controlledSurveys! : fetchedSurveys;

  // `response` embeds as a single object (or null), never an array — see SurveyRow.
  const respondedSurveys = surveys.filter(s => s.response != null);
  const responses = respondedSurveys.map(s => s.response!);

  // The table lists EVERY survey, not just the answered ones. Showing only answered rows
  // made the list contradict the "Total encuestas" KPI directly above it (22 vs 2 rows)
  // with nothing on screen explaining the gap; "sin responder" is itself information a
  // manager needs to chase.
  //
  // Table filters apply ONLY to the table. The KPI cards and the per-aspect breakdown stay
  // on the full set on purpose: those answer "how is the operation doing", and letting a
  // name search rewrite the averages would make the numbers mean something different on
  // every keystroke. Facets come from the unfiltered rows too, so choosing one filter never
  // empties another's options.
  const dealershipFacets = deriveDealershipFacets(surveys);
  const salespersonFacets = deriveSalespersonFacets(surveys);
  const visibleSurveys = filterSurveyTable(surveys, filters);
  const filtersActive = hasActiveFilters(filters);

  const funnel = computeFunnel(surveys);
  const stats = computeSurveyStats(responses);

  const avgOverallRounded = stats.avgOverall != null ? Math.round(stats.avgOverall) : null;
  const avgOverallLevel = avgOverallRounded != null ? getSatisfactionLevel(avgOverallRounded) : null;

  return (
    <div className="space-y-4">
      {/* Header — omitted in compact mode; the parent provides its own heading */}
      {!compact && (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-display font-bold flex items-center gap-2">
              <Smile className="w-5 h-5" /> Encuestas de Satisfacción
            </h1>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              Percepción del cliente post-compra, por aspecto y concesionario
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Card className="gac-shadow">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Total encuestas</p>
            <p className="text-xl font-bold">{funnel.total}</p>
          </CardContent>
        </Card>
        <Card className="gac-shadow">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Respondidas</p>
            <p className="text-xl font-bold">{funnel.responded}</p>
            <p className="text-[10px] text-muted-foreground">{funnel.responseRate.toFixed(0)}% tasa de respuesta</p>
          </CardContent>
        </Card>
        <Card className="gac-shadow">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" /> Promedio general</p>
            {stats.avgOverall != null && avgOverallLevel ? (
              <p className="text-xl font-bold flex items-center gap-1" style={{ color: `hsl(${avgOverallLevel.color})` }}>
                {stats.avgOverall.toFixed(1)} <span>{avgOverallLevel.emoji}</span>
              </p>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
        <Card className="gac-shadow">
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> NPS (recomienda)</p>
            <p className="text-xl font-bold">{stats.npsPercent != null ? `${stats.npsPercent.toFixed(0)}%` : '—'}</p>
          </CardContent>
        </Card>
        <Card className={cn("gac-shadow", stats.lowScoreCount > 0 && "border-red-300")}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Con alerta</p>
            <p className={cn("text-xl font-bold", stats.lowScoreCount > 0 ? "text-red-600" : "")}>{stats.lowScoreCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-aspect breakdown */}
      <Card className="gac-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Promedio por aspecto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.totalResponses === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {SATISFACTION_ASPECTS.map(aspect => {
                const avg = stats.aspectAverages[aspect.key];
                if (avg == null) {
                  return (
                    <div key={aspect.key} className="space-y-1">
                      <p className="text-xs font-medium">{aspect.title}</p>
                      <p className="text-[11px] text-muted-foreground">Sin datos</p>
                    </div>
                  );
                }
                const level = getSatisfactionLevel(Math.round(avg));
                const widthPct = Math.max(0, Math.min(100, (avg / 5) * 100));
                return (
                  <div key={aspect.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{aspect.title}</span>
                      <span className="flex items-center gap-1 font-semibold">
                        {avg.toFixed(1)} <span>{level.emoji}</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${widthPct}%`, backgroundColor: `hsl(${level.color})` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responded surveys table — omitted in compact mode */}
      {!compact && (
        <Card className="gac-shadow">
          <CardHeader className="pb-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-display">Encuestas</CardTitle>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {filtersActive
                  ? `${visibleSurveys.length} de ${surveys.length}`
                  : `${surveys.length}`}
              </span>
            </div>

            {surveys.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={filters.search}
                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                    placeholder="Buscar cliente o placa"
                    className="h-8 pl-7 text-xs"
                  />
                </div>

                <Select
                  value={filters.dealership}
                  onValueChange={v => setFilters(f => ({ ...f, dealership: v }))}
                >
                  <SelectTrigger className="h-8 text-xs sm:w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE} className="text-xs">Todos los concesionarios</SelectItem>
                    {dealershipFacets.map(d => (
                      <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.salesperson}
                  onValueChange={v => setFilters(f => ({ ...f, salesperson: v }))}
                >
                  <SelectTrigger className="h-8 text-xs sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE} className="text-xs">Todos los vendedores</SelectItem>
                    {salespersonFacets.map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.status}
                  onValueChange={v => setFilters(f => ({ ...f, status: v as StatusFilter }))}
                >
                  <SelectTrigger className="h-8 text-xs sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.score}
                  onValueChange={v => setFilters(f => ({ ...f, score: v as ScoreBucket }))}
                >
                  <SelectTrigger className="h-8 text-xs sm:w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCORE_BUCKETS.map(b => (
                      <SelectItem key={b.value} value={b.value} className="text-xs">{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {filtersActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => setFilters(DEFAULT_TABLE_FILTERS)}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Limpiar
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Cargando encuestas...</p>
              </div>
            ) : surveys.length === 0 ? (
              <div className="p-8 text-center">
                <Smile className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Aún no hay encuestas registradas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs">Concesionario</TableHead>
                      <TableHead className="text-xs">Vendedor</TableHead>
                      <TableHead className="text-xs">Placa</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-xs text-center">Puntaje general</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSurveys.map(s => {
                      const r = s.response;
                      const score = r ? Number(r.overall_score) : null;
                      const level = score != null ? getSatisfactionLevel(Math.round(score)) : null;
                      // Legacy surveys predate `client_id`, so there is no client to open.
                      // Those rows stay inert instead of showing a dead affordance.
                      const clientId = s.client_id ?? null;
                      const openable = !!(onSelectClient && clientId);
                      return (
                        <TableRow
                          key={s.id}
                          onClick={openable ? () => onSelectClient!(clientId!) : undefined}
                          // Keyboard parity: a row that acts as a button must be reachable
                          // and activatable without a mouse.
                          tabIndex={openable ? 0 : undefined}
                          role={openable ? 'button' : undefined}
                          onKeyDown={openable ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectClient!(clientId!);
                            }
                          } : undefined}
                          title={openable ? `Ver ficha de ${s.client_name || 'este cliente'}` : undefined}
                          className={cn(openable && 'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 outline-none')}
                        >
                          <TableCell className="text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              {r?.has_low_score && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" title="Puntaje bajo en algún aspecto" />
                              )}
                              {s.client_name || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{s.dealerships?.name || '-'}</TableCell>
                          <TableCell className="text-xs">{s.salesperson || '-'}</TableCell>
                          <TableCell className="text-xs">{s.sold_plate || '-'}</TableCell>
                          <TableCell className="text-xs">
                            {/* Answered → when they answered. Not answered → when it was
                                created, so "how long has this been sitting" is visible. */}
                            {s.responded_at
                              ? format(new Date(s.responded_at), 'dd/MM/yyyy')
                              : s.created_at
                                ? format(new Date(s.created_at), 'dd/MM/yyyy')
                                : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {score != null && level ? (
                              <Badge className="text-[10px] gap-1" style={{ backgroundColor: `hsl(${level.color} / 0.15)`, color: `hsl(${level.color})` }}>
                                {score.toFixed(1)} {level.emoji}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Sin responder
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="p-0 pr-2">
                            {openable && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {visibleSurveys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                          Ninguna encuesta coincide con los filtros aplicados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SatisfactionOverview;
