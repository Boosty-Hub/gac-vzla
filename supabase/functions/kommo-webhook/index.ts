import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const text = await req.text()
    const params = new URLSearchParams(text)

    const { data: configRow } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('integration_name', 'kommo')
      .eq('is_active', true)
      .single()

    if (!configRow) return new Response('OK', { status: 200 })

    const config = configRow.config as Record<string, unknown>
    const baseUrl = `https://${config.subdomain}.kommo.com/api/v4`
    const authHeaders = {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    }

    // ── Detect event type ─────────────────────────────────────────────────────
    const statusLeadId = params.get('leads[status][0][id]')
    const statusId     = params.get('leads[status][0][status_id]')
    const pipelineId   = params.get('leads[status][0][pipeline_id]')
    const updateLeadId = params.get('leads[update][0][id]')

    // Handle status change event
    if (statusLeadId && statusId) {
      // Only handle Ventas pipeline
      if (pipelineId && String(pipelineId) !== String(config.pipeline_id)) {
        return new Response('OK', { status: 200 })
      }

      const reverseMap = config.reverse_mappings as Record<string, string>
      const ourStatus = reverseMap[statusId]

      const { data: prospect } = await supabase
        .from('prospects')
        .select('id, status')
        .eq('kommo_lead_id', parseInt(statusLeadId))
        .single()

      if (!prospect) {
        const DEMOSTRACION_STAGE_ID = '101392719'
        if (statusId === DEMOSTRACION_STAGE_ID) {
          await autoCreateProspectFromKommo(supabase, parseInt(statusLeadId), authHeaders, baseUrl)
        } else {
          await supabase.from('integration_logs').insert({
            integration_name: 'kommo',
            event_type: 'webhook_lead_not_found',
            kommo_lead_id: parseInt(statusLeadId),
            status: 'warning',
            details: { kommo_status_id: statusId, pipeline_id: pipelineId },
          })
        }
        return new Response('OK', { status: 200 })
      }

      if (ourStatus && prospect.status !== ourStatus) {
        await supabase.from('prospects').update({ status: ourStatus }).eq('id', prospect.id)
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo',
          event_type: 'webhook_status_update',
          prospect_id: prospect.id,
          kommo_lead_id: parseInt(statusLeadId),
          status: 'success',
          details: { old_status: prospect.status, new_status: ourStatus, kommo_status_id: statusId },
        })
      }

      // Also sync fields from Kommo (fill empty fields in our system)
      await syncFieldsFromKommo(supabase, prospect.id, parseInt(statusLeadId), authHeaders, baseUrl)

      return new Response('OK', { status: 200 })
    }

    // Handle lead update event (field changes)
    if (updateLeadId) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id')
        .eq('kommo_lead_id', parseInt(updateLeadId))
        .single()

      if (prospect) {
        await syncFieldsFromKommo(supabase, prospect.id, parseInt(updateLeadId), authHeaders, baseUrl)
        // Also push our empty fields to Kommo
        await syncFieldsToKommo(supabase, prospect.id, parseInt(updateLeadId), authHeaders, baseUrl)
      }

      return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('OK', { status: 200 })
  }
})

