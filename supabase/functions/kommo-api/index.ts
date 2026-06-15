import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Lead custom field IDs in Kommo ──────────────────────────────────────────
const CF = {
  supabase_id:             3192400,
  dealership_id:           3192486,
  salesperson:             3193866,
  notes:                   3192402,
  estado_vzla:             3204218,
  event_name:              3448828,  // "Nombre del Evento" (select)
  fuente:                  2988728,
  marca:                   2988724,
  concesionario:           2988984,
  modelo_interes_gac:      3436641,
  modelo_interes_dfsk:     3436639,
  modelo_interes_shinerey: 2988850,
}

// ─── Contact custom field IDs in Kommo ───────────────────────────────────────
const CONTACT_CF = {
  tipo_persona:    2988986,
  genero:          3451546,
  rango_edad:      3451548,
  ci_rif:          2988990,  // C.I - RIF
  estado:          3076676,  // Estado (Venezuela state)
  modelo_vehiculo: 3454795,  // Modelo de vehículo (Post Venta mirror)
  km_vehiculo:     3454797,  // Kilometraje (Post Venta mirror)
  centro_servicio: 3454799,  // Centro de Servicio (Post Venta mirror)
  placa:           3454801,  // Placa (Post Venta mirror)
}

// ─── Source mappings ──────────────────────────────────────────────────────────
// IMPORTANT: 'Visita' en Kommo tiene ID 8164367 (≠ 'Vendedor' = 7832230)
const SOURCE_TO_KOMMO: Record<string, number> = {
  concesionario:  7832230,  // "Vendedor" en Kommo
  evento:         7832228,
  pagina_web:     7832226,
  redes_sociales: 7893992,
  referido:       7832232,
  visita:         8164367,  // "Visita" en Kommo — ID correcto
  whatsapp:       7893992,
  tiktok:         7893994,
  qr:             8158236,
  ads:            8162702,
}
const KOMMO_TO_SOURCE: Record<string, string> = {
  '7832218': 'redes_sociales',   // Instagram DFSK
  '7832220': 'redes_sociales',   // Instagram GAC
  '7832222': 'redes_sociales',   // Facebook DFSK
  '7832224': 'redes_sociales',   // Facebook GAC
  '7832226': 'pagina_web',
  '7832228': 'evento',
  '7832230': 'concesionario',    // Vendedor
  '7832232': 'referido',
  '7893992': 'redes_sociales',   // WhatsApp
  '7893994': 'redes_sociales',   // TikTok
  '8158236': 'redes_sociales',   // QR
  '8162702': 'redes_sociales',   // Campaña ADS
  '8164367': 'visita',           // Visita — ID correcto
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

// ─── Event name mappings (CF 3448828 "Nombre del Evento" is a SELECT) ─────────
const EVENT_NAME_ENUMS = [
  { id: 8158302, value: 'Cerro Verde 2026',                       keywords: ['cerro verde'] },
  { id: 8161259, value: 'Exhibición Acarigua Mango Center 2026',  keywords: ['acarigua', 'mango center'] },
  { id: 8161682, value: 'Plastic Show Valencia',                   keywords: ['plastic show'] },
]
const KOMMO_EVENT_ID_TO_NAME: Record<number, string> = {
  8158302: 'Cerro Verde 2026',
  8161259: 'Exhibición Acarigua Mango Center 2026',
  8161682: 'Plastic Show Valencia',
}

function eventNameToKommoEnumId(eventName: string): number | null {
  if (!eventName) return null
  const lower = eventName.toLowerCase()
  return EVENT_NAME_ENUMS.find(e => e.keywords.some(k => lower.includes(k)))?.id ?? null
}

// ─── Person type mappings (on Kommo contact CF 2988986) ───────────────────────
const PERSON_TYPE_TO_KOMMO: Record<string, number> = {
  natural:  7832512,
  juridica: 7832514,
}
const KOMMO_TO_PERSON_TYPE: Record<number, string> = {
  7832512: 'natural',
  7832514: 'juridica',
}

// ─── Kommo enum IDs para campos de modelo por marca ──────────────────────────
const K_GAC = { EMPOW: 8148533, EMZOOM: 8148535, GS8: 8148537, SMILODON: 8148539 }
const K_DFSK = {
  PICK_UP:       8148523,
  BOX_CAVA:      8148525,
  CARGA_PANEL:   8148527,
  VAN_PASAJEROS: 8148529,
  SUV_PASAJEROS: 8148531,
}
const K_SHINEREY = { PASAJEROS: 7832388, PANEL: 7832390 }

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
  'C31 (Pick up)':           K_DFSK.PICK_UP,
  'C31 (Box)':               K_DFSK.BOX_CAVA,
  'C31 (Refrig -18°)':       K_DFSK.BOX_CAVA,
  'C32 (Pick up)':           K_DFSK.PICK_UP,
  'C35 (Panel)':             K_DFSK.CARGA_PANEL,
  'C37 (Pasajeros)':         K_DFSK.VAN_PASAJEROS,
  'C37 (11 Pasajeros)':      K_DFSK.VAN_PASAJEROS,
  'D51 (Plataforma)':        K_DFSK.PICK_UP,
  'D51 (Estacas)':           K_DFSK.PICK_UP,
  'D71 (Pick up)':           K_DFSK.PICK_UP,
  'D71 (BOX)':               K_DFSK.BOX_CAVA,
  'D72 (Pick up)':           K_DFSK.PICK_UP,
  'D1 Pick up (4X4)':        K_DFSK.PICK_UP,
  'Z9 Pick Up':              K_DFSK.PICK_UP,
  'K01S Cava (Isotermica)':  K_DFSK.BOX_CAVA,
  'K01S Cava (Refrig -5°)':  K_DFSK.BOX_CAVA,
  'K01S Cava (Refrig -18°)': K_DFSK.BOX_CAVA,
  'K01S (Estacas)':          K_DFSK.PICK_UP,
  'K01S (Pick up)':          K_DFSK.PICK_UP,
  'K02S (Pick up)':          K_DFSK.PICK_UP,
  'K05S (Panel)':            K_DFSK.CARGA_PANEL,
  'K07S (Pasajeros)':        K_DFSK.VAN_PASAJEROS,
  'GLORY 500 (SUV)':         K_DFSK.SUV_PASAJEROS,
  'GLORY 500 T (Dynamic)':   K_DFSK.SUV_PASAJEROS,
  'GLORY E5 (Hybrid)':       K_DFSK.SUV_PASAJEROS,
}
const MODEL_SHINEREY_TO_KOMMO: Record<string, number> = {
  'X30 (Pasajeros)': K_SHINEREY.PASAJEROS,
  'X30 (Panel)':     K_SHINEREY.PANEL,
}

