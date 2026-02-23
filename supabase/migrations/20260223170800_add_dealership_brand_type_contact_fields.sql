-- migration: add brand, type, email, instagram, website columns to dealerships table
-- purpose: support multiple brands (GAC, DFSK) and location types (concesionario, centro_servicio)

alter table public.dealerships
  add column brand text not null default 'GAC',
  add column type text not null default 'concesionario',
  add column email text,
  add column instagram text,
  add column website text;

comment on column public.dealerships.brand is 'Brand managed by this dealership: GAC or DFSK';
comment on column public.dealerships.type is 'Type of location: concesionario or centro_servicio';
comment on column public.dealerships.email is 'Contact email address';
comment on column public.dealerships.instagram is 'Instagram handle';
comment on column public.dealerships.website is 'Website URL';

-- add check constraint for brand
alter table public.dealerships
  add constraint dealerships_brand_check check (brand in ('GAC', 'DFSK'));

-- add check constraint for type
alter table public.dealerships
  add constraint dealerships_type_check check (type in ('concesionario', 'centro_servicio'));
