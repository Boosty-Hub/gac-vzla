import { describe, it, expect } from 'vitest';
import {
  distinctiveTokens,
  nameMatchScore,
  matchDealershipByName,
} from '../../supabase/functions/_shared/dealershipMatch';

// Los 21 concesionarios reales al 2026-08-05. El emparejamiento solo se puede juzgar contra
// el padron completo: el bug no fue elegir mal entre dos nombres sino empatar entre tres.
const DEALERSHIPS = [
  { id: 'd-florida', name: 'Automotores La Florida, C.A.' },
  { id: 'd-aviadores', name: 'Centro De Servicio Los Aviadores' },
  { id: 'd-merida', name: 'Centro De Servicio Mérida' },
  { id: 'd-pzo', name: 'Centro de Servicio Puerto Ordaz' },
  { id: 'd-tachira', name: 'Centro de Servicio Sán Cristóbal' },
  { id: 'd-dfsk-cs', name: 'DFSK & GAC Centro de Servicio' },
  { id: 'd-bqto', name: 'GAC - Barquisimeto' },
  { id: 'd-tigre', name: 'GAC - El Tigre' },
  { id: 'd-castellana', name: 'GAC - La Castellana' },
  { id: 'd-lecherias', name: 'GAC - Lecherías' },
  { id: 'd-maracaibo', name: 'GAC - Maracaibo' },
  { id: 'd-rosal', name: 'GAC - Street Boutique El Rosal' },
  { id: 'd-valencia', name: 'GAC - Valencia' },
  { id: 'd-harbin', name: 'Harbin Motors, C.A.' },
  { id: 'd-hobby', name: 'Hobby Cars' },
  { id: 'd-garzas', name: 'Las Garzas Motor' },
  { id: 'd-palma', name: 'Palma Motors' },
  { id: 'd-pits', name: 'PITS Services Maracaibo' },
  { id: 'd-techno', name: 'Soy Techno Exhibición' },
  { id: 'd-foraneo-mcbo', name: 'Técnico Foráneo - Maracaibo' },
  { id: 'd-refrigeracion', name: 'Técnico Refrigeración Foraneo' },
];

describe('matchDealershipByName — regresión GAC Maracaibo → PITS', () => {
  it('elige GAC - Maracaibo y no PITS Services Maracaibo', () => {
    const result = matchDealershipByName('GAC - Maracaibo', DEALERSHIPS);
    expect(result).toEqual({ kind: 'match', id: 'd-maracaibo', name: 'GAC - Maracaibo', score: 1 });
  });

  it('deja a los otros dos Maracaibo por debajo del umbral, no empatados en el tope', () => {
    // Con el denominador viejo, min(#tokens), los tres daban exactamente 1.00.
    expect(nameMatchScore('GAC - Maracaibo', 'GAC - Maracaibo')).toBe(1);
    expect(nameMatchScore('GAC - Maracaibo', 'PITS Services Maracaibo')).toBeLessThan(0.5);
    expect(nameMatchScore('GAC - Maracaibo', 'Técnico Foráneo - Maracaibo')).toBeLessThan(0.5);
  });

  it('no depende del orden en que venga la tabla', () => {
    const reversed = [...DEALERSHIPS].reverse();
    // El SELECT del webhook no lleva ORDER BY. Antes, invertir el orden cambiaba el ganador.
    expect(matchDealershipByName('GAC - Maracaibo', reversed)).toMatchObject({ id: 'd-maracaibo' });
  });
});

describe('matchDealershipByName — las 16 opciones reales del campo Concesionario', () => {
  const CASES: Array<[label: string, expectedId: string | null]> = [
    ['Harbin Motor (La Trinidad) - DFSK', 'd-harbin'],
    ['Las Garzas Motor (Anzoátegui) - DFSK', 'd-garzas'],
    ['Hobby Cars (Barinas) - DFSK', 'd-hobby'],
    ['Palma Motors (Falcón) - DFSK', 'd-palma'],
    ['GAC Street Boutique (Rosal) - GAC', 'd-rosal'],
    ['GAC - Valencia (Valencia) - GAC', 'd-valencia'],
    ['GAC - Barquisimeto (Barquisimeto) - GAC', 'd-bqto'],
    ['Automotores la Florida (Caracas) - GAC', 'd-florida'],
    ['GAC - La Castellana (Caracas) - GAC', 'd-castellana'],
    ['GAC - Lecherías (Anzoátegui) - GAC', 'd-lecherias'],
    ['Soy Tecnho Exhibición', 'd-techno'], // typo real en el CRM: "Tecnho"
    ['GAC - El Tigre', 'd-tigre'],
    ['GAC - Maracaibo', 'd-maracaibo'],
    ['Los Aviadores - Maracay', 'd-aviadores'],
    // Sin concesionario que les corresponda: el webhook debe crearlo, no forzar un parecido.
    ['Meta Car Group (Zulia) - DFSK', null],
    ['Centro de Servicio Guarenas', null],
  ];

  it.each(CASES)('%s', (label, expectedId) => {
    const result = matchDealershipByName(label, DEALERSHIPS);
    if (expectedId === null) {
      expect(result.kind).toBe('none');
    } else {
      expect(result).toMatchObject({ kind: 'match', id: expectedId });
    }
  });
});

describe('matchDealershipByName — empates', () => {
  it('ante un empate no elige ninguno', () => {
    // Dos concesionarios cuyos tokens distintivos son idénticos: nada en el label los separa.
    const result = matchDealershipByName('GAC - Valencia (Valencia) - GAC', [
      { id: 'a', name: 'GAC - Valencia' },
      { id: 'b', name: 'Valencia Motors' },
    ]);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' && result.candidates.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('sin candidatos por encima del umbral devuelve none', () => {
    expect(matchDealershipByName('GAC - Maracaibo', [{ id: 'x', name: 'Hobby Cars' }]).kind)
      .toBe('none');
  });
});

describe('distinctiveTokens', () => {
  it('descarta las palabras genéricas', () => {
    expect(distinctiveTokens('GAC - Maracaibo')).toEqual(['maracaibo']);
    expect(distinctiveTokens('GAC - Lecherías (Anzoátegui) - GAC')).toEqual(['lecherias']);
  });

  it('descarta los tokens de una letra que deja "C.A."', () => {
    // "Harbin Motors, C.A." se normaliza a "harbin motors c a"; contar "c" y "a" triplicaba
    // el tamaño del nombre y hundía su puntaje contra el label de Kommo.
    expect(distinctiveTokens('Harbin Motors, C.A.')).toEqual(['harbin']);
    expect(distinctiveTokens('Automotores La Florida, C.A.')).toEqual(['florida']);
  });

  it('si todo es genérico, usa todos los tokens en vez de quedarse vacío', () => {
    // Sin este repliegue el nombre quedaría sin tokens y no podría emparejar con nada.
    expect(distinctiveTokens('Centro de Servicio')).toEqual(['centro', 'de', 'servicio']);
  });
});
