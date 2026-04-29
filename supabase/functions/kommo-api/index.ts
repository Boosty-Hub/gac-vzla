import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Custom field IDs in Kommo ────────────────────────────────────────────────
const CF = {
  supabase_id:             3192400,
  dealership_id:           3192486,
  salesperson:             3193866,
  notes:                   3192402,
  estado_vzla:             3204218,
  event_name:              3415147,
  fuente:                  2988728,
  marca:                   2988724,
  concesionario:           2988984,
  modelo_interes_gac:      3436641,
  modelo_interes_dfsk:     3436639,
  modelo_interes_shinerey: 2988850,
}

// ─── Source mappings ──────────────────────────────────────────────────────────
const SOURCE_TO_KOMMO: Record<string, number> = {
  concesionario: 7832230,
  evento:        7832228,
  pagina_web:    7832226,
  redes_sociales:7893992,
  referido:      7832232,
  visita:        7832230,
}
const KOMMO_TO_SOURCE: Record<string, string> = {
  '7832218': 'redes_sociales',
  '7832220': 'redes_sociales',
  '7832222': 'redes_sociales',
  '7832224': 'redes_sociales',
  '7832226': 'pagina_web',
  '7832228': 'evento',
  '7832230': 'concesionario',
  '7832232': 'referido',
  '7893992': 'redes_sociales',
  '7893994': 'redes_sociales',
}

// ─── Brand mappings ───────────────────────────────────────────────────────────
const BRAND_TO_KOMMO: Record<string, number> = {
  GAC:      7832208,
  DFSK:     7832206,
  SHINERAY: 7857650,
}
const KOMMO_TO_BRAND: Record<number, string> = {
  7832208: 'GAC',
  7832206: 'DFSK',
  7857650: 'SHINERAY',
}

// ─── Kommo enum IDs para campos de modelo por marca ──────────────────────────
// IDs reales obtenidos de /api/v4/leads/custom_fields/{field_id}
// Campo "Modelo Interes GAC" (3436641):
const K_GAC = { EMPOW: 8148533, EMZOOM: 8148535, GS8: 8148537, SMILODON: 8148539 }
// Campo "Modelo Interes DFSK" (3436639):
const K_DFSK = {
  PICK_UP:       8148523, // "Modelos Pick up"
  BOX_CAVA:      8148525, // "Modelos Box / Cava"
  CARGA_PANEL:   8148527, // "Modelos de Carga / Panel"
  VAN_PASAJEROS: 8148529, // "Modelos Van Pasajeros"
  SUV_PASAJEROS: 8148531, // "Modelos SUV / Pasajeros"
}
// Campo "Modelo Interés Shinerey" (2988850):
const K_SHINEREY = { PASAJEROS: 7832388, PANEL: 7832390 }

