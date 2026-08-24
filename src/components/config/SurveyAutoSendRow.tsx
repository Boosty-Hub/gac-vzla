import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Hand, Timer } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Interruptor AUTOMÁTICO / MANUAL de una encuesta (2026-08-24).
 *
 * Es una dimensión distinta del interruptor de encendido de arriba: aquél decide SI la
 * encuesta existe, éste decide CÓMO sale. Apagar el envío automático no apaga la encuesta —
 * la deja esperando a que una persona la mande con un botón.
 *
 * Manual es el default desde este día, por pedido expreso. El único default seguro además:
 * si alguien restaura una configuración vieja, lo peor que puede pasar es que una encuesta
 * espere; al revés, saldrían mensajes a clientes reales que nadie pidió.
 *
 * Vive en su propio componente porque las dos tarjetas necesitan exactamente esto con otro
 * nombre de RPC y otro texto.
 */

/**
 * `supabase.rpc` es un método de clase y usa `this` adentro: guardarlo suelto lo desprende
 * del cliente y revienta antes de tocar la red. Ver el comentario largo en
 * PostventaSurveyConfigCard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

interface SurveyAutoSendRowProps {
  id: string;
  rpcName: 'set_sales_survey_auto_send' | 'set_service_survey_auto_send';
  autoSend: boolean;
  /** Apagada la encuesta entera, este interruptor no decide nada: se muestra inerte. */
  disabled?: boolean;
  /** Dónde la manda una persona cuando está en manual. Se muestra tal cual. */
  manualHint: string;
  onChanged: () => void;
}

const SurveyAutoSendRow = ({
  id,
  rpcName,
  autoSend,
  disabled,
  manualHint,
  onChanged,
}: SurveyAutoSendRowProps) => {
  const [saving, setSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const { error } = await rpc(rpcName, { p_enabled: next });
      if (error) throw error;
      toast.success(
        next
          ? 'Envío automático activado — el sistema la manda solo'
          : 'Envío automático desactivado — ahora se manda a mano',
      );
      onChanged();
    } catch (e) {
      console.error(e);
      const msg = String((e as { message?: string })?.message || '');
      if (msg.includes('not_authorized')) toast.error('No tenés permiso para cambiar esta configuración');
      else toast.error('No se pudo cambiar el modo de envío');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor={id} className="text-sm">
            Envío automático
          </Label>
          <p className="text-xs text-muted-foreground">
            Apagado, la encuesta se prepara pero no sale sola: la manda una persona.
            Prendido, el sistema la envía solo, sin que nadie intervenga.
          </p>
        </div>
        <Switch
          id={id}
          checked={autoSend}
          disabled={saving || disabled}
          onCheckedChange={handleToggle}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {autoSend ? (
          <Badge className="bg-blue-100 text-blue-800 border-0 gap-1">
            <Timer className="w-3.5 h-3.5" /> Automática
          </Badge>
        ) : (
          <Badge className="bg-violet-100 text-violet-800 border-0 gap-1">
            <Hand className="w-3.5 h-3.5" /> Manual
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">
          {autoSend ? 'El sistema la envía solo.' : manualHint}
        </span>
      </div>
    </div>
  );
};

export default SurveyAutoSendRow;
