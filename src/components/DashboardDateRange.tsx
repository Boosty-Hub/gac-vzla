import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarDays, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** First day of the default window: 30 days back from today. */
export const last30From = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return iso(d);
};

/** Today, ISO yyyy-mm-dd. */
export const todayIso = () => iso(new Date());

const fmt = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtShort = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

/** True when the range equals the default "últimos 30 días" window. */
export const isDefaultLast30 = (desde: string, hasta: string) => desde === last30From() && hasta === todayIso();

/** Empty desde + hasta means "todo el historial" (no date filter). */
export const isAllTimeRange = (desde: string, hasta: string) => !desde && !hasta;

/**
 * Human-friendly description of the active range, for the dashboard title.
 * e.g. "Últimos 30 días · 12 may – 11 jun 2026", "Todo el historial", "01 jun – 15 jun 2026".
 */
export function rangeDescription(desde: string, hasta: string): string {
  if (isAllTimeRange(desde, hasta)) return 'Todo el historial';
  if (isDefaultLast30(desde, hasta)) return `Últimos 30 días · ${fmt(desde)} – ${fmt(hasta)}`;
  if (desde && hasta) return `${fmt(desde)} – ${fmt(hasta)}`;
  if (desde) return `Desde ${fmt(desde)}`;
  return `Hasta ${fmt(hasta)}`;
}

interface DashboardDateRangeProps {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}

/**
 * Shared dashboard date-range picker: quick presets, custom Desde/Hasta, and a
 * "Ver todos (desde siempre)" option that clears the range to show all-time metrics.
 * State is owned by the parent so it can drive the data queries.
 */
export function DashboardDateRange({ desde, hasta, onChange }: DashboardDateRangeProps) {
  const [open, setOpen] = useState(false);

  const allTime = isAllTimeRange(desde, hasta);
  const isDefault = isDefaultLast30(desde, hasta);

  const setLast30 = () => onChange(last30From(), todayIso());
  const setThisMonth = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth();
    onChange(iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0)));
  };
  const setLastMonth = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth();
    onChange(iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0)));
  };
  const setYTD = () => onChange(`${new Date().getFullYear()}-01-01`, todayIso());
  const setAllTime = () => onChange('', '');

  const triggerLabel = allTime
    ? 'Todo el historial'
    : isDefault
    ? 'Últimos 30 días'
    : desde && hasta
    ? `${fmtShort(desde)} – ${fmtShort(hasta)}`
    : desde
    ? `Desde ${fmtShort(desde)}`
    : `Hasta ${fmtShort(hasta)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 text-xs gap-1.5', !allTime && 'border-primary text-primary')}>
          <CalendarDays className="w-3.5 h-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="end">
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setLast30}>Últimos 30 días</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setThisMonth}>Este mes</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setLastMonth}>Mes pasado</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={setYTD}>Año actual</Button>
        </div>
        <Button
          variant={allTime ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs w-full"
          onClick={setAllTime}
        >
          Ver todos (desde siempre)
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Desde</span>
            <Input type="date" value={desde} onChange={e => onChange(e.target.value, hasta)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">Hasta</span>
            <Input type="date" value={hasta} onChange={e => onChange(desde, e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        {!allTime && (
          <Button variant="ghost" size="sm" className="h-7 text-xs w-full text-muted-foreground gap-1" onClick={setAllTime}>
            <X className="w-3 h-3" />Quitar rango (ver todo el historial)
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
