-- A6 — Buckets de Storage privados (cierra la fuga de PII por URL pública).
--
-- ⚠️ APLICAR SOLO DESPUES de desplegar el frontend que usa createSignedUrl.
-- Si se aplica antes, los archivos (reportes técnicos, adjuntos de prospectos)
-- dejan de mostrarse porque las URLs públicas guardadas dejan de servir.
--
-- technical-reports y prospect-updates contienen PII de clientes y eran públicos:
-- cualquiera con la URL los leía sin autenticación. Se vuelven privados; la app
-- genera URLs firmadas temporales solo para usuarios autenticados.
-- (vehicle-models y branding se dejan públicos: son catálogo/logos, no PII.)

UPDATE storage.buckets SET public = false
WHERE id IN ('technical-reports', 'prospect-updates');

-- technical-reports: reemplazar la lectura pública por lectura autenticada.
DROP POLICY IF EXISTS "Public can read technical reports" ON storage.objects;
CREATE POLICY "Authenticated can read technical reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'technical-reports');

-- prospect-updates ya tiene una policy SELECT para authenticated
-- ("anyone can view prospect update files"), que al hacer el bucket privado
-- pasa a ser efectiva (antes la bypasseaba el acceso público).
