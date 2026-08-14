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
 * Con el campo vacío no se despacha nada: las encuestas se siguen creando al completar el
 * servicio y quedan en cola.
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
      setFieldId(row.survey_link_field_id_service ?? '');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await rpc('set_postventa_survey_config', {
      // Postventa ya no usa etapa: su disparador es la escritura del campo.
      p_stage_id: null,
      p_link_field_id: fieldId.trim() || null,
    });
    setSaving(false);
    if (error) {
      console.error(error);
      const msg = String(error.message || '');
      if (msg.includes('field_id_invalido')) toast.error('El ID del campo debe ser numérico');
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
                al entrar a esa etapa, 20 horas después de la compra.
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
                <Label htmlFor="pv-field">ID del campo del enlace de postventa</Label>
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
