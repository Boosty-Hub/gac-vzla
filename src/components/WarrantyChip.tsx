import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldX, AlertTriangle, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  evaluateWarranty,
  resolveWarrantyCondition,
  type WarrantyConditionRef,
  type WarrantyEvaluation,
} from '@/lib/warranty';

interface Props {
  vehicleId: string | null;
  className?: string;
}

interface VehicleData {
  mileage: number;
  warranty_active: boolean;
  purchase_date: string | null;
  vehicle_models: {
    warranty_condition_id: number | null;
    warranty_km: number | null;
    warranty_months: number | null;
    warranty_service_interval_km: number | null;
    is_manual: boolean | null;
  } | null;
}

export const WarrantyChip = ({ vehicleId, className }: Props) => {
  const [evaluation, setEvaluation] = useState<WarrantyEvaluation | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vehicleId) {
      setEvaluation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [vehRes, condsRes, servicesRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('mileage, warranty_active, purchase_date, vehicle_models(warranty_condition_id, warranty_km, warranty_months, warranty_service_interval_km, is_manual)')
          .eq('id', vehicleId)
          .maybeSingle(),
        supabase.from('warranty_conditions').select('id, name, max_km, max_months, service_interval_km, is_active'),
        supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('vehicle_id', vehicleId).eq('status', 'completada'),
      ]);

      if (cancelled) return;

      const vehicle = (vehRes.data ?? null) as VehicleData | null;
      const conditions = ((condsRes.data ?? []) as WarrantyConditionRef[]).filter(c => c.is_active);
      const completed = servicesRes.count ?? 0;

      if (!vehicle) {
        setEvaluation(null);
        setLoading(false);
        return;
      }

      const resolved = resolveWarrantyCondition(vehicle.vehicle_models, conditions);
      const result = evaluateWarranty(
        { mileage: vehicle.mileage, warranty_active: vehicle.warranty_active, purchase_date: vehicle.purchase_date },
        resolved,
        completed,
      );
      setIsManual(!!vehicle.vehicle_models?.is_manual);
      setEvaluation(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [vehicleId]);

  if (!vehicleId) return null;
  if (loading || !evaluation) {
    return <p className={cn('text-[11px] text-muted-foreground', className)}>Evaluando garantía...</p>;
  }

  if (evaluation.status === 'violated') {
    return (
      <div className={cn('border border-red-300 bg-red-50 rounded-md px-2 py-1.5 flex items-start gap-1.5', className)}>
        <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-red-800">Garantía violada</p>
          <p className="text-[10px] text-red-700 leading-tight">{evaluation.reasons.join(' · ')}</p>
        </div>
      </div>
    );
  }

  if (evaluation.status === 'expired') {
    return (
      <Badge className={cn('bg-gray-200 text-gray-800 gap-1 text-[11px]', className)}>
        <ShieldX className="w-3 h-3" /> Garantía expirada
      </Badge>
    );
  }

  if (evaluation.status === 'active') {
    return (
      <Badge className={cn('bg-green-100 text-green-800 gap-1 text-[11px]', className)}>
        <ShieldCheck className="w-3 h-3" /> Garantía activa
        {evaluation.conditionName && <span className="font-normal opacity-75">· {evaluation.conditionName}</span>}
      </Badge>
    );
  }

  if (isManual) {
    return (
      <Badge className={cn('bg-blue-100 text-blue-800 gap-1 text-[11px]', className)}>
        <Car className="w-3 h-3" /> Vehículo de terceros — sin garantía GAC
      </Badge>
    );
  }

  return (
    <Badge className={cn('bg-muted text-muted-foreground gap-1 text-[11px]', className)}>
      <ShieldX className="w-3 h-3" /> Sin condición de garantía
    </Badge>
  );
};
