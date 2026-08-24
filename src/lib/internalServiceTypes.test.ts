import { describe, it, expect } from 'vitest';
import {
  collectInternalServiceNames,
  isInternalServiceName,
  PARTS_REQUEST_TYPE,
} from './serviceTypes';

describe('collectInternalServiceNames', () => {
  it('toma los servicios marcados como internos en la base', () => {
    const names = collectInternalServiceNames([
      { name: 'Mantenimiento por Kilometraje', is_internal: false },
      { name: 'Solicitud de Repuestos', is_internal: true },
      { name: 'Traslado a planta', is_internal: true },
    ]);
    expect([...names].sort()).toEqual(['Solicitud de Repuestos', 'Traslado a planta']);
  });

  it('respeta que un servicio deje de ser interno desde el panel', () => {
    // Configuración → Servicios es la fuente de verdad. Si el admin apaga el flag, el
    // servicio tiene que volver a verse: un fallback fijo lo dejaría escondido para siempre.
    const names = collectInternalServiceNames([
      { name: 'Solicitud de Repuestos', is_internal: false },
      { name: 'Mantenimiento por Kilometraje', is_internal: false },
    ]);
    expect(names.has(PARTS_REQUEST_TYPE)).toBe(false);
  });

  it('esconde el interno conocido cuando la consulta falla', () => {
    // `service_types` nunca está vacía en producción, así que una lista vacía o nula sólo
    // puede ser un error de red. Ahí el default seguro es esconder, no mostrar.
    expect(collectInternalServiceNames(null).has(PARTS_REQUEST_TYPE)).toBe(true);
    expect(collectInternalServiceNames([]).has(PARTS_REQUEST_TYPE)).toBe(true);
  });

  it('trata null e is_internal ausente como no interno', () => {
    const names = collectInternalServiceNames([
      { name: 'Otros' },
      { name: 'Garantía', is_internal: null },
      { name: 'Solicitud de Repuestos', is_internal: true },
    ]);
    expect(names.has('Otros')).toBe(false);
    expect(names.has('Garantía')).toBe(false);
    expect(names.has('Solicitud de Repuestos')).toBe(true);
  });
});

describe('isInternalServiceName', () => {
  const internal = collectInternalServiceNames([
    { name: 'Solicitud de Repuestos', is_internal: true },
  ]);

  it('reconoce el servicio interno', () => {
    expect(isInternalServiceName('Solicitud de Repuestos', internal)).toBe(true);
  });

  it('deja pasar los servicios normales', () => {
    expect(isInternalServiceName('Mantenimiento por Kilometraje', internal)).toBe(false);
  });

  it('no esconde una cita sin tipo de servicio', () => {
    // Reservas viejas con `service_type` vacío existen. Esconderlas por las dudas le sacaría
    // al cliente citas suyas que sí debe ver.
    expect(isInternalServiceName(null, internal)).toBe(false);
    expect(isInternalServiceName(undefined, internal)).toBe(false);
  });
});
