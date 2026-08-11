import { Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  /** `clients.is_manual`. Null/undefined cuando la reserva no tiene cliente vinculado. */
  isExternal?: boolean | null;
  /** `clients.external_source` — el convenio por el que llegó. */
  source?: string | null;
  /** `sm` para las tablas densas, `md` para fichas y diálogos. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Marca visible de "este no es un cliente nuestro".
 *
 * Existe como componente y no como JSX repetido porque aparece en las dos listas de citas
 * (admin y concesionario), en la ficha de la reserva y en el diálogo de cierre: seis copias
 * que se irían despegando entre sí. Mismo ámbar que usa el módulo de Clientes, a propósito —
 * es la misma idea y tiene que leerse igual en los dos lados.
 *
 * No renderiza nada si el cliente no es externo, así se puede dejar puesto sin condicionales
 * en cada llamada.
 */
export default function ExternalClientBadge({ isExternal, source, size = 'sm', className }: Props) {
  if (!isExternal) return null;

  return (
    <Badge
      className={cn(
        'shrink-0 bg-amber-100 text-amber-800 hover:bg-amber-100 gap-0.5 font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        className,
      )}
      title={source
        ? `Cliente externo — llegó por ${source}. La garantía de fábrica no aplica.`
        : 'Cliente externo: cargado a mano, no vino de una venta ni del CRM.'}
    >
      <Wrench className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      Externo{source ? ` · ${source}` : ''}
    </Badge>
  );
}
