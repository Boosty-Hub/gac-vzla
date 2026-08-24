import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { XCircle } from 'lucide-react';

/**
 * Motivo de cancelación de una cita (2026-08-24).
 *
 * Reportado desde el historial: al cancelar no quedaba registrado POR QUÉ. El historial
 * guardaba el ingreso ("Motivo del ingreso") y el egreso ("Trabajo realizado"), pero de las
 * canceladas no guardaba nada — y son justo las que alguien pregunta después.
 *
 * El motivo es OBLIGATORIO. Un campo opcional acá queda vacío el 90% de las veces y entonces
 * la columna existe pero no sirve para nada, que es peor que no tenerla: da la impresión de
 * que el dato está.
 *
 * Se cancela desde varias pantallas (Reservas admin en tabla y en móvil, Reservas del
 * concesionario, y el editor del historial). Este diálogo es uno solo para las cuatro: si
 * cada una preguntara distinto, los motivos no serían comparables entre sedes.
 */

interface CancelReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cabecera con cliente / placa / servicio, para no cancelar la cita equivocada. */
  summary?: string;
  /** Motivo ya guardado, cuando se está corrigiendo una cancelación anterior. */
  initialReason?: string;
  saving?: boolean;
  onConfirm: (reason: string) => void;
}

const CancelReservationDialog = ({
  open,
  onOpenChange,
  summary,
  initialReason,
  saving,
  onConfirm,
}: CancelReservationDialogProps) => {
  const [reason, setReason] = useState(initialReason ?? '');
  const [touched, setTouched] = useState(false);

  // El diálogo se monta con `key` desde el padre en cada apertura, así que el estado
  // arranca limpio y nunca arrastra el motivo de la cita anterior.

  const trimmed = reason.trim();

  const handleConfirm = () => {
    setTouched(true);
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600" /> Cancelar Cita
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {summary && (
            <div className="rounded-md border p-3 bg-muted/30 text-xs whitespace-pre-line">
              {summary}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Motivo de cancelación *</Label>
            <Textarea
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Por qué se cancela la cita: el cliente reagendó, no se presentó, falta de repuesto..."
              autoFocus
            />
            {touched && !trimmed && (
              <p className="text-xs text-red-600">Escribí el motivo para poder cancelar la cita.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Queda guardado en el historial de servicios junto con la cita.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={saving}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Cancelar cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancelReservationDialog;
