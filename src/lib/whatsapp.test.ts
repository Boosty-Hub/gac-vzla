import { describe, it, expect } from 'vitest';
import { buildWhatsAppReservationUrl } from './whatsapp';

describe('buildWhatsAppReservationUrl — notas are internal, never sent to the client', () => {
  it('does NOT include internal notes in the WhatsApp message even when notes are provided', () => {
    const url = buildWhatsAppReservationUrl({
      phone: '04141234567',
      clientName: 'Juan Perez',
      date: '2026-06-12',
      time: '10:00',
      serviceType: 'Mantenimiento',
      notes: 'NOTA-INTERNA-SECRETA',
    });
    expect(url).not.toBeNull();
    const decoded = decodeURIComponent(url as string);
    expect(decoded).not.toContain('NOTA-INTERNA-SECRETA');
    expect(decoded).not.toMatch(/Notas/i);
  });

  it('still includes the client-facing fields (name, service)', () => {
    const url = buildWhatsAppReservationUrl({
      phone: '04141234567',
      clientName: 'Juan Perez',
      date: '2026-06-12',
      time: '10:00',
      serviceType: 'Mantenimiento',
    });
    const decoded = decodeURIComponent(url as string);
    expect(decoded).toContain('Juan Perez');
    expect(decoded).toContain('Mantenimiento');
  });
});
