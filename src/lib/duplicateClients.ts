/**
 * Detección de fichas duplicadas del mismo cliente real.
 *
 * Agrupa por NOMBRE normalizado y no por cédula ni por `IdContactKommo`:
 *
 *  - Los 9 pares que dejó la carga inicial de clientes (2026-02-12) tienen el mismo nombre y
 *    el mismo teléfono, pero la cédula mal tipeada — `J120284017` contra `V120284017`,
 *    `V20859485` contra `V208594857`. Una detección por cédula no ve ninguno.
 *  - La vista `v_duplicate_clients` agrupa por `IdContactKommo`, y Kommo reusa esos ids: el
 *    108470133 lo comparten 8 clientes distintos y reales. No sirve como llave.
 *
 * El teléfono NO agrupa por sí solo: 196 clientes comparten teléfono con otro y casi todos
 * son legítimos (una empresa y su representante, familiares con una sola línea). Acá el
 * teléfono sólo CONFIRMA un grupo que ya coincide por nombre.
 */

export interface DuplicateClientRow {
  id: string;
  full_name: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
}

export interface DuplicateGroup {
  /** Nombre normalizado que une al grupo. Sirve de key de React. */
  key: string;
  /** Nombre tal cual está cargado en la ficha más antigua del grupo. */
  displayName: string;
  clients: DuplicateClientRow[];
  /** Todas las fichas comparten el mismo teléfono: es un duplicado casi seguro. */
  samePhone: boolean;
  /** Todas comparten la misma cédula. Raro entre estos duplicados, justamente. */
  sameCedula: boolean;
}

/** Dígitos por debajo de los cuales un teléfono no identifica a nadie. Mismo umbral que
 *  `staff_search_clients` y que el buscador de MergeClientsDialog. */
const MIN_PHONE_DIGITS = 7;

const stripAccents = (raw: string): string => raw.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Llave de comparación de nombres: sin acentos, sin mayúsculas, sin espacios ni puntuación.
 * Así «TV. CABLE LITORAL C.A.» y «TV CABLE LITORAL CA» caen en el mismo grupo.
 */
export function normalizeNameKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripAccents(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Llave de comparación de teléfonos. Se queda con los últimos 10 dígitos porque el mismo
 * número está cargado de tres formas distintas — `04121234567`, `+584121234567` y
 * `4121234567` — y las tres tienen que coincidir.
 */
export function normalizePhoneKey(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return '';
  return digits.slice(-10);
}

/** Llave de comparación de cédulas/RIF: sin guiones, sin puntos, sin espacios. */
export function normalizeCedulaKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return stripAccents(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** true cuando todos los valores son no vacíos y iguales entre sí. */
const allShare = (values: string[]): boolean =>
  values.length > 1 && values.every(v => v !== '' && v === values[0]);

/**
 * Arma los grupos de fichas que parecen ser el mismo cliente.
 *
 * Recibe las fichas ya filtradas por quien llama (sólo activas): una ficha desactivada suele
 * ser el resultado de una fusión anterior, y volver a ofrecerla como duplicado invitaría a
 * fusionar hacia una ficha muerta.
 *
 * Los grupos que además comparten teléfono van primero: son los que casi no hay que pensar.
 */
export function buildDuplicateGroups(rows: DuplicateClientRow[]): DuplicateGroup[] {
  const byName = new Map<string, DuplicateClientRow[]>();
  for (const row of rows) {
    const key = normalizeNameKey(row.full_name);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(row);
    else byName.set(key, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, members] of byName) {
    if (members.length < 2) continue;
    const ordered = [...members].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    groups.push({
      key,
      displayName: ordered[0].full_name,
      clients: ordered,
      samePhone: allShare(ordered.map(c => normalizePhoneKey(c.phone))),
      sameCedula: allShare(ordered.map(c => normalizeCedulaKey(c.cedula))),
    });
  }

  return groups.sort((a, b) => {
    if (a.samePhone !== b.samePhone) return a.samePhone ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, 'es');
  });
}
