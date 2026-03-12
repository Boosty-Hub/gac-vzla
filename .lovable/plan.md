

## Plan: Vendedores (Salespersons) Management for Prospects Module

### Overview
Create a salespersons database table and a management UI (similar to ProspectStatusManager) accessible via a button in the prospects header. Update prospect creation/editing to select salespersons from this table instead of free text.

### 1. Database Migration — Create `salespersons` table

```sql
CREATE TABLE public.salespersons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salespersons ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated can read salespersons" ON public.salespersons
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage salespersons" ON public.salespersons
  FOR ALL TO authenticated USING (is_admin_user())
  WITH CHECK (is_admin_user());

-- Updated_at trigger
CREATE TRIGGER handle_salespersons_updated_at
  BEFORE UPDATE ON public.salespersons
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

### 2. Create `SalespersonManager` component
- New file: `src/components/SalespersonManager.tsx`
- Dialog-based CRUD manager (following ProspectStatusManager pattern)
- Table listing salespersons with name, phone, active status
- Inline create/edit form with name (required) and phone fields
- Delete with confirmation

### 3. Update `AdminProspectos.tsx`
- Add a "Vendedores" management button in the header (next to the status manager button)
- Fetch salespersons list on mount
- Replace the free-text salesperson input with a `Select` dropdown populated from the `salespersons` table
- Add a "Vendedor" column to the prospects table
- Show salesperson in the detail dialog
- Add salesperson filter dropdown

### 4. Update `DealershipProspectos.tsx`
- Same changes: fetch salespersons, replace free-text input with Select dropdown in create dialog

### Files to create
- `src/components/SalespersonManager.tsx`

### Files to modify
- `src/pages/admin/AdminProspectos.tsx`
- `src/pages/dealership/DealershipProspectos.tsx`