// ─── Central model name → Kommo enum_id ──────────────────────────────────────
// Múltiples variantes del sistema central se agrupan en la categoría Kommo correspondiente
const MODEL_GAC_TO_KOMMO: Record<string, number> = {
  'EMPOW GS':         K_GAC.EMPOW,
  'EMPOW GE':         K_GAC.EMPOW,
  'EMPOW GE 2.0':     K_GAC.EMPOW,
  'EMPOW GL':         K_GAC.EMPOW,
  'EMZOOM GB':        K_GAC.EMZOOM,
  'EMZOOM GS':        K_GAC.EMZOOM,
  'EMZOOM GB RSTYLE': K_GAC.EMZOOM,
  'GS8 GT':           K_GAC.GS8,
  'GS8 4WD GT':       K_GAC.GS8,
  'GS8 FACELIFT':     K_GAC.GS8,
  'SMILODON 4x2':     K_GAC.SMILODON,
  'SMILODON 4x4':     K_GAC.SMILODON,
}
const MODEL_DFSK_TO_KOMMO: Record<string, number> = {
  'C31 (Pick up)':          K_DFSK.PICK_UP,
  'C31 (Box)':              K_DFSK.BOX_CAVA,
  'C31 (Refrig -18°)':      K_DFSK.BOX_CAVA,
  'C32 (Pick up)':          K_DFSK.PICK_UP,
  'C35 (Panel)':            K_DFSK.CARGA_PANEL,
  'C37 (Pasajeros)':        K_DFSK.VAN_PASAJEROS,
  'C37 (11 Pasajeros)':     K_DFSK.VAN_PASAJEROS,
  'D51 (Plataforma)':       K_DFSK.PICK_UP,
  'D51 (Estacas)':          K_DFSK.PICK_UP,
  'D71 (Pick up)':          K_DFSK.PICK_UP,
  'D71 (BOX)':              K_DFSK.BOX_CAVA,
  'D72 (Pick up)':          K_DFSK.PICK_UP,
  'D1 Pick up (4X4)':       K_DFSK.PICK_UP,
  'Z9 Pick Up':             K_DFSK.PICK_UP,
  'K01S Cava (Isotermica)': K_DFSK.BOX_CAVA,
  'K01S Cava (Refrig -5°)': K_DFSK.BOX_CAVA,
  'K01S Cava (Refrig -18°)':K_DFSK.BOX_CAVA,
  'K01S (Estacas)':         K_DFSK.PICK_UP,
  'K01S (Pick up)':         K_DFSK.PICK_UP,
  'K02S (Pick up)':         K_DFSK.PICK_UP,
  'K05S (Panel)':           K_DFSK.CARGA_PANEL,
  'K07S (Pasajeros)':       K_DFSK.VAN_PASAJEROS,
  'GLORY 500 (SUV)':        K_DFSK.SUV_PASAJEROS,
  'GLORY 500 T (Dynamic)':  K_DFSK.SUV_PASAJEROS,
  'GLORY E5 (Hybrid)':      K_DFSK.SUV_PASAJEROS,
}
const MODEL_SHINEREY_TO_KOMMO: Record<string, number> = {
  'X30 (Pasajeros)': K_SHINEREY.PASAJEROS,
  'X30 (Panel)':     K_SHINEREY.PANEL,
}

// ─── Kommo label (text value) → central model name ───────────────────────────
// Las claves van en mayúsculas (se normaliza el label de Kommo antes de buscar)
const KOMMO_GAC_LABEL_TO_MODEL: Record<string, string> = {
  'EMPOW':    'EMPOW GS',
  'EMZOOM':   'EMZOOM GB',
  'GS8':      'GS8 GT',
  'SMILODON': 'SMILODON 4x2',
}
const KOMMO_DFSK_LABEL_TO_MODEL: Record<string, string> = {
  'MODELOS PICK UP':        'C31 (Pick up)',
  'MODELOS BOX / CAVA':     'C31 (Box)',
  'MODELOS DE CARGA / PANEL': 'C35 (Panel)',
  'MODELOS VAN PASAJEROS':  'C37 (Pasajeros)',
  'MODELOS SUV / PASAJEROS':'GLORY 500 (SUV)',
}
const KOMMO_SHINEREY_LABEL_TO_MODEL: Record<string, string> = {
  'X30 (PASAJEROS)': 'X30 (Pasajeros)',
  'X30 (PANEL)':     'X30 (Panel)',
}

// ─── Helpers de modelo ────────────────────────────────────────────────────────
function modelFieldForBrand(brand: string): number | null {
  if (brand === 'GAC') return CF.modelo_interes_gac
  if (brand === 'DFSK') return CF.modelo_interes_dfsk
  if (brand === 'SHINERAY') return CF.modelo_interes_shinerey
  return null
}

function modelToKommoEnumId(brand: string, modelName: string): number | null {
  let id: number | undefined
  if (brand === 'GAC') id = MODEL_GAC_TO_KOMMO[modelName]
  else if (brand === 'DFSK') id = MODEL_DFSK_TO_KOMMO[modelName]
  else if (brand === 'SHINERAY') id = MODEL_SHINEREY_TO_KOMMO[modelName]
  return id !== undefined ? id : null
}

