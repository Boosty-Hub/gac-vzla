// Emparejamiento entre el label del campo "Concesionario" de Kommo y la tabla `dealerships`.
//
// Vive en _shared, y no dentro de kommo-webhook, para que las pruebas de Vitest ejecuten
// exactamente este codigo y no una copia paralela: el bug que motivo este archivo era de
// puntaje, invisible a simple vista y facil de reintroducir.

// Minusculas, sin acentos, solo alfanumerico separado por espacios.
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

// Distancia de edicion con transposiciones (OSA) — tolera typos como "tecnho"/"techno"
// (una transposicion = distancia 1, no 2 como en Levenshtein clasico).
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

// Palabras que NO distinguen un concesionario de otro (marca, forma juridica, tipo de
// entidad, ciudad/estado que aparecen en muchos labels). Si las contaramos, "GAC Valencia"
// haria match con "GAC Lecherias" solo por compartir "gac".
export const GENERIC_TOKENS = new Set([
  'gac', 'dfsk', 'shineray', 'shinerey', 'motor', 'motors', 'motores',
  'automotores', 'auto', 'car', 'cars', 'group', 'grupo', 'centro', 'de', 'del',
  // "services" queda FUERA a proposito: sacarlo de "PITS Services Maracaibo" dejaria ese
  // nombre en dos tokens y subiria su puntaje contra el label "GAC - Maracaibo" de 0.33 a
  // 0.50, justo el umbral. Contarlo mantiene la separacion.
  'servicio', 'servicios', 'la', 'el', 'los', 'las', 'ca', 'sa', 'soy',
  'exhibicion', 'exhibition', 'concesionario', 'caracas', 'anzoategui',
])

// Tokens distintivos: normalizados, sin duplicados y sin palabras genericas.
// Si tras quitar las genericas no queda nada, se usan todos (caso degenerado).
export function distinctiveTokens(s: string): string[] {
  // Los tokens de UNA letra se descartan primero: "Harbin Motors, C.A." se normaliza a
  // "harbin motors c a", y tomar "c" y "a" como señas de identidad infla el nombre a tres
  // tokens y hunde su puntaje contra el label real de Kommo.
  const all = [...new Set(normalizeText(s).split(' ').filter(t => t.length > 1))]
  const distinctive = all.filter(t => !GENERIC_TOKENS.has(t))
  return distinctive.length ? distinctive : all
}

// Dos tokens "iguales" si coinciden exacto o difieren por un typo (>=4 chars, distancia <=1).
export function tokensMatch(x: string, y: string): boolean {
  if (x === y) return true
  return Math.min(x.length, y.length) >= 4 && editDistance(x, y) <= 1
}

// Cobertura 0..1: que porcion de los tokens distintivos del CONCESIONARIO aparece en el
// label de Kommo. El denominador es el nombre del concesionario, a proposito.
//
// Antes era `compartidos / min(#label, #concesionario)` y ahi estaba el bug: "GAC - Maracaibo"
// se reduce a un unico token distintivo, ["maracaibo"], asi que el minimo valia 1 y CUALQUIER
// concesionario que contuviera "maracaibo" puntuaba 1.00. "PITS Services Maracaibo" y
// "Tecnico Foraneo - Maracaibo" empataban con el correcto, y ganaba el primero que devolviera
// un SELECT sin ORDER BY: el mas antiguo de la tabla, PITS.
//
// Con el denominador en el concesionario, PITS baja a 1/3 y solo "GAC - Maracaibo" llega a
// 1.00. Ademas es estable frente a lo unico que de verdad cambia aca: los labels del CRM, que
// se editan a mano y acumulan calificadores como "(Zulia)" o "- DFSK". Agregarle palabras al
// label ya no penaliza a nadie.
export function nameMatchScore(kommoLabel: string, dealershipName: string): number {
  const label = distinctiveTokens(kommoLabel)
  const dealer = distinctiveTokens(dealershipName)
  if (!label.length || !dealer.length) return 0
  let shared = 0
  for (const token of dealer) if (label.some(l => tokensMatch(l, token))) shared++
  return shared / dealer.length
}

export const MATCH_THRESHOLD = 0.5

// Los puntajes son racionales de enteros chicos; el epsilon solo cubre el ruido de IEEE754
// al comparar dos divisiones que deberian dar lo mismo (1/3 vs 1/3).
const EPSILON = 1e-9

export type DealershipCandidate = { id: string; name: string }

export type DealershipMatch =
  | { kind: 'match'; id: string; name: string; score: number }
  | { kind: 'ambiguous'; candidates: DealershipCandidate[]; score: number }
  | { kind: 'none' }

// Elige UN concesionario por nombre. Si dos o mas empatan en el puntaje mas alto no adivina:
// devuelve 'ambiguous' y quien llama decide (hoy: dejar el lead sin concesionario y loguear).
//
// Dejarlo vacio es peor a la vista pero mejor en la practica. Un lead sin concesionario se ve
// y se corrige; un lead en el concesionario equivocado aparece en el portal de otro y el dueño
// real nunca se entera de que existio.
export function matchDealershipByName(
  kommoLabel: string,
  dealerships: DealershipCandidate[],
): DealershipMatch {
  let best = 0
  let winners: DealershipCandidate[] = []
  for (const d of dealerships) {
    const score = nameMatchScore(kommoLabel, d.name || '')
    if (score < MATCH_THRESHOLD) continue
    if (score > best + EPSILON) {
      best = score
      winners = [d]
    } else if (Math.abs(score - best) <= EPSILON) {
      winners.push(d)
    }
  }
  if (!winners.length) return { kind: 'none' }
  if (winners.length > 1) return { kind: 'ambiguous', candidates: winners, score: best }
  return { kind: 'match', id: winners[0].id, name: winners[0].name, score: best }
}
