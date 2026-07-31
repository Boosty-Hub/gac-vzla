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
  payment_modality:        3455739,  // "Modalidad de Pago" (select)
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
  genero:          3455737,  // "Género" (select)
  rango_edad:      3455741,  // "Rango de edad" (select)
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
// Outbound (GAC → Kommo): map a GAC event name to the Kommo select enum_id.
// Full snapshot of the 9 options of CF 3448828 (exact match, accent-insensitive).
// Inbound (Kommo → GAC) reads the option label directly from `.value` (no map needed).
const EVENT_NAME_TO_ENUM_ID: Record<string, number> = {
  'cerro verde 2026': 8158302,
  'exhibicion acarigua mango center 2026': 8161259,
  'plastic show valencia': 8161682,
  'expo - cerro verde': 8164423,
  'expo isp 2026': 8164999,
  'clinica sanatrix': 8165459,
  'hotel punta palma': 8166147,
  'exhibicion pits maracaibo': 8166999,
  'futuro venezuela 360': 8167001,
}

function normEventName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function eventNameToKommoEnumId(eventName: string): number | null {
  if (!eventName) return null
  return EVENT_NAME_TO_ENUM_ID[normEventName(eventName)] ?? null
}

// Dynamic outbound resolver: events are authored in Kommo. If the name isn't in the
// static snapshot above, fetch the live enum options of CF "Nombre del Evento" and
// match by normalized label, so events created ONLY in Kommo resolve outbound without
// a code change/redeploy. The static map stays as a fast path / offline fallback.
async function resolveEventEnumId(
  eventName: string,
  baseUrl: string,
  authHeaders: Record<string, string>,
): Promise<number | null> {
  if (!eventName) return null
  const norm = normEventName(eventName)
  const cached = EVENT_NAME_TO_ENUM_ID[norm]
  if (cached) return cached
  try {
    const res = await fetch(`${baseUrl}/leads/custom_fields/${CF.event_name}`, { headers: authHeaders })
    if (!res.ok) return null
    const field = await res.json() as { enums?: Array<{ id: number; value: string }> }
    for (const e of field.enums || []) {
      if (normEventName(String(e.value)) === norm) return e.id
    }
  } catch (_) { /* ignore — fall through to null */ }
  return null
}

