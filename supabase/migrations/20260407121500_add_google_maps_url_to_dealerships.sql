-- migration: add google_maps_url column to dealerships table
-- purpose: allow dealerships to have a Google Maps link for customers to view location

alter table public.dealerships
  add column if not exists google_maps_url text;

comment on column public.dealerships.google_maps_url is 'Google Maps URL for the dealership location';