const KOMMO_GAC_LABEL_TO_MODEL: Record<string, string> = {
  'EMPOW':    'EMPOW GS',
  'EMZOOM':   'EMZOOM GB',
  'GS8':      'GS8 GT',
  'SMILODON': 'SMILODON 4x2',
}
const KOMMO_DFSK_LABEL_TO_MODEL: Record<string, string> = {
  'MODELOS PICK UP':          'C31 (Pick up)',
  'MODELOS  PICK UP':         'C31 (Pick up)',
  'MODELOS BOX / CAVA':       'C31 (Box)',
  'MODELOS DE CARGA / PANEL': 'C35 (Panel)',
  'MODELOS VAN PASAJEROS':    'C37 (Pasajeros)',
  'MODELOS SUV / PASAJEROS':  'GLORY 500 (SUV)',
}
const KOMMO_SHINEREY_LABEL_TO_MODEL: Record<string, string> = {
  'X30 (PASAJEROS)': 'X30 (Pasajeros)',
  'X30 (PANEL)':     'X30 (Panel)',
  'X30 (PANEL':      'X30 (Panel)',
}

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

// ─── Post Venta pipeline (Reservas / Servicios) ──────────────────────────────
const POSTVENTA_PIPELINE_ID = 13151339

const POSTVENTA_STATUS_TO_STAGE: Record<string, number> = {
  pendiente:  101411319,  // Pendiente
  confirmada: 101411323,  // Confirmada
  en_proceso: 101411327,  // En proceso
  completada: 104022404,  // Completada
  cancelada:  104022408,  // Cancelada
  agendada:   101411323,  // Confirmada (incidencias agendadas)
  culminado:  142,        // servicio realizado
}

// Custom fields específicos del pipeline Post Venta (grupo leads_87791771102231)
const CF_RES = {
  vehiculo:          2989052,  // Vehículo (text)
  placa:             3017626,  // Placa (text)
  kilometraje:       2989050,  // Kilometraje (numeric)
  centro_servicio:   2989054,  // Centro de Servicio (select)
  servicio_realizar: 2989056,  // Servicio a Realizar (textarea)
  descripcion_inc:   3017690,  // Descripción incidencia (textarea)
  estado_cita:       3417651,  // Estado de la Cita (text)
  fecha_cita:        3417653,  // Fecha de la Cita (text)
  hora_cita:         3417655,  // Hora de la Cita (text)
  servicio_cita:     3417657,  // Servicio de la Cita (text)
  vehiculo_cita:     3417659,  // Vehículo de la Cita (text)
  placa_vehiculo:    3417661,  // Placa del Vehiculo (text)
  concesionario_cita:3417663,  // Concesionario de la Cita (text)
  km_vehiculo:       3417665,  // Kilometraje del Vehiculo (text)
  supabase_id:       3192400,  // ID Supabase (reused)
}

