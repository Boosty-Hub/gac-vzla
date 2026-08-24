import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Car, CheckCircle2, AlertTriangle, Loader2, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import SurveyAutoSendRow from './SurveyAutoSendRow';

/**
 * Interruptor de la encuesta de ENTREGA DE VEHÍCULO (origin 'won' y 'repurchase').
 *
 * Espejo de `PostventaSurveyConfigCard`, que maneja la del taller. Son dos encuestas
 * distintas, con dos bots distintos en Kommo, y cada una manda sobre sí misma.
 *
 * RUTEO — se escribe `Link Encuesta` en el lead de CONVERSACIÓN del cliente y se rebota la
 * etapa hasta "ENCUESTA ENVIADA". El bot arranca al ENTRAR a esa etapa, 20 horas después de
 * la compra. Por eso ésta necesita etapa Y campo, mientras que la de servicio necesita sólo
 * el campo: allá el disparador es la escritura del campo.
 *
 * La etapa y el campo NO se editan desde acá a propósito: cambiarlos mal es el incidente del
 * 2026-08-14, donde 30 clientes de taller recibieron el mensaje de compra de vehículo. Se
 * muestran para poder verificarlos de un vistazo.
 *
 * Apagada, la encuesta no se crea: ni al pasar un prospecto a ganado, ni al registrar una
 * recompra. No queda cola escondida esperando para salir toda junta al reactivar. La venta
 * se registra igual — `register_won_prospect` devuelve la fila con los campos de encuesta en
 * NULL, y los dos diálogos ya toleran ese caso.
 */

interface DeliveryConfig {
  delivery_enabled: boolean;
  survey_stage_id: string | null;
  survey_link_field_id: string | null;
  sales_enabled: boolean;
  sales_ready: boolean;
  /** false = la manda una persona desde la ficha del cliente. Ver SurveyAutoSendRow. */
  sales_auto_send: boolean;
}

/**
 * `supabase.rpc` es un método de clase y usa `this` adentro. Guardarlo suelto en una
 * constante lo desprende del cliente y revienta al llamarlo. Se envuelve para que el `this`
 * viaje siempre. Ver el comentario largo en PostventaSurveyConfigCard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

const SalesSurveyConfigCard = () => {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await rpc('get_survey_delivery_config');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as DeliveryConfig | undefined;
      if (row) setConfig(row);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cargar la configuración de encuestas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    try {
      const { error } = await rpc('set_sales_survey_enabled', { p_enabled: next });
      if (error) throw error;
      toast.success(
        next
          ? 'Encuesta de entrega de vehículo activada'
          : 'Encuesta de entrega de vehículo desactivada — no se crea ni se envía ninguna',
      );
      load();
    } catch (e) {
      console.error(e);
      const msg = String((e as { message?: string })?.message || '');
      if (msg.includes('not_authorized')) toast.error('No tenés permiso para cambiar esta configuración');
      else toast.error('No se pudo cambiar el estado de la encuesta');
    } finally {
      setToggling(false);
    }
  };

  const enabled = config?.sales_enabled ?? true;
  const ready = config?.sales_ready ?? false;
  const autoSend = config?.sales_auto_send ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Car className="w-4 h-4" />
          Encuesta de Entrega de Vehículo
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Es la de la venta, la que se manda 20 horas después de marcar un prospecto como
          ganado. No es la del taller, que se configura en la tarjeta de abajo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="sales-enabled" className="text-sm">
                  Enviar encuesta de entrega de vehículo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apagado no se crea ni se envía ninguna encuesta de venta ni de recompra. La
                  venta se registra igual. La encuesta del taller no se ve afectada.
                </p>
              </div>
              <Switch
                id="sales-enabled"
                checked={enabled}
                disabled={toggling}
                onCheckedChange={handleToggle}
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {!enabled ? (
                <Badge className="bg-slate-200 text-slate-800 border-0 gap-1">
                  <PowerOff className="w-3.5 h-3.5" /> Desactivada
                </Badge>
              ) : ready ? (
                <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enviando
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-0 gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> En espera de configuración
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {enabled
                  ? 'Se genera al marcar un prospecto como Ganado.'
                  : 'Marcar un prospecto como Ganado no genera ninguna encuesta.'}
              </span>
            </div>

            <SurveyAutoSendRow
              id="sales-auto-send"
              rpcName="set_sales_survey_auto_send"
              autoSend={autoSend}
              disabled={!enabled}
              manualHint='Se manda desde la ficha del cliente, pestaña "Encuestas" → "Enviar encuesta".'
              onChanged={load}
            />

            {!enabled && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold">La encuesta de entrega de vehículo está apagada.</p>
                <p className="text-muted-foreground">
                  No se está creando ni enviando ninguna, ni por venta nueva ni por recompra.
                  La configuración de Kommo queda guardada, así que volver a prenderla es sólo
                  mover el interruptor. Las ventas que se registren mientras esté apagada no
                  generan encuesta ni quedan en cola.
                </p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
              <p className="font-medium">Cómo se entrega</p>
              <p className="text-muted-foreground">
                Escribe el enlace en el campo{' '}
                <code className="font-mono">{config?.survey_link_field_id || '—'}</code> del lead
                de conversación del cliente y lo mueve a la etapa{' '}
                <code className="font-mono">{config?.survey_stage_id || '—'}</code>. El bot
                arranca al entrar a esa etapa.{' '}
                {autoSend
                  ? 'En modo automático eso pasa 20 horas después de la compra.'
                  : 'En modo manual eso pasa en el momento en que alguien aprieta "Enviar encuesta".'}
              </p>
              <p className="text-muted-foreground">
                La etapa y el campo no se editan desde acá a propósito: equivocarlos es lo que
                el 2026-08-14 le mandó el mensaje de compra de vehículo a 30 clientes de taller.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SalesSurveyConfigCard;
