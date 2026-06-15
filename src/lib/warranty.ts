export type WarrantyStatus = 'active' | 'expired' | 'violated' | 'unknown';

export interface WarrantyConditionRef {
  id: number;
  name: string;
  max_km: number;
  max_months: number;
  service_interval_km: number;
  is_active: boolean;
}

export interface ModelWarrantyRef {
  warranty_condition_id?: number | null;
  warranty_km?: number | null;
  warranty_months?: number | null;
  warranty_service_interval_km?: number | null;
}

export interface VehicleWarrantyRef {
  mileage: number;
  warranty_active: boolean;
  purchase_date: string | null;
}

export interface ResolvedCondition {
  maxKm: number;
  maxMonths: number;
  intervalKm: number;
  name: string;
}

export interface WarrantyEvaluation {
  status: WarrantyStatus;
  active: boolean;
  violated: boolean;
  expired: boolean;
  reasons: string[];
  servicesExpected: number;
  servicesCompleted: number;
  monthsRemaining: number;
  kmRemaining: number;
  nextServiceKm: number;
  conditionName: string;
}

export function resolveWarrantyCondition(
  model: ModelWarrantyRef | null | undefined,
  conditions: WarrantyConditionRef[]
): ResolvedCondition | null {
  if (model?.warranty_condition_id != null) {
    const c = conditions.find(cond => cond.id === model.warranty_condition_id);
    if (c) {
      return { maxKm: c.max_km, maxMonths: c.max_months, intervalKm: c.service_interval_km, name: c.name };
    }
  }

  if (model && (model.warranty_km != null || model.warranty_months != null || model.warranty_service_interval_km != null)) {
    return {
      maxKm: model.warranty_km ?? 0,
      maxMonths: model.warranty_months ?? 0,
      intervalKm: model.warranty_service_interval_km ?? 0,
      name: 'Personalizada',
    };
  }

  const globalFallback = conditions.find(c => c.is_active);
  if (globalFallback) {
    return {
      maxKm: globalFallback.max_km,
      maxMonths: globalFallback.max_months,
      intervalKm: globalFallback.service_interval_km,
      name: globalFallback.name,
    };
  }

  return null;
}

export function evaluateWarranty(
  vehicle: VehicleWarrantyRef,
  resolved: ResolvedCondition | null,
  completedServices: number
): WarrantyEvaluation {
  if (!resolved) {
    return {
      status: 'unknown',
      active: false,
      violated: false,
      expired: false,
      reasons: ['No hay condiciones de garantía configuradas'],
      servicesExpected: 0,
      servicesCompleted: completedServices,
      monthsRemaining: 0,
      kmRemaining: 0,
      nextServiceKm: 0,
      conditionName: '-',
    };
  }

  const reasons: string[] = [];
  const violationReasons: string[] = [];
  const expiryReasons: string[] = [];

  if (!vehicle.warranty_active) {
    violationReasons.push('Garantía desactivada manualmente');
  }

  const kmRemaining = resolved.maxKm - vehicle.mileage;
  if (resolved.maxKm > 0 && vehicle.mileage > resolved.maxKm) {
    violationReasons.push(`Excede ${resolved.maxKm.toLocaleString()} km (actual: ${vehicle.mileage.toLocaleString()} km)`);
  }

  let monthsRemaining = resolved.maxMonths;
  if (vehicle.purchase_date) {
    const purchase = new Date(vehicle.purchase_date);
    const now = new Date();
    const monthsElapsed = (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
    monthsRemaining = resolved.maxMonths - monthsElapsed;
    if (resolved.maxMonths > 0 && monthsElapsed > resolved.maxMonths) {
      expiryReasons.push(`Excede ${resolved.maxMonths} meses desde la compra (${monthsElapsed} meses transcurridos)`);
    }
  }

  const servicesExpected = resolved.intervalKm > 0 ? Math.floor(vehicle.mileage / resolved.intervalKm) : 0;
  // Service count is informational only — not a warranty voiding condition.
  // Vehicles often enter the system with existing mileage and no prior tracked service history.

  reasons.push(...violationReasons, ...expiryReasons);

  const nextServiceKm = resolved.intervalKm > 0 ? (Math.floor(vehicle.mileage / resolved.intervalKm) + 1) * resolved.intervalKm : 0;

  const violated = violationReasons.length > 0;
  const expired = !violated && expiryReasons.length > 0;
  const active = !violated && !expired;

  let status: WarrantyStatus;
  if (violated) status = 'violated';
  else if (expired) status = 'expired';
  else status = 'active';

  return {
    status,
    active,
    violated,
    expired,
    reasons,
    servicesExpected,
    servicesCompleted: completedServices,
    monthsRemaining: Math.max(0, monthsRemaining),
    kmRemaining: Math.max(0, kmRemaining),
    nextServiceKm,
    conditionName: resolved.name,
  };
}
