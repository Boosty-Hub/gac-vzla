import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Shared constants (mirrored from kommo-api) ───────────────────────────────
const CF = {
  supabase_id:             3192400,
  dealership_id:           3192486,
  salesperson:             3193866,
  notes:                   3192402,
  estado_vzla:             3204218,
  event_name:              3448828,
  fuente:                  2988728,
  marca:                   2988724,
  concesionario:           2988984,
  modelo_interes_gac:      3436641,
  modelo_interes_dfsk:     3436639,
  modelo_interes_shinerey: 2988850,
}

const CONTACT_CF = {
  tipo_persona: 2988986,
  genero:       3451546,
  rango_edad:   3451548,
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
  '8158236': 'redes_sociales',
  '8162702': 'redes_sociales',   // Campaña ADS
  '8164367': 'visita',           // Visita — ID correcto (≠ Vendedor)
}

const KOMMO_TO_BRAND: Record<number, string> = {
  7832208: 'GAC',
  7832206: 'DFSK',
  7857650: 'SHINERAY',
}

const KOMMO_EVENT_ID_TO_NAME: Record<number, string> = {
  8158302: 'Cerro Verde 2026',
  8161259: 'Exhibición Acarigua Mango Center 2026',
  8161682: 'Plastic Show Valencia',
}

const KOMMO_TO_PERSON_TYPE: Record<number, string> = {
  7832512: 'natural',
  7832514: 'juridica',
}

const K_GAC = { EMPOW: 8148533, EMZOOM: 8148535, GS8: 8148537, SMILODON: 8148539 }
const K_DFSK = {
  PICK_UP: 8148523, BOX_CAVA: 8148525, CARGA_PANEL: 8148527,
  VAN_PASAJEROS: 8148529, SUV_PASAJEROS: 8148531,
}
const K_SHINEREY = { PASAJEROS: 7832388, PANEL: 7832390 }

const SOURCE_TO_KOMMO: Record<string, number> = {
  concesionario:  7832230,
  evento:         7832228,
  pagina_web:     7832226,
  redes_sociales: 7893992,
  referido:       7832232,
  visita:         8164367,  // ID correcto (≠ Vendedor = 7832230)
  whatsapp:       7893992,
  tiktok:         7893994,
  qr:             8158236,
  ads:            8162702,
}
const BRAND_TO_KOMMO: Record<string, number> = { GAC: 7832208, DFSK: 7832206, SHINERAY: 7857650 }

const EVENT_NAME_ENUMS = [
  { id: 8158302, keywords: ['cerro verde'] },
  { id: 8161259, keywords: ['acarigua', 'mango center'] },
  { id: 8161682, keywords: ['plastic show'] },
]

function eventNameToKommoEnumId(eventName: string): number | null {
  if (!eventName) return null
  const lower = eventName.toLowerCase()
  return EVENT_NAME_ENUMS.find(e => e.keywords.some(k => lower.includes(k)))?.id ?? null
}

const PERSON_TYPE_TO_KOMMO: Record<string, number> = {
  natural: 7832512, juridica: 7832514,
}

const VALID_AGE_RANGES = new Set(['20-30', '30-40', '40+'])
function sanitizeAgeRange(val: string | null): string | null {
  return val && VALID_AGE_RANGES.has(val) ? val : null
}

