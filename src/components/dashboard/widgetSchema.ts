import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart2, PieChart, Target, Users, Car, MapPin, User, CalendarDays, Tag, List, Wrench, ShieldCheck } from 'lucide-react';

export type WidgetType = 'kpi' | 'bar' | 'pie' | 'list';
export type SourceTable = 'prospects' | 'reservations' | 'clients' | 'vehicles';
export type Aggregation = 'count';

export interface DashboardWidget {
  id: string;
  title: string;
  description: string | null;
  widget_type: WidgetType;
  source_table: SourceTable;
  aggregation: Aggregation;
  group_by: string | null;
  filters: Record<string, unknown>;
  color: string | null;
  icon: string | null;
  size: 'sm' | 'md' | 'lg';
  sort_order: number;
  is_active: boolean;
}

/**
 * `type` decide DOS cosas: qué opciones ofrece el filtro y cómo se traduce el valor crudo
 * a una etiqueta legible. Se resuelve por tipo y NUNCA por nombre de columna: `status`
 * existe en prospectos y en reservas con juegos de valores distintos, y mapear por nombre
 * hacía que las reservas se etiquetaran con los estados de prospecto.
 */
export interface FieldDef {
  key: string;
  label: string;
  type:
    | 'enum' | 'boolean' | 'date' | 'text'
    | 'fk_dealership' | 'fk_status' | 'fk_source' | 'fk_salesperson'
    /** Marca deducida del texto libre `model_interest` (prospectos). */
    | 'brand_extract'
    /** Marca real, vía la relación `vehicle_models` (vehículos). */
    | 'model_brand';
  options?: { value: string; label: string }[];
  groupable: boolean;
  filterable: boolean;
}

export interface SourceDef {
  key: SourceTable;
  label: string;
  /** Columna sobre la que aplica el filtro global de rango de fechas. */
  dateColumn: string;
  /**
   * Columna de concesionario, o null si la tabla no tiene. Cuando es null, el filtro
   * global de concesionario simplemente no se aplica: filtrar por una columna inexistente
   * devolvía error y el widget quedaba en cero sin decir por qué.
   */
  dealershipColumn: string | null;
  /** Relaciones extra que el select necesita para poder agrupar (ej. la marca real). */
  relations?: string[];
  fields: FieldDef[];
}

const SI_NO = [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }];

export const SOURCES: SourceDef[] = [
  {
    key: 'prospects',
    label: 'Prospectos',
    dateColumn: 'created_at',
    dealershipColumn: 'dealership_id',
    fields: [
      { key: 'status',         label: 'Estado',         type: 'fk_status',       groupable: true,  filterable: true },
      { key: 'source',         label: 'Fuente',         type: 'fk_source',       groupable: true,  filterable: true },
      { key: 'salesperson',    label: 'Vendedor',       type: 'fk_salesperson',  groupable: true,  filterable: true },
      { key: 'dealership_id',  label: 'Concesionario',  type: 'fk_dealership',   groupable: true,  filterable: true },
      { key: 'Estado de Vnzla',label: 'Estado (Vzla)',  type: 'text',            groupable: true,  filterable: true },
      { key: 'event_name',     label: 'Evento',         type: 'text',            groupable: true,  filterable: true },
      { key: 'brand',          label: 'Marca',          type: 'brand_extract',   groupable: true,  filterable: true,
        options: [
          { value: 'GAC', label: 'GAC' },
          { value: 'DFSK', label: 'DFSK' },
          { value: 'SHINERAY', label: 'SHINERAY' },
        ] },
      { key: 'test_drive',     label: 'Test Drive',     type: 'boolean',         groupable: true,  filterable: true, options: SI_NO },
      { key: 'person_type',    label: 'Tipo persona',   type: 'enum',            groupable: true,  filterable: true,
        options: [
          { value: 'natural', label: 'Natural' },
          { value: 'juridica', label: 'Jurídica' },
        ] },
      { key: 'gender',         label: 'Género',         type: 'enum',            groupable: true,  filterable: true,
        options: [
          { value: 'masculino', label: 'Masculino' },
          { value: 'femenino', label: 'Femenino' },
        ] },
      { key: 'age_range',      label: 'Rango edad',     type: 'enum',            groupable: true,  filterable: true,
        options: [
          { value: '20-30', label: '20 a 30' },
          { value: '30-40', label: '30 a 40' },
          { value: '40+',   label: '40 o más' },
        ] },
      { key: 'created_at',     label: 'Fecha creación', type: 'date',            groupable: false, filterable: true },
    ],
  },
  {
    key: 'reservations',
    label: 'Reservas / Servicios',
    dateColumn: 'created_at',
    dealershipColumn: 'dealership_id',
    fields: [
      { key: 'status',          label: 'Estado',         type: 'enum',          groupable: true,  filterable: true,
        options: [
          { value: 'pendiente',  label: 'Pendiente' },
          { value: 'confirmada', label: 'Confirmada' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'completada', label: 'Completada' },
          { value: 'cancelada',  label: 'Cancelada' },
        ] },
      { key: 'dealership_id',   label: 'Concesionario',  type: 'fk_dealership', groupable: true,  filterable: true },
      { key: 'service_type',    label: 'Tipo de servicio', type: 'text',        groupable: true,  filterable: false },
      { key: 'state',           label: 'Estado (Vzla)',  type: 'text',          groupable: true,  filterable: false },
      { key: 'created_by_role', label: 'Cargada por',    type: 'enum',          groupable: true,  filterable: true,
        options: [
          { value: 'superadmin',     label: 'Superadmin' },
          { value: 'admin',          label: 'Admin' },
          { value: 'concesionario',  label: 'Concesionario' },
          { value: 'vendedor',       label: 'Vendedor' },
          { value: 'Cliente',        label: 'Cliente (portal)' },
        ] },
      { key: 'created_at',      label: 'Fecha de carga', type: 'date',          groupable: false, filterable: true },
    ],
  },
  {
    key: 'clients',
    label: 'Clientes',
    dateColumn: 'created_at',
    // `clients` no tiene concesionario: un cliente puede atenderse en varios.
    dealershipColumn: null,
    fields: [
      { key: 'state',     label: 'Estado (Vzla)', type: 'text',    groupable: true, filterable: false },
      { key: 'city',      label: 'Ciudad',        type: 'text',    groupable: true, filterable: false },
      { key: 'is_manual', label: 'Externo',       type: 'boolean', groupable: true, filterable: true, options: SI_NO },
      { key: 'is_fleet',  label: 'Flota',         type: 'boolean', groupable: true, filterable: true, options: SI_NO },
      { key: 'is_active', label: 'Activo',        type: 'boolean', groupable: true, filterable: true, options: SI_NO },
      { key: 'created_at',label: 'Fecha de alta', type: 'date',    groupable: false, filterable: true },
    ],
  },
  {
    key: 'vehicles',
    label: 'Vehículos',
    dateColumn: 'created_at',
    dealershipColumn: null,
    relations: ['vehicle_models(brand)'],
    fields: [
      { key: 'model_brand',     label: 'Marca',       type: 'model_brand', groupable: true, filterable: false },
      { key: 'year',            label: 'Año',         type: 'text',        groupable: true, filterable: false },
      { key: 'warranty_active', label: 'En garantía', type: 'boolean',     groupable: true, filterable: true, options: SI_NO },
      { key: 'is_manual',       label: 'Externo',     type: 'boolean',     groupable: true, filterable: true, options: SI_NO },
      { key: 'is_active',       label: 'Activo',      type: 'boolean',     groupable: true, filterable: true, options: SI_NO },
      { key: 'created_at',      label: 'Fecha de alta', type: 'date',      groupable: false, filterable: true },
    ],
  },
];

