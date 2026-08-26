import { describe, it, expect } from 'vitest';
import { entryStatus, ENTRY_STATUS_FALLBACK } from './prospectStatus';

describe('entryStatus', () => {
  it('toma el primero del embudo por orden', () => {
    // El catálogo real: por_contactar tiene sort_order 2 y es el más bajo.
    expect(entryStatus([
      { name: 'ganado', sort_order: 8 },
      { name: 'por_contactar', sort_order: 2 },
      { name: 'en_conversacion', sort_order: 3 },
    ])).toBe('por_contactar');
  });

  it('sigue al catálogo si reordenan el embudo desde el panel', () => {
    // La razón de que esto salga del catálogo y no de una constante: reordenar los estados
    // no puede obligar a tocar código.
    expect(entryStatus([
      { name: 'por_contactar', sort_order: 5 },
      { name: 'contacto_estrategico', sort_order: 1 },
    ])).toBe('contacto_estrategico');
  });

  it('ignora los estados desactivados', () => {
    expect(entryStatus([
      { name: 'apagado', sort_order: 1, is_active: false },
      { name: 'por_contactar', sort_order: 2, is_active: true },
    ])).toBe('por_contactar');
  });

  it('cae al piso mientras el catálogo no cargó', () => {
    // Los primeros milisegundos de la pantalla. Devolver vacío dejaría el selector en blanco,
    // que es justo el síntoma que esto vino a arreglar.
    expect(entryStatus([])).toBe(ENTRY_STATUS_FALLBACK);
    expect(entryStatus(null)).toBe(ENTRY_STATUS_FALLBACK);
    expect(entryStatus(undefined)).toBe(ENTRY_STATUS_FALLBACK);
  });

  it('desempata por nombre cuando dos comparten orden', () => {
    expect(entryStatus([
      { name: 'zeta', sort_order: 1 },
      { name: 'alfa', sort_order: 1 },
    ])).toBe('alfa');
  });
});
