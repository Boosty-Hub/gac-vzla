-- Allow clients to update their own reservations (e.g. cancel)
CREATE POLICY "Clients can cancel own reservations" ON public.reservations
FOR UPDATE
USING (
  client_id IN (
    SELECT client_id FROM public.client_users WHERE profile_id = auth.uid()
  )
)
WITH CHECK (
  client_id IN (
    SELECT client_id FROM public.client_users WHERE profile_id = auth.uid()
  )
);
