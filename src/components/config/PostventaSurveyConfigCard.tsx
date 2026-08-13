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
 * Existe porque estos dos ids vivían únicamente dentro del JSON de `integration_configs` y
 * sólo podían cambiarse por SQL. No es un detalle cosmético: mientras faltaban, kommo-api
 * caía al par campo/etapa de VENTAS a propósito, y el 2026-08-03 eso mandó tres encuestas de
 * postventa al SalesBot de ventas — dos clientes que habían ido a un servicio recibieron una
 * felicitación por la compra de un vehículo nuevo.
 *
 * Ahora el barrido de despacho se niega a enviar postventa mientras estos dos estén vacíos
 * (20260813130000_postventa_survey_dispatch.sql), y esta tarjeta es donde se cargan.
 */

interface DeliveryConfig {
  delivery_enabled: boolean;
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
                  Las encuestas de postventa se están generando, pero todavía no se envían.
                </p>
                <p className="text-amber-800">
                  Faltan la etapa y el campo de Kommo propios de postventa. Sin ellos el envío
                  usaría el bot de <strong>ventas</strong>, que felicita al cliente por la compra
                  de un vehículo nuevo — ya pasó el 3 de agosto con tres encuestas. Quedan en
                  espera, sin perderse, hasta que cargues los dos datos.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pv-stage">ID de etapa (Post Venta)</Label>
                <Input
                  id="pv-stage"
                  value={stageId}
                  onChange={e => setStageId(e.target.value)}
                  placeholder="Ej: 109744268"
                  inputMode="numeric"
                />
                <p className="text-[11px] text-muted-foreground">
                  Etapa del pipeline Post Venta que dispara el bot de la encuesta.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-field">ID del campo del enlace</Label>
                <Input
                  id="pv-field"
                  value={fieldId}
                  onChange={e => setFieldId(e.target.value)}
                  placeholder="Ej: 3456839"
                  inputMode="numeric"
                />
                <p className="text-[11px] text-muted-foreground">
                  Campo personalizado del lead donde se escribe el enlace de la encuesta.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Vaciar ambos campos vuelve a poner el envío en espera.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PostventaSurveyConfigCard;