function extractModelFromKommoFields(
  cfValues: Array<{ field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }>,
  brand: string
): string {
  const fieldId = modelFieldForBrand(brand)
  if (!fieldId) return ''
  const cf = cfValues.find(f => f.field_id === fieldId)
  if (!cf?.values?.[0]) return ''
  const label = String(cf.values[0].value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (!label) return ''
  const labelMap = brand === 'GAC' ? KOMMO_GAC_LABEL_TO_MODEL
    : brand === 'DFSK' ? KOMMO_DFSK_LABEL_TO_MODEL
    : KOMMO_SHINEREY_LABEL_TO_MODEL
  return labelMap[label] ?? label
}

// ─── Concesionario mappings ───────────────────────────────────────────────────
const CONCESIONARIO_KOMMO: Array<{ id: number; keywords: string[] }> = [
  { id: 7832490, keywords: ['harbin'] },
  { id: 7832492, keywords: ['garzas', 'anzoátegui', 'anzoategui'] },
  { id: 7832494, keywords: ['hobby'] },
  { id: 7832496, keywords: ['meta car', 'zulia'] },
  { id: 7832498, keywords: ['palma', 'falcón', 'falcon'] },
  { id: 7832502, keywords: ['rosal', 'street boutique'] },
  { id: 7832504, keywords: ['valencia'] },
  { id: 7832506, keywords: ['barquisimeto'] },
  { id: 7832508, keywords: ['florida'] },
  { id: 7832510, keywords: ['castellana'] },
  { id: 8039476, keywords: ['guarenas', 'servicio'] },
  { id: 8134449, keywords: ['lecher', 'lechería'] },
]

function dealershipNameToKommoId(name: string): number | null {
  const lower = name.toLowerCase()
  for (const c of CONCESIONARIO_KOMMO) {
    if (c.keywords.some(k => lower.includes(k))) return c.id
  }
  return null
}

// ─── Build custom_fields_values for Kommo from prospect data ─────────────────
function buildCustomFields(prospect: Record<string, unknown>, dealershipName?: string) {
  const fields: unknown[] = []
  const add = (field_id: number, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      fields.push({ field_id, values: [{ value }] })
    }
  }

  add(CF.supabase_id, prospect.id)
  add(CF.dealership_id, prospect.dealership_id)
  add(CF.salesperson, prospect.salesperson)
  add(CF.notes, prospect.notes)
  add(CF.estado_vzla, prospect['Estado de Vnzla'])
  add(CF.event_name, prospect.event_name)

  // Source → Fuente select
  const sourceEnumId = SOURCE_TO_KOMMO[prospect.source as string]
  if (sourceEnumId) fields.push({ field_id: CF.fuente, values: [{ enum_id: sourceEnumId }] })

  // model_interest → Marca + Modelo
  const modelInterest = (prospect.model_interest as string) || ''
  const parts = modelInterest.split(' ')
  const brand = parts[0] as string
  const modelName = parts.slice(1).join(' ')

  const brandEnumId = BRAND_TO_KOMMO[brand]
  if (brandEnumId) fields.push({ field_id: CF.marca, values: [{ enum_id: brandEnumId }] })

  if (modelName) {
    const fieldId = modelFieldForBrand(brand)
    const enumId = modelToKommoEnumId(brand, modelName)
    if (fieldId && enumId !== null) fields.push({ field_id: fieldId, values: [{ enum_id: enumId }] })
  }

  // Concesionario select
  if (dealershipName) {
    const dealEnumId = dealershipNameToKommoId(dealershipName)
    if (dealEnumId) fields.push({ field_id: CF.concesionario, values: [{ enum_id: dealEnumId }] })
  }

  return fields
}

// ─── Extract custom field value from Kommo lead ───────────────────────────────
function extractCF(lead: Record<string, unknown>, fieldId: number): string | null {
  const cfValues = (lead.custom_fields_values as Array<{ field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }>) || []
  const cf = cfValues.find(f => f.field_id === fieldId)
  if (!cf || !cf.values?.[0]) return null
  return String(cf.values[0].value ?? cf.values[0].enum_id ?? '').trim() || null
}

function extractCFEnumId(lead: Record<string, unknown>, fieldId: number): number | null {
  const cfValues = (lead.custom_fields_values as Array<{ field_id: number; values: Array<{ enum_id?: number }> }>) || []
  const cf = cfValues.find(f => f.field_id === fieldId)
  return cf?.values?.[0]?.enum_id ?? null
}

