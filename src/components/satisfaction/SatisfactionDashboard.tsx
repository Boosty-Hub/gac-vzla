import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import SatisfactionOverview from './SatisfactionOverview';
import SatisfactionFilters from './SatisfactionFilters';
import SatisfactionClientList from './SatisfactionClientList';
import {
  DEFAULT_FILTERS,
  filterSurveys,
  groupSurveysByClient,
  type SatisfactionFilterState,
  type SatisfactionSurveyRow,
} from './satisfactionDashboardUtils';

/**
 * "Satisfacción" dashboard tab (requirements.md R7/R8). Single fetch, RLS-scoped
 * by `satisfaction_surveys`' own policy (admin: all; concesionario: own
 * dealership; vendedor: own salesperson) — mirrors `SatisfactionOverview.tsx`'s
 * established pattern.
 *
 * CRITICAL (design.md D6): the client list is derived from these survey rows,
 * NEVER from a direct `clients` query — `clients` has no `dealership_id`
 * column, so a direct read would leak all ~1367 client rows to every
 * dealership-scoped user regardless of role. `satisfaction_surveys` already
 * carries `dealership_id`/`salesperson` and a `client_name`/`client_phone`
 * snapshot on each row, so no `clients` read is needed at all.
 */
const SatisfactionDashboard = () => {
  const [rows, setRows] = useState<SatisfactionSurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SatisfactionFilterState>(DEFAULT_FILTERS);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // `satisfaction_surveys` / `vehicles` / `vehicle_models` embeds are not
      // in the generated types.ts yet (new tables, no regen) — `as any`,
      // matching this project's established convention for un-typed tables
      // (see SatisfactionOverview.tsx).
      const { data, error } = await (supabase as any)
        .from('satisfaction_surveys')
        .select(
          'id, client_id, client_name, client_phone, sold_plate, status, origin, suppressed_reason, ' +
          'created_at, responded_at, dealership_id, salesperson, dealerships(name), ' +
          'vehicles(plate, vehicle_models(brand, name)), response:satisfaction_responses(*)',
        )
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Error al cargar el panel de satisfacción');
        setLoading(false);
        return;
      }

      setRows((data || []) as SatisfactionSurveyRow[]);
      setLoading(false);
    };
    load();
  }, []);

  // Filters compose with AND and drive both the metrics and the client list
  // (requirements.md R8: "handled completely, not partially").
  const filteredRows = useMemo(() => filterSurveys(rows, filters), [rows, filters]);
  const clientRows = useMemo(() => groupSurveysByClient(filteredRows), [filteredRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando panel de satisfacción...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Facets always derived from the full RLS-scoped fetch, not the
          filtered set, so switching one filter never hides another's options. */}
      <SatisfactionFilters rows={rows} filters={filters} onChange={setFilters} />
      {/* Reuses the existing metrics component (design.md D8) instead of a
          parallel KPI/aspect-breakdown implementation — `compact` hides its
          own header + "Encuestas respondidas" table (this tab has its own
          client list below instead), `surveys` hands it the already
          brand/model/month-filtered rows so it renders controlled, with no
          fetch of its own. */}
      <SatisfactionOverview compact surveys={filteredRows} />
      <SatisfactionClientList rows={clientRows} />
    </div>
  );
};

export default SatisfactionDashboard;