// Centro de Servicio (select) para el pipeline Post Venta
const CENTRO_SERVICIO_KOMMO: Array<{ id: number; keywords: string[] }> = [
  { id: 7832600, keywords: ['florida', 'la florida'] },
  { id: 7832602, keywords: ['guarenas'] },
  { id: 7832604, keywords: ['valencia'] },
  { id: 7832606, keywords: ['barquisimeto'] },
  { id: 7832608, keywords: ['mérida', 'merida'] },
  { id: 7832610, keywords: ['puerto ordaz', 'ordaz'] },
]

function dealershipToCentroServicioId(name: string): number | null {
  const lower = name.toLowerCase()
  for (const c of CENTRO_SERVICIO_KOMMO) {
    if (c.keywords.some(k => lower.includes(k))) return c.id
  }
  return null
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
  { id: 8039476, keywords: ['guarenas', 'servicio guarenas'] },
  { id: 8134449, keywords: ['lecher', 'lechería'] },
  { id: 8159325, keywords: ['cerro verde'] },
]

function dealershipNameToKommoId(name: string): number | null {
  const lower = name.toLowerCase()
  for (const c of CONCESIONARIO_KOMMO) {
    if (c.keywords.some(k => lower.includes(k))) return c.id
  }
  return null
}

// ─── Build lead custom_fields_values for Kommo ────────────────────────────────
function buildCustomFields(prospect: Record<string, unknown>, dealershipName?: string) {
  const fields: unknown[] = []
  const addText = (field_id: number, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      fields.push({ field_id, values: [{ value }] })
    }
  }
  const addEnum = (field_id: number, enum_id: number | null) => {
    if (enum_id !== null) {
      fields.push({ field_id, values: [{ enum_id }] })
    }
  }

  addText(CF.supabase_id, prospect.id)
  addText(CF.dealership_id, prospect.dealership_id)
  addText(CF.salesperson, prospect.salesperson)
  addText(CF.notes, prospect.notes)
  addText(CF.estado_vzla, prospect['Estado de Vnzla'])

  // event_name → select enum (CF 3448828)
  addEnum(CF.event_name, eventNameToKommoEnumId(String(prospect.event_name || '')))

  // source → Fuente select
  addEnum(CF.fuente, SOURCE_TO_KOMMO[prospect.source as string] ?? null)

  // model_interest → Marca + Modelo selects
  const modelInterest = (prospect.model_interest as string) || ''
  const parts = modelInterest.split(' ')
  const brand = parts[0]
  const modelName = parts.slice(1).join(' ')
  addEnum(CF.marca, BRAND_TO_KOMMO[brand] ?? null)
  if (modelName) {
    const fieldId = modelFieldForBrand(brand)
    const enumId = modelToKommoEnumId(brand, modelName)
    if (fieldId && enumId !== null) fields.push({ field_id: fieldId, values: [{ enum_id: enumId }] })
  }

  // Concesionario select
  if (dealershipName) addEnum(CF.concesionario, dealershipNameToKommoId(dealershipName))

  return fields
}

// ─── Build contact custom fields (person_type, gender, age_range, ci_rif, estado) ──
function buildContactCustomFields(prospect: Record<string, unknown>) {
  const fields: unknown[] = []

  const personTypeEnum = PERSON_TYPE_TO_KOMMO[String(prospect.person_type || '').toLowerCase()] ?? null
  if (personTypeEnum !== null) {
    fields.push({ field_id: CONTACT_CF.tipo_persona, values: [{ enum_id: personTypeEnum }] })
  }
  if (prospect.gender) {
    const g = String(prospect.gender)
    fields.push({ field_id: CONTACT_CF.genero, values: [{ value: g.charAt(0).toUpperCase() + g.slice(1) }] })
  }
  if (prospect.age_range) {
    fields.push({ field_id: CONTACT_CF.rango_edad, values: [{ value: prospect.age_range }] })
  }
  if (prospect.cedula) {
    fields.push({ field_id: CONTACT_CF.ci_rif, values: [{ value: prospect.cedula }] })
  }
  if (prospect['Estado de Vnzla']) {
    fields.push({ field_id: CONTACT_CF.estado, values: [{ value: prospect['Estado de Vnzla'] }] })
  }

  return fields
}

