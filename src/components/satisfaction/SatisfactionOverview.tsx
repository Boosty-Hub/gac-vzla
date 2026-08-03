import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Smile, ThumbsUp, ClipboardList, AlertTriangle, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SATISFACTION_ASPECTS, getSatisfactionLevel } from '@/lib/satisfaction';
import { computeSurveyStats, computeFunnel, type SurveyResponseLike } from '@/lib/satisfactionStats';

// `satisfaction_surveys` / `satisfaction_responses` are not in the generated
// `types.ts` yet (new tables, no regen) — all Supabase calls below use `as any`,
// matching this project's established convention for un-typed tables.

interface SurveyRow {
  id: string;
  client_name: string | null;
  salesperson: string | null;
  sold_plate: string | null;
  status: string;
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
}

const SatisfactionOverview = ({ compact, surveys: controlledSurveys }: SatisfactionOverviewProps) => {
  const isControlled = controlledSurveys !== undefined;
  const [fetchedSurveys, setFetchedSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(!isControlled);

  useEffect(() => {
    if (isControlled) return; // parent owns the data — skip the internal fetch entirely
    const fetchSurveys = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('satisfaction_surveys')
        .select('id, client_name, salesperson, sold_plate, status, responded_at, dealerships(name), response:satisfaction_responses(*)')
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display">Encuestas respondidas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Cargando encuestas...</p>
              </div>
            ) : respondedSurveys.length === 0 ? (
              <div className="p-8 text-center">
                <Smile className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Aún no hay encuestas respondidas</p>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {respondedSurveys.map(s => {
                      const r = s.response!;
                      const score = Number(r.overall_score);
                      const level = getSatisfactionLevel(Math.round(score));
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              {r.has_low_score && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" title="Puntaje bajo en algún aspecto" />
                              )}
                              {s.client_name || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{s.dealerships?.name || '-'}</TableCell>
                          <TableCell className="text-xs">{s.salesperson || '-'}</TableCell>
                          <TableCell className="text-xs">{s.sold_plate || '-'}</TableCell>
                          <TableCell className="text-xs">
                            {s.responded_at ? format(new Date(s.responded_at), 'dd/MM/yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="text-[10px] gap-1" style={{ backgroundColor: `hsl(${level.color} / 0.15)`, color: `hsl(${level.color})` }}>
                              {score.toFixed(1)} {level.emoji}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
