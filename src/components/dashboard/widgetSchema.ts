import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart2, PieChart, Target, Users, Car, MapPin, User, CalendarDays, Tag, List } from 'lucide-react';

export type WidgetType = 'kpi' | 'bar' | 'pie' | 'list';
export type SourceTable = 'prospects';
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

export interface FieldDef {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'date' | 'text' | 'fk_dealership' | 'fk_status' | 'fk_source' | 'fk_salesperson' | 'brand_extract';
  options?: { value: string; label: string }[];
  groupable: boolean;
  filterable: boolean;
}

export interface SourceDef {
  key: SourceTable;
  label: string;
  fields: FieldDef[];
}

export const SOURCES: SourceDef[] = [
  {
    key: 'prospects',
    label: 'Prospectos',
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
      { key: 'test_drive',     label: 'Test Drive',     type: 'boolean',         groupable: true,  filterable: true },
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
