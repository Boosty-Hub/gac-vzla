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
 * RUTEO: GAC confirmó que en Kommo sólo se reemplaza el campo del enlace — no hay objetos
 * dedicados a la encuesta de servicio. Se verificó contra la API de Kommo: la etapa
 * configurada, 109744268 "ENCUESTA ENVIADA", ya pertenece al pipeline de POST VENTA
 * (13151339) y no al de Ventas (13148719). Por eso la postventa sale por la misma etapa y el
 * mismo campo que la encuesta de compra.
 *
 * Lo que sí provocó el incidente del 2026-08-03 no era la etapa: el barrido mandaba
 * `reason: 'won'` fijo para toda encuesta, de modo que la postventa recorría el camino de
 * ventas. Corregido en 20260813130000; el origen real viaja en cada despacho.
 *
 * Los campos `*_service` quedan como override opcional por si algún día se crean objetos
 * dedicados: kommo-api ya los prefiere cuando están cargados.
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
                  Falta la etapa de encuesta, el campo del enlace, o el envío está apagado.
                  Las encuestas quedan en cola sin perderse.
                </p>
              </div>
            )}

            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium">Ruteo actual</p>
              <p className="text-muted-foreground">
                La postventa usa la misma etapa y el mismo campo de enlace que la encuesta de
                compra — sólo cambia el enlace que se escribe. Etapa{' '}
                <code className="font-mono">{config?.survey_stage_id || '—'}</code>, campo{' '}
                <code className="font-mono">{config?.survey_link_field_id || '—'}</code>.
              </p>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Usar una etapa y un campo distintos para postventa (opcional)
              </summary>
              <div className="pt-3 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Sólo si en Kommo se crean objetos dedicados a la encuesta de servicio. Vacíos,
                  la postventa sigue el ruteo de arriba.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pv-stage">ID de etapa de postventa</Label>
                    <Input
                      id="pv-stage"
                      value={stageId}
                      onChange={e => setStageId(e.target.value)}
                      placeholder="Vacío = usa la etapa de arriba"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pv-field">ID del campo del enlace</Label>
                    <Input
                      id="pv-field"
                      value={fieldId}
                      onChange={e => setFieldId(e.target.value)}
                      placeholder="Vacío = usa el campo de arriba"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar override'}
                </Button>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PostventaSurveyConfigCard;
