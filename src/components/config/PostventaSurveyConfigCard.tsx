import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Star, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Configuración de entrega de la encuesta de POSTVENTA.
 *
 * Existe porque esta configuración vivía únicamente dentro del JSON de
 * `integration_configs` y sólo podía cambiarse por SQL.
 *
 * RUTEO — la etapa de postventa es OBLIGATORIA, no un override opcional.
 *
 * El sistema no manda el mensaje: escribe el enlace en el campo y rebota la etapa del lead.
 * Quien manda el mensaje es el SalesBot enganchado a esa etapa. La etapa 109744268
 * "ENCUESTA ENVIADA" (pipeline 13151339 "Servicio") tiene el bot de VENTAS, el que saluda
 * por la entrega de un vehículo — así que compartirla mandaba ese texto a clientes de
 * taller. Pasó: 30 entregas el 2026-08-14 antes de cortarlo.
 *
 * El CAMPO sí puede compartirse: cada entrega lo sobrescribe justo antes de mover la etapa,
 * así que el bot siempre lee el enlace que le corresponde. Lo que no puede compartirse es la
 * etapa, porque la etapa es el disparador.
 *
 * Mientras estos dos IDs estén vacíos, `fn_dispatch_eligible_surveys` no despacha postventa:
 * las encuestas se siguen creando al completar el servicio y quedan en cola.
 */

interface DeliveryConfig {
  delivery_enabled: boolean;
  survey_stage_id: string | null;
  survey_link_field_id: string | null;
  survey_stage_id_service: string | null;
  survey_link_field_id_service: string | null;
  service_ready: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

const PostventaSurveyConfigCard = () => {
  const [config, setConfig] = useState<DeliveryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stageId, setStageId] = useState('');
  const [fieldId, setFieldId] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await rpc('get_survey_delivery_config');
    if (error) {
      console.error(error);
      toast.error('No se pudo cargar la configuración de encuestas');
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as DeliveryConfig | undefined;
    if (row) {
      setConfig(row);
      setStageId(row.survey_stage_id_service ?? '');
      setFieldId(row.survey_link_field_id_service ?? '');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await rpc('set_postventa_survey_config', {
      p_stage_id: stageId.trim() || null,
      p_link_field_id: fieldId.trim() || null,
    });
    setSaving(false);
    if (error) {
      console.error(error);
      const msg = String(error.message || '');
      if (msg.includes('stage_id_invalido')) toast.error('El ID de etapa debe ser numérico');
      else if (msg.includes('field_id_invalido')) toast.error('El ID del campo debe ser numérico');
      else if (msg.includes('not_authorized')) toast.error('No tenés permiso para cambiar esta configuración');
      else toast.error('No se pudo guardar');
      return;
    }
    toast.success('Configuración de postventa guardada');
    load();
  };

  const ready = config?.service_ready ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="w-4 h-4" />
          Encuesta de Postventa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              {ready ? (
                <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enviando
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-0 gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> En espera de configuración
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Se genera al marcar una cita como Completada.
              </span>
            </div>

            {!ready && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-900">
                  Las encuestas se están generando, pero no se envían.
                </p>
                <p className="text-amber-800">
                  Falta la etapa propia de postventa en Kommo. Las encuestas quedan en cola sin
                  perderse y salen solas apenas se cargue el ID acá abajo.
                </p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium">Por qué hace falta una etapa propia</p>
              <p className="text-muted-foreground">
                El sistema escribe el enlace en el campo y mueve el lead de etapa. El mensaje lo
                manda el bot que esté enganchado a esa etapa. La etapa de ventas{' '}
                <code className="font-mono">{config?.survey_stage_id || '—'}</code> tiene el bot de
                entrega de vehículo, así que un cliente de taller recibiría el texto de compra. El
                campo del enlace <code className="font-mono">{config?.survey_link_field_id || '—'}</code>{' '}
                sí puede ser el mismo: se sobrescribe justo antes de mover la etapa.
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pv-stage">ID de la etapa de postventa</Label>
                  <Input
                    id="pv-stage"
                    value={stageId}
                    onChange={e => setStageId(e.target.value)}
                    placeholder="Etapa nueva en el embudo Servicio"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-field">ID del campo del enlace</Label>
                  <Input
                    id="pv-field"
                    value={fieldId}
                    onChange={e => setFieldId(e.target.value)}
                    placeholder="Puede ser el mismo de ventas"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La etapa tiene que estar en el mismo embudo que las citas (Servicio). El lead que
                llega ahí es el de conversación del cliente, no el de la reserva.
              </p>
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
