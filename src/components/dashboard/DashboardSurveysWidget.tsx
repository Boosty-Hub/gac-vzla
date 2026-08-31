import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Smile, Wrench, Gauge, AlertTriangle, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSatisfactionLevel } from '@/lib/satisfaction';
import { computeSurveyStats, type SurveyResponseLike } from '@/lib/satisfactionStats';
import { computeServiceSurveyStats, type ServiceSurveyLike } from '@/lib/serviceSatisfactionStats';

/**
 * Widget compacto de encuestas de satisfacción para el Dashboard del portal
 * concesionario / asesor de servicio.
 *
 * Gateado por el permiso `encuestas.view` (+ admin/superadmin, igual que el
 * resto del proyecto): sin el permiso el componente no renderiza nada — ni un
 * estado vacío ni un aviso de "sin permiso" — así el layout del Dashboard
 * queda exactamente igual que hoy para quien no lo tiene.
 *
 * Reusa la lógica pura de agregación de `SatisfactionOverview` /
 * `ServiceSatisfactionOverview` (`computeSurveyStats` / `computeServiceSurveyStats`
 * en `src/lib/satisfactionStats.ts` y `src/lib/serviceSatisfactionStats.ts`) en vez de
 * reinventar el cálculo: solo la consulta (filtrada por concesionario) y la
 * presentación compacta son nuevas. No es un acceso directo al tab "Satisfacción" de
 * Clientes — es un resumen propio para convivir con los demás KPIs de esta pantalla.
 */

interface SaleSurveyRow {
  id: string;
  status: string;
  response: SurveyResponseLike | null;
}

interface ServiceSurveyRow {
  id: string;
  status: string;
  suppressed_reason: string | null;
  response: ServiceSurveyLike['response'];
}

interface DashboardSurveysWidgetProps {
  /** Concesionario ya resuelto por `useDealershipAccess()` en el Dashboard que lo embebe. */
  dealershipId: string;
}

const DashboardSurveysWidget = ({ dealershipId }: DashboardSurveysWidgetProps) => {
  const { role, hasPermission } = useAuth();
  const roleName = role?.name?.toLowerCase() || '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const canView = isAdmin || hasPermission('encuestas.view');

  const [loading, setLoading] = useState(true);
  const [saleRows, setSaleRows] = useState<SaleSurveyRow[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceSurveyRow[]>([]);

  useEffect(() => {
    if (!canView || !dealershipId) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      // `satisfaction_surveys` / `satisfaction_responses` / `service_survey_responses` no
      // están en el types.ts generado (tablas nuevas, sin regenerar) — `as any`, igual que
      // el resto del módulo de satisfacción (SatisfactionOverview, ServiceSatisfactionOverview).
      const [{ data: sale, error: saleErr }, { data: service, error: serviceErr }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('satisfaction_surveys')
          .select('id, status, response:satisfaction_responses(*)')
          .eq('dealership_id', dealershipId)
          // Encuesta de VENTA/ENTREGA — mismo filtro de origen que SatisfactionOverview.
          .in('origin', ['won', 'repurchase']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('satisfaction_surveys')
          .select('id, status, suppressed_reason, response:service_survey_responses(*)')
          .eq('dealership_id', dealershipId)
          // Encuesta de POSTVENTA/SERVICIO — mismo filtro que ServiceSatisfactionOverview.
          .eq('origin', 'service'),
      ]);

      if (saleErr) console.error(saleErr);
      if (serviceErr) console.error(serviceErr);

      setSaleRows((sale || []) as SaleSurveyRow[]);
      setServiceRows((service || []) as ServiceSurveyRow[]);
      setLoading(false);
    };
    load();
  }, [canView, dealershipId]);

  // Sin el permiso, nada de este componente se monta — ni un placeholder.
  if (!canView) return null;

  const saleResponses = saleRows.filter(s => s.response != null).map(s => s.response!);
  const saleStats = computeSurveyStats(saleResponses);
  const saleTotal = saleRows.length;
  const saleResponded = saleResponses.length;
  const saleRate = saleTotal === 0 ? 0 : (saleResponded / saleTotal) * 100;
  const saleLevel = saleStats.avgOverall != null ? getSatisfactionLevel(Math.round(saleStats.avgOverall)) : null;

  const serviceStats = computeServiceSurveyStats(serviceRows);
  const serviceLevel = serviceStats.avgOverall != null ? getSatisfactionLevel(Math.round(serviceStats.avgOverall)) : null;

  const noData = !loading && saleTotal === 0 && serviceStats.total === 0;

  return (
    <Card className="gac-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Smile className="w-4 h-4 text-muted-foreground" /> Encuestas de Satisfacción
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : noData ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Aún no hay encuestas registradas para este concesionario
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Venta / entrega */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" /> Venta / Entrega
              </p>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xl font-bold">{saleTotal}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {saleResponded} respondidas · {saleRate.toFixed(0)}%
                  </p>
                </div>
                <div className="text-right">
                  {saleStats.avgOverall != null && saleLevel ? (
                    <p className="text-lg font-bold flex items-center gap-1 justify-end" style={{ color: `hsl(${saleLevel.color})` }}>
                      {saleStats.avgOverall.toFixed(1)} <span>{saleLevel.emoji}</span>
                    </p>
                  ) : (
                    <p className="text-lg font-bold text-muted-foreground">—</p>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    <Gauge className="w-3 h-3" /> promedio
                  </p>
                </div>
              </div>
              {saleStats.lowScoreCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 border-red-300 text-red-600">
                  <AlertTriangle className="w-3 h-3" /> {saleStats.lowScoreCount} con alerta
                </Badge>
              )}
            </div>

            {/* Postventa / servicio */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-muted-foreground" /> Postventa / Servicio
              </p>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xl font-bold">{serviceStats.total}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {serviceStats.responded} respondidas · {serviceStats.responseRate.toFixed(0)}%
                  </p>
                </div>
                <div className="text-right">
                  {serviceStats.avgOverall != null && serviceLevel ? (
                    <p className="text-lg font-bold flex items-center gap-1 justify-end" style={{ color: `hsl(${serviceLevel.color})` }}>
                      {serviceStats.avgOverall.toFixed(1)} <span>{serviceLevel.emoji}</span>
                    </p>
                  ) : (
                    <p className="text-lg font-bold text-muted-foreground">—</p>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                    <Gauge className="w-3 h-3" /> promedio
                  </p>
                </div>
              </div>
              {serviceStats.lowScoreCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 border-red-300 text-red-600">
                  <AlertTriangle className="w-3 h-3" /> {serviceStats.lowScoreCount} con alerta
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardSurveysWidget;