export const WIDGET_TYPES: { value: WidgetType; label: string; icon: LucideIcon }[] = [
  { value: 'kpi',  label: 'Indicador (KPI)',   icon: Target },
  { value: 'list', label: 'Lista de conteos',  icon: List },
  { value: 'bar',  label: 'Gráfico de barras', icon: BarChart2 },
  { value: 'pie',  label: 'Gráfico de torta',  icon: PieChart },
];

/** Tipos que cuentan registros por categoría y por lo tanto exigen "Agrupar por". */
export function requiresGroupBy(type: WidgetType): boolean {
  return type !== 'kpi';
}

export const ICON_OPTIONS: { value: string; icon: LucideIcon; label: string }[] = [
  { value: 'Users',       icon: Users,       label: 'Usuarios' },
  { value: 'Target',      icon: Target,      label: 'Objetivo' },
  { value: 'Car',         icon: Car,         label: 'Vehículo' },
  { value: 'Wrench',      icon: Wrench,      label: 'Servicio' },
  { value: 'ShieldCheck', icon: ShieldCheck, label: 'Garantía' },
  { value: 'MapPin',      icon: MapPin,      label: 'Ubicación' },
  { value: 'User',        icon: User,        label: 'Persona' },
  { value: 'CalendarDays',icon: CalendarDays,label: 'Calendario' },
  { value: 'Tag',         icon: Tag,         label: 'Etiqueta' },
  { value: 'Activity',    icon: Activity,    label: 'Actividad' },
];

export const COLOR_OPTIONS: { value: string; label: string; hex: string }[] = [
  { value: 'primary', label: 'Primario',  hex: 'hsl(var(--primary))' },
  { value: 'blue',    label: 'Azul',      hex: 'hsl(220, 70%, 55%)' },
  { value: 'green',   label: 'Verde',     hex: 'hsl(160, 60%, 45%)' },
  { value: 'amber',   label: 'Ámbar',     hex: 'hsl(45, 90%, 50%)' },
  { value: 'red',     label: 'Rojo',      hex: 'hsl(0, 70%, 55%)' },
  { value: 'purple',  label: 'Morado',    hex: 'hsl(280, 60%, 55%)' },
];

export function getSource(key: SourceTable) {
  return SOURCES.find(s => s.key === key) || SOURCES[0];
}

export function getField(source: SourceTable, key: string): FieldDef | undefined {
  return getSource(source).fields.find(f => f.key === key);
}

export function getColorHex(value: string | null | undefined): string {
  return COLOR_OPTIONS.find(c => c.value === value)?.hex || COLOR_OPTIONS[0].hex;
}
