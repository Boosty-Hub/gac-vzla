
-- Create prospect_models table for specific models used in prospect creation
-- These are independent from the vehicle_models table used elsewhere

create table public.prospect_models (
  id uuid not null default gen_random_uuid() primary key,
  brand text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Enable RLS
alter table public.prospect_models enable row level security;

-- RLS: anyone authenticated can read
create policy "Authenticated can read prospect_models"
  on public.prospect_models for select
  to authenticated
  using (true);

-- RLS: admins can insert
create policy "Admins can insert prospect_models"
  on public.prospect_models for insert
  to authenticated
  with check (is_admin_user());

-- RLS: admins can update
create policy "Admins can update prospect_models"
  on public.prospect_models for update
  to authenticated
  using (is_admin_user());

-- RLS: admins can delete
create policy "Admins can delete prospect_models"
  on public.prospect_models for delete
  to authenticated
  using (is_admin_user());

-- updated_at trigger
create trigger set_prospect_models_updated_at
  before update on public.prospect_models
  for each row
  execute function public.handle_updated_at();

-- Seed DFSK models
insert into public.prospect_models (brand, name, sort_order) values
  ('DFSK', 'C31 (Pick up)', 1),
  ('DFSK', 'C31 (Box)', 2),
  ('DFSK', 'C31 (Refrig -18°)', 3),
  ('DFSK', 'C32 (Pick up)', 4),
  ('DFSK', 'C35 (Panel)', 5),
  ('DFSK', 'C37 (Pasajeros)', 6),
  ('DFSK', 'C37 (11 Pasajeros)', 7),
  ('DFSK', 'D51 (Plataforma)', 8),
  ('DFSK', 'D51 (Estacas)', 9),
  ('DFSK', 'D71 (Pick up)', 10),
  ('DFSK', 'D72 (Pick up)', 11),
  ('DFSK', 'D71 (BOX)', 12),
  ('DFSK', 'D1 Pick up (4X4)', 13),
  ('DFSK', 'Z9 Pick Up', 14),
  ('DFSK', 'K01S Cava (Isotermica)', 15),
  ('DFSK', 'K01S Cava (Refrig -5°)', 16),
  ('DFSK', 'K01S Cava (Refrig -18°)', 17),
  ('DFSK', 'K01S (Estacas)', 18),
  ('DFSK', 'K01S (Pick up)', 19),
  ('DFSK', 'K02S (Pick up)', 20),
  ('DFSK', 'K05S (Panel)', 21),
  ('DFSK', 'K07S (Pasajeros)', 22),
  ('DFSK', 'GLORY 500 (SUV)', 23),
  ('DFSK', 'GLORY 500 T (Dynamic)', 24),
  ('DFSK', 'GLORY E5 (Hybrid)', 25);

-- Seed GAC models
insert into public.prospect_models (brand, name, sort_order) values
  ('GAC', 'EMPOW GS', 1),
  ('GAC', 'EMPOW GE', 2),
  ('GAC', 'EMZOOM GB', 3),
  ('GAC', 'EMZOOM GS', 4),
  ('GAC', 'GS8 GT', 5),
  ('GAC', 'GS8 4WD GT', 6),
  ('GAC', 'EMZOOM GB RSTYLE', 7),
  ('GAC', 'EMPOW GE 2.0', 8),
  ('GAC', 'GS8 FACELIFT', 9),
  ('GAC', 'EMPOW GL', 10),
  ('GAC', 'SMILODON 4x2', 11),
  ('GAC', 'SMILODON 4x4', 12);

-- Seed SHINERAY models
insert into public.prospect_models (brand, name, sort_order) values
  ('SHINERAY', 'X30 (Pasajeros)', 1),
  ('SHINERAY', 'X30 (Panel)', 2);