// ─── Build contact CFs for Post Venta vehicle data (mirrors reservation) ─────
function buildVehicleContactFields(
  vehicleStr: string,
  plate: string | null,
  mileage: number | null,
  dealershipName: string,
  cedula?: string | null
) {
  const fields: unknown[] = []
  if (vehicleStr) fields.push({ field_id: CONTACT_CF.modelo_vehiculo, values: [{ value: vehicleStr }] })
  if (plate) fields.push({ field_id: CONTACT_CF.placa, values: [{ value: plate }] })
  if (mileage) fields.push({ field_id: CONTACT_CF.km_vehiculo, values: [{ value: mileage }] })
  if (dealershipName) fields.push({ field_id: CONTACT_CF.centro_servicio, values: [{ value: dealershipName }] })
  if (cedula) fields.push({ field_id: CONTACT_CF.ci_rif, values: [{ value: cedula }] })
  return fields
}

// ─── Extract helpers ──────────────────────────────────────────────────────────
type CFValue = { field_id: number; values: Array<{ value?: unknown; enum_id?: number }> }

function extractCFText(cfValues: CFValue[], fieldId: number): string | null {
  const cf = cfValues.find(f => f.field_id === fieldId)
  if (!cf?.values?.[0]) return null
  return String(cf.values[0].value ?? '').trim() || null
}

function extractCFEnumId(cfValues: CFValue[], fieldId: number): number | null {
  return cfValues.find(f => f.field_id === fieldId)?.values?.[0]?.enum_id ?? null
}