// ─── Auto-create prospect when an unknown Kommo lead reaches "Demostracion" ───
async function autoCreateProspectFromKommo(
  supabase: ReturnType<typeof createClient>,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const CF_IDS = {
    supabase_id: 3192400, salesperson: 3193866, notes: 3192402,
    estado_vzla: 3204218, event_name: 3415147, fuente: 2988728,
    marca: 2988724, modelo_gac: 2988732, concesionario: 2988984,
  }
  const KOMMO_TO_SOURCE: Record<string, string> = {
    '7832218':'redes_sociales','7832220':'redes_sociales','7832222':'redes_sociales',
    '7832224':'redes_sociales','7832226':'pagina_web','7832228':'evento',
    '7832230':'concesionario','7832232':'referido','7893992':'redes_sociales','7893994':'redes_sociales',
  }
  const BRAND_REVERSE: Record<number, string> = { 7832208:'GAC', 7832206:'DFSK', 7857650:'Shinarey' }
  const KOMMO_GAC_TO_MODEL: Record<string, string> = {
    '7832236':'EMPOW','7832370':'EMZOOM','7832372':'GS8','7832384':'SMILODON',
  }
  // Maps Kommo concesionario enum_id → search keyword for dealerships table
  const CONCESIONARIO_KEYWORD: Record<number, string> = {
    7832490:'harbin', 7832492:'garzas', 7832494:'hobby', 7832496:'meta car',
    7832498:'palma', 7832502:'rosal', 7832504:'valencia', 7832506:'barquisimeto',
    7832508:'florida', 7832510:'castellana', 8039476:'guarenas', 8134449:'lecher',
  }

  const leadRes = await fetch(`${baseUrl}/leads/${kommoLeadId}?with=contacts,custom_fields`, { headers: authHeaders })
  if (!leadRes.ok) {
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'webhook_auto_create_failed',
      kommo_lead_id: kommoLeadId, status: 'error',
      details: { reason: 'kommo_fetch_failed', http_status: leadRes.status },
    })
    return
  }

  const lead = await leadRes.json() as Record<string, unknown>
  const cfValues = (lead.custom_fields_values as Array<{ field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }>) || []

  const getCF = (id: number): string | null => {
    const f = cfValues.find(x => x.field_id === id)
    return f?.values?.[0]?.value ? String(f.values[0].value).trim() : null
  }
  const getEnum = (id: number): number | null =>
    cfValues.find(x => x.field_id === id)?.values?.[0]?.enum_id ?? null

  // If supabase_id CF is already set, try to re-link the existing prospect
  const existingSupabaseId = getCF(CF_IDS.supabase_id)
  if (existingSupabaseId) {
    const { data: existing } = await supabase
      .from('prospects')
      .select('id, kommo_lead_id')
      .eq('id', existingSupabaseId)
      .single()
    if (existing && !existing.kommo_lead_id) {
      await supabase.from('prospects')
        .update({ kommo_lead_id: kommoLeadId, status: 'demostracion' })
        .eq('id', existingSupabaseId)
      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'webhook_auto_linked',
        prospect_id: existingSupabaseId, kommo_lead_id: kommoLeadId,
        status: 'success', details: { method: 'supabase_id_cf_match' },
      })
      return
    }
  }

  // Extract contact info (phone/email)
  const contacts = ((lead as Record<string, unknown>)._embedded as Record<string, unknown>)?.contacts as Array<Record<string, unknown>> || []
  const contact = contacts[0]
  const leadName = (lead.name as string) || (contact?.name as string) || 'Sin nombre'

  let phone: string | null = null
  let email: string | null = null
  if (contact?.custom_fields_values) {
    const cfs = contact.custom_fields_values as Array<{ field_code?: string; values: Array<{ value?: string }> }>
    phone = cfs.find(f => f.field_code === 'PHONE')?.values?.[0]?.value ?? null
    email = cfs.find(f => f.field_code === 'EMAIL')?.values?.[0]?.value ?? null
  }

  // Build prospect fields from Kommo custom fields
  const salesperson = getCF(CF_IDS.salesperson)
  const notes = getCF(CF_IDS.notes)
  const estadoVzla = getCF(CF_IDS.estado_vzla)
  const eventName = getCF(CF_IDS.event_name)

  const sourceEnumId = getEnum(CF_IDS.fuente)
  const source = sourceEnumId ? (KOMMO_TO_SOURCE[String(sourceEnumId)] || 'concesionario') : 'concesionario'

  const brandEnumId = getEnum(CF_IDS.marca)
  const gacModelEnumId = getEnum(CF_IDS.modelo_gac)
  let modelInterest: string | null = null
  if (brandEnumId && BRAND_REVERSE[brandEnumId]) {
    const brandName = BRAND_REVERSE[brandEnumId]
    const modelName = gacModelEnumId ? (KOMMO_GAC_TO_MODEL[String(gacModelEnumId)] || '') : ''
    modelInterest = modelName ? `${brandName} ${modelName}` : brandName
  }

  // Resolve dealership_id from concesionario enum
  let dealershipId: string | null = null
  const concEnumId = getEnum(CF_IDS.concesionario)
  if (concEnumId && CONCESIONARIO_KEYWORD[concEnumId]) {
    const keyword = CONCESIONARIO_KEYWORD[concEnumId]
    const { data: dealership } = await supabase
      .from('dealerships')
      .select('id')
      .ilike('name', `%${keyword}%`)
      .limit(1)
      .single()
    if (dealership) dealershipId = dealership.id
  }

  // Create the prospect
  const newProspect: Record<string, unknown> = {
    name: leadName,
    status: 'demostracion',
    kommo_lead_id: kommoLeadId,
    source,
    ...(phone && { phone }),
    ...(email && { email }),
    ...(salesperson && { salesperson }),
    ...(notes && { notes }),
    ...(estadoVzla && { 'Estado de Vnzla': estadoVzla }),
    ...(eventName && { event_name: eventName }),
    ...(modelInterest && { model_interest: modelInterest }),
    ...(dealershipId && { dealership_id: dealershipId }),
  }

  const { data: created, error } = await supabase
    .from('prospects')
    .insert(newProspect)
    .select('id')
    .single()

  if (error || !created) {
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'webhook_auto_create_failed',
      kommo_lead_id: kommoLeadId, status: 'error',
      details: { reason: 'insert_failed', error: error?.message },
    })
    return
  }

  // Write supabase_id back to Kommo to close the bidirectional link
  await fetch(`${baseUrl}/leads/${kommoLeadId}`, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({
      custom_fields_values: [{ field_id: CF_IDS.supabase_id, values: [{ value: created.id }] }],
    }),
  })

  await supabase.from('integration_logs').insert({
    integration_name: 'kommo', event_type: 'webhook_auto_created',
    prospect_id: created.id, kommo_lead_id: kommoLeadId,
    status: 'success',
    details: { lead_name: leadName, dealership_id: dealershipId, fields_extracted: Object.keys(newProspect) },
  })
}