// ─── Sync Kommo lead fields → prospect (fill empty only) ─────────────────────
async function syncFromKommo(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const [prospectRes, leadRes] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', prospectId).single(),
    fetch(`${baseUrl}/leads/${kommoLeadId}?with=contacts,custom_fields`, { headers: authHeaders }),
  ])

  const prospect = prospectRes.data
  if (!prospect) return

  const lead = await leadRes.json() as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (!prospect.salesperson) {
    const val = extractCF(lead, CF.salesperson)
    if (val) updates.salesperson = val
  }
  if (!prospect.notes) {
    const val = extractCF(lead, CF.notes)
    if (val) updates.notes = val
  }
  if (!prospect['Estado de Vnzla']) {
    const val = extractCF(lead, CF.estado_vzla)
    if (val) updates['Estado de Vnzla'] = val
  }
  if (!prospect.event_name) {
    const val = extractCF(lead, CF.event_name)
    if (val) updates.event_name = val
  }
  if (!prospect.source || prospect.source === 'concesionario') {
    const enumId = extractCFEnumId(lead, CF.fuente)
    if (enumId && KOMMO_TO_SOURCE[String(enumId)]) {
      updates.source = KOMMO_TO_SOURCE[String(enumId)]
    }
  }
  if (!prospect.model_interest) {
    const brandEnumId = extractCFEnumId(lead, CF.marca)
    if (brandEnumId && KOMMO_TO_BRAND[brandEnumId]) {
      const brandName = KOMMO_TO_BRAND[brandEnumId]
      const cfValues = (lead.custom_fields_values as Array<{ field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }>) || []
      const modelName = extractModelFromKommoFields(cfValues, brandName)
      updates.model_interest = modelName ? `${brandName} ${modelName}` : brandName
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('prospects').update(updates).eq('id', prospectId)
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo',
      event_type: 'sync_from_kommo',
      prospect_id: prospectId,
      kommo_lead_id: kommoLeadId,
      status: 'success',
      details: { fields_updated: Object.keys(updates) },
    })
  }
}

