-- Widgets de dashboard configurables (globales, admin-CRUD)
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  widget_type text NOT NULL CHECK (widget_type IN ('kpi','bar','pie')),
  source_table text NOT NULL CHECK (source_table IN ('prospects')),
  aggregation text NOT NULL DEFAULT 'count' CHECK (aggregation IN ('count')),
  group_by text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  color text,
  icon text,
  size text NOT NULL DEFAULT 'md' CHECK (size IN ('sm','md','lg')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_active_order
  ON public.dashboard_widgets (is_active, sort_order);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_widgets_read ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_read ON public.dashboard_widgets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dashboard_widgets_admin_write ON public.dashboard_widgets;
CREATE POLICY dashboard_widgets_admin_write ON public.dashboard_widgets
  FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.dashboard_widgets_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dashboard_widgets_updated_at ON public.dashboard_widgets;
CREATE TRIGGER trg_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_widgets_set_updated_at();
