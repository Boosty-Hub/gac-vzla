// Shared, framework-agnostic capacity logic for reservation slots.
//
// A dealership can service at most `bays` vehicles at the same time. A candidate
// time slot is only unavailable when the number of concurrent (overlapping),
// non-cancelled reservations reaches the dealership's bay capacity — NOT after
// the first booking. This mirrors the minute-by-minute overlap count that
// AdminReservas.tsx used, extracted here so every reservation-creation flow
// (admin, dealership, public, user portal, Kommo webhook) shares one contract.

/**
 * A pre-existing reservation to weigh against a candidate slot.
 * `duration_minutes` may be provided directly; otherwise the caller supplies a
 * `resolveDuration` callback (e.g. a service_types lookup) or the fallback is used.
 */
export interface CapacityReservation {
  reservation_time: string; // "HH:MM" or "HH:MM:SS"
  service_type: string;
  duration_minutes?: number | null;
}

export interface ComputeSlotOccupancyParams {
  /** Non-cancelled reservations already booked for the same dealership + date. */
  existingReservations: CapacityReservation[];
  /** Candidate slot start, "HH:MM" or "HH:MM:SS". */
  startTime: string;
  /** Candidate service duration in minutes. */
  durationMinutes: number;
  /** Dealership bay capacity. Null/undefined falls back to DEFAULT_BAYS. */
  bays?: number | null;
  /** Resolve an existing reservation's duration by service name (e.g. service_types lookup). */
  resolveDuration?: (serviceType: string) => number;
  /** Duration used when neither `duration_minutes` nor `resolveDuration` yields a value. */
  fallbackDurationMinutes?: number;
}

export interface SlotOccupancy {
  /** Peak concurrent reservations across the candidate's minute range. */
  occupied: number;
  /** Effective capacity used (bays ?? DEFAULT_BAYS). */
  capacity: number;
  /** True when the slot cannot be booked (peak occupancy reaches capacity). */
  full: boolean;
  /** Free bays at the busiest minute of the candidate range (never negative). */
  remaining: number;
  /** First absolute minute-of-day where the slot is at capacity, or null. */
  firstFullMinute: number | null;
}

/** Default bay count when a dealership has no `bays` value configured. */
export const DEFAULT_BAYS = 2;

/** Default service duration when it cannot be resolved. */
export const DEFAULT_SERVICE_DURATION_MINUTES = 60;

/** Parse "HH:MM" / "HH:MM:SS" into minutes-of-day. Ignores seconds. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Count how many bays a candidate slot would need against existing reservations.
 *
 * The candidate occupies [start, start + durationMinutes). For every minute in
 * that range we count overlapping non-cancelled reservations; the slot is `full`
 * when that count reaches `capacity` at any minute.
 */
export function computeSlotOccupancy(params: ComputeSlotOccupancyParams): SlotOccupancy {
  const {
    existingReservations,
    startTime,
    durationMinutes,
    bays,
    resolveDuration,
    fallbackDurationMinutes = DEFAULT_SERVICE_DURATION_MINUTES,
  } = params;

  const capacity = bays ?? DEFAULT_BAYS;
  const startMin = toMinutes(startTime);
  const endMin = startMin + durationMinutes;

  let peak = 0;
  let firstFullMinute: number | null = null;

  for (let m = startMin; m < endMin; m++) {
    let occupied = 0;
    for (const r of existingReservations) {
      const rStart = toMinutes(r.reservation_time);
      const rDuration =
        r.duration_minutes ??
        (resolveDuration ? resolveDuration(r.service_type) : fallbackDurationMinutes);
      const rEnd = rStart + rDuration;
      if (m >= rStart && m < rEnd) occupied++;
    }
    if (occupied > peak) peak = occupied;
    if (firstFullMinute === null && occupied >= capacity) firstFullMinute = m;
  }

  return {
    occupied: peak,
    capacity,
    full: firstFullMinute !== null,
    remaining: Math.max(capacity - peak, 0),
    firstFullMinute,
  };
}

/** Format a minute-of-day as a Spanish 12h clock label, e.g. "1:05 PM". */
export function formatMinuteLabel(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const min = minuteOfDay % 60;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}
