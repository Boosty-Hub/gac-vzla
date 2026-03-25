
-- The "Admins can manage reservations" restrictive ALL policy blocks non-admin SELECT.
-- Drop it and recreate admin-specific policies for INSERT, UPDATE, DELETE only.
DROP POLICY "Admins can manage reservations" ON public.reservations;

CREATE POLICY "Admins can insert reservations"
  ON public.reservations FOR INSERT
  WITH CHECK (is_admin_user());

CREATE POLICY "Admins can update reservations"
  ON public.reservations FOR UPDATE
  USING (is_admin_user());

CREATE POLICY "Admins can delete reservations"
  ON public.reservations FOR DELETE
  USING (is_admin_user());
