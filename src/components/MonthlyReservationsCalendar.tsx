import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RESERVATION_STATUS_COLORS } from '@/lib/reservationStatus';

interface MiniReservation {
  id: string;
  reservation_date: string; // 'YYYY-MM-DD'
  reservation_time: string; // 'HH:MM:SS'
  status: string;
  service_type: string;
  clients: { full_name: string } | null;
  walkin_client_name: string | null;
  vehicles: { plate: string | null } | null;
  walkin_plate: string | null;
}

interface MonthlyReservationsCalendarProps<R extends MiniReservation = MiniReservation> {
  reservations: R[];
  /** YYYY-MM string e.g. '2026-05' */
  month: string;
  onMonthChange: (month: string) => void;
  /** When a day is clicked, parent can react (e.g. open a detail) */
  onDayClick?: (dateStr: string, dayReservations: R[]) => void;
  /** Optional click on a single reservation */
  onReservationClick?: (r: R) => void;
  statusColors?: Record<string, string>;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DEFAULT_STATUS_COLORS = RESERVATION_STATUS_COLORS;

function parseYearMonth(ym: string): { year: number; month0: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month0: m - 1 };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatMonthYear(ym: string): string {
  const { year, month0 } = parseYearMonth(ym);
  const date = new Date(year, month0, 1);
  return date.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number): string {
  const { year, month0 } = parseYearMonth(ym);
  const d = new Date(year, month0 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Returns an array of arrays (weeks) of Date objects, starting Monday, length 6x7. */
function buildMonthGrid(ym: string): Date[][] {
  const { year, month0 } = parseYearMonth(ym);
  const firstOfMonth = new Date(year, month0, 1);
  // 0=Sun..6=Sat → convert to 0=Mon..6=Sun
  const weekday = (firstOfMonth.getDay() + 6) % 7;
  // Start at Monday of the week that contains the 1st
  const start = new Date(year, month0, 1 - weekday);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function MonthlyReservationsCalendar<R extends MiniReservation>({
  reservations,
  month,
  onMonthChange,
  onDayClick,
  onReservationClick,
  statusColors = DEFAULT_STATUS_COLORS,
}: MonthlyReservationsCalendarProps<R>) {
  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const { year, month0 } = parseYearMonth(month);
  const todayIso = toIsoDate(new Date());

  // Group reservations by reservation_date
  const byDate = useMemo(() => {
    const map: Record<string, R[]> = {};
    for (const r of reservations) {
      if (!map[r.reservation_date]) map[r.reservation_date] = [];
      map[r.reservation_date].push(r);
    }
    // Sort each day's reservations by time
    Object.values(map).forEach(list => list.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time)));
    return map;
  }, [reservations]);

  const monthLabel = formatMonthYear(month);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(shiftMonth(month, -1))} title="Mes anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(shiftMonth(month, 1))} title="Mes siguiente">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            const now = new Date();
            onMonthChange(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
          }}>Hoy</Button>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/50 border-b">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-[11px] font-semibold text-center py-1.5 text-muted-foreground">{d}</div>
          ))}
        </div>
        {/* Weeks */}
        <div className="grid grid-cols-7 grid-rows-6 auto-rows-fr">
          {weeks.flat().map((d, idx) => {
            const iso = toIsoDate(d);
            const inMonth = d.getMonth() === month0 && d.getFullYear() === year;
            const isToday = iso === todayIso;
            const dayList = byDate[iso] || [];
            const visible = dayList.slice(0, 3);
            const hidden = dayList.length - visible.length;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onDayClick?.(iso, dayList)}
                className={cn(
                  'min-h-[100px] border-r border-b p-1.5 text-left align-top hover:bg-muted/40 transition-colors',
                  !inMonth && 'bg-muted/20 text-muted-foreground/60',
                  isToday && 'ring-2 ring-primary ring-inset bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn('text-[11px] font-semibold', isToday && 'text-primary')}>{d.getDate()}</span>
                  {dayList.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground bg-background border rounded-full px-1.5 leading-tight">{dayList.length}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {visible.map(r => {
                    const clientName = r.clients?.full_name || r.walkin_client_name || 'Cliente';
                    const color = statusColors[r.status] || 'bg-muted';
                    return (
                      <div
                        key={r.id}
                        className={cn('rounded px-1 py-0.5 text-[10px] leading-tight truncate', color)}
                        title={`${r.reservation_time.slice(0, 5)} · ${clientName} · ${r.service_type}`}
                        onClick={onReservationClick ? (e) => { e.stopPropagation(); onReservationClick(r); } : undefined}
                      >
                        <span className="font-medium">{r.reservation_time.slice(0, 5)}</span>
                        <span className="ml-1">{clientName}</span>
                      </div>
                    );
                  })}
                  {hidden > 0 && (
                    <div className="text-[10px] text-muted-foreground pl-1">+ {hidden} más</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MonthlyReservationsCalendar;