// ─── Sync prospect fields → Kommo (fill empty only) ──────────────────────────
async function syncToKommo(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const [prospectRes, leadRes] = await Promise.all([
    supabase.from('prospects').select('*, dealerships(name)').eq('id', prospectId).single(),
    fetch(`${baseUrl}/leads/${kommoLeadId}?with=custom_fields`, { headers: authHeaders }),
  ])

  const prospect = prospectRes.data
  if (!prospect) return

  const lead = await leadRes.json() as Record<string, unknown>
  const existingCFs = (lead.custom_fields_values as Array<{ field_id: number; values: Array<unknown> }>) || []

  const hasField = (fieldId: number) =>
    existingCFs.some(f => f.field_id === fieldId && f.values?.length > 0 && f.values[0] !== null)

  const newFields: unknown[] = []
  const addIfEmpty = (fieldId: number, value: unknown) => {
    if (!hasField(fieldId) && value !== null && value !== undefined && value !== '') {
      newFields.push({ field_id: fieldId, values: [{ value }] })
    }
  }
  const addEnumIfEmpty = (fieldId: number, enumId: number | null) => {
    if (!hasField(fieldId) && enumId !== null) {
      newFields.push({ field_id: fieldId, values: [{ enum_id: enumId }] })
    }
  }

  addIfEmpty(CF.supabase_id, prospect.id)
  addIfEmpty(CF.dealership_id, prospect.dealership_id)
  addIfEmpty(CF.salesperson, prospect.salesperson)
  addIfEmpty(CF.notes, prospect.notes)
  addIfEmpty(CF.estado_vzla, prospect['Estado de Vnzla'])
  addIfEmpty(CF.event_name, prospect.event_name)
  addEnumIfEmpty(CF.fuente, SOURCE_TO_KOMMO[prospect.source] ?? null)

  const modelInterest = (prospect.model_interest as string) || ''
  const parts = modelInterest.split(' ')
  const brand = parts[0]
  const modelName = parts.slice(1).join(' ')
  addEnumIfEmpty(CF.marca, BRAND_TO_KOMMO[brand] ?? null)
  if (modelName) {
    const fieldId = modelFieldForBrand(brand)
    const enumId = modelToKommoEnumId(brand, modelName)
    if (fieldId) addEnumIfEmpty(fieldId, enumId)
  }

  const dealName = (prospect.dealerships as { name: string })?.name || ''
  addEnumIfEmpty(CF.concesionario, dealershipNameToKommoId(dealName))

  if (newFields.length > 0) {
    await fetch(`${baseUrl}/leads/${kommoLeadId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ custom_fields_values: newFields }),
    })
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo',
      event_type: 'sync_to_kommo',
      prospect_id: prospectId,
      kommo_lead_id: kommoLeadId,
      status: 'success',
      details: { fields_synced: newFields.length },
    })
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { action, prospect_id, kommo_lead_id, new_status } = body

    const { data: configRow } = await supabase
      .from('integration_configs')
      .select('config')
      .eq('integration_name', 'kommo')
      .eq('is_active', true)
      .single()

    if (!configRow) {
      return new Response(JSON.stringify({ error: 'Kommo no configurado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const config = configRow.config as Record<string, unknown>
    const baseUrl = `https://${config.subdomain}.kommo.com/api/v4`
    const authHeaders = {
      Authorization: `Bearer ${config.access_token}`,
      'Content-Type': 'application/json',
    }

    // ── Create lead ──────────────────────────────────────────────────────────
    if (action === 'create_lead') {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('*, dealerships(name)')
        .eq('id', prospect_id)
        .single()

      if (!prospect) throw new Error('Prospecto no encontrado')

      const stageId = (config.stage_mappings as Record<string, number>)['por_contactar']
      const dealershipName = (prospect.dealerships as { name: string })?.name || ''
      const customFields = buildCustomFields(prospect, dealershipName)

      const contactFields: unknown[] = []
      if (prospect.phone) contactFields.push({ field_code: 'PHONE', values: [{ value: prospect.phone, enum_code: 'WORK' }] })
      if (prospect.email) contactFields.push({ field_code: 'EMAIL', values: [{ value: prospect.email, enum_code: 'WORK' }] })

      const leadPayload = [{
        name: prospect.name,
        pipeline_id: config.pipeline_id,
        status_id: stageId,
        custom_fields_values: customFields,
        _embedded: {
          contacts: [{ name: prospect.name, custom_fields_values: contactFields }],
          tags: [{ name: 'Sistema Central' }],
        },
      }]

      const kommoRes = await fetch(`${baseUrl}/leads/complex`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(leadPayload),
      })
      const kommoData = await kommoRes.json() as Record<string, unknown>

      if (!kommoRes.ok) {
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'create_lead',
          prospect_id, status: 'error', details: kommoData,
        })
        throw new Error(`Kommo API error: ${JSON.stringify(kommoData)}`)
      }

      // /leads/complex returns a plain array [{id, ...}]
      const leadsArray = Array.isArray(kommoData) ? kommoData as Array<{ id: number }> : []
      const newLead = leadsArray[0]
      if (newLead?.id) {
        await supabase.from('prospects').update({ kommo_lead_id: newLead.id }).eq('id', prospect_id)
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'create_lead',
          prospect_id, kommo_lead_id: newLead.id,
          status: 'success', details: { lead_id: newLead.id, fields_synced: customFields.length },
        })
      }

      return new Response(JSON.stringify({ success: true, kommo_lead_id: newLead?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Update stage ─────────────────────────────────────────────────────────
    if (action === 'update_stage') {
      if (!kommo_lead_id || !new_status) throw new Error('Faltan parámetros')
      const stageId = (config.stage_mappings as Record<string, number>)[new_status]
      if (!stageId) throw new Error(`Sin mapeo para status: ${new_status}`)

      const kommoRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify({ status_id: stageId }),
      })
      const kommoData = await kommoRes.json()

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_stage',
        prospect_id: prospect_id || null, kommo_lead_id,
        status: kommoRes.ok ? 'success' : 'error',
        details: { new_status, stage_id: stageId },
      })

      // Also sync fields to Kommo (fill empty)
      if (kommoRes.ok && prospect_id) {
        syncToKommo(supabase, prospect_id, kommo_lead_id, authHeaders, baseUrl).catch(console.error)
      }

      return new Response(JSON.stringify({ success: kommoRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Sync to Kommo (fill empty fields in Kommo from our system) ───────────
    if (action === 'sync_to_kommo') {
      if (!prospect_id || !kommo_lead_id) throw new Error('Faltan parámetros')
      await syncToKommo(supabase, prospect_id, kommo_lead_id, authHeaders, baseUrl)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Sync from Kommo (fill empty fields in our system from Kommo) ─────────
    if (action === 'sync_from_kommo') {
      if (!prospect_id || !kommo_lead_id) throw new Error('Faltan parámetros')
      await syncFromKommo(supabase, prospect_id, kommo_lead_id, authHeaders, baseUrl)
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Acción desconocida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
