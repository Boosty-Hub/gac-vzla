export interface Concesionario {
  id: string;
  nombre: string;
  ciudad: string;
  estado: string;
  direccion: string;
  telefono: string;
  horario: string;
  imagen: string;
  capacidadDiaria: number;
}

export interface Vehiculo {
  id: string;
  marca: string;
  modelo: string;
  año: number;
  placa: string;
  vin: string;
  kilometraje: number;
  propietarioId: string;
  fechaCompra: string;
  garantiaActiva: boolean;
}

export interface Reserva {
  id: string;
  vehiculoId: string;
  concesionarioId: string;
  usuarioId: string;
  fecha: string;
  hora: string;
  tipoServicio: string;
  kilometrajeActual: number;
  estado: 'pendiente' | 'confirmada' | 'en_proceso' | 'completada' | 'cancelada';
  notas?: string;
}

export interface HistorialServicio {
  id: string;
  vehiculoId: string;
  concesionarioId: string;
  fecha: string;
  tipoServicio: string;
  kilometraje: number;
  descripcion: string;
  tecnico: string;
  costo: number;
  garantiaCubierta: boolean;
}

export interface Prospecto {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  modeloInteres: string;
  concesionarioId: string;
  estado: 'nuevo' | 'contactado' | 'en_seguimiento' | 'convertido' | 'perdido';
  fuente: 'central' | 'concesionario' | 'web';
  fecha: string;
  notas?: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  cedula: string;
  rol: 'usuario' | 'admin' | 'concesionario';
}

export const concesionarios: Concesionario[] = [
  {
    id: 'c1',
    nombre: 'GAC Motor Caracas Centro',
    ciudad: 'Caracas',
    estado: 'Distrito Capital',
    direccion: 'Av. Francisco de Miranda, Chacao',
    telefono: '+58 212-555-0101',
    horario: 'Lun-Vie 8:00-17:00 | Sáb 8:00-12:00',
    imagen: '/placeholder.svg',
    capacidadDiaria: 12,
  },
  {
    id: 'c2',
    nombre: 'GAC Motor Valencia',
    ciudad: 'Valencia',
    estado: 'Carabobo',
    direccion: 'Av. Bolívar Norte, Zona Industrial',
    telefono: '+58 241-555-0202',
    horario: 'Lun-Vie 8:00-17:00 | Sáb 8:00-12:00',
    imagen: '/placeholder.svg',
    capacidadDiaria: 10,
  },
  {
    id: 'c3',
    nombre: 'GAC Motor Maracaibo',
    ciudad: 'Maracaibo',
    estado: 'Zulia',
    direccion: 'Av. 5 de Julio, Sector La Lago',
    telefono: '+58 261-555-0303',
    horario: 'Lun-Vie 8:00-17:00 | Sáb 8:00-12:00',
    imagen: '/placeholder.svg',
    capacidadDiaria: 8,
  },
  {
    id: 'c4',
    nombre: 'GAC Motor Barquisimeto',
    ciudad: 'Barquisimeto',
    estado: 'Lara',
    direccion: 'Av. Venezuela, Zona Este',
    telefono: '+58 251-555-0404',
    horario: 'Lun-Vie 8:00-17:00 | Sáb 8:00-12:00',
    imagen: '/placeholder.svg',
    capacidadDiaria: 8,
  },
  {
    id: 'c5',
    nombre: 'GAC Motor Puerto Ordaz',
    ciudad: 'Puerto Ordaz',
    estado: 'Bolívar',
    direccion: 'Av. Guayana, Alta Vista',
    telefono: '+58 286-555-0505',
    horario: 'Lun-Vie 8:00-17:00 | Sáb 8:00-12:00',
    imagen: '/placeholder.svg',
    capacidadDiaria: 6,
  },
];

export const modelosGAC = [
  'GS3', 'GS4', 'GS5', 'GS8', 'GN6', 'GN8', 'M6', 'M8', 'Emkoo', 'Emzoom'
];

export const tiposServicio = [
  'Mantenimiento 5,000 km',
  'Mantenimiento 10,000 km',
  'Mantenimiento 15,000 km',
  'Mantenimiento 20,000 km',
  'Mantenimiento 25,000 km',
  'Mantenimiento 30,000 km',
  'Mantenimiento 35,000 km',
  'Mantenimiento 40,000 km',
  'Mantenimiento 45,000 km',
  'Mantenimiento 50,000 km',
  'Revisión General',
  'Diagnóstico',
  'Garantía - Reparación',
];

