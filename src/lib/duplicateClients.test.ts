import { describe, it, expect } from 'vitest';
import {
  buildDuplicateGroups,
  normalizeCedulaKey,
  normalizeNameKey,
  normalizePhoneKey,
  type DuplicateClientRow,
} from './duplicateClients';

const row = (over: Partial<DuplicateClientRow> & { id: string }): DuplicateClientRow => ({
  full_name: 'Cliente',
  cedula: null,
  phone: null,
  email: null,
  city: null,
  created_at: '2026-02-12T00:00:00Z',
  ...over,
});

describe('normalizeNameKey', () => {
  it('ignora acentos, mayúsculas, espacios y puntuación', () => {
    expect(normalizeNameKey('TV. CABLE LITORAL C.A.')).toBe(normalizeNameKey('tv cable litoral ca'));
    expect(normalizeNameKey('José  Domingo Díaz')).toBe(normalizeNameKey('JOSE DOMINGO DIAZ'));
  });

  it('devuelve vacío para un nombre que no aporta letras', () => {
    expect(normalizeNameKey('   ')).toBe('');
    expect(normalizeNameKey(null)).toBe('');
  });
});

describe('normalizePhoneKey', () => {
  it('iguala el mismo número cargado con 0, con +58 o pelado', () => {
    expect(normalizePhoneKey('0412-1234567')).toBe(normalizePhoneKey('+58 412 1234567'));
    expect(normalizePhoneKey('4121234567')).toBe(normalizePhoneKey('0412 123 45 67'));
  });

  it('descarta los teléfonos demasiado cortos para identificar a alguien', () => {
    expect(normalizePhoneKey('12345')).toBe('');
    expect(normalizePhoneKey(null)).toBe('');
  });
});

describe('normalizeCedulaKey', () => {
  it('ignora guiones y puntos, pero no la letra', () => {
    expect(normalizeCedulaKey('J-30436705-8')).toBe(normalizeCedulaKey('J304367058'));
    expect(normalizeCedulaKey('J159715066')).not.toBe(normalizeCedulaKey('V159715066'));
  });
});

describe('buildDuplicateGroups', () => {
  it('agrupa las fichas con la cédula mal tipeada, que ninguna búsqueda por cédula encuentra', () => {
    const groups = buildDuplicateGroups([
      row({ id: 'j', full_name: 'JOSE DOMINGO DIAZ CHIARINE', cedula: 'J159715066', phone: '04141234567' }),
      row({ id: 'v', full_name: 'JOSE DOMINGO DIAZ CHIARINE', cedula: 'V159715066', phone: '04141234567' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].clients.map(c => c.id).sort()).toEqual(['j', 'v']);
    expect(groups[0].samePhone).toBe(true);
    expect(groups[0].sameCedula).toBe(false);
  });

  it('no arma grupos con clientes que aparecen una sola vez', () => {
    expect(buildDuplicateGroups([
      row({ id: 'a', full_name: 'ANA PEREZ' }),
      row({ id: 'b', full_name: 'LUIS PEREZ' }),
    ])).toEqual([]);
  });

  it('no agrupa por teléfono compartido: una empresa y su representante son dos clientes', () => {
    expect(buildDuplicateGroups([
      row({ id: 'empresa', full_name: 'VELAS 3 N C.A', phone: '04121112233' }),
      row({ id: 'persona', full_name: 'PEDRO SUAREZ', phone: '04121112233' }),
    ])).toEqual([]);
  });

  it('marca samePhone en false cuando una de las fichas no tiene teléfono', () => {
    const [group] = buildDuplicateGroups([
      row({ id: 'con', full_name: 'KINEN KHIR KHIR', phone: '04125556677' }),
      row({ id: 'sin', full_name: 'KINEN KHIR KHIR', phone: null }),
    ]);
    expect(group.samePhone).toBe(false);
  });

  it('pone primero los grupos que además comparten teléfono', () => {
    const groups = buildDuplicateGroups([
      row({ id: 'a1', full_name: 'AAA NOMBRE', phone: '04121110000' }),
      row({ id: 'a2', full_name: 'AAA NOMBRE', phone: '04129998888' }),
      row({ id: 'z1', full_name: 'ZZZ NOMBRE', phone: '04127774444' }),
      row({ id: 'z2', full_name: 'ZZZ NOMBRE', phone: '04127774444' }),
    ]);
    expect(groups.map(g => g.displayName)).toEqual(['ZZZ NOMBRE', 'AAA NOMBRE']);
  });

  it('ordena cada grupo por antigüedad y toma de ahí el nombre a mostrar', () => {
    const [group] = buildDuplicateGroups([
      row({ id: 'nueva', full_name: 'Roxibel Jose Gelvez', created_at: '2026-06-01T00:00:00Z' }),
      row({ id: 'vieja', full_name: 'ROXIBEL JOSE GELVEZ', created_at: '2026-02-12T00:00:00Z' }),
    ]);
    expect(group.clients.map(c => c.id)).toEqual(['vieja', 'nueva']);
    expect(group.displayName).toBe('ROXIBEL JOSE GELVEZ');
  });
});
