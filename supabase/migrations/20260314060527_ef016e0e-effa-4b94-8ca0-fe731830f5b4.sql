INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

CREATE POLICY "Anyone can read branding" ON storage.objects FOR SELECT USING (bucket_id = 'branding');
CREATE POLICY "Admins can upload branding" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'branding' AND public.is_admin_user());
CREATE POLICY "Admins can update branding" ON storage.objects FOR UPDATE USING (bucket_id = 'branding' AND public.is_admin_user());
CREATE POLICY "Admins can delete branding" ON storage.objects FOR DELETE USING (bucket_id = 'branding' AND public.is_admin_user());