export const horasDisponibles = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
];

export const vehiculosMock: Vehiculo[] = [
  {
    id: 'v1', marca: 'GAC', modelo: 'GS4', año: 2023, placa: 'AB123CD',
    vin: 'LGAGC1234P1000001', kilometraje: 18500, propietarioId: 'u1',
    fechaCompra: '2023-03-15', garantiaActiva: true,
  },
  {
    id: 'v2', marca: 'GAC', modelo: 'GS8', año: 2022, placa: 'XY456ZW',
    vin: 'LGAGC5678P2000002', kilometraje: 45200, propietarioId: 'u1',
    fechaCompra: '2022-06-20', garantiaActiva: true,
  },
  {
    id: 'v3', marca: 'GAC', modelo: 'Emkoo', año: 2024, placa: 'MN789QR',
    vin: 'LGAGC9012P3000003', kilometraje: 5800, propietarioId: 'u2',
    fechaCompra: '2024-01-10', garantiaActiva: true,
  },
];

export const reservasMock: Reserva[] = [
  {
    id: 'r1', vehiculoId: 'v1', concesionarioId: 'c1', usuarioId: 'u1',
    fecha: '2025-02-15', hora: '09:00', tipoServicio: 'Mantenimiento 20,000 km',
    kilometrajeActual: 19800, estado: 'confirmada',
  },
  {
    id: 'r2', vehiculoId: 'v2', concesionarioId: 'c2', usuarioId: 'u1',
    fecha: '2025-02-16', hora: '10:30', tipoServicio: 'Mantenimiento 45,000 km',
    kilometrajeActual: 45200, estado: 'pendiente',
  },
  {
    id: 'r3', vehiculoId: 'v3', concesionarioId: 'c1', usuarioId: 'u2',
    fecha: '2025-02-14', hora: '08:00', tipoServicio: 'Mantenimiento 5,000 km',
    kilometrajeActual: 5800, estado: 'en_proceso',
  },
  {
    id: 'r4', vehiculoId: 'v1', concesionarioId: 'c3', usuarioId: 'u1',
    fecha: '2025-02-17', hora: '14:00', tipoServicio: 'Revisión General',
    kilometrajeActual: 18500, estado: 'pendiente',
  },
  {
    id: 'r5', vehiculoId: 'v3', concesionarioId: 'c4', usuarioId: 'u2',
    fecha: '2025-02-18', hora: '11:00', tipoServicio: 'Diagnóstico',
    kilometrajeActual: 5800, estado: 'completada',
  },
];

export const historialMock: HistorialServicio[] = [
  {
    id: 'h1', vehiculoId: 'v1', concesionarioId: 'c1', fecha: '2023-09-10',
    tipoServicio: 'Mantenimiento 5,000 km', kilometraje: 5100,
    descripcion: 'Cambio de aceite, filtro de aceite, revisión general',
    tecnico: 'Carlos Méndez', costo: 85, garantiaCubierta: true,
  },
  {
    id: 'h2', vehiculoId: 'v1', concesionarioId: 'c1', fecha: '2024-02-20',
    tipoServicio: 'Mantenimiento 10,000 km', kilometraje: 10200,
    descripcion: 'Cambio de aceite, filtros, revisión de frenos',
    tecnico: 'Carlos Méndez', costo: 120, garantiaCubierta: true,
  },
  {
    id: 'h3', vehiculoId: 'v1', concesionarioId: 'c1', fecha: '2024-08-15',
    tipoServicio: 'Mantenimiento 15,000 km', kilometraje: 15050,
    descripcion: 'Cambio de aceite, filtros, alineación y balanceo',
    tecnico: 'José Rodríguez', costo: 150, garantiaCubierta: true,
  },
  {
    id: 'h4', vehiculoId: 'v2', concesionarioId: 'c2', fecha: '2022-12-10',
    tipoServicio: 'Mantenimiento 5,000 km', kilometraje: 5050,
    descripcion: 'Primer servicio de mantenimiento',
    tecnico: 'Luis Pérez', costo: 85, garantiaCubierta: true,
  },
  {
    id: 'h5', vehiculoId: 'v2', concesionarioId: 'c2', fecha: '2023-06-22',
    tipoServicio: 'Mantenimiento 10,000 km', kilometraje: 10100,
    descripcion: 'Segundo servicio de mantenimiento',
    tecnico: 'Luis Pérez', costo: 120, garantiaCubierta: true,
  },
];

