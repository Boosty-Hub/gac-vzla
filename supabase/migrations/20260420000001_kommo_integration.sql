-- Add kommo_lead_id to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS kommo_lead_id bigint;

-- Add pendiente_por_disponibilidad status if not present
INSERT INTO prospect_statuses (name, label, color, sort_order, is_active)
VALUES ('pendiente_por_disponibilidad', 'Pendiente por Disponibilidad', 'bg-sky-100 text-sky-800', 75, true)
ON CONFLICT (name) DO NOTHING;

-- Integration configs table
CREATE TABLE IF NOT EXISTS integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Integration activity log
CREATE TABLE IF NOT EXISTS integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL,
  event_type text NOT NULL,
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  kommo_lead_id bigint,
  status text NOT NULL DEFAULT 'success',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed Kommo config with pre-mapped stages
INSERT INTO integration_configs (integration_name, config, is_active)
VALUES (
  'kommo',
  jsonb_build_object(
    'subdomain', 'gacvenezuelait',
    'client_id', 'de7cb5ef-4957-4d97-9731-94bdf22549f1',
    'access_token', 'NO ',
    'pipeline_id', 13148719,
    'stage_mappings', jsonb_build_object(
      'nuevo', 101392711,
      'por_contactar', 101392711,
      'en_conversacion', 102420903,
      'cotizacion_enviada', 101392715,
      'precalificar', 101393955,
      'demostracion', 101392719,
      'negociacion', 101392723,
      'pendiente_por_disponibilidad', 104647804,
      'ganado', 142,
      'perdido', 143
    ),
    'reverse_mappings', jsonb_build_object(
      '101392711', 'por_contactar',
      '102420903', 'en_conversacion',
      '101392715', 'cotizacion_enviada',
      '101393955', 'precalificar',
      '101392719', 'demostracion',
      '101392723', 'negociacion',
      '104647804', 'pendiente_por_disponibilidad',
      '142', 'ganado',
      '143', 'perdido'
    )
  ),
  true
)
ON CONFLICT (integration_name) DO UPDATE SET
  config = EXCLUDED.config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- RLS
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read integration_configs"
  ON integration_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read integration_logs"
  ON integration_logs FOR SELECT TO authenticated USING (true);