const MODEL_GAC_TO_KOMMO: Record<string, number> = {
  'EMPOW GS': K_GAC.EMPOW, 'EMPOW GE': K_GAC.EMPOW, 'EMPOW GE 2.0': K_GAC.EMPOW, 'EMPOW GL': K_GAC.EMPOW,
  'EMZOOM GB': K_GAC.EMZOOM, 'EMZOOM GS': K_GAC.EMZOOM, 'EMZOOM GB RSTYLE': K_GAC.EMZOOM,
  'GS8 GT': K_GAC.GS8, 'GS8 4WD GT': K_GAC.GS8, 'GS8 FACELIFT': K_GAC.GS8,
  'SMILODON 4x2': K_GAC.SMILODON, 'SMILODON 4x4': K_GAC.SMILODON,
}
const MODEL_DFSK_TO_KOMMO: Record<string, number> = {
  'C31 (Pick up)': K_DFSK.PICK_UP, 'C31 (Box)': K_DFSK.BOX_CAVA, 'C31 (Refrig -18°)': K_DFSK.BOX_CAVA,
  'C32 (Pick up)': K_DFSK.PICK_UP, 'C35 (Panel)': K_DFSK.CARGA_PANEL,
  'C37 (Pasajeros)': K_DFSK.VAN_PASAJEROS, 'C37 (11 Pasajeros)': K_DFSK.VAN_PASAJEROS,
  'D51 (Plataforma)': K_DFSK.PICK_UP, 'D51 (Estacas)': K_DFSK.PICK_UP,
  'D71 (Pick up)': K_DFSK.PICK_UP, 'D71 (BOX)': K_DFSK.BOX_CAVA,
  'D72 (Pick up)': K_DFSK.PICK_UP, 'D1 Pick up (4X4)': K_DFSK.PICK_UP, 'Z9 Pick Up': K_DFSK.PICK_UP,
  'K01S Cava (Isotermica)': K_DFSK.BOX_CAVA, 'K01S Cava (Refrig -5°)': K_DFSK.BOX_CAVA,
  'K01S Cava (Refrig -18°)': K_DFSK.BOX_CAVA, 'K01S (Estacas)': K_DFSK.PICK_UP,
  'K01S (Pick up)': K_DFSK.PICK_UP, 'K02S (Pick up)': K_DFSK.PICK_UP,
  'K05S (Panel)': K_DFSK.CARGA_PANEL, 'K07S (Pasajeros)': K_DFSK.VAN_PASAJEROS,
  'GLORY 500 (SUV)': K_DFSK.SUV_PASAJEROS, 'GLORY 500 T (Dynamic)': K_DFSK.SUV_PASAJEROS,
  'GLORY E5 (Hybrid)': K_DFSK.SUV_PASAJEROS,
}
const MODEL_SHINEREY_TO_KOMMO: Record<string, number> = {
  'X30 (Pasajeros)': K_SHINEREY.PASAJEROS, 'X30 (Panel)': K_SHINEREY.PANEL,
}

const KOMMO_GAC_LABEL_TO_MODEL: Record<string, string> = {
  'EMPOW': 'EMPOW GS', 'EMZOOM': 'EMZOOM GB', 'GS8': 'GS8 GT', 'SMILODON': 'SMILODON 4x2',
}
const KOMMO_DFSK_LABEL_TO_MODEL: Record<string, string> = {
  'MODELOS PICK UP': 'C31 (Pick up)', 'MODELOS  PICK UP': 'C31 (Pick up)',
  'MODELOS BOX / CAVA': 'C31 (Box)', 'MODELOS DE CARGA / PANEL': 'C35 (Panel)',
  'MODELOS VAN PASAJEROS': 'C37 (Pasajeros)', 'MODELOS SUV / PASAJEROS': 'GLORY 500 (SUV)',
}
const KOMMO_SHINEREY_LABEL_TO_MODEL: Record<string, string> = {
  'X30 (PASAJEROS)': 'X30 (Pasajeros)', 'X30 (PANEL)': 'X30 (Panel)', 'X30 (PANEL': 'X30 (Panel)',
}

// ─── Post Venta pipeline ──────────────────────────────────────────────────────
const POSTVENTA_PIPELINE_ID = 13151339
const POSTVENTA_STAGE_TO_STATUS: Record<string, string> = {
  '101411319': 'pendiente',
  '101411323': 'confirmada',
  '101411327': 'en_proceso',
  '104022404': 'completada',
  '104022408': 'cancelada',
}

const CONCESIONARIO_KOMMO = [
  { id: 7832490, kw: ['harbin'] }, { id: 7832492, kw: ['garzas'] }, { id: 7832494, kw: ['hobby'] },
  { id: 7832496, kw: ['meta car', 'zulia'] }, { id: 7832498, kw: ['palma'] },
  { id: 7832502, kw: ['rosal', 'street boutique'] }, { id: 7832504, kw: ['valencia'] },
  { id: 7832506, kw: ['barquisimeto'] }, { id: 7832508, kw: ['florida'] },
  { id: 7832510, kw: ['castellana'] }, { id: 8039476, kw: ['guarenas'] },
  { id: 8134449, kw: ['lecher'] }, { id: 8159325, kw: ['cerro verde'] },
]