// ─── syncFromKommo: fill empty fields in GAC from Kommo ───────────────────────
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
  if (!prospect || !leadRes.ok) return

  const lead = await leadRes.json() as Record<string, unknown>
  const cfValues = (lead.custom_fields_values as CFValue[]) || []
  const updates: Record<string, unknown> = {}

  if (!prospect.salesperson) {
    const v = extractCFText(cfValues, CF.salesperson); if (v) updates.salesperson = v
  }
  if (!prospect.notes) {
    const v = extractCFText(cfValues, CF.notes); if (v) updates.notes = v
  }
  if (!prospect['Estado de Vnzla']) {
    const v = extractCFText(cfValues, CF.estado_vzla); if (v) updates['Estado de Vnzla'] = v
  }
  if (!prospect.event_name) {
    const enumId = extractCFEnumId(cfValues, CF.event_name)
    if (enumId && KOMMO_EVENT_ID_TO_NAME[enumId]) updates.event_name = KOMMO_EVENT_ID_TO_NAME[enumId]
  }
  if (!prospect.source || prospect.source === 'concesionario') {
    const enumId = extractCFEnumId(cfValues, CF.fuente)
    if (enumId && KOMMO_TO_SOURCE[String(enumId)]) updates.source = KOMMO_TO_SOURCE[String(enumId)]
  }
  if (!prospect.model_interest) {
    const brandEnumId = extractCFEnumId(cfValues, CF.marca)
    if (brandEnumId && KOMMO_TO_BRAND[brandEnumId]) {
      const brandName = KOMMO_TO_BRAND[brandEnumId]
      const modelName = extractModelFromKommoFields(cfValues, brandName)
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

// ─── syncToKommo: fill empty fields in Kommo from GAC ────────────────────────
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
    if (!hasField(fieldId) && value !== null && value !== undefined && value !== '')
      newFields.push({ field_id: fieldId, values: [{ value }] })
  }
  const addEnumIfEmpty = (fieldId: number, enumId: number | null) => {
    if (!hasField(fieldId) && enumId !== null)
      newFields.push({ field_id: fieldId, values: [{ enum_id: enumId }] })
  }

  addIfEmpty(CF.supabase_id, prospect.id)
  addIfEmpty(CF.dealership_id, prospect.dealership_id)
  addIfEmpty(CF.salesperson, prospect.salesperson)
  addIfEmpty(CF.notes, prospect.notes)
  addIfEmpty(CF.estado_vzla, prospect['Estado de Vnzla'])
  addEnumIfEmpty(CF.event_name, eventNameToKommoEnumId(String(prospect.event_name || '')))
  addEnumIfEmpty(CF.fuente, SOURCE_TO_KOMMO[prospect.source] ?? null)

  const parts = ((prospect.model_interest as string) || '').split(' ')
  const brand = parts[0]; const modelName = parts.slice(1).join(' ')
  addEnumIfEmpty(CF.marca, BRAND_TO_KOMMO[brand] ?? null)
  if (modelName) {
    const fieldId = modelFieldForBrand(brand)
    if (fieldId) addEnumIfEmpty(fieldId, modelToKommoEnumId(brand, modelName))
  }

  const dealName = (prospect.dealerships as { name: string })?.name || ''
  addEnumIfEmpty(CF.concesionario, dealershipNameToKommoId(dealName))

  if (newFields.length > 0) {
    await fetch(`${baseUrl}/leads/${kommoLeadId}`, {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ custom_fields_values: newFields }),
    })
    await supabase.from('integration_logs').insert({
      integration_name: 'kommo', event_type: 'sync_to_kommo',
      prospect_id: prospectId, kommo_lead_id: kommoLeadId,
      status: 'success', details: { fields_synced: newFields.length },
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
    const { action, prospect_id, kommo_lead_id, new_status, reservation_id } = body

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

      const contactPayload: Record<string, unknown> = { name: prospect.name, custom_fields_values: contactFields }
      if (prospect.company_name) contactPayload.company_name = prospect.company_name

      const embedded: Record<string, unknown> = {
        contacts: [contactPayload],
        tags: [{ name: 'Sistema Central' }],
      }
      // Also link company as entity (shows in "Agregar Compañía" section of the lead)
      if (prospect.company_name) {
        embedded.companies = [{ name: prospect.company_name }]
      }

      const leadPayload = [{
        name: prospect.name,
        pipeline_id: config.pipeline_id,
        status_id: stageId,
        custom_fields_values: customFields,
        _embedded: embedded,
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

      const leadsArray = Array.isArray(kommoData) ? kommoData as Array<{ id: number }> : []
      const newLead = leadsArray[0]
      if (newLead?.id) {
        await supabase.from('prospects').update({ kommo_lead_id: newLead.id }).eq('id', prospect_id)

        // PATCH contact with person_type, gender, age_range + company_name
        const contactCFs = buildContactCustomFields(prospect)
        const hasContactUpdates = contactCFs.length > 0 || !!prospect.company_name
        if (hasContactUpdates) {
          const leadGet = await fetch(`${baseUrl}/leads/${newLead.id}?with=contacts`, { headers: authHeaders })
          if (leadGet.ok) {
            const leadData = await leadGet.json() as Record<string, unknown>
            const contacts = ((leadData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
            if (contacts[0]?.id) {
              const contactPatch: Record<string, unknown> = {}
              if (contactCFs.length > 0) contactPatch.custom_fields_values = contactCFs
              if (prospect.company_name) contactPatch.company_name = prospect.company_name
              await fetch(`${baseUrl}/contacts/${contacts[0].id}`, {
                method: 'PATCH', headers: authHeaders,
                body: JSON.stringify(contactPatch),
              })
            }
          }
        }

        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'create_lead',
          prospect_id, kommo_lead_id: newLead.id,
          status: 'success',
          details: { lead_id: newLead.id, fields_synced: customFields.length, contact_cfs: contactCFs.length },
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

      if (kommoRes.ok && prospect_id) {
        syncToKommo(supabase, prospect_id, kommo_lead_id, authHeaders, baseUrl).catch(console.error)
      }

      return new Response(JSON.stringify({ success: kommoRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Update fields: true overwrite from GAC → Kommo ───────────────────────
    if (action === 'update_fields') {
      if (!prospect_id || !kommo_lead_id) throw new Error('Faltan parámetros')

      const { data: prospect } = await supabase
        .from('prospects')
        .select('*, dealerships(name)')
        .eq('id', prospect_id)
        .single()

      if (!prospect) throw new Error('Prospecto no encontrado')

      const dealershipName = (prospect.dealerships as { name: string })?.name || ''
      const leadCFs = buildCustomFields(prospect, dealershipName)
      const contactCFs = buildContactCustomFields(prospect)

      // Log immediately so we know the action was invoked even if Kommo API fails
      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_fields',
        prospect_id, kommo_lead_id,
        status: 'pending',
        details: { lead_cfs: leadCFs.length, contact_cfs: contactCFs.length },
      })

      // PATCH lead: name + all CFs (overwrite)
      const leadPatchRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ name: prospect.name, custom_fields_values: leadCFs }),
      })
      const leadPatchBody = await leadPatchRes.text()

      // Fetch contact id, then PATCH contact: name + phone + email + contact CFs
      const leadGetRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}?with=contacts`, { headers: authHeaders })
      let contactPatched = false
      if (leadGetRes.ok) {
        const leadData = await leadGetRes.json() as Record<string, unknown>
        const contacts = ((leadData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
        const contactId = contacts[0]?.id

        if (contactId) {
          const allContactCFs: unknown[] = [...contactCFs]
          if (prospect.phone) allContactCFs.push({ field_code: 'PHONE', values: [{ value: prospect.phone, enum_code: 'WORK' }] })
          if (prospect.email) allContactCFs.push({ field_code: 'EMAIL', values: [{ value: prospect.email, enum_code: 'WORK' }] })

          const contactPatchBody: Record<string, unknown> = { name: prospect.name, custom_fields_values: allContactCFs }
          if (prospect.company_name) contactPatchBody.company_name = prospect.company_name
          await fetch(`${baseUrl}/contacts/${contactId}`, {
            method: 'PATCH', headers: authHeaders,
            body: JSON.stringify(contactPatchBody),
          })
          contactPatched = true
        }
      }

      // Update log with final status
      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_fields',
        prospect_id, kommo_lead_id,
        status: leadPatchRes.ok ? 'success' : 'error',
        details: {
          lead_cfs: leadCFs.length, contact_cfs: contactCFs.length,
          contact_patched: contactPatched,
          lead_status: leadPatchRes.status,
          lead_response: leadPatchBody.slice(0, 300),
        },
      })

      return new Response(JSON.stringify({ success: leadPatchRes.ok, lead_status: leadPatchRes.status }), {
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

    // ── Create reservation in Post Venta pipeline ────────────────────────────
    if (action === 'create_reservation') {
      if (!reservation_id) throw new Error('Falta reservation_id')

      const { data: res } = await supabase
        .from('reservations')
        .select(`
          id, reservation_date, reservation_time, service_type, current_mileage,
          status, notes, walkin_client_name, walkin_client_phone, walkin_plate,
          client_id, vehicle_id, kommo_lead_id,
          clients(full_name, phone, cedula),
          vehicles(plate, year, vehicle_models(name, brand)),
          dealerships(name)
        `)
        .eq('id', reservation_id)
        .single()

      if (!res) throw new Error('Reserva no encontrada')

      // Guard: if reservation already has a Kommo lead, just update its stage (no duplicate)
      if (res.kommo_lead_id) {
        const existingStageId = POSTVENTA_STATUS_TO_STAGE[res.status] ?? POSTVENTA_STATUS_TO_STAGE.pendiente
        await fetch(`${baseUrl}/leads/${res.kommo_lead_id}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ status_id: existingStageId }),
        })
        return new Response(JSON.stringify({ success: true, kommo_lead_id: res.kommo_lead_id, already_existed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const clientName =
        (res.clients as { full_name: string } | null)?.full_name
        || res.walkin_client_name
        || 'Sin nombre'
      const clientPhone =
        (res.clients as { phone: string | null } | null)?.phone
        || res.walkin_client_phone
        || null
      const vehicleModel =
        (res.vehicles as { vehicle_models: { name: string; brand: string } | null } | null)?.vehicle_models
      const plate =
        (res.vehicles as { plate: string | null } | null)?.plate
        || res.walkin_plate
        || null
      const vehicleStr = vehicleModel ? `${vehicleModel.brand} ${vehicleModel.name}` : ''
      const dealershipName = (res.dealerships as { name: string } | null)?.name || ''

      const stageId = POSTVENTA_STATUS_TO_STAGE[res.status] ?? POSTVENTA_STATUS_TO_STAGE.pendiente
      const leadName = `${clientName} - ${res.service_type} ${res.reservation_date}`

      const resCFs: unknown[] = []
      const addResField = (field_id: number, value: unknown) => {
        if (value !== null && value !== undefined && value !== '')
          resCFs.push({ field_id, values: [{ value }] })
      }
      const addResEnum = (field_id: number, enum_id: number | null) => {
        if (enum_id !== null) resCFs.push({ field_id, values: [{ enum_id }] })
      }

      addResField(CF_RES.supabase_id, res.id)
      addResField(CF_RES.estado_cita, res.status)
      addResField(CF_RES.fecha_cita, res.reservation_date)
      addResField(CF_RES.hora_cita, res.reservation_time)
      addResField(CF_RES.servicio_cita, res.service_type)
      addResField(CF_RES.vehiculo_cita, vehicleStr)
      addResField(CF_RES.placa_vehiculo, plate)
      addResField(CF_RES.concesionario_cita, dealershipName)
      if (res.current_mileage) addResField(CF_RES.km_vehiculo, String(res.current_mileage))
      if (res.notes) addResField(CF_RES.descripcion_inc, res.notes)
      addResEnum(CF_RES.centro_servicio, dealershipToCentroServicioId(dealershipName))

      // ── Find existing Kommo contact to avoid duplicates ──────────────────
      // Priority: 1) prospect with matching phone → get contact from their Ventas lead
      //           2) search Kommo contacts by name
      //           3) create new contact
      let existingKommoContactId: number | null = null
      const searchPhone = clientPhone

      if (searchPhone) {
        // Look for a prospect with the same phone that already has a kommo_lead_id
        const { data: matchedProspect } = await supabase
          .from('prospects')
          .select('kommo_lead_id')
          .eq('phone', searchPhone)
          .not('kommo_lead_id', 'is', null)
          .limit(1)
          .maybeSingle()

        if (matchedProspect?.kommo_lead_id) {
          const ventasLeadRes = await fetch(
            `${baseUrl}/leads/${matchedProspect.kommo_lead_id}?with=contacts`,
            { headers: authHeaders }
          )
          if (ventasLeadRes.ok) {
            const ventasLead = await ventasLeadRes.json() as Record<string, unknown>
            const contacts = ((ventasLead._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
            existingKommoContactId = contacts[0]?.id ?? null
          }
        }
      }

      // If not found by phone, search Kommo contacts by name
      if (!existingKommoContactId && clientName && clientName !== 'Sin nombre') {
        const contactSearch = await fetch(
          `${baseUrl}/contacts?query=${encodeURIComponent(clientName)}&limit=5`,
          { headers: authHeaders }
        )
        if (contactSearch.ok && contactSearch.status !== 204) {
          const searchData = await contactSearch.json() as Record<string, unknown>
          const foundContacts = ((searchData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number; name?: string }>) || []
          // Exact name match preferred
          const exactMatch = foundContacts.find(c => c.name?.trim().toLowerCase() === clientName.trim().toLowerCase())
          existingKommoContactId = (exactMatch ?? foundContacts[0])?.id ?? null
        }
      }

      const contactEntry: Record<string, unknown> = existingKommoContactId
        ? { id: existingKommoContactId }
        : {
            name: clientName,
            ...(clientPhone
              ? { custom_fields_values: [{ field_code: 'PHONE', values: [{ value: clientPhone, enum_code: 'WORK' }] }] }
              : {}),
          }

      const leadPayload = [{
        name: leadName,
        pipeline_id: POSTVENTA_PIPELINE_ID,
        status_id: stageId,
        custom_fields_values: resCFs,
        _embedded: {
          contacts: [contactEntry],
          tags: [{ name: 'Post Venta' }],
        },
      }]

      const kommoRes = await fetch(`${baseUrl}/leads/complex`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(leadPayload),
      })
      const kommoData = await kommoRes.json() as Record<string, unknown>

      if (!kommoRes.ok) {
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'create_reservation',
          status: 'error', details: { ...kommoData, reservation_id },
        })
        throw new Error(`Kommo API error: ${JSON.stringify(kommoData)}`)
      }

      const leadsArr = Array.isArray(kommoData) ? kommoData as Array<{ id: number }> : []
      const newLead = leadsArr[0]
      if (newLead?.id) {
        await supabase.from('reservations').update({ kommo_lead_id: newLead.id }).eq('id', reservation_id)

        // PATCH contact with vehicle mirror fields (modelo, placa, km, centro, cedula)
        const clientCedula = (res.clients as { cedula?: string | null } | null)?.cedula || null
        const vehicleContactCFs = buildVehicleContactFields(vehicleStr, plate, res.current_mileage || null, dealershipName, clientCedula)
        if (vehicleContactCFs.length > 0) {
          let contactId = existingKommoContactId
          if (!contactId) {
            const leadGet = await fetch(`${baseUrl}/leads/${newLead.id}?with=contacts`, { headers: authHeaders })
            if (leadGet.ok) {
              const leadData = await leadGet.json() as Record<string, unknown>
              const contacts = ((leadData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
              contactId = contacts[0]?.id ?? null
            }
          }
          if (contactId) {
            await fetch(`${baseUrl}/contacts/${contactId}`, {
              method: 'PATCH', headers: authHeaders,
              body: JSON.stringify({ custom_fields_values: vehicleContactCFs }),
            })
          }
        }

        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'create_reservation',
          status: 'success',
          details: {
            lead_id: newLead.id, reservation_id, fields: resCFs.length,
            linked_contact: existingKommoContactId,
            contact_source: existingKommoContactId ? 'existing' : 'new',
            contact_cfs: vehicleContactCFs.length,
          },
        })
      }

      return new Response(JSON.stringify({ success: true, kommo_lead_id: newLead?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Update reservation fields in Post Venta pipeline ─────────────────────
    // Called after editing a reservation in GAC to keep Kommo in sync.
    if (action === 'update_reservation_fields') {
      if (!reservation_id || !kommo_lead_id) throw new Error('Faltan parámetros')

      const { data: res } = await supabase
        .from('reservations')
        .select(`
          id, reservation_date, reservation_time, service_type, current_mileage,
          status, notes, walkin_client_name, walkin_client_phone, walkin_plate,
          clients(full_name, phone, cedula),
          vehicles(plate, vehicle_models(name, brand)),
          dealerships(name)
        `)
        .eq('id', reservation_id)
        .single()

      if (!res) throw new Error('Reserva no encontrada')

      const clientName =
        (res.clients as { full_name: string } | null)?.full_name
        || res.walkin_client_name
        || 'Sin nombre'
      const clientCedula = (res.clients as { cedula?: string | null } | null)?.cedula || null
      const plate =
        (res.vehicles as { plate: string | null } | null)?.plate
        || res.walkin_plate
        || null
      const vehicleModel =
        (res.vehicles as { vehicle_models: { name: string; brand: string } | null } | null)?.vehicle_models
      const vehicleStr = vehicleModel ? `${vehicleModel.brand} ${vehicleModel.name}` : ''
      const dealershipName = (res.dealerships as { name: string } | null)?.name || ''

      const resCFs: unknown[] = []
      const addField = (field_id: number, value: unknown) => {
        if (value !== null && value !== undefined && value !== '')
          resCFs.push({ field_id, values: [{ value }] })
      }
      const addEnum = (field_id: number, enum_id: number | null) => {
        if (enum_id !== null) resCFs.push({ field_id, values: [{ enum_id }] })
      }

      addField(CF_RES.supabase_id, res.id)
      addField(CF_RES.estado_cita, res.status)
      addField(CF_RES.fecha_cita, res.reservation_date)
      addField(CF_RES.hora_cita, res.reservation_time)
      addField(CF_RES.servicio_cita, res.service_type)
      addField(CF_RES.vehiculo_cita, vehicleStr)
      addField(CF_RES.placa_vehiculo, plate)
      addField(CF_RES.concesionario_cita, dealershipName)
      if (res.current_mileage) addField(CF_RES.km_vehiculo, String(res.current_mileage))
      if (res.notes) addField(CF_RES.descripcion_inc, res.notes)
      addEnum(CF_RES.centro_servicio, dealershipToCentroServicioId(dealershipName))

      const leadName = `${clientName} - ${res.service_type} ${res.reservation_date}`

      const kommoRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify({ name: leadName, custom_fields_values: resCFs }),
      })

      // Also PATCH the contact with vehicle mirror fields (modelo, placa, km, centro, cedula)
      const vehicleContactCFs = buildVehicleContactFields(vehicleStr, plate, res.current_mileage || null, dealershipName, clientCedula)
      if (vehicleContactCFs.length > 0) {
        const leadGetRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}?with=contacts`, { headers: authHeaders })
        if (leadGetRes.ok) {
          const leadData = await leadGetRes.json() as Record<string, unknown>
          const contacts = ((leadData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
          const contactId = contacts[0]?.id
          if (contactId) {
            await fetch(`${baseUrl}/contacts/${contactId}`, {
              method: 'PATCH', headers: authHeaders,
              body: JSON.stringify({ custom_fields_values: vehicleContactCFs }),
            })
          }
        }
      }

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_reservation_fields',
        status: kommoRes.ok ? 'success' : 'error',
        details: { reservation_id, kommo_lead_id, fields: resCFs.length, lead_status: kommoRes.status },
      })

      return new Response(JSON.stringify({ success: kommoRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Update reservation stage in Post Venta pipeline ──────────────────────
    if (action === 'update_reservation_stage') {
      if (!kommo_lead_id || !new_status) throw new Error('Faltan parámetros')

      const stageId = POSTVENTA_STATUS_TO_STAGE[new_status]
      if (!stageId) throw new Error(`Sin mapeo de stage para status: ${new_status}`)

      const patchBody = {
        status_id: stageId,
        custom_fields_values: [
          { field_id: CF_RES.estado_cita, values: [{ value: new_status }] },
        ],
      }

      const kommoRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify(patchBody),
      })

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_reservation_stage',
        status: kommoRes.ok ? 'success' : 'error',
        details: { reservation_id: reservation_id || null, kommo_lead_id, new_status, stage_id: stageId },
      })

      return new Response(JSON.stringify({ success: kommoRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Batch sync: create Kommo leads for reservations without kommo_lead_id ──
    if (action === 'batch_sync_reservations') {
      const batchLimit = Math.min(Number(body.limit) || 20, 50)

      const { data: pendingRes } = await supabase
        .from('reservations')
        .select('id')
        .is('kommo_lead_id', null)
        .neq('status', 'cancelada')
        .order('created_at', { ascending: true })
        .limit(batchLimit)

      if (!pendingRes?.length) {
        return new Response(JSON.stringify({ processed: 0, message: 'Sin reservas pendientes de sync' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let created = 0, skipped = 0, failed = 0

      for (const r of pendingRes) {
        try {
          const { error } = await supabase.functions.invoke('kommo-api', {
            body: { action: 'create_reservation', reservation_id: r.id },
          })
          if (error) { failed++; console.error(`batch_sync: ${r.id} →`, error) }
          else created++
        } catch (e) {
          failed++
          console.error(`batch_sync: ${r.id} threw`, e)
        }
      }

      const { count: remaining } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .is('kommo_lead_id', null)
        .neq('status', 'cancelada')

      return new Response(JSON.stringify({ created, skipped, failed, remaining: remaining || 0 }), {
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
