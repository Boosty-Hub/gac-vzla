
-- Notifications table for admin/dealership alerts
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_dealership_id UUID REFERENCES public.dealerships(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  USING (is_admin_user());

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_profile_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_profile_id);

CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Dealership users can read dealership notifications"
  ON public.notifications FOR SELECT
  USING (
    recipient_dealership_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.dealership_users 
      WHERE dealership_users.dealership_id = notifications.recipient_dealership_id 
      AND dealership_users.profile_id = auth.uid()
    )
  );