export const prospectosMock: Prospecto[] = [
  {
    id: 'p1', nombre: 'María González', telefono: '+58 414-555-1111',
    email: 'maria@email.com', modeloInteres: 'GS4', concesionarioId: 'c1',
    estado: 'nuevo', fuente: 'web', fecha: '2025-02-10',
  },
  {
    id: 'p2', nombre: 'Pedro Ramírez', telefono: '+58 412-555-2222',
    email: 'pedro@email.com', modeloInteres: 'Emkoo', concesionarioId: 'c1',
    estado: 'contactado', fuente: 'central', fecha: '2025-02-08',
  },
  {
    id: 'p3', nombre: 'Ana Martínez', telefono: '+58 416-555-3333',
    email: 'ana@email.com', modeloInteres: 'GS8', concesionarioId: 'c2',
    estado: 'en_seguimiento', fuente: 'concesionario', fecha: '2025-02-05',
  },
];

export function verificarGarantia(vehiculo: Vehiculo, historial: HistorialServicio[]): {
  activa: boolean;
  razon?: string;
  proximoServicioKm: number;
  serviciosRealizados: number;
  serviciosEsperados: number;
} {
  const fechaCompra = new Date(vehiculo.fechaCompra);
  const ahora = new Date();
  const añosTranscurridos = (ahora.getTime() - fechaCompra.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (añosTranscurridos > 6) {
    return { activa: false, razon: 'Vencida por tiempo (más de 6 años)', proximoServicioKm: 0, serviciosRealizados: historial.length, serviciosEsperados: Math.floor(vehiculo.kilometraje / 5000) };
  }

  if (vehiculo.kilometraje > 100000) {
    return { activa: false, razon: 'Vencida por kilometraje (más de 100,000 km)', proximoServicioKm: 0, serviciosRealizados: historial.length, serviciosEsperados: 20 };
  }

  const serviciosEsperados = Math.floor(vehiculo.kilometraje / 5000);
  const vehiculoHistorial = historial.filter(h => h.vehiculoId === vehiculo.id);
  const serviciosRealizados = vehiculoHistorial.length;

  if (serviciosRealizados < serviciosEsperados) {
    return {
      activa: false,
      razon: `Servicios faltantes: realizados ${serviciosRealizados} de ${serviciosEsperados} esperados`,
      proximoServicioKm: (serviciosRealizados + 1) * 5000,
      serviciosRealizados,
      serviciosEsperados,
    };
  }

  const todosEnConcesionarioOficial = vehiculoHistorial.every(h =>
    concesionarios.some(c => c.id === h.concesionarioId)
  );

  if (!todosEnConcesionarioOficial) {
    return { activa: false, razon: 'Servicios realizados fuera de concesionarios oficiales', proximoServicioKm: (serviciosRealizados + 1) * 5000, serviciosRealizados, serviciosEsperados };
  }

  return {
    activa: true,
    proximoServicioKm: (serviciosRealizados + 1) * 5000,
    serviciosRealizados,
    serviciosEsperados,
  };
}

export function getEstadoColor(estado: string): string {
  switch (estado) {
    case 'pendiente': return 'bg-yellow-100 text-yellow-800';
    case 'confirmada': return 'bg-blue-100 text-blue-800';
    case 'en_proceso': return 'bg-orange-100 text-orange-800';
    case 'completada': return 'bg-green-100 text-green-800';
    case 'cancelada': return 'bg-red-100 text-red-800';
    case 'nuevo': return 'bg-blue-100 text-blue-800';
    case 'contactado': return 'bg-purple-100 text-purple-800';
    case 'en_seguimiento': return 'bg-yellow-100 text-yellow-800';
    case 'convertido': return 'bg-green-100 text-green-800';
    case 'perdido': return 'bg-red-100 text-red-800';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getEstadoLabel(estado: string): string {
  switch (estado) {
    case 'pendiente': return 'Pendiente';
    case 'confirmada': return 'Confirmada';
    case 'en_proceso': return 'En Proceso';
    case 'completada': return 'Completada';
    case 'cancelada': return 'Cancelada';
    case 'nuevo': return 'Nuevo';
    case 'contactado': return 'Contactado';
    case 'en_seguimiento': return 'En Seguimiento';
    case 'convertido': return 'Convertido';
    case 'perdido': return 'Perdido';
    default: return estado;
  }
}
