import { supabase } from '@/integrations/supabase/client'

export async function createKommoLead(prospectId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: { action: 'create_lead', prospect_id: prospectId },
  })
  if (error) console.error('[Kommo] Error creando lead:', error)
}

export async function updateKommoLeadStage(
  prospectId: string,
  kommoLeadId: number,
  newStatus: string
): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: {
      action: 'update_stage',
      prospect_id: prospectId,
      kommo_lead_id: kommoLeadId,
      new_status: newStatus,
    },
  })
  if (error) console.error('[Kommo] Error actualizando etapa:', error)
}

// Create a lead in the Post Venta (Reservas/Servicios) Kommo pipeline
export async function createKommoReservation(reservationId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: { action: 'create_reservation', reservation_id: reservationId },
  })
  if (error) console.error('[Kommo] Error creando reserva en Post Venta:', error)
}

// Update the stage of a Post Venta lead when reservation status changes
export async function updateKommoReservationStage(
  reservationId: string,
  kommoLeadId: number,
  newStatus: string
): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: {
      action: 'update_reservation_stage',
      reservation_id: reservationId,
      kommo_lead_id: kommoLeadId,
      new_status: newStatus,
    },
  })
  if (error) console.error('[Kommo] Error actualizando etapa de reserva:', error)
}

// Re-push all reservation custom fields to the Post Venta lead in Kommo (call after editing a reservation)
export async function updateKommoReservationFields(
  reservationId: string,
  kommoLeadId: number
): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: {
      action: 'update_reservation_fields',
      reservation_id: reservationId,
      kommo_lead_id: kommoLeadId,
    },
  })
  if (error) console.error('[Kommo] Error actualizando campos de reserva:', error)
}

// Overwrite all matching fields in Kommo with current GAC values (true bidirectional sync)
export async function updateKommoLeadFields(
  prospectId: string,
  kommoLeadId: number
): Promise<void> {
  const { error } = await supabase.functions.invoke('kommo-api', {
    body: {
      action: 'update_fields',
      prospect_id: prospectId,
      kommo_lead_id: kommoLeadId,
    },
  })
  if (error) console.error('[Kommo] Error actualizando campos:', error)
}
