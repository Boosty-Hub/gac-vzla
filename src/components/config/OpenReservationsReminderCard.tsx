import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BellRing, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Recordatorio diario de citas sin cerrar.
 *
 * El cron corre cada hora en punto y `fn_notify_open_reservations` decide si le toca según
 * la hora guardada acá. Por eso cambiar el horario desde esta pantalla alcanza: no hay que
 * reprogramar nada en la base.
 *
 * Quién lo recibe NO se configura acá: se reparte a todo rol que tenga el permiso
 * `reservas.recordatorio`, que se activa o se quita desde Roles y Permisos.
 */

interface ReminderSettings {
  open_reservations_enabled: boolean;
  open_reservations_hour: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc as any;

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const hourLabel = (h: number) => {
  const suffix = h < 12 ? 'am' : 'pm';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${String(h).padStart(2, '0')}:00 (${twelve} ${suffix})`;
};

const OpenReservationsReminderCard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(16);
  const [saved, setSaved] = useState<ReminderSettings | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await rpc('get_reminder_settings');
    if (error) {
      console.error(error);
      toast.error('No se pudo cargar la configuración del recordatorio');
      setLoading(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as ReminderSettings | undefined;
    if (row) {
      setSaved(row);
      setEnabled(row.open_reservations_enabled);
      setHour(row.open_reservations_hour);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await rpc('set_open_reservations_reminder', { p_enabled: enabled, p_hour: hour });
    setSaving(false);
    if (error) {
      console.error(error);
      const msg = String(error.message || '');
      if (msg.includes('not_authorized')) toast.error('No tenés permiso para cambiar esta configuración');
      else if (msg.includes('hora_invalida')) toast.error('La hora debe estar entre 0 y 23');
      else toast.error('No se pudo guardar');
      return;
    }
    toast.success('Recordatorio actualizado');
    load();
  };

  const dirty = !saved || saved.open_reservations_enabled !== enabled || saved.open_reservations_hour !== hour;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="w-4 h-4" />
          Recordatorio de citas sin cerrar
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
              {saved?.open_reservations_enabled ? (
                <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                </Badge>
              ) : (
                <Badge variant="secondary">Apagado</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Avisa una vez por día a quien tenga citas de hoy sin cerrar.
              </span>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                Cuenta las citas de hoy que siguen en Pendiente, Confirmada o En proceso. Una cita
                que no pasa a Completada tampoco dispara la encuesta de servicio.
              </p>
              <p>
                Cada persona ve el número de sus propios concesionarios; los administradores ven el
                total. Quién lo recibe se maneja desde Roles y Permisos, con el permiso{' '}
                <code className="font-mono">reservas.recordatorio</code>.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="rem-enabled">Enviar el recordatorio</Label>
                <p className="text-xs text-muted-foreground">Apagalo para silenciarlo sin perder la configuración.</p>
              </div>
              <Switch id="rem-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="rem-hour">Hora de envío (hora de Venezuela)</Label>
              <Select value={String(hour)} onValueChange={v => setHour(Number(v))}>
                <SelectTrigger id="rem-hour"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS.map(h => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OpenReservationsReminderCard;