// Inbound auto-provision: when a Kommo lead brings an event GAC doesn't have yet,
// create it in prospect_events (idempotent by normalized name) so it appears in the
// GAC selector and future prospects match by the exact same label. Single source of
// truth = Kommo; the event never needs to be created by hand in two places.
async function ensureProspectEvent(
  supabase: ReturnType<typeof createClient>,
  eventName: string | null | undefined,
): Promise<void> {
  const name = String(eventName || '').trim()
  if (!name) return
  try {
    const norm = normEventName(name)
    const { data } = await supabase.from('prospect_events').select('name')
    const rows = (data as Array<{ name: string }> | null) || []
    if (rows.some(r => normEventName(String(r.name)) === norm)) return
    await supabase.from('prospect_events').insert({ name, is_active: true })
  } catch (_) { /* non-fatal: never break the sync over a selector row */ }
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

// ─── Payment modality mappings (Kommo lead CF 3455739, select) ───────────────
const PAYMENT_MODALITY_TO_KOMMO: Record<string, number> = {
  contado:        8167755,  // "Pago de Contado" in Kommo
  financiamiento: 8167753,
}
const KOMMO_TO_PAYMENT_MODALITY: Record<number, string> = {
  8167755: 'Contado',
  8167753: 'Financiamiento',
}
const paymentModalityToKommo = (v: unknown): number | null =>
  PAYMENT_MODALITY_TO_KOMMO[String(v ?? '').toLowerCase().trim()] ?? null

// ─── Gender mappings (Kommo contact CF 3455737, select) ──────────────────────
const GENDER_TO_KOMMO: Record<string, number> = {
  masculino: 8167751,
  femenino:  8167749,
}
const KOMMO_TO_GENDER: Record<number, string> = {
  8167751: 'masculino',
  8167749: 'femenino',
}

// ─── Age range mappings (Kommo contact CF 3455741, select) ───────────────────
const AGE_RANGE_TO_KOMMO: Record<string, number> = {
  '20-30': 8167757,
  '30-40': 8167759,
  '40+':   8167761,
}
const KOMMO_TO_AGE_RANGE: Record<number, string> = {
  8167757: '20-30',
  8167759: '30-40',
  8167761: '40+',
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

// Post Venta stage used for the persistent "client conversation" lead created by
// migrate_clients / sync_client (broadcast messages), not part of the reservation
// status flow below.
const CONVERSATION_STAGE = 104023216  // "En conversación Cliente/Empresa"

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
  cliente_cita:      3456611,  // Cliente de la Cita (text)
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

// Normalize a Venezuelan phone to E.164-ish (+58...) for Kommo / WhatsApp.
function normalizeVzPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  // Drop the country code so we always work with the national number.
  if (digits.startsWith('58')) digits = digits.slice(2)
  // Drop the trunk '0' (national prefix) — it must never appear in E.164. This also
  // repairs numbers that arrived as "+580412..." (a stray 0 after the country code),
  // which previously slipped through and broke WhatsApp delivery.
  if (digits.startsWith('0')) digits = digits.slice(1)
  return `+58${digits}`
}

// Strip accent marks from vowels (keeps ñ/Ñ) so WhatsApp templates render clean.
// Accented characters were showing up garbled in the dealership notification message.
function stripAccents(s: string): string {
  return s
    .replace(/[áàäâã]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o').replace(/[úùüû]/g, 'u')
    .replace(/[ÁÀÄÂÃ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔÕ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U')
}

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

// ─── Reservation → Estado de Venezuela ───────────────────────────────────────
// Mirrors resolveReservationState() in src/lib/venezuelaStates.ts (duplicated
// here because edge functions are deployed standalone and cannot import from
// src/). An explicit reservations.state override wins; otherwise falls back
// to the dealership's own state column; otherwise null. This replaced a
// hardcoded dealership-name → state keyword map that was wrong for several
// dealerships (now that dealerships.state is fully populated in the DB, the
// real column is the source of truth).
function resolveReservationState(reservationState: string | null | undefined, dealershipState: string | null | undefined): string | null {
  return reservationState || dealershipState || null
}

// ─── Vendedor Asignado (select CF 2988736) ───────────────────────────────────
const VENDEDOR_KOMMO: Record<string, number> = {
  'elsy bellanger':       7832240,
  'franklin rodriguez':   7832242,
  'julio martínez':       7832244,
  'julio martinez':       7832244,
  'manuel robles':        7832246,
  'kodiak peña':          7897720,
  'kodiak pena':          7897720,
  'egerlyn sánchez':      7897722,
  'egerlyn sanchez':      7897722,
  'arturo silva':         7942378,
  'miguel medina':        7962802,
  'hernán argüello':      8008574,
  'hernan arguello':      8008574,
  'william morales':      8044212,
  'moises ramirez':       8128135,
  'moisés ramírez':       8128135,
  'genesis giuseppe':     8158965,
  'génesis giuseppe':     8158965,
  'valery llanos':        8161093,
  'yhonny farfán':        8161097,
  'yhonny farfan':        8161097,
  'roberto calzadilla':   8165001,
  'leonardo sosa':        8165003,
  'walter parra':         8165097,
  'darwin zambrano':      8165099,
  'naileth rodriguez':    8165471,
  'samuel cuarta':        8166159,
  'marc rondón':          8166161,
  'marc rondon':          8166161,
  'pedro tineo':          8166163,
  'jheanfranco ochoa':    8166203,
}

function vendedorToKommoId(name: string | null): number | null {
  if (!name) return null
  return VENDEDOR_KOMMO[name.toLowerCase().trim()] ?? null
}

// ─── Build lead custom_fields_values for Kommo ────────────────────────────────
function buildCustomFields(prospect: Record<string, unknown>, dealershipName?: string, eventEnumId?: number | null) {
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
  addEnum(CF.payment_modality, paymentModalityToKommo(prospect.payment_modality))

  // event_name → select enum (CF 3448828). Prefer the dynamically-resolved enum passed
  // by the caller (live Kommo options); fall back to the static snapshot if not provided.
  addEnum(CF.event_name, eventEnumId !== undefined ? eventEnumId : eventNameToKommoEnumId(String(prospect.event_name || '')))

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
  const genderEnum = GENDER_TO_KOMMO[String(prospect.gender ?? '').toLowerCase().trim()] ?? null
  if (genderEnum !== null) {
    fields.push({ field_id: CONTACT_CF.genero, values: [{ enum_id: genderEnum }] })
  }
  const ageEnum = AGE_RANGE_TO_KOMMO[String(prospect.age_range ?? '').trim()] ?? null
  if (ageEnum !== null) {
    fields.push({ field_id: CONTACT_CF.rango_edad, values: [{ enum_id: ageEnum }] })
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

// ─── Unified contact dedup search ─────────────────────────────────────────────
// GAC search order to locate an existing client/contact before create/update:
//   1) C.I - RIF  2) Teléfono Oficina  3) Email  4) Placa
const PHONE_CF_ID = 2988356  // Teléfono (multitext, enum WORK = Oficina)
const EMAIL_CF_ID = 2988358  // Email (multitext)

type KommoContactMatch = { id: number; _embedded?: { leads?: Array<{ id: number }> } }

// Full-text search Kommo contacts by `value`, then keep only the contact whose
// custom field `fieldId` actually equals that value (avoids loose query matches).
async function searchContactByValue(
  baseUrl: string,
  authHeaders: Record<string, string>,
  value: string | null | undefined,
  fieldId: number,
): Promise<KommoContactMatch | null> {
  const q = String(value ?? '').trim()
  if (!q) return null
  const res = await fetch(
    `${baseUrl}/contacts?query=${encodeURIComponent(q)}&with=leads&limit=10`,
    { headers: authHeaders },
  )
  if (!res.ok || res.status === 204) return null
  const data = await res.json() as Record<string, unknown>
  const contacts = ((data._embedded as Record<string, unknown>)?.contacts as Array<Record<string, unknown>>) || []
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
  const target = norm(q)
  for (const c of contacts) {
    const cfs = (c.custom_fields_values as Array<{ field_id: number; values: Array<{ value: unknown }> }>) || []
    const f = cfs.find(x => x.field_id === fieldId)
    if (f && (f.values || []).some(v => norm(v.value) === target)) return c as KommoContactMatch
  }
  return null
}

// Returns the first matching Kommo contact following the GAC dedup order.
async function findExistingContact(
  baseUrl: string,
  authHeaders: Record<string, string>,
  keys: { ciRif?: string | null; phone?: string | null; email?: string | null; placa?: string | null },
): Promise<KommoContactMatch | null> {
  return (
    (await searchContactByValue(baseUrl, authHeaders, keys.ciRif, CONTACT_CF.ci_rif)) ||
    (await searchContactByValue(baseUrl, authHeaders, keys.phone, PHONE_CF_ID)) ||
    (await searchContactByValue(baseUrl, authHeaders, keys.email, EMAIL_CF_ID)) ||
    (await searchContactByValue(baseUrl, authHeaders, keys.placa, CONTACT_CF.placa))
  )
}

// Given a contact already known to Kommo, returns the id of a lead it owns inside
// `pipelineId`, or null if it has none there yet. Used to stop syncOneClientToConversation
// from ever creating a SECOND "En conversación" lead for the same contact — a contact
// rarely has more than a handful of leads, so this stays cheap in practice.
async function findExistingPipelineLeadOnContact(
  baseUrl: string,
  authHeaders: Record<string, string>,
  contactId: number,
  pipelineId: number,
): Promise<number | null> {
  const res = await fetch(`${baseUrl}/contacts/${contactId}?with=leads`, { headers: authHeaders })
  if (!res.ok || res.status === 204) return null
  const data = await res.json() as Record<string, unknown>
  const leads = ((data._embedded as Record<string, unknown>)?.leads as Array<{ id: number }>) || []
  for (const l of leads) {
    const leadRes = await fetch(`${baseUrl}/leads/${l.id}`, { headers: authHeaders })
    if (!leadRes.ok) continue
    const leadData = await leadRes.json() as Record<string, unknown>
    if (leadData.pipeline_id === pipelineId) return l.id
  }
  return null
}

// Loosely normalizes a client phone for the Kommo "conversation" contact. Kept
// separate from normalizeVzPhone() above (which strips the trunk '0' unconditionally):
// this mirrors the exact behavior migrate_clients has always used for `clients.phone`
// values, which are not guaranteed to be pre-normalized the way prospect phones are.
function normalizeClientPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('58')) return `+${digits}`
  if (digits.startsWith('0')) return `+58${digits.slice(1)}`
  if (digits.length === 10) return `+58${digits}`
  return `+${digits}`
}

type SyncClientResult = { status: 'skipped' | 'linked' | 'created' | 'failed'; leadId: number | null }

// Syncs ONE GAC client into the Post Venta "En conversación Cliente/Empresa" stage
// (CONVERSATION_STAGE), for broadcast messages. Shared by the `migrate_clients` batch
// backfill and the `sync_client` action fired right after a client is created.
//
// Duplicate safety (never creates a second conversation lead for the same client):
//   1) If the client already has kommo_conversation_lead_id → 'skipped', no Kommo calls.
//   2) Dedup the Kommo contact by CI-RIF → phone → email (findExistingContact).
//   3) If a contact was found, check whether it ALREADY owns a lead in POSTVENTA_PIPELINE_ID
//      (findExistingPipelineLeadOnContact) — if so, link that lead instead of creating one.
//   4) Only create a new lead when no contact match and no existing pipeline lead were found.
async function syncOneClientToConversation(
  supabase: ReturnType<typeof createClient>,
  baseUrl: string,
  authHeaders: Record<string, string>,
  cl: Record<string, unknown>,
): Promise<SyncClientResult> {
  if (cl.kommo_conversation_lead_id) {
    return { status: 'skipped', leadId: Number(cl.kommo_conversation_lead_id) }
  }

  try {
    const phone = cl.phone ? normalizeClientPhone(String(cl.phone)) : null
    const cedula = (cl.cedula as string | null) || null
    const email = (cl.email as string | null) || null
    const estado = (cl.state as string | null) || null
    const name = (cl.full_name as string | null) || 'Cliente'

    const contactCFs: unknown[] = []
    if (cedula) contactCFs.push({ field_id: CONTACT_CF.ci_rif, values: [{ value: cedula }] })
    if (phone) contactCFs.push({ field_code: 'PHONE', values: [{ value: phone, enum_code: 'WORK' }] })
    if (email) contactCFs.push({ field_code: 'EMAIL', values: [{ value: email, enum_code: 'WORK' }] })
    if (estado) contactCFs.push({ field_id: CONTACT_CF.estado, values: [{ value: estado }] })

    // 1) Dedup the contact (CI-RIF → phone → email); also honor a previously known contact id.
    const match = await findExistingContact(baseUrl, authHeaders, { ciRif: cedula, phone, email })
    const contactId = match?.id ?? (cl.IdContactKommo ? Number(cl.IdContactKommo) : null)

    if (contactId) {
      // 2) Anti-duplicate safeguard: does this contact already have a lead in Post Venta?
      const existingLeadId = await findExistingPipelineLeadOnContact(baseUrl, authHeaders, contactId, POSTVENTA_PIPELINE_ID)
      if (existingLeadId) {
        await supabase.from('clients').update({
          IdContactKommo: String(contactId),
          kommo_conversation_lead_id: existingLeadId,
        }).eq('id', cl.id as string)
        return { status: 'linked', leadId: existingLeadId }
      }

      // Ensure identifiers exist on the contact, then attach a NEW conversation lead.
      if (contactCFs.length) {
        await fetch(`${baseUrl}/contacts/${contactId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ custom_fields_values: contactCFs }),
        }).catch(() => {})
      }
      const createRes = await fetch(`${baseUrl}/leads/complex`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify([{
          name, pipeline_id: POSTVENTA_PIPELINE_ID, status_id: CONVERSATION_STAGE,
          _embedded: { contacts: [{ id: contactId }], tags: [{ name: 'Cliente GAC' }] },
        }]),
      })
      const cd = await createRes.json() as Array<{ id: number }>
      const leadId = cd?.[0]?.id ?? null
      await supabase.from('clients').update({
        IdContactKommo: String(contactId),
        kommo_conversation_lead_id: leadId,
      }).eq('id', cl.id as string)
      return { status: leadId ? 'created' : 'failed', leadId }
    }

    // No existing contact found → create contact + lead together.
    const createRes = await fetch(`${baseUrl}/leads/complex`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify([{
        name, pipeline_id: POSTVENTA_PIPELINE_ID, status_id: CONVERSATION_STAGE,
        _embedded: {
          contacts: [{ name, custom_fields_values: contactCFs }],
          tags: [{ name: 'Cliente GAC' }],
        },
      }]),
    })
    const cd = await createRes.json() as Array<{ id: number; contact_id?: number }>
    const leadId = cd?.[0]?.id ?? null
    await supabase.from('clients').update({
      IdContactKommo: cd?.[0]?.contact_id ? String(cd[0].contact_id) : null,
      kommo_conversation_lead_id: leadId,
    }).eq('id', cl.id as string)
    return { status: leadId ? 'created' : 'failed', leadId }
  } catch (e) {
    console.error(`syncOneClientToConversation ${cl.id}:`, e)
    return { status: 'failed', leadId: null }
  }
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
  if (!prospect.payment_modality) {
    const enumId = extractCFEnumId(cfValues, CF.payment_modality)
    if (enumId && KOMMO_TO_PAYMENT_MODALITY[enumId]) updates.payment_modality = KOMMO_TO_PAYMENT_MODALITY[enumId]
  }
  const kommoEvent = extractCFText(cfValues, CF.event_name)
  if (kommoEvent) {
    await ensureProspectEvent(supabase, kommoEvent)
    if (!prospect.event_name) updates.event_name = kommoEvent
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

  // person_type / gender / age_range live on the CONTACT, not the lead — fetch it separately.
  if (!prospect.person_type || !prospect.gender || !prospect.age_range) {
    const contacts = ((lead._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
    if (contacts[0]?.id) {
      const contactRes = await fetch(`${baseUrl}/contacts/${contacts[0].id}?with=custom_fields`, { headers: authHeaders })
      if (contactRes.ok) {
        const contactData = await contactRes.json() as Record<string, unknown>
        const contactCFs = (contactData.custom_fields_values as CFValue[]) || []

        if (!prospect.person_type) {
          const personTypeEnumId = extractCFEnumId(contactCFs, CONTACT_CF.tipo_persona)
          if (personTypeEnumId && KOMMO_TO_PERSON_TYPE[personTypeEnumId]) {
            updates.person_type = KOMMO_TO_PERSON_TYPE[personTypeEnumId]
          }
        }
        if (!prospect.gender) {
          const generoEnumId = extractCFEnumId(contactCFs, CONTACT_CF.genero)
          if (generoEnumId && KOMMO_TO_GENDER[generoEnumId]) updates.gender = KOMMO_TO_GENDER[generoEnumId]
        }
        if (!prospect.age_range) {
          const ageEnumId = extractCFEnumId(contactCFs, CONTACT_CF.rango_edad)
          if (ageEnumId && KOMMO_TO_AGE_RANGE[ageEnumId]) updates.age_range = KOMMO_TO_AGE_RANGE[ageEnumId]
        }
      }
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
  addEnumIfEmpty(CF.payment_modality, paymentModalityToKommo(prospect.payment_modality))
  addEnumIfEmpty(CF.event_name, await resolveEventEnumId(String(prospect.event_name || ''), baseUrl, authHeaders))
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
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    )

    const body = await req.json()
    const { action, prospect_id, kommo_lead_id, new_status, reservation_id } = body

    // ── Autorizacion del llamante (M1) ────────────────────────────────────────
    // Resolver el usuario del JWT y gatear por rol/accion. Sin esto, cualquier
    // usuario autenticado (incluido un cliente) podia invocar TODAS las acciones,
    // incluidas migraciones masivas y sincronizaciones batch.
    const authHeader = req.headers.get('Authorization') ?? ''

    // Internal service-to-service calls (e.g. notify_dealership_reservation fired from
    // create_reservation) authenticate with the service/secret key, NOT a user JWT.
    // Recognize that key as a trusted internal caller so this guard does not block
    // self-invocations. The secret key is server-only (never exposed to browsers).
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    const serviceKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    // supabase-js sends new-format secret keys (sb_secret_*) only in the `apikey`
    // header — they are not JWTs, so the client never puts them in Authorization.
    // Self-invocations (functions.invoke) therefore arrive with apikey=secret and
    // no usable bearer. Accept either header as proof of a trusted internal call.
    const apikeyHeader = (req.headers.get('apikey') ?? '').trim()
    const isServiceCall = serviceKey.length > 0 &&
      (bearerToken === serviceKey || apikeyHeader === serviceKey)

    let callerId: string | null = null
    let callerRole: string | null = null

    if (isServiceCall) {
      // Trusted internal call → superadmin-equivalent access.
      callerRole = 'superadmin'
    } else {
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
        { global: { headers: { Authorization: authHeader } } }
      )
      const { data: { user: caller } } = await callerClient.auth.getUser()
      if (!caller) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      callerId = caller.id
      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('roles(name)')
        .eq('id', caller.id)
        .single()
      callerRole = (callerProfile as { roles?: { name?: string } } | null)?.roles?.name ?? null
    }

    const isAdmin = callerRole === 'superadmin' || callerRole === 'admin'
    const isStaff = isServiceCall || isAdmin || ['concesionario', 'vendedor', 'Asesor de Servicio'].includes(callerRole ?? '')

    // Acciones masivas/administrativas: solo superadmin.
    const SUPERADMIN_ACTIONS = ['batch_sync_reservations', 'batch_update_reservations', 'migrate_clients', 'precreate_dealership_leads']
    // Acciones que un cliente puede disparar sobre SU propia reserva.
    const CLIENT_ALLOWED_ACTIONS = ['create_reservation']

    if (SUPERADMIN_ACTIONS.includes(action)) {
      if (callerRole !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Solo superadmin puede ejecutar esta accion' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (CLIENT_ALLOWED_ACTIONS.includes(action) && !isStaff) {
      // Cliente: solo puede sincronizar una reserva de la que es dueno.
      const { data: resv } = await supabase.from('reservations').select('client_id').eq('id', reservation_id).single()
      const { data: links } = await supabase.from('client_users').select('client_id').eq('profile_id', callerId ?? '')
      const ownClientIds = (links ?? []).map((l: { client_id: string }) => l.client_id)
      if (!resv || !ownClientIds.includes(resv.client_id)) {
        return new Response(JSON.stringify({ error: 'No autorizado sobre esta reserva' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (!isStaff) {
      // Resto de acciones: requieren rol de staff.
      return new Response(JSON.stringify({ error: 'Requiere rol de staff' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
      const eventEnumId = await resolveEventEnumId(String(prospect.event_name || ''), baseUrl, authHeaders)
      const customFields = buildCustomFields(prospect, dealershipName, eventEnumId)

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

      // When closing the lead as lost, include the loss reason so Kommo records why
      // the lead was lost. The lost stage id is derived from the config mapping so it
      // stays correct if the mapping changes. loss_reason_id is optional and only
      // forwarded for the "perdido" stage.
      const lostStageId = (config.stage_mappings as Record<string, number>)['perdido']
      const lossReasonId = body.loss_reason_id as number | undefined
      const stagePayload: Record<string, unknown> = { status_id: stageId }
      if (stageId === lostStageId && typeof lossReasonId === 'number') {
        stagePayload.loss_reason_id = lossReasonId
      }

      const kommoRes = await fetch(`${baseUrl}/leads/${kommo_lead_id}`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify(stagePayload),
      })
      const kommoData = await kommoRes.json()

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'update_stage',
        prospect_id: prospect_id || null, kommo_lead_id,
        status: kommoRes.ok ? 'success' : 'error',
        details: {
          new_status, stage_id: stageId,
          ...(stagePayload.loss_reason_id !== undefined
            ? { loss_reason_id: stagePayload.loss_reason_id }
            : {}),
        },
      })

      if (kommoRes.ok && prospect_id) {
        syncToKommo(supabase, prospect_id, kommo_lead_id, authHeaders, baseUrl).catch(console.error)
      }

      return new Response(JSON.stringify({ success: kommoRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Sync loss reasons from Kommo → prospect_loss_reasons ──────────────────
    // Pulls the catalog of "loss reasons" configured in Kommo and upserts them so
    // the UI can offer the same options when closing a prospect as lost. Runs
    // server-side in Deno, so accents are preserved as-is (do NOT strip accents).
    if (action === 'sync_loss_reasons') {
      const lossRes = await fetch(`${baseUrl}/leads/loss_reasons`, { headers: authHeaders })

      if (!lossRes.ok) {
        const errText = await lossRes.text()
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'sync_loss_reasons',
          status: 'error', details: { http_status: lossRes.status, error: errText },
        })
        throw new Error(`Kommo API error (loss_reasons): ${errText}`)
      }

      const lossData = await lossRes.json() as Record<string, unknown>
      const embedded = lossData._embedded as Record<string, unknown> | undefined
      const reasons = (embedded?.loss_reasons as Array<{ id: number; name: string; sort?: number }>) || []

      const rows = reasons.map((r) => ({
        kommo_loss_reason_id: r.id,
        name: r.name,
        sort_order: typeof r.sort === 'number' ? r.sort : 0,
        is_active: true,
      }))

      let upserted = 0
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('prospect_loss_reasons')
          .upsert(rows, { onConflict: 'kommo_loss_reason_id' })
        if (upsertError) {
          await supabase.from('integration_logs').insert({
            integration_name: 'kommo', event_type: 'sync_loss_reasons',
            status: 'error', details: { stage: 'upsert', error: upsertError.message },
          })
          throw new Error(`Supabase upsert error (loss_reasons): ${upsertError.message}`)
        }
        upserted = rows.length

        // Deactivate any local reason that no longer comes from Kommo. Filter to
        // currently active rows first so already-inactive rows are not rewritten on
        // every run.
        const keepIds = rows.map((r) => r.kommo_loss_reason_id)
        await supabase
          .from('prospect_loss_reasons')
          .update({ is_active: false })
          .eq('is_active', true)
          .not('kommo_loss_reason_id', 'in', `(${keepIds.join(',')})`)
      }

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'sync_loss_reasons',
        status: 'success', details: { fetched: reasons.length, upserted },
      })

      return new Response(JSON.stringify({ success: true, fetched: reasons.length, upserted }), {
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
      const eventEnumId = await resolveEventEnumId(String(prospect.event_name || ''), baseUrl, authHeaders)
      const leadCFs = buildCustomFields(prospect, dealershipName, eventEnumId)
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
          status, notes, internal_notes, walkin_client_name, walkin_client_phone, walkin_plate,
          client_id, vehicle_id, kommo_lead_id, created_by_name, state,
          clients(full_name, phone, cedula, email),
          vehicles(plate, year, vehicle_models(name, brand)),
          dealerships(name, state)
        `)
        .eq('id', reservation_id)
        .single()

      if (!res) throw new Error('Reserva no encontrada')

      // Guard 1: DB — reservation already linked to a Kommo lead
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

      // Guard 2: Kommo — search by supabase_id CF to prevent duplicates if DB is out of sync
      const kommoSearchRes = await fetch(
        `${baseUrl}/leads?filter[custom_fields][${CF_RES.supabase_id}]=${encodeURIComponent(res.id)}&limit=1`,
        { headers: authHeaders }
      )
      if (kommoSearchRes.ok && kommoSearchRes.status !== 204) {
        const kommoSearchData = await kommoSearchRes.json() as Record<string, unknown>
        const existingLeads = ((kommoSearchData._embedded as Record<string, unknown>)?.leads as Array<{ id: number }>) || []
        if (existingLeads.length > 0) {
          const existingLeadId = existingLeads[0].id
          // Link the DB record to the existing Kommo lead (repair the missing kommo_lead_id)
          await supabase.from('reservations').update({ kommo_lead_id: existingLeadId }).eq('id', reservation_id)
          return new Response(JSON.stringify({ success: true, kommo_lead_id: existingLeadId, already_existed: true, repaired: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
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
      const dealershipState = (res.dealerships as { state: string | null } | null)?.state ?? null

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

      const brandName = (res.vehicles as { vehicle_models: { brand: string } | null } | null)?.vehicle_models?.brand ?? null
      const createdByName = (res as unknown as { created_by_name: string | null }).created_by_name ?? null

      addResField(CF_RES.supabase_id, res.id)
      addResField(CF_RES.estado_cita, res.status)
      addResField(CF_RES.fecha_cita, res.reservation_date)
      addResField(CF_RES.hora_cita, res.reservation_time)
      addResField(CF_RES.servicio_cita, res.service_type)
      addResField(CF_RES.vehiculo_cita, vehicleStr)
      addResField(CF_RES.placa_vehiculo, plate)
      addResField(CF_RES.concesionario_cita, dealershipName)
      if (res.current_mileage) addResField(CF_RES.km_vehiculo, String(res.current_mileage))
      if (res.notes) addResField(CF_RES.descripcion_inc, res.notes)  // Descripción de incidencia (visible)
      if (res.internal_notes) addResField(CF.notes, res.internal_notes)  // Observaciones / notas internas GAC (3192402)
      addResEnum(CF_RES.centro_servicio, dealershipToCentroServicioId(dealershipName))
      addResEnum(CF.concesionario, dealershipNameToKommoId(dealershipName))  // Concesionario select
      addResEnum(CF.marca, BRAND_TO_KOMMO[brandName ?? ''] ?? null)           // Marca select
      addResField(CF.estado_vzla, resolveReservationState(res.state as string | null, dealershipState))  // Estado de Venezuela
      addResEnum(2988736, vendedorToKommoId(createdByName))                   // Vendedor Asignado select

      // ── Find existing Kommo contact to avoid duplicates ──────────────────
      // GAC dedup order: 1) C.I-RIF  2) Teléfono Oficina  3) Email  4) Placa
      // Fallbacks (legacy): prospect with matching phone → Ventas lead contact, then name search.
      let existingKommoContactId: number | null = null
      const searchPhone = clientPhone
      const clientCedula = (res.clients as { cedula?: string | null } | null)?.cedula || null
      const clientEmail = (res.clients as { email?: string | null } | null)?.email || null

      const dedupContact = await findExistingContact(baseUrl, authHeaders, {
        ciRif: clientCedula, phone: clientPhone, email: clientEmail, placa: plate,
      })
      existingKommoContactId = dedupContact?.id ?? null

      if (!existingKommoContactId && searchPhone) {
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

      // ── Notify dealership (fire-and-forget, does not block response) ────────
      if (newLead?.id) {
        supabase.functions.invoke('kommo-api', {
          body: {
            action: 'notify_dealership_reservation',
            reservation_id,
            kommo_lead_id: newLead.id,
          },
          // Explicit bearer: supabase-js does not put sb_secret_* keys in
          // Authorization on its own, and the auth guard must see this call
          // as a trusted internal one.
          headers: { Authorization: `Bearer ${serviceKey}` },
        }).catch(() => { /* notification failure is non-blocking */ })
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
          status, notes, internal_notes, walkin_client_name, walkin_client_phone, walkin_plate,
          created_by_name, state,
          clients(full_name, phone, cedula),
          vehicles(plate, vehicle_models(name, brand)),
          dealerships(name, state)
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
      const dealershipState2 = (res.dealerships as { state: string | null } | null)?.state ?? null
      const brandName2 = vehicleModel?.brand ?? null
      const createdByName2 = (res as unknown as { created_by_name: string | null }).created_by_name ?? null

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
      if (res.notes) addField(CF_RES.descripcion_inc, res.notes)  // Descripción de incidencia (visible)
      if (res.internal_notes) addField(CF.notes, res.internal_notes)  // Observaciones / notas internas GAC (3192402)
      addEnum(CF_RES.centro_servicio, dealershipToCentroServicioId(dealershipName))
      addEnum(CF.concesionario, dealershipNameToKommoId(dealershipName))
      addEnum(CF.marca, BRAND_TO_KOMMO[brandName2 ?? ''] ?? null)
      addField(CF.estado_vzla, resolveReservationState(res.state as string | null, dealershipState2))
      addEnum(2988736, vendedorToKommoId(createdByName2))

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
            headers: { Authorization: `Bearer ${serviceKey}` },
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

    // ── Notify dealership: ONE persistent lead per dealership, updated per reservation ─
    // Lead name = dealership name. Each new reservation updates the same lead's CFs.
    // A stage toggle (buffer → Notificaciones) re-triggers the Kommo Sales Bot.
    if (action === 'notify_dealership_reservation') {
      if (!reservation_id) throw new Error('Falta reservation_id')

      // Wrap the whole notification flow so failures are recorded instead of being
      // swallowed by the top-level catch. This lets us measure the notification gap.
      try {
      const { data: res } = await supabase
        .from('reservations')
        .select(`
          id, reservation_date, reservation_time, service_type, current_mileage,
          status, notes, created_by_name,
          walkin_client_name, walkin_client_phone, walkin_plate,
          clients(full_name),
          vehicles(plate, vehicle_models(name, brand)),
          dealerships(id, name, phone, state, kommo_contact_id, kommo_notification_lead_id)
        `)
        .eq('id', reservation_id)
        .single()

      if (!res) throw new Error('Reserva no encontrada')

      const dealership = res.dealerships as {
        id: string;
        name: string;
        phone: string | null;
        state: string | null;
        kommo_contact_id: number | null;
        kommo_notification_lead_id: number | null;
      } | null

      if (!dealership?.phone) {
        return new Response(JSON.stringify({ skipped: true, reason: 'dealership has no phone' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const normalizedPhone = normalizeVzPhone(dealership.phone)

      // ── Find or create dealership contact in Kommo ───────────────────────────
      let dealerContactId: number | null = dealership.kommo_contact_id ?? null
      // Phone currently stored on the existing Kommo contact (null if we have to create/search).
      let existingContactPhone: string | null = null

      if (dealerContactId) {
        const checkRes = await fetch(`${baseUrl}/contacts/${dealerContactId}`, { headers: authHeaders })
        if (!checkRes.ok || checkRes.status === 204) {
          dealerContactId = null
        } else {
          const cdata = await checkRes.json() as Record<string, unknown>
          const cfs = (cdata.custom_fields_values as Array<{ field_code?: string; values?: Array<{ value?: string }> }>) || []
          existingContactPhone = cfs.find(f => f.field_code === 'PHONE')?.values?.[0]?.value ?? null
        }
      }

      if (!dealerContactId) {
        const phoneSearch = await fetch(
          `${baseUrl}/contacts?query=${encodeURIComponent(normalizedPhone)}&limit=3`,
          { headers: authHeaders }
        )
        if (phoneSearch.ok && phoneSearch.status !== 204) {
          const searchData = await phoneSearch.json() as Record<string, unknown>
          const found = ((searchData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>) || []
          dealerContactId = found[0]?.id ?? null
        }
      }

      if (!dealerContactId) {
        const createContactRes = await fetch(`${baseUrl}/contacts`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify([{
            name: dealership.name,
            custom_fields_values: [{ field_code: 'PHONE', values: [{ value: normalizedPhone, enum_code: 'WORK' }] }],
          }]),
        })
        if (createContactRes.ok) {
          const createData = await createContactRes.json() as Record<string, unknown>
          dealerContactId = ((createData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>)?.[0]?.id ?? null
        }
      }

      if (dealerContactId && dealerContactId !== dealership.kommo_contact_id) {
        await supabase.from('dealerships').update({ kommo_contact_id: dealerContactId }).eq('id', dealership.id)
      }

      if (!dealerContactId) throw new Error('No se pudo obtener contacto del concesionario en Kommo')

      // GAC is the SOURCE OF TRUTH for the dealership's WhatsApp number. WhatsApp delivers to the
      // Kommo contact's phone, so it must always mirror whatever the admin set in GAC — no prefix
      // or "valid mobile" filtering. If the Kommo number differs from GAC's, overwrite it. Compare
      // on normalized digits so Kommo's own formatting doesn't trigger a needless re-write each time.
      if (existingContactPhone === null || normalizeVzPhone(existingContactPhone) !== normalizedPhone) {
        await fetch(`${baseUrl}/contacts/${dealerContactId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({
            custom_fields_values: [{ field_code: 'PHONE', values: [{ value: normalizedPhone, enum_code: 'WORK' }] }],
          }),
        })
      }

      // ── Build notification CFs with reservation data ───────────────────────────
      const clientName =
        (res.clients as { full_name: string } | null)?.full_name
        || res.walkin_client_name
        || 'Sin nombre'
      const plate =
        (res.vehicles as { plate: string | null } | null)?.plate
        || res.walkin_plate || null
      const vehicleModel =
        (res.vehicles as { vehicle_models: { name: string; brand: string } | null } | null)?.vehicle_models
      const vehicleStr = vehicleModel ? `${vehicleModel.brand} ${vehicleModel.name}` : ''
      const createdBy = (res as unknown as { created_by_name: string | null }).created_by_name

      const notifCFs: unknown[] = []
      const addNotif = (field_id: number, value: unknown) => {
        // This is a single permanent per-dealership lead that gets overwritten on every
        // reservation. If we skipped empty values, the field would keep the data from the
        // PREVIOUS reservation (e.g. a stale plate/vehicle). So for empty/null we still send
        // an empty string to CLEAR the field in Kommo instead of leaving phantom data.
        if (value === null || value === undefined || value === '') {
          notifCFs.push({ field_id, values: [{ value: '' }] })
          return
        }
        // Strip accents on text so the WhatsApp template renders clean (no garbled chars).
        const clean = typeof value === 'string' ? stripAccents(value) : value
        notifCFs.push({ field_id, values: [{ value: clean }] })
      }
      addNotif(CF_RES.fecha_cita,         res.reservation_date)
      addNotif(CF_RES.hora_cita,          res.reservation_time)
      addNotif(CF_RES.servicio_cita,      res.service_type)
      // The WhatsApp template reads "Servicio a Realizar" (2989056), a different field than
      // "Servicio de la Cita" (3417657). Fill both so the [Servicio a Realizar] token resolves.
      addNotif(CF_RES.servicio_realizar,  res.service_type)
      addNotif(CF_RES.vehiculo_cita,      vehicleStr)
      addNotif(CF_RES.placa_vehiculo,     plate)
      addNotif(CF_RES.concesionario_cita, dealership.name)
      // The client who booked, in a field of its own. The WhatsApp template reads this
      // for its "Cliente" line. It must NOT come from the lead name: the notification
      // lead is permanent and shared by every reservation of this dealership, so naming
      // it after each client would rewrite it on every booking and wreck the CRM.
      addNotif(CF_RES.cliente_cita, clientName)
      // NOTE: do NOT stamp supabase_id on the notification lead — it is a permanent
      // per-dealership lead, not a reservation lead. Stamping it would make it collide
      // with the real reservation lead in the supabase_id-based duplicate detection.
      // Client name goes in Observaciones so the dealership sees who the appointment is for
      addNotif(CF.notes, `Cliente: ${clientName}${res.notes ? ' | ' + res.notes : ''}`)
      // Always call addNotif so empty values clear the field (avoid stale data from the
      // previous reservation on this permanent per-dealership lead).
      addNotif(CF_RES.km_vehiculo, res.current_mileage ? String(res.current_mileage) : '')
      addNotif(CF.salesperson, createdBy || '')

      // The notification lead is PERMANENT and one-per-dealership: every reservation for
      // this dealership reuses it. So its name is the DEALERSHIP, always — never the
      // client. Naming it after whoever booked last would rewrite the same lead on every
      // reservation and make the Kommo pipeline unreadable. The client's name travels in
      // CF_RES.cliente_cita instead, which is what the WhatsApp template reads.
      // Patched on every notification so a lead that drifted gets restored.
      const notifLeadName = dealership.name

      // ── Ensure ONE persistent notification lead per dealership ─────────────────
      let notifLeadId: number | null = dealership.kommo_notification_lead_id ?? null
      let wasCreated = false

      if (notifLeadId) {
        const checkLead = await fetch(`${baseUrl}/leads/${notifLeadId}`, { headers: authHeaders })
        if (!checkLead.ok || checkLead.status === 204) notifLeadId = null
      }

      if (notifLeadId) {
        // Update the name AND the CFs first, then toggle stage to re-trigger the Sales Bot.
        // Patching the name keeps it pinned to the dealership, so any lead that was
        // renamed by hand (or by an earlier build) is restored on its next notification.
        await fetch(`${baseUrl}/leads/${notifLeadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ name: notifLeadName, custom_fields_values: notifCFs }),
        })
        // Buffer stage (Pendiente) → back to Notificaciones: fires "entered stage" event
        await fetch(`${baseUrl}/leads/${notifLeadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ status_id: POSTVENTA_STATUS_TO_STAGE.pendiente }),
        })
        await fetch(`${baseUrl}/leads/${notifLeadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ status_id: 107696308 }),
        })
      } else {
        // First reservation for this dealership → create the permanent notification lead
        const createLeadPayload = [{
          name: notifLeadName,
          pipeline_id: POSTVENTA_PIPELINE_ID,
          status_id: 107696308,
          custom_fields_values: notifCFs,
          _embedded: {
            contacts: [{ id: dealerContactId }],
            tags: [{ name: 'Notificación Concesionario' }],
          },
        }]

        const createRes = await fetch(`${baseUrl}/leads/complex`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify(createLeadPayload),
        })

        if (!createRes.ok) {
          const errData = await createRes.text()
          throw new Error(`Kommo error al crear lead notificación: ${errData}`)
        }

        const createData = await createRes.json() as Record<string, unknown>
        notifLeadId = (createData as Array<{ id: number }>)?.[0]?.id ?? null
        wasCreated = true

        if (notifLeadId) {
          await supabase.from('dealerships')
            .update({ kommo_notification_lead_id: notifLeadId })
            .eq('id', dealership.id)
        }
      }

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo',
        event_type: 'notify_dealership',
        status: 'success',
        details: {
          reservation_id,
          dealership_id: dealership.id,
          dealership_name: dealership.name,
          dealer_contact_id: dealerContactId,
          notification_lead_id: notifLeadId,
          action: wasCreated ? 'created' : 'updated',
        },
      })

      return new Response(JSON.stringify({
        success: true,
        notification_lead_id: notifLeadId,
        dealer_contact_id: dealerContactId,
        action: wasCreated ? 'created' : 'updated',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } catch (notifyErr) {
        // Record the failure so the notification gap is observable in integration_logs.
        await supabase.from('integration_logs').insert({
          integration_name: 'kommo',
          event_type: 'notify_dealership_error',
          status: 'error',
          details: {
            reservation_id,
            error: (notifyErr as Error).message,
          },
        })
        return new Response(JSON.stringify({ error: (notifyErr as Error).message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Batch update: re-push all fields for reservations already in Kommo ──────
    if (action === 'batch_update_reservations') {
      const batchLimit = Math.min(Number(body.limit) || 20, 50)
      const offset = Number(body.offset) || 0

      const { data: synced } = await supabase
        .from('reservations')
        .select('id, kommo_lead_id')
        .not('kommo_lead_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(offset, offset + batchLimit - 1)

      if (!synced?.length) {
        return new Response(JSON.stringify({ updated: 0, failed: 0, message: 'Sin reservas para actualizar' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let updated = 0, failed = 0
      for (const r of synced) {
        try {
          const { error } = await supabase.functions.invoke('kommo-api', {
            body: { action: 'update_reservation_fields', reservation_id: r.id, kommo_lead_id: r.kommo_lead_id },
            headers: { Authorization: `Bearer ${serviceKey}` },
          })
          if (error) { failed++; console.error(`batch_update: ${r.id} →`, error) }
          else updated++
        } catch (e) {
          failed++
          console.error(`batch_update: ${r.id} threw`, e)
        }
      }

      return new Response(JSON.stringify({ updated, failed, offset, batch_size: synced.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Sync ONE client into Post Venta "En conversación Cliente/Empresa" ───────
    // Fired right after a client is created (admin/staff, or internal service call
    // from create_reservation's manual-entry path). Not superadmin-only and not in
    // CLIENT_ALLOWED_ACTIONS — it falls through to the generic "requires staff role"
    // gate above, which isServiceCall/isAdmin/concesionario/vendedor all satisfy.
    // Delegates entirely to syncOneClientToConversation for the duplicate-safe logic.
    if (action === 'sync_client') {
      const clientId = body.client_id
      if (!clientId) throw new Error('Falta client_id')

      const { data: cl } = await supabase
        .from('clients')
        .select('id, full_name, cedula, phone, email, state, "IdContactKommo", kommo_conversation_lead_id')
        .eq('id', clientId)
        .single()

      if (!cl) throw new Error('Cliente no encontrado')

      const result = await syncOneClientToConversation(supabase, baseUrl, authHeaders, cl as Record<string, unknown>)

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo', event_type: 'sync_client',
        status: result.status === 'failed' ? 'error' : 'success',
        details: { client_id: clientId, status: result.status, lead_id: result.leadId },
      })

      return new Response(JSON.stringify({ success: true, status: result.status, lead_id: result.leadId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Deliver satisfaction survey: write link CF + toggle stage to wake SalesBot ───
    // requirements.md R3/R4, design.md section 3 (decision D4). The delivery mechanism
    // mirrors notify_dealership_reservation's buffer-toggle (:1877-1885), but D4 is the
    // one deliberate divergence from that pattern: this lead is the customer's REAL,
    // permanent conversation lead — shared with reservations, broadcasts and live chat
    // history — not a disposable per-dealership one. So this PATCHes exactly ONE custom
    // field and never runs a clear-on-empty sweep across the rest of the lead's fields.
    //
    // Request:  { action:'deliver_satisfaction_survey', prospect_id? | client_id? | survey_id?, reason?:'won'|'repurchase'|'resend' }
    // Response: { delivered:boolean, skipped?:string, survey_id, client_id, lead_id, token }
    //
    // Authorization: no bespoke gate — falls through to the staff check above (:972-977).
    // Not added to SUPERADMIN_ACTIONS. kommo-webhook fires this with the service key
    // (isServiceCall → superadmin-equivalent, :918-926), so no new auth surface is needed.
    if (action === 'deliver_satisfaction_survey') {
      const survey_id = body.survey_id as string | undefined
      const client_id_in = body.client_id as string | undefined
      const reason = (body.reason as string | undefined) || 'won'

      if (!prospect_id && !client_id_in && !survey_id) {
        throw new Error('Falta prospect_id, client_id o survey_id')
      }

      const logDelivery = (status: string, details: Record<string, unknown>) =>
        supabase.from('integration_logs').insert({
          integration_name: 'kommo', event_type: 'survey_delivery',
          prospect_id: prospect_id || null,
          status, details: { reason, ...details },
        })

      const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
        new Response(JSON.stringify(payload), {
          status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      // 1) Config, read at call time — never hardcode (requirements.md's config table).
      const surveyDeliveryEnabled = config.survey_delivery_enabled === true
      const surveyLinkFieldIdRaw = config.survey_link_field_id
      const surveyBaseUrlRaw = config.survey_base_url
      const surveyStageIdRaw = config.survey_stage_id

      // 2) Kill switch off → quiet 200, not an error (design.md :264).
      if (!surveyDeliveryEnabled) {
        return jsonResponse({ delivered: false, skipped: 'disabled' })
      }

      const missingConfig = (key: string) => String((config as Record<string, unknown>)[key] ?? '').trim() === ''

      // 3) Hard fail on missing config. A silent skip here would make the SalesBot never
      // fire while the UI still looks green (design.md :265-267). design.md's own snippet
      // reuses one literal message ('survey_stage_id_not_configured') for all three gaps;
      // split into one message per key here so an operator can tell which slot is empty
      // without guessing — same 400 contract, more actionable detail.
      for (const [key, code] of [
        ['survey_stage_id', 'survey_stage_id_not_configured'],
        ['survey_link_field_id', 'survey_link_field_id_not_configured'],
        ['survey_base_url', 'survey_base_url_not_configured'],
      ] as const) {
        if (missingConfig(key)) {
          await logDelivery('error', { error: code })
          return jsonResponse({ error: code }, 400)
        }
      }

      const surveyLinkFieldId = Number(surveyLinkFieldIdRaw)
      const surveyStageId = Number(surveyStageIdRaw)
      const surveyBaseUrl = String(surveyBaseUrlRaw)

      try {
        // 4) Resolve the survey row. It already exists by this point — created by the
        // trigger pair (trg_link_client_on_won / trg_create_satisfaction_survey_on_won)
        // inside the SAME transaction that moved the prospect to 'ganado', on both the UI
        // path (register_won_prospect RPC) and the Kommo webhook path (raw status UPDATE,
        // design.md D5). This action never mints clients/vehicles/surveys, it only
        // delivers what already exists — so prospect_id resolves via a direct read here,
        // NOT a second register_won_prospect call (which requires a plate array this
        // action does not have, and would contradict D5's "must not block on a missing
        // plate"). The partial unique index on prospect_id guarantees at most one row.
        type SurveyRow = {
          id: string; token: string; client_id: string | null
          suppressed_reason: string | null; delivered_at: string | null
        }
        let survey: SurveyRow | null = null

        if (survey_id) {
          const { data } = await supabase
            .from('satisfaction_surveys')
            .select('id, token, client_id, suppressed_reason, delivered_at')
            .eq('id', survey_id)
            .maybeSingle()
          survey = data as SurveyRow | null
        } else if (prospect_id) {
          const { data } = await supabase
            .from('satisfaction_surveys')
            .select('id, token, client_id, suppressed_reason, delivered_at')
            .eq('prospect_id', prospect_id)
            .maybeSingle()
          survey = data as SurveyRow | null
        } else {
          // client_id path (repurchase / resend): most recent survey for this client.
          const { data } = await supabase
            .from('satisfaction_surveys')
            .select('id, token, client_id, suppressed_reason, delivered_at')
            .eq('client_id', client_id_in as string)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          survey = data as SurveyRow | null
        }

        if (!survey) throw new Error('survey_not_found')
        const clientId = survey.client_id
        if (!clientId) throw new Error('survey_has_no_client')

        // 5) Rate limit (requirements.md R4) — fn_claim_survey_slot already stamped this
        // at survey-creation time; honor it here BEFORE any Kommo write/read of the client
        // record, so a rate-limited survey never even reaches the shared-lead guard.
        if (survey.suppressed_reason) {
          return jsonResponse({
            delivered: false, skipped: 'rate_limited_24h',
            survey_id: survey.id, client_id: clientId, lead_id: null, token: survey.token,
          })
        }

        // 5b) Already-delivered guard. Delivery is NOT naturally idempotent from the
        // customer's point of view: re-running it re-PATCHes the CF and re-toggles the
        // stage, and that stage toggle is exactly what wakes the SalesBot — so the
        // customer receives a SECOND survey message for the same purchase.
        //
        // This is reachable in normal use: the "Falta placa" backfill reopens the won
        // dialog and calls register_won_prospect again (deliberately idempotent, no
        // no_new_plates guard), which leaves suppressed_reason NULL, so the check above
        // does not catch it. The 24h slot was claimed once at survey creation and is
        // never re-claimed, so it does not catch it either.
        //
        // 'resend' is the explicit, human-initiated escape hatch and is allowed through —
        // that is the whole point of the resend button (R9).
        if (survey.delivered_at && reason !== 'resend') {
          await logDelivery('info', { survey_id: survey.id, client_id: clientId, delivered_at: survey.delivered_at })
          return jsonResponse({
            delivered: false, skipped: 'already_delivered',
            survey_id: survey.id, client_id: clientId, lead_id: null, token: survey.token,
          })
        }

        const { data: client } = await supabase
          .from('clients')
          .select('id, full_name, cedula, phone, email, state, "IdContactKommo", kommo_conversation_lead_id')
          .eq('id', clientId)
          .single()
        if (!client) throw new Error('client_not_found')

        // 6) Shared-lead guard — the only path that could deliver a survey to the wrong
        // customer (5 such leads exist today, requirements.md). Re-checked after any
        // fresh link below (step 7), since syncOneClientToConversation can attach an
        // EXISTING lead that is itself already shared.
        const guardSharedLead = async (leadId: number): Promise<boolean> => {
          const { data: sharers } = await supabase
            .from('clients').select('id').eq('kommo_conversation_lead_id', leadId)
          if ((sharers?.length ?? 0) > 1) {
            await logDelivery('warning', {
              error: 'shared_conversation_lead', client_id: clientId, lead_id: leadId,
              client_ids: (sharers ?? []).map((s: { id: string }) => s.id),
            })
            return true
          }
          return false
        }

        let leadId = (client as { kommo_conversation_lead_id: number | null }).kommo_conversation_lead_id ?? null

        if (!leadId) {
          // 7) No lead yet — reuse the existing dedup-safe link/create logic verbatim
          // (:653): self-skips when set, dedups CI-RIF→phone→email, links an existing
          // pipeline lead instead of creating a second one.
          const syncResult = await syncOneClientToConversation(supabase, baseUrl, authHeaders, client as Record<string, unknown>)
          leadId = syncResult.leadId
        }
        if (!leadId) throw new Error('kommo_lead_resolution_failed')

        if (await guardSharedLead(leadId)) {
          return jsonResponse({
            delivered: false, skipped: 'shared_conversation_lead',
            survey_id: survey.id, client_id: clientId, lead_id: leadId, token: survey.token,
          })
        }

        // 8) Survey URL.
        const url = `${surveyBaseUrl.replace(/\/+$/, '')}/encuesta/${survey.token}`

        // 9) PATCH ONLY the survey link CF — D4: no clear-on-empty sweep on this shared,
        // permanent customer lead; every other field is left untouched.
        const cfRes = await fetch(`${baseUrl}/leads/${leadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({
            custom_fields_values: [{ field_id: surveyLinkFieldId, values: [{ value: url }] }],
          }),
        })
        if (!cfRes.ok) throw new Error(`Kommo error al escribir CF encuesta: ${await cfRes.text()}`)

        // 10) Stage toggle — the mechanism that wakes the SalesBot (mirrors :1877-1885).
        // The buffer must differ from the target or the "entered stage" event never fires.
        const buffer = surveyStageId === CONVERSATION_STAGE
          ? POSTVENTA_STATUS_TO_STAGE.pendiente
          : CONVERSATION_STAGE

        const bufferRes = await fetch(`${baseUrl}/leads/${leadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ status_id: buffer }),
        })
        if (!bufferRes.ok) throw new Error(`Kommo error al mover a etapa buffer: ${await bufferRes.text()}`)

        const targetRes = await fetch(`${baseUrl}/leads/${leadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ status_id: surveyStageId }),
        })
        if (!targetRes.ok) throw new Error(`Kommo error al volver a etapa de encuesta: ${await targetRes.text()}`)

        // 11) Mark sent + timestamp + log. Retry-safe: the CF write and the stage toggle
        // are both idempotent, and mark_survey_sent (20260720120000:198-218) refuses to
        // downgrade an already-'responded' survey.
        await supabase.rpc('mark_survey_sent', { p_survey_id: survey.id })
        await supabase.from('satisfaction_surveys')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', survey.id)

        await logDelivery('success', { client_id: clientId, survey_id: survey.id, lead_id: leadId })

        return jsonResponse({
          delivered: true, survey_id: survey.id, client_id: clientId, lead_id: leadId, token: survey.token,
        })
      } catch (deliverErr) {
        // Mirrors notify_dealership_reservation's own wrapping try/catch (:1707/:1940):
        // record the failure in integration_logs instead of letting the generic
        // top-level catch (:2212) swallow it into an unlogged 500.
        await logDelivery('error', { error: (deliverErr as Error).message })
        return jsonResponse({ error: (deliverErr as Error).message }, 500)
      }
    }

    // ── Migrate GAC clients into Post Venta "En conversación Cliente/Empresa" ───
    // Batched + idempotent. Delegates the per-client dedup/create/link logic (and
    // the anti-duplicate pipeline-lead check) to syncOneClientToConversation, the
    // same helper used by the sync_client action above.
    if (action === 'migrate_clients') {
      const batchLimit = Math.min(Number(body.limit) || 25, 60)

      // Always pull the next slice of NOT-yet-migrated clients (stable by id).
      // This is naturally idempotent and immune to pagination drift on re-runs.
      const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name, cedula, phone, email, state, "IdContactKommo", kommo_conversation_lead_id')
        .is('kommo_conversation_lead_id', null)
        .order('id', { ascending: true })
        .limit(batchLimit)

      if (!clients?.length) {
        return new Response(JSON.stringify({ done: true, processed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let created = 0, linked = 0, skipped = 0, failed = 0
      for (const cl of clients as Array<Record<string, unknown>>) {
        const result = await syncOneClientToConversation(supabase, baseUrl, authHeaders, cl)
        if (result.status === 'created') created++
        else if (result.status === 'linked') linked++
        else if (result.status === 'skipped') skipped++
        else failed++
      }

      return new Response(JSON.stringify({
        processed: clients.length, created, linked, skipped, failed,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Pre-create the permanent notification lead for every dealership that has
    //    a phone but no lead yet (so the Sales Bot is wired before the 1st reservation).
    if (action === 'precreate_dealership_leads') {
      const { data: dealers } = await supabase
        .from('dealerships')
        .select('id, name, phone, kommo_contact_id, kommo_notification_lead_id')
        .is('kommo_notification_lead_id', null)
        .not('phone', 'is', null)

      let created = 0, failed = 0
      const results: Array<Record<string, unknown>> = []
      for (const d of (dealers || []) as Array<Record<string, unknown>>) {
        try {
          const normalizedPhone = normalizeVzPhone(String(d.phone))
          let contactId = (d.kommo_contact_id as number | null) ?? null
          if (!contactId) {
            const createContactRes = await fetch(`${baseUrl}/contacts`, {
              method: 'POST', headers: authHeaders,
              body: JSON.stringify([{
                name: d.name,
                custom_fields_values: [{ field_code: 'PHONE', values: [{ value: normalizedPhone, enum_code: 'WORK' }] }],
              }]),
            })
            const cData = await createContactRes.json() as Record<string, unknown>
            contactId = ((cData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>)?.[0]?.id ?? null
          }
          if (!contactId) { failed++; continue }

          const createRes = await fetch(`${baseUrl}/leads/complex`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify([{
              name: d.name, pipeline_id: POSTVENTA_PIPELINE_ID, status_id: 107696308,
              _embedded: { contacts: [{ id: contactId }], tags: [{ name: 'Notificación Concesionario' }] },
            }]),
          })
          const cd = await createRes.json() as Array<{ id: number }>
          const leadId = cd?.[0]?.id ?? null
          await supabase.from('dealerships').update({
            kommo_contact_id: contactId, kommo_notification_lead_id: leadId,
          }).eq('id', d.id as string)
          created++
          results.push({ dealership: d.name, contact_id: contactId, lead_id: leadId })
        } catch (e) {
          failed++
          console.error(`precreate_dealership_leads ${d.id}:`, e)
        }
      }

      return new Response(JSON.stringify({ created, failed, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Mirror the dealership (name + phone) onto its Kommo notification contact ──
    //    GAC is the source of truth: call this after creating/editing a dealership so
    //    Kommo reflects GAC. Auto-provisions the contact + notification lead if missing,
    //    and keeps the lead title aligned with the dealership name.
    if (action === 'sync_dealership_contact') {
      const dealershipId = body.dealership_id
      if (!dealershipId) throw new Error('Falta dealership_id')

      const { data: d } = await supabase
        .from('dealerships')
        .select('id, name, phone, kommo_contact_id, kommo_notification_lead_id')
        .eq('id', dealershipId)
        .single()

      if (!d) throw new Error('Concesionario no encontrado')
      if (!d.phone) {
        return new Response(JSON.stringify({ skipped: true, reason: 'sin teléfono' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const normalizedPhone = normalizeVzPhone(d.phone)
      const dealName = String(d.name || '')
      let contactId = (d.kommo_contact_id as number | null) ?? null
      let leadId = (d.kommo_notification_lead_id as number | null) ?? null
      let createdContact = false, createdLead = false

      if (!contactId) {
        // Provision the notification contact with GAC's name + phone
        const createContactRes = await fetch(`${baseUrl}/contacts`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify([{
            name: dealName,
            custom_fields_values: [{ field_code: 'PHONE', values: [{ value: normalizedPhone, enum_code: 'WORK' }] }],
          }]),
        })
        const cData = await createContactRes.json() as Record<string, unknown>
        contactId = ((cData._embedded as Record<string, unknown>)?.contacts as Array<{ id: number }>)?.[0]?.id ?? null
        createdContact = true
      } else {
        // Enforce GAC's name + phone onto the existing contact
        await fetch(`${baseUrl}/contacts/${contactId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({
            name: dealName,
            custom_fields_values: [{ field_code: 'PHONE', values: [{ value: normalizedPhone, enum_code: 'WORK' }] }],
          }),
        })
      }

      if (contactId && !leadId) {
        // Provision the persistent notification lead in the Post Venta pipeline
        const createRes = await fetch(`${baseUrl}/leads/complex`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify([{
            name: dealName, pipeline_id: POSTVENTA_PIPELINE_ID, status_id: 107696308,
            _embedded: { contacts: [{ id: contactId }], tags: [{ name: 'Notificación Concesionario' }] },
          }]),
        })
        const cd = await createRes.json() as Array<{ id: number }>
        leadId = cd?.[0]?.id ?? null
        createdLead = true
      } else if (leadId) {
        // Keep the notification lead title aligned with the dealership name
        await fetch(`${baseUrl}/leads/${leadId}`, {
          method: 'PATCH', headers: authHeaders,
          body: JSON.stringify({ name: dealName }),
        }).catch(() => {})
      }

      if (createdContact || createdLead) {
        await supabase.from('dealerships').update({
          kommo_contact_id: contactId, kommo_notification_lead_id: leadId,
        }).eq('id', d.id)
      }

      await supabase.from('integration_logs').insert({
        integration_name: 'kommo',
        event_type: 'sync_dealership_contact',
        status: contactId ? 'success' : 'error',
        details: {
          dealership_id: d.id, contact_id: contactId, lead_id: leadId,
          name: dealName, phone: normalizedPhone,
          created_contact: createdContact, created_lead: createdLead,
        },
      })

      return new Response(JSON.stringify({
        success: !!contactId, contact_id: contactId, lead_id: leadId,
        name: dealName, phone: normalizedPhone,
        created_contact: createdContact, created_lead: createdLead,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
