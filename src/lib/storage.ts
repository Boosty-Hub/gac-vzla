import { supabase } from '@/integrations/supabase/client';

// Buckets privados que sirven archivos mediante URLs firmadas temporales.
export const PRIVATE_BUCKETS = ['technical-reports', 'prospect-updates'] as const;

/**
 * Extrae el path del objeto desde un valor guardado, que puede ser:
 *  - una URL pública antigua (.../object/public/<bucket>/<path>)
 *  - una URL firmada (.../object/sign/<bucket>/<path>?token=...)
 *  - un path ya limpio (<path> o <bucket>/<path>)
 * Devuelve '' si no hay valor.
 */
export function extractStoragePath(bucket: string, stored: string | null | undefined): string {
  if (!stored) return '';
  const markers = [
    `/object/public/${bucket}/`,
    `/object/sign/${bucket}/`,
    `/object/authenticated/${bucket}/`,
  ];
  for (const m of markers) {
    const i = stored.indexOf(m);
    if (i >= 0) return decodeURIComponent(stored.slice(i + m.length).split('?')[0]);
  }
  // Ya es un path; quitar prefijo "<bucket>/" si viniera incluido.
  return stored.replace(new RegExp(`^${bucket}/`), '');
}

/**
 * Devuelve una URL firmada temporal para mostrar/descargar un archivo de un
 * bucket privado. Acepta tanto una URL pública antigua como un path nuevo, por
 * lo que es compatible hacia atrás con los valores ya guardados en la DB.
 */
export async function getSignedFileUrl(
  bucket: string,
  stored: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  const path = extractStoragePath(bucket, stored);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('[storage] createSignedUrl', bucket, path, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Firma en lote (para listas de archivos separados por "|"). */
export async function getSignedFileUrls(
  bucket: string,
  storedList: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    storedList.map(async (s) => {
      const url = await getSignedFileUrl(bucket, s, expiresIn);
      if (url) out[s] = url;
    }),
  );
  return out;
}
