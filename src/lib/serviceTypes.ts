// Service-type helpers shared across reservation flows.
//
// "Solicitud de Repuestos" is an INTERNAL parts request routed to the central
// plant. It behaves like a normal reservation (client + vehicle required) but:
//  - it does NOT occupy a bay or a time slot (its service_types.duration_minutes
//    is 0, so computeSlotOccupancy never counts it),
//  - it is auto-assigned to the plant dealership so the parts manager sees it,
//  - it must NOT appear in client-facing booking flows (public + user portal).

/** Exact service_types.name of the internal parts request. */
export const PARTS_REQUEST_TYPE = 'Solicitud de Repuestos';

/**
 * Dealership that owns all parts requests ("DFSK & GAC Centro de Servicio").
 * Parts requests are routed here regardless of who creates them, so the plant's
 * parts manager (and admins) can act on them.
 */
export const PLANT_DEALERSHIP_ID = 'ba7a54a0-5620-48bf-8a36-4cfcd9c7bde6';

/** True when a service type is the internal parts request. */
export const isPartsRequest = (serviceType: string | null | undefined): boolean =>
  serviceType === PARTS_REQUEST_TYPE;

/**
 * Service types that must be hidden from client-facing booking flows
 * (public reservation + user portal). Staff-only.
 */
export const isInternalServiceType = (serviceType: string | null | undefined): boolean =>
  serviceType === PARTS_REQUEST_TYPE;

/** Service types whose `notes` field describes a reported fault rather than a request. */
const FAULT_TYPES = new Set(['Incidencia', 'Falla o Desperfecto']);

/**
 * Título para `reservations.notes` — lo que el cliente vino a resolver.
 *
 * Existe porque las vistas de detalle sólo mostraban ese campo cuando el tipo era incidencia
 * o repuestos. Para un mantenimiento normal — 558 de 621 citas — el motivo del ingreso
 * quedaba invisible salvo que alguien abriera Editar, así que el historial registraba el
 * egreso ("Trabajo realizado") sin el ingreso que lo justificaba.
 */
export const serviceNotesLabel = (serviceType: string | null | undefined): string => {
  if (isPartsRequest(serviceType)) return 'Descripción de la solicitud';
  if (FAULT_TYPES.has(serviceType ?? '')) return 'Descripción de la falla';
  return 'Motivo del ingreso';
};
