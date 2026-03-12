
-- Create salespersons table for managing sales staff
create table public.salespersons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.salespersons enable row level security;

-- Authenticated users can read salespersons
create policy "Authenticated can read salespersons"
  on public.salespersons
  for select
  to authenticated
  using (true);

-- Admins can insert salespersons
create policy "Admins can insert salespersons"
  on public.salespersons
  for insert
  to authenticated
  with check (is_admin_user());

-- Admins can update salespersons
create policy "Admins can update salespersons"
  on public.salespersons
  for update
  to authenticated
  using (is_admin_user());

-- Admins can delete salespersons
create policy "Admins can delete salespersons"
  on public.salespersons
  for delete
  to authenticated
  using (is_admin_user());

-- Updated_at trigger
create trigger handle_salespersons_updated_at
  before update on public.salespersons
  for each row execute function handle_updated_at();