const CONCESIONARIO_KEYWORD: Record<number, string> = {
  7832490: 'harbin', 7832492: 'garzas', 7832494: 'hobby', 7832496: 'meta car',
  7832498: 'palma', 7832502: 'rosal', 7832504: 'valencia', 7832506: 'barquisimeto',
  7832508: 'florida', 7832510: 'castellana', 8039476: 'guarenas', 8134449: 'lecher',
  8159325: 'cerro verde',
}

type CFValue = { field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }

function getCFText(cfValues: CFValue[], id: number): string | null {
  const f = cfValues.find(x => x.field_id === id)
  return f?.values?.[0]?.value ? String(f.values[0].value).trim() : null
}
function getCFEnum(cfValues: CFValue[], id: number): number | null {
  return cfValues.find(x => x.field_id === id)?.values?.[0]?.enum_id ?? null
}

function modelFieldForBrand(brand: string): number | null {
  if (brand === 'GAC') return CF.modelo_interes_gac
  if (brand === 'DFSK') return CF.modelo_interes_dfsk
  if (brand === 'SHINERAY') return CF.modelo_interes_shinerey
  return null
}

function extractModelFromCFs(cfValues: CFValue[], brand: string): string {
  const fieldId = modelFieldForBrand(brand)
  if (!fieldId) return ''
  const cf = cfValues.find(x => x.field_id === fieldId)
  if (!cf?.values?.[0]) return ''
  const label = String(cf.values[0].value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (!label) return ''
  const map = brand === 'GAC' ? KOMMO_GAC_LABEL_TO_MODEL
    : brand === 'DFSK' ? KOMMO_DFSK_LABEL_TO_MODEL
    : KOMMO_SHINEREY_LABEL_TO_MODEL
  return map[label] ?? label
}

// ─── Main webhook handler ─────────────────────────────────────────────────────
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

    // ── Status change event ───────────────────────────────────────────────────
    const statusLeadId = params.get('leads[status][0][id]')
    const statusId     = params.get('leads[status][0][status_id]')
    const pipelineId   = params.get('leads[status][0][pipeline_id]')

    if (statusLeadId && statusId) {
      // ── Post Venta pipeline: update reservation status ───────────────────
      if (String(pipelineId) === String(POSTVENTA_PIPELINE_ID)) {
        const ourStatus = POSTVENTA_STAGE_TO_STATUS[statusId]
        if (ourStatus) {
          const { data: reservation } = await supabase
            .from('reservations')
            .select('id, status')
            .eq('kommo_lead_id', parseInt(statusLeadId))
            .single()

          if (reservation && reservation.status !== ourStatus) {
            await supabase.from('reservations').update({ status: ourStatus }).eq('id', reservation.id)
            await supabase.from('integration_logs').insert({
              integration_name: 'kommo', event_type: 'webhook_reservation_status_update',
              kommo_lead_id: parseInt(statusLeadId), status: 'success',
              details: { reservation_id: reservation.id, old_status: reservation.status, new_status: ourStatus },
            })
          }
        }
        return new Response('OK', { status: 200 })
      }

      // ── Prospects pipeline ───────────────────────────────────────────────
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
        // Auto-create only when reaching "Demostracion" stage
        const DEMOSTRACION_STAGE_ID = '101392719'
        if (statusId === DEMOSTRACION_STAGE_ID) {
          await autoCreateProspectFromKommo(supabase, parseInt(statusLeadId), authHeaders, baseUrl)
        } else {
          await supabase.from('integration_logs').insert({
            integration_name: 'kommo', event_type: 'webhook_lead_not_found',
            kommo_lead_id: parseInt(statusLeadId), status: 'warning',
            details: { kommo_status_id: statusId, pipeline_id: pipelineId },
          })
        }
        return new Response('OK', { status: 200 })
      }

      if (ourStatus && prospect.status !== ourStatus) {
        await supabase.from('prospects').update({ status: ourStatus }).eq('id', prospect.id)
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'webhook_status_update',
          prospect_id: prospect.id, kommo_lead_id: parseInt(statusLeadId),
          status: 'success',
          details: { old_status: prospect.status, new_status: ourStatus, kommo_status_id: statusId },
        })
      }

      // Sync all fields from Kommo → GAC (overwrite if different)
      await syncFieldsFromKommo(supabase, prospect.id, parseInt(statusLeadId), authHeaders, baseUrl)

      return new Response('OK', { status: 200 })
    }

    // ── Lead updated event ────────────────────────────────────────────────────
    const updateLeadId = params.get('leads[update][0][id]')

    if (updateLeadId) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id')
        .eq('kommo_lead_id', parseInt(updateLeadId))
        .single()

      if (prospect) {
        // Sync Kommo → GAC (overwrite if different) then push any GAC-only fields back
        await syncFieldsFromKommo(supabase, prospect.id, parseInt(updateLeadId), authHeaders, baseUrl)
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

// ─── syncFieldsFromKommo: overwrite GAC fields from Kommo (if different) ──────
async function syncFieldsFromKommo(
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
  if (!prospect || !leadRes.ok) return

  const lead = await leadRes.json() as Record<string, unknown>
  const cfValues = (lead.custom_fields_values as CFValue[]) || []
  const updates: Record<string, unknown> = {}

  // Lead title → name
  const kommoName = String(lead.name ?? '').trim()
  if (kommoName && kommoName !== prospect.name) updates.name = kommoName

  // Text fields: overwrite if Kommo has a value and it differs
  const salesperson = getCFText(cfValues, CF.salesperson)
  if (salesperson !== null && salesperson !== prospect.salesperson) updates.salesperson = salesperson

  const notes = getCFText(cfValues, CF.notes)
  if (notes !== null && notes !== prospect.notes) updates.notes = notes

  const estadoVzla = getCFText(cfValues, CF.estado_vzla)
  if (estadoVzla !== null && estadoVzla !== prospect['Estado de Vnzla']) updates['Estado de Vnzla'] = estadoVzla

  // Event name: only fill if GAC doesn't have an event yet.
  // GAC has more events than Kommo's enum list — never overwrite a GAC value with Kommo's
  // (Kommo would revert it back because it can't represent GAC-only events as enums).
  if (!prospect.event_name) {
    const eventEnumId = getCFEnum(cfValues, CF.event_name)
    if (eventEnumId !== null) {
      const eventName = KOMMO_EVENT_ID_TO_NAME[eventEnumId] ?? null
      if (eventName) updates.event_name = eventName
    }
  }

  // Source (select → text)
  const sourceEnumId = getCFEnum(cfValues, CF.fuente)
  if (sourceEnumId !== null) {
    const source = KOMMO_TO_SOURCE[String(sourceEnumId)] ?? null
    if (source && source !== prospect.source) updates.source = source
  }

  // Brand + model
  const brandEnumId = getCFEnum(cfValues, CF.marca)
  if (brandEnumId !== null && KOMMO_TO_BRAND[brandEnumId]) {
    const brandName = KOMMO_TO_BRAND[brandEnumId]
    const modelName = extractModelFromCFs(cfValues, brandName)
    const modelInterest = modelName ? `${brandName} ${modelName}` : brandName
    if (modelInterest !== prospect.model_interest) updates.model_interest = modelInterest
  }

  // Contact fields: name, phone, email, person_type, gender, age_range
  const contacts = ((lead._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
  if (contacts[0]?.id) {
    const contactRes = await fetch(`${baseUrl}/contacts/${contacts[0].id}?with=custom_fields`, { headers: authHeaders })
    if (contactRes.ok) {
      const contactData = await contactRes.json() as Record<string, unknown>
      const contactCFs = (contactData.custom_fields_values as CFValue[]) || []

      // Contact name → prospect name (only if not already updated from lead.name)
      if (!updates.name) {
        const contactName = String(contactData.name ?? '').trim()
        if (contactName && contactName !== prospect.name) updates.name = contactName
      }

      // Phone
      const phoneCF = contactCFs.find(f => (f as unknown as { field_code?: string }).field_code === 'PHONE' || f.field_id === 2988356)
      const phone = phoneCF?.values?.[0]?.value ? String(phoneCF.values[0].value).trim() : null
      if (phone && phone !== prospect.phone) updates.phone = phone

      // Email
      const emailCF = contactCFs.find(f => (f as unknown as { field_code?: string }).field_code === 'EMAIL' || f.field_id === 2988358)
      const email = emailCF?.values?.[0]?.value ? String(emailCF.values[0].value).trim() : null
      if (email && email !== prospect.email) updates.email = email

      // Tipo de Persona (enum → 'natural'/'juridica')
      const personTypeEnumId = getCFEnum(contactCFs, CONTACT_CF.tipo_persona)
      if (personTypeEnumId !== null) {
        const personType = KOMMO_TO_PERSON_TYPE[personTypeEnumId] ?? null
        if (personType && personType !== prospect.person_type) updates.person_type = personType
      }

      // Género (text, lowercase to match GAC values)
      const genero = getCFText(contactCFs, CONTACT_CF.genero)
      if (genero !== null) {
        const generoLower = genero.toLowerCase()
        if (generoLower !== prospect.gender) updates.gender = generoLower
      }

      // Rango de edad (text — must match constraint values)
      const rangoEdad = sanitizeAgeRange(getCFText(contactCFs, CONTACT_CF.rango_edad))
      if (rangoEdad !== null && rangoEdad !== prospect.age_range) updates.age_range = rangoEdad
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

// ─── syncFieldsToKommo: fill empty fields in Kommo from GAC ──────────────────
async function syncFieldsToKommo(
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
    if (!hasField(id) && enumId !== null) newFields.push({ field_id: id, values: [{ enum_id: enumId }] })
  }

  addVal(CF.supabase_id, prospect.id)
  addVal(CF.dealership_id, prospect.dealership_id)
  addVal(CF.salesperson, prospect.salesperson)
  addVal(CF.notes, prospect.notes)
  addVal(CF.estado_vzla, prospect['Estado de Vnzla'])
  addEnum(CF.event_name, eventNameToKommoEnumId(String(prospect.event_name || '')))
  addEnum(CF.fuente, SOURCE_TO_KOMMO[prospect.source] ?? null)

  const parts = ((prospect.model_interest as string) || '').split(' ')
  const brand = parts[0]; const modelName = parts.slice(1).join(' ')
  addEnum(CF.marca, BRAND_TO_KOMMO[brand] ?? null)
  if (modelName) {
    const fieldId = modelFieldForBrand(brand)
    let enumId: number | null = null
    if (brand === 'GAC') enumId = MODEL_GAC_TO_KOMMO[modelName] ?? null
    else if (brand === 'DFSK') enumId = MODEL_DFSK_TO_KOMMO[modelName] ?? null
    else if (brand === 'SHINERAY') enumId = MODEL_SHINEREY_TO_KOMMO[modelName] ?? null
    if (fieldId) addEnum(fieldId, enumId)
  }

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

// ─── autoCreateProspectFromKommo: create GAC prospect from Kommo lead ─────────
async function autoCreateProspectFromKommo(
  supabase: ReturnType<typeof createClient>,
  kommoLeadId: number,
  authHeaders: Record<string, string>,
  baseUrl: string
) {
  const leadRes = await fetch(`${baseUrl}/leads/${kommoLeadId}?with=contacts,custom_fields`, { headers: authHeaders })
  if (!leadRes.ok || leadRes.status === 204) {
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'webhook_auto_create_failed',
      kommo_lead_id: kommoLeadId, status: 'error',
      details: { reason: 'kommo_fetch_failed', http_status: leadRes.status },
    })
    return
  }

  let lead: Record<string, unknown>
  try {
    lead = await leadRes.json() as Record<string, unknown>
  } catch {
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'webhook_auto_create_failed',
      kommo_lead_id: kommoLeadId, status: 'error',
      details: { reason: 'json_parse_failed' },
    })
    return
  }

  const cfValues = (lead.custom_fields_values as CFValue[]) || []

  // If supabase_id CF already set → re-link existing prospect
  const existingSupabaseId = getCFText(cfValues, CF.supabase_id)
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

  const leadName = (lead.name as string) || ''
  const contacts = ((lead._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []

  // Fetch contact for name, phone, email, and contact CFs
  let contactName: string | null = null
  let phone: string | null = null
  let email: string | null = null
  let personType: string | null = null
  let gender: string | null = null
  let ageRange: string | null = null

  if (contacts[0]?.id) {
    const contactRes = await fetch(`${baseUrl}/contacts/${contacts[0].id}?with=custom_fields`, { headers: authHeaders })
    if (contactRes.ok && contactRes.status !== 204) {
      try {
        const contactData = await contactRes.json() as Record<string, unknown>
        const cfs = (contactData.custom_fields_values as CFValue[]) || []

        // Prefer contact name over lead name (lead name can be "Lead #XXXXXXX")
        const rawContactName = String(contactData.name ?? '').trim()
        if (rawContactName) contactName = rawContactName

        const phoneCF = cfs.find(f => (f as unknown as { field_code?: string }).field_code === 'PHONE')
        phone = phoneCF?.values?.[0]?.value ? String(phoneCF.values[0].value) : null

        const emailCF = cfs.find(f => (f as unknown as { field_code?: string }).field_code === 'EMAIL')
        email = emailCF?.values?.[0]?.value ? String(emailCF.values[0].value) : null

        const ptEnumId = getCFEnum(cfs, CONTACT_CF.tipo_persona)
        if (ptEnumId) personType = KOMMO_TO_PERSON_TYPE[ptEnumId] ?? null

        const generoVal = getCFText(cfs, CONTACT_CF.genero)
        if (generoVal) gender = generoVal.toLowerCase()

        ageRange = sanitizeAgeRange(getCFText(cfs, CONTACT_CF.rango_edad))
      } catch { /* ignore */ }
    }
  }

  // Use contact name first, fall back to lead name, then generic placeholder
  const finalName = contactName || leadName || 'Sin nombre'

  // Extract lead fields
  const salesperson = getCFText(cfValues, CF.salesperson) || getCFText(cfValues, 2988736)
  const notes = getCFText(cfValues, CF.notes)
  const estadoVzla = getCFText(cfValues, CF.estado_vzla)

  const eventEnumId = getCFEnum(cfValues, CF.event_name)
  const eventName = eventEnumId ? (KOMMO_EVENT_ID_TO_NAME[eventEnumId] ?? null) : null

  const sourceEnumId = getCFEnum(cfValues, CF.fuente)
  const source = sourceEnumId ? (KOMMO_TO_SOURCE[String(sourceEnumId)] || 'concesionario') : 'concesionario'

  const brandEnumId = getCFEnum(cfValues, CF.marca)
  let modelInterest: string | null = null
  if (brandEnumId && KOMMO_TO_BRAND[brandEnumId]) {
    const brandName = KOMMO_TO_BRAND[brandEnumId]
    const modelName = extractModelFromCFs(cfValues, brandName)
    modelInterest = modelName ? `${brandName} ${modelName}` : brandName
  }

  // Resolve dealership_id from concesionario enum
  let dealershipId: string | null = null
  const concEnumId = getCFEnum(cfValues, CF.concesionario)
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

  const newProspect: Record<string, unknown> = {
    name: finalName,
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
    ...(personType && { person_type: personType }),
    ...(gender && { gender }),
    ...(ageRange && { age_range: ageRange }),
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

  // Write supabase_id back to Kommo
  await fetch(`${baseUrl}/leads/${kommoLeadId}`, {
    method: 'PATCH', headers: authHeaders,
    body: JSON.stringify({
      custom_fields_values: [{ field_id: CF.supabase_id, values: [{ value: created.id }] }],
    }),
  })

  await supabase.from('integration_logs').insert({
    integration_name: 'kommo', event_type: 'webhook_auto_created',
    prospect_id: created.id, kommo_lead_id: kommoLeadId,
    status: 'success',
    details: { lead_name: finalName, dealership_id: dealershipId, fields: Object.keys(newProspect) },
  })
}