// ─── Sync Kommo → our system (fill empty only) ────────────────────────────────
async function syncFieldsFromKommo(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const CF = {
    salesperson: 3193866, notes: 3192402, estado_vzla: 3204218,
    event_name: 3415147, fuente: 2988728, marca: 2988724, modelo_gac: 2988732,
  }
  const KOMMO_TO_SOURCE: Record<string, string> = {
    '7832218':'redes_sociales','7832220':'redes_sociales','7832222':'redes_sociales',
    '7832224':'redes_sociales','7832226':'pagina_web','7832228':'evento',
    '7832230':'concesionario','7832232':'referido','7893992':'redes_sociales','7893994':'redes_sociales',
  }
  const BRAND_TO_KOMMO: Record<number, string> = { 7832208:'GAC', 7832206:'DFSK', 7857650:'Shinarey' }
  const KOMMO_GAC_TO_MODEL: Record<string, string> = {
    '7832236':'EMPOW','7832370':'EMZOOM','7832372':'GS8','7832384':'SMILODON',
  }

  const [prospectRes, leadRes] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', prospectId).single(),
    fetch(`${baseUrl}/leads/${kommoLeadId}?with=custom_fields`, { headers: authHeaders }),
  ])

  const prospect = prospectRes.data
  if (!prospect || !leadRes.ok) return

  const lead = await leadRes.json() as Record<string, unknown>
  const cfValues = (lead.custom_fields_values as Array<{ field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }>) || []

  const getCF = (id: number) => {
    const f = cfValues.find(x => x.field_id === id)
    return f?.values?.[0]?.value ? String(f.values[0].value).trim() : null
  }
  const getEnum = (id: number) => cfValues.find(x => x.field_id === id)?.values?.[0]?.enum_id ?? null

  const updates: Record<string, unknown> = {}

  if (!prospect.salesperson) { const v = getCF(CF.salesperson); if (v) updates.salesperson = v }
  if (!prospect.notes) { const v = getCF(CF.notes); if (v) updates.notes = v }
  if (!prospect['Estado de Vnzla']) { const v = getCF(CF.estado_vzla); if (v) updates['Estado de Vnzla'] = v }
  if (!prospect.event_name) { const v = getCF(CF.event_name); if (v) updates.event_name = v }

  if (!prospect.source || prospect.source === 'concesionario') {
    const e = getEnum(CF.fuente)
    if (e && KOMMO_TO_SOURCE[String(e)]) updates.source = KOMMO_TO_SOURCE[String(e)]
  }

  if (!prospect.model_interest) {
    const brandEnumId = getEnum(CF.marca)
    const gacModelEnumId = getEnum(CF.modelo_gac)
    if (brandEnumId && BRAND_TO_KOMMO[brandEnumId]) {
      const brandName = BRAND_TO_KOMMO[brandEnumId]
      const modelName = gacModelEnumId ? KOMMO_GAC_TO_MODEL[String(gacModelEnumId)] || '' : ''
      updates.model_interest = modelName ? `${brandName} ${modelName}` : brandName
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('prospects').update(updates).eq('id', prospectId)
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'sync_from_kommo',
      prospect_id: prospectId, kommo_lead_id: kommoLeadId,
      status: 'success', details: { fields_updated: Object.keys(updates) },
    })
  }
}

