import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Star, CheckCircle2, AlertTriangle, Loader2, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import SurveyAutoSendRow from './SurveyAutoSendRow';

/**
 * Configuración de entrega de la encuesta de POSTVENTA.
 *
 * Existe porque esta configuración vivía únicamente dentro del JSON de
 * `integration_configs` y sólo podía cambiarse por SQL.
 *
 * RUTEO — venta y postventa se entregan por caminos separados de punta a punta.
 *
 * Venta: escribe `Link Encuesta` (3456839) en el lead de CONVERSACIÓN del cliente y rebota la
 * etapa hasta "ENCUESTA ENVIADA" (109744268). El bot arranca al ENTRAR a esa etapa, 20 horas
 * después de la compra.
 *
 * Postventa: escribe `Link Encuesta / Servicio` (3457883) en el lead DE LA RESERVA, que ya
 * está parado en la columna "Completada", y no mueve ninguna etapa. El bot de postventa vive
 * en esa columna y arranca cuando ese CAMPO se escribe.
 *
 * Por eso acá sólo se pide el campo: el disparador de postventa es el campo, no una etapa. Y
 * por eso tiene que ser un campo distinto al de venta — compartiéndolo, escribir la encuesta
 * de compra dispararía también al bot de taller. Fue el error del 2026-08-14: 30 clientes de
 * taller recibieron el mensaje de entrega de vehículo.
 *
 * INTERRUPTOR (2026-08-19) — el switch de abajo apaga la encuesta de postservicio SIN tocar
 * la de postentrega de vehículo, y sin borrar el id del campo. Apagada no se crea ni se envía
 * nada: no queda cola escondida esperando para salir toda junta al reactivar. Es una llave
 * propia, `service_survey_enabled`, distinta de `survey_delivery_enabled`, que es global y
 * apagaría también las encuestas de compra.
 */

interface DeliveryConfig {
  delivery_enabled: boolean;
  survey_stage_id: string | null;
  survey_link_field_id: string | null;
  survey_stage_id_service: string | null;
  survey_link_field_id_service: string | null;
  service_enabled: boolean;
  service_ready: boolean;
  /** false = la manda una persona desde "Completar Servicio". Ver SurveyAutoSendRow. */
  service_auto_send: boolean;
}

/**
 * `supabase.rpc` es un MÉTODO de clase y usa `this` adentro. Guardarlo suelto en una
 * constante — `const rpc = supabase.rpc` — lo desprende del cliente, y al llamarlo revienta
 * con `TypeError: Cannot read properties of undefined (reading 'rest')` ANTES de salir a la
 * red. Como el throw ocurría dentro de un `async` sin `catch`, la promesa quedaba rechazada,
 * el `setLoading(false)` del final nunca corría y la tarjeta se quedaba en "Cargando..."
 * para siempre. El `as any` de la versión anterior era justamente lo que tapaba el error.
 *
 * Se envuelve en una función que llama sobre `supabase`, así el `this` viaja siempre.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

const PostventaSurveyConfigCard = () => {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [fieldId, setFieldId] = useState('');

  // `finally`, no un `setLoading(false)` al final del camino feliz: si la llamada falla de
  // una forma no prevista, la tarjeta tiene que mostrar el error, no quedarse girando.
  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await rpc('get_survey_delivery_config');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as DeliveryConfig | undefined;
      if (row) {
        setConfig(row);
        setFieldId(row.survey_link_field_id_service ?? '');
      }
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
      const { error } = await rpc('set_service_survey_enabled', { p_enabled: next });
      if (error) throw error;
      toast.success(
        next
          ? 'Encuesta de postventa / servicio activada'
          : 'Encuesta de postventa / servicio desactivada — no se crea ni se envía ninguna',
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await rpc('set_postventa_survey_config', {
        // Postventa / servicio ya no usa etapa: su disparador es la escritura del campo.
        p_stage_id: null,
        p_link_field_id: fieldId.trim() || null,
      });
      if (error) throw error;
      toast.success('Configuración de postventa / servicio guardada');
      load();
    } catch (e) {
      console.error(e);
      const msg = String((e as { message?: string })?.message || '');
      if (msg.includes('field_id_invalido')) toast.error('El ID del campo debe ser numérico');
      else if (msg.includes('not_authorized')) toast.error('No tenés permiso para cambiar esta configuración');
      else toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const enabled = config?.service_enabled ?? true;
  const ready = config?.service_ready ?? false;
  const autoSend = config?.service_auto_send ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="w-4 h-4" />
          Encuesta de Postventa / Servicio
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          Es la del taller, la que se manda al completar una cita. No es la de entrega de
          vehículo, que sale cuando se gana una venta y se configura sola más abajo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            {/* El interruptor va primero: es la decisión más grande de esta tarjeta. */}
            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="pv-enabled" className="text-sm">
                  Enviar encuesta de postventa / servicio
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apagado no se crea ni se envía ninguna encuesta de taller. La encuesta de
                  entrega de vehículo no se ve afectada: sigue saliendo igual.
                </p>
              </div>
              <Switch
                id="pv-enabled"
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
                  ? 'Se genera al marcar una cita como Completada.'
                  : 'Marcar una cita como Completada no genera ninguna encuesta.'}
              </span>
            </div>

            <SurveyAutoSendRow
              id="pv-auto-send"
              rpcName="set_service_survey_auto_send"
              autoSend={autoSend}
              disabled={!enabled}
              manualHint="Al cerrar una cita, el diálogo de Completar Servicio pregunta si se envía."
              onChanged={load}
            />

            {!enabled && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-semibold">La encuesta de postventa / servicio está apagada.</p>
                <p className="text-muted-foreground">
                  No se está creando ni enviando ninguna. El ID del campo de Kommo queda
                  guardado acá abajo, así que volver a prenderla es sólo mover el interruptor.
                  Las citas que se completen mientras esté apagada no generan encuesta ni
                  quedan en cola.
                </p>
              </div>
            )}

            {enabled && !ready && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-900">
                  Las encuestas se están generando, pero no se envían.
                </p>
                <p className="text-amber-800">
                  Falta el campo del enlace de postventa. Las encuestas quedan en cola sin
                  perderse y salen solas apenas se cargue el ID acá abajo.
                </p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-2">
              <p className="font-medium">Cómo se entrega cada una</p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Compra de vehículo:</span> escribe el
                enlace en el campo{' '}
                <code className="font-mono">{config?.survey_link_field_id || '—'}</code> del lead de
                conversación y lo mueve a la etapa{' '}
                <code className="font-mono">{config?.survey_stage_id || '—'}</code>. El bot arranca
                al entrar a esa etapa, 20 horas después de la compra. El interruptor de arriba no
                la toca.
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Servicio:</span> escribe el enlace en
                el campo de acá abajo, sobre el lead de la reserva, que ya está en la columna
                Completada. No mueve ninguna etapa: el bot arranca porque el campo se escribió.
              </p>
              <p className="text-muted-foreground">
                Tiene que ser un campo distinto al de compra. Compartiéndolo, entregar una encuesta
                de compra dispararía también al bot de taller.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="pv-field">ID del campo del enlace de postventa / servicio</Label>
                <Input
                  id="pv-field"
                  value={fieldId}
                  onChange={e => setFieldId(e.target.value)}
                  placeholder="Campo url propio de servicio"
                  inputMode="numeric"
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar y activar envío'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PostventaSurveyConfigCard;
