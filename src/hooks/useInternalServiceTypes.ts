import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { collectInternalServiceNames } from '@/lib/serviceTypes';

/**
 * Nombres de los tipos de servicio marcados como internos (`service_types.is_internal`).
 *
 * Se usa para no mostrarle al cliente lo que es una gestión interna — hoy "Solicitud de
 * Repuestos" — ni al reservar, ni en sus citas, ni en el historial de su vehículo, ni en el
 * conteo de servicios que alimenta la garantía.
 *
 * La consulta trae activos e inactivos a propósito: un servicio interno desactivado sigue
 * teniendo citas viejas asociadas, y esas también hay que esconderlas.
 *
 * Arranca con el interno conocido ya adentro, así el primer render no muestra por un
 * instante lo que después va a esconder.
 */
export const useInternalServiceTypes = (): ReadonlySet<string> => {
  const [internalNames, setInternalNames] = useState<ReadonlySet<string>>(() =>
    collectInternalServiceNames(null),
  );

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('service_types')
      .select('name, is_internal')
      .then(({ data }) => {
        if (!cancelled) {
          setInternalNames(
            collectInternalServiceNames(data as { name: string; is_internal?: boolean | null }[] | null),
          );
        }
      });
    return () => { cancelled = true; };
  }, []);

  return internalNames;
};
