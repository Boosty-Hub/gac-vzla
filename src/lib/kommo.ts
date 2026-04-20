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