// ─── Sync our system → Kommo (fill empty only) ────────────────────────────────
async function syncFieldsToKommo(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const CF = {
    supabase_id:3192400, dealership_id:3192486, salesperson:3193866, notes:3192402,
    estado_vzla:3204218, event_name:3415147, fuente:2988728, marca:2988724,
    modelo_gac:2988732, concesionario:2988984,
  }
  const SOURCE_TO_KOMMO: Record<string, number> = {
    concesionario:7832230,evento:7832228,pagina_web:7832226,
    redes_sociales:7893992,referido:7832232,visita:7832230,
  }
  const BRAND_TO_KOMMO: Record<string, number> = { GAC:7832208,DFSK:7832206,Shinarey:7857650 }
  const MODEL_GAC_TO_KOMMO: Record<string, number> = { EMPOW:7832236,EMZOOM:7832370,GS8:7832372,SMILODON:7832384 }
  const CONCESIONARIO_KOMMO = [
    {id:7832490,kw:['harbin']},{id:7832492,kw:['garzas']},{id:7832494,kw:['hobby']},
    {id:7832496,kw:['meta car','zulia']},{id:7832498,kw:['palma']},
    {id:7832502,kw:['rosal','street boutique']},{id:7832504,kw:['valencia']},
    {id:7832506,kw:['barquisimeto']},{id:7832508,kw:['florida']},
    {id:7832510,kw:['castellana']},{id:8039476,kw:['guarenas']},{id:8134449,kw:['lecher']},
  ]

  const [prospectRes, leadRes] = await Promise.all([
    supabase.from('prospects').select('*, dealerships(name)').eq('id', prospectId).single(),
    fetch(`${baseUrl}/leads/${kommoLeadId}?with=custom_fields`, { headers: authHeaders }),
  ])

  const prospect = prospectRes.data
  if (!prospect || !leadRes.ok) return

  const lead = await leadRes.json() as Record<string, unknown>
  const existing = (lead.custom_fields_values as Array<{ field_id: number; values: Array<unknown> }>) || []
  const hasField = (id: number) => existing.some(f => f.field_id === id && f.values?.length > 0)

  const newFields: unknown[] = []
  const addVal = (id: number, val: unknown) => {
    if (!hasField(id) && val !== null && val !== undefined && val !== '')
      newFields.push({ field_id: id, values: [{ value: val }] })
  }
  const addEnum = (id: number, enumId: number | null) => {
    if (!hasField(id) && enumId) newFields.push({ field_id: id, values: [{ enum_id: enumId }] })
  }

  addVal(CF.supabase_id, prospect.id)
  addVal(CF.dealership_id, prospect.dealership_id)
  addVal(CF.salesperson, prospect.salesperson)
  addVal(CF.notes, prospect.notes)
  addVal(CF.estado_vzla, prospect['Estado de Vnzla'])
  addVal(CF.event_name, prospect.event_name)
  addEnum(CF.fuente, SOURCE_TO_KOMMO[prospect.source] ?? null)

  const parts = ((prospect.model_interest as string) || '').split(' ')
  const brand = parts[0]; const modelName = parts.slice(1).join(' ')
  addEnum(CF.marca, BRAND_TO_KOMMO[brand] ?? null)
  if (brand === 'GAC' && modelName) addEnum(CF.modelo_gac, MODEL_GAC_TO_KOMMO[modelName] ?? null)

  const dealName = ((prospect.dealerships as { name: string })?.name || '').toLowerCase()
  const dealEnum = CONCESIONARIO_KOMMO.find(c => c.kw.some(k => dealName.includes(k)))?.id ?? null
  addEnum(CF.concesionario, dealEnum)

  if (newFields.length > 0) {
    await fetch(`${baseUrl}/leads/${kommoLeadId}`, {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ custom_fields_values: newFields }),
    })
  }
}
