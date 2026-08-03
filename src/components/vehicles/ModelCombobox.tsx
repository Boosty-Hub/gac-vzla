import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Searchable model picker.
 *
 * A plain `<Select>` over the catalog is unusable: there are 269 active models, so finding
 * one means scrolling a long list, and the "Otro / escribir manualmente" entry was reported
 * as missing simply because nobody scrolled far enough to see it. This renders the same
 * choices behind a type-to-filter box, with the manual option pinned above the list so it
 * is reachable in one glance regardless of the search term.
 *
 * Deliberately a shared component rather than a fifth copy of the same Select: the option
 * list, the manual sentinel and the empty state now have exactly one definition.
 */

export const MANUAL_MODEL_VALUE = '__manual__';

export interface ModelOption {
  id: string;
  brand: string;
  name: string;
}

interface ModelComboboxProps {
  models: ModelOption[];
  /** A model id, MANUAL_MODEL_VALUE, or '' when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Hidden when the caller has no manual path (e.g. an edit form that forbids it). */
  allowManual?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function ModelCombobox({
  models,
  value,
  onChange,
  allowManual = true,
  placeholder = 'Seleccionar modelo',
  className,
  disabled,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (value === MANUAL_MODEL_VALUE) return 'Otro / escribir manualmente';
    const found = models.find(m => m.id === value);
    return found ? `${found.brand} ${found.name}` : '';
  }, [value, models]);

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selectedLabel && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Width matches the trigger so the list never spills over a narrow dialog. */}
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          // Default cmdk scoring drops "d1 2024"-style multi-token queries against a single
          // long label. Substring matching over the whole label is what users expect here.
          filter={(itemValue, search) => {
            const haystack = itemValue.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .filter(Boolean)
              .every(term => haystack.includes(term))
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Buscar marca o modelo..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {allowManual
                ? 'Sin coincidencias. Usa "Otro / escribir manualmente".'
                : 'Sin coincidencias.'}
            </CommandEmpty>

            {allowManual && (
              <CommandGroup>
                <CommandItem
                  // `value` is what cmdk filters on, so it carries the words a user would
                  // type looking for this option.
                  value="otro escribir manualmente nuevo modelo manual"
                  onSelect={() => handleSelect(MANUAL_MODEL_VALUE)}
                  className="font-medium"
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Otro / escribir manualmente
                  <Check className={cn('ml-auto h-4 w-4', value === MANUAL_MODEL_VALUE ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading={`Catálogo (${models.length})`}>
              {models.map(m => (
                <CommandItem key={m.id} value={`${m.brand} ${m.name}`} onSelect={() => handleSelect(m.id)}>
                  <span className="truncate">{m.brand} {m.name}</span>
                  <Check className={cn('ml-auto h-4 w-4 shrink-0', value === m.id ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
