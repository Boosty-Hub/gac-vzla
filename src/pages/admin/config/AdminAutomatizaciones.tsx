import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SalesSurveyConfigCard from '@/components/config/SalesSurveyConfigCard';
import PostventaSurveyConfigCard from '@/components/config/PostventaSurveyConfigCard';
import OpenReservationsReminderCard from '@/components/config/OpenReservationsReminderCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Copy, RefreshCw, ArrowRight, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const WEBHOOK_URL = 'https://wsbuqiznddvxcwvpnbxm.supabase.co/functions/v1/kommo-webhook';

// Espejo de `integration_configs.stage_mappings`. Se sacó la fila 'nuevo': apuntaba a la MISMA
// etapa que 'por_contactar' (101392711), ese estado ya no existe en el catálogo y no lo escribe
// nadie. Se agregó 'seguimiento', que sí está en el mapeo real y faltaba en esta tabla.
const STAGE_MAPPING = [
  { ourStatus: 'por_contactar', ourLabel: 'Por Contactar', kommoStage: 'por contactar', kommoId: 101392711 },
  { ourStatus: 'en_conversacion', ourLabel: 'En Conversación', kommoStage: 'en conversación', kommoId: 102420903 },
  { ourStatus: 'cotizacion_enviada', ourLabel: 'Cotización Enviada', kommoStage: 'cotización enviada', kommoId: 101392715 },
  { ourStatus: 'precalificar', ourLabel: 'Precalificar', kommoStage: 'precalificar', kommoId: 101393955 },
  { ourStatus: 'demostracion', ourLabel: 'Demostración', kommoStage: 'demostración', kommoId: 101392719 },
  { ourStatus: 'negociacion', ourLabel: 'Negociación', kommoStage: 'negociación', kommoId: 101392723 },
  { ourStatus: 'pendiente_por_disponibilidad', ourLabel: 'Pendiente por Disponibilidad', kommoStage: 'Pendiente por disponibilidad', kommoId: 104647804 },
  { ourStatus: 'seguimiento', ourLabel: 'Seguimiento', kommoStage: 'seguimiento', kommoId: 105277992 },
  { ourStatus: 'ganado', ourLabel: 'Ganado', kommoStage: 'GANADO', kommoId: 142 },
  { ourStatus: 'perdido', ourLabel: 'Perdido', kommoStage: 'PERDIDO', kommoId: 143 },
];

interface LogEntry {
  id: string;
  event_type: string;
  prospect_id: string | null;
  kommo_lead_id: number | null;
  status: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  create_lead: 'Crear lead en Kommo',
  update_stage: 'Actualizar etapa en Kommo',
  webhook_status_update: 'Actualización desde Kommo',
  webhook_lead_not_found: 'Lead no encontrado (webhook)',
};

export default function AdminAutomatizaciones() {
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('integration_configs' as any)
      .select('is_active')
      .eq('integration_name', 'kommo')
      .single();
    setIsActive((data as any)?.is_active ?? false);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from('integration_logs')
      .select('*')
      .eq('integration_name', 'kommo')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs((data as LogEntry[]) || []);
    setLoadingLogs(false);
  };

  const fetchSyncedCount = async () => {
    const { count } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .not('kommo_lead_id', 'is', null);
    setSyncedCount(count ?? 0);
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();
    fetchSyncedCount();
  }, []);

  const copyWebhook = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success('URL copiada al portapapeles');
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Integración bidireccional con Kommo CRM para sincronización de prospectos.
        </p>
      </div>

      {/* Connection status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Kommo CRM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {isActive === null ? (
              <Badge variant="outline">Cargando...</Badge>
            ) : isActive ? (
              <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Activo
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 border-0 gap-1">
                <XCircle className="w-3.5 h-3.5" /> Inactivo
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">gacvenezuelait.kommo.com — Pipeline: Ventas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-muted-foreground text-xs">Prospectos sincronizados</p>
              <p className="text-2xl font-semibold">{syncedCount ?? '—'}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-muted-foreground text-xs">Flujo saliente</p>
              <p className="font-medium">Prospecto → Lead Kommo</p>
              <p className="text-xs text-muted-foreground">Al crear un prospecto</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-muted-foreground text-xs">Flujo entrante</p>
              <p className="font-medium">Kommo → Prospecto</p>
              <p className="text-xs text-muted-foreground">Cambio de etapa via webhook</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">URL del Webhook (configurar en Kommo)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate">
                {WEBHOOK_URL}
              </code>
              <Button size="sm" variant="outline" onClick={copyWebhook}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              En Kommo: Configuración → Integraciones → tu app → Webhooks → agregar esta URL para el evento "Estado del lead cambiado".
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Venta primero y postventa después: es el orden en que las vive el cliente, y deja
          claro de un vistazo que son dos encuestas distintas con dos interruptores. */}
      <SalesSurveyConfigCard />

      <PostventaSurveyConfigCard />

      <OpenReservationsReminderCard />

      {/* Stage mapping */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mapeo de Etapas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {STAGE_MAPPING.map(m => (
              <div key={m.ourStatus} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                <span className="w-52 font-medium">{m.ourLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 text-muted-foreground capitalize">{m.kommoStage}</span>
                <code className="text-xs text-muted-foreground font-mono">{m.kommoId}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Actividad Reciente</CardTitle>
            <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loadingLogs}>
              <RefreshCw className={cn('w-3.5 h-3.5', loadingLogs && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 && !loadingLogs ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin actividad registrada aún.
            </p>
          ) : (
            <ScrollArea className="h-72">
              <div className="space-y-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                    <span className={cn(
                      'mt-0.5 w-2 h-2 rounded-full shrink-0',
                      log.status === 'success' ? 'bg-green-500' :
                      log.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {EVENT_LABELS[log.event_type] || log.event_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.kommo_lead_id ? `Lead Kommo #${log.kommo_lead_id} · ` : ''}
                        {formatDate(log.created_at)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-xs',
                        log.status === 'success' ? 'text-green-700 border-green-200' :
                        log.status === 'warning' ? 'text-yellow-700 border-yellow-200' :
                        'text-red-700 border-red-200'
                      )}
                    >
                      {log.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
