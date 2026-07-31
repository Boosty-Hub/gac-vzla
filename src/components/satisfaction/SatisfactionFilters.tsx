import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';
import {
  ALL_VALUE,
  deriveBrandFacets,
  deriveModelFacets,
  deriveMonthOptions,
  type SatisfactionFilterState,
  type SatisfactionSurveyRow,
} from './satisfactionDashboardUtils';

interface SatisfactionFiltersProps {
  /** Full RLS-scoped fetch (unfiltered) — facets are always derived from
   * every survey the viewer can see, not from the currently filtered set,
   * so switching a filter never hides options for the others. */
  rows: SatisfactionSurveyRow[];
  filters: SatisfactionFilterState;
  onChange: (next: SatisfactionFilterState) => void;
}

/** Brand / Model / Month — requirements.md R8: all three compose (AND) and
 * every metric + the client list respect the active filter set. */
const SatisfactionFilters = ({ rows, filters, onChange }: SatisfactionFiltersProps) => {
  const brands = deriveBrandFacets(rows);
  const models = deriveModelFacets(rows, filters.brand);
  const months = deriveMonthOptions(rows);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <Filter className="w-3.5 h-3.5" /> Filtros
      </span>

      <Select
        value={filters.brand}
        onValueChange={brand => onChange({ brand, model: ALL_VALUE, month: filters.month })}
      >
        <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Marca" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las marcas</SelectItem>
          {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.model}
        onValueChange={model => onChange({ ...filters, model })}
      >
        <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue placeholder="Modelo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los modelos</SelectItem>
          {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.month}
        onValueChange={month => onChange({ ...filters, month })}
      >
        <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Mes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los meses</SelectItem>
          {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SatisfactionFilters;
