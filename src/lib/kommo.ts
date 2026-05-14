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
