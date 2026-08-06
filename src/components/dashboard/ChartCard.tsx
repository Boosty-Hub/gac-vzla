import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { List, BarChart2, PieChart as PieIcon, LayoutGrid, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChartView, DashboardLayoutApi } from '@/hooks/useDashboardLayout';

export interface Series {
  name: string;
  value: number;
}

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(45, 90%, 50%)',
  'hsl(0, 70%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 80%, 55%)',
];

const VIEW_BUTTONS: { value: ChartView; icon: LucideIcon; title: string }[] = [
  { value: 'default', icon: LayoutGrid, title: 'Vista original' },
  { value: 'list',    icon: List,       title: 'Lista de conteos' },
  { value: 'bar',     icon: BarChart2,  title: 'Gráfico de barras' },
  { value: 'pie',     icon: PieIcon,    title: 'Gráfico de torta' },
];

interface Props {
  /** Clave estable con la que se guarda la preferencia. No cambiarla: se pierde el orden. */
  chartKey: string;
  title: string;
  icon: LucideIcon;
  iconClass?: string;
  /**
   * Serie canónica nombre/valor. Es lo que se dibuja en lista, barra y torta. Cuando el
   * gráfico no se puede reducir a un solo número por categoría (una tendencia diaria, unas
   * barras apiladas), se pasa vacía y la tarjeta ofrece solo la vista original.
   */
  series?: Series[];
  /** La vista de siempre: torta, línea, ranking con medallas, lo que ya había. */
  children: ReactNode;
  /** Controles propios de la tarjeta (los selectores de filtro que ya tenía). */
  headerExtra?: ReactNode;
  layout: DashboardLayoutApi;
  /** Todas las claves del tablero, en su orden por defecto — para saber si se puede mover. */
  allKeys: string[];
  color?: string;
  className?: string;
  emptyText?: string;
  /**
   * El porcentaje sobre el total solo tiene sentido cuando los valores se suman. Para un
   * promedio (la satisfacción, por ejemplo) sumarlos no significa nada, así que se apaga.
   */
  showPercent?: boolean;
  /** Sufijo del valor en la lista, ej. "/5". */
  unit?: string;
}

/**
 * Envuelve un gráfico del tablero y le agrega lo que el usuario pidió: elegir cómo se ve
 * (original / lista / barras / torta) y moverlo de lugar, con la elección guardada.
 *
 * La vista original NO se reemplaza. Varias tarjetas muestran más que un conteo — la
 * conversión por vendedor, la satisfacción por concesionario, la tendencia diaria — y
 * forzarlas a nombre+número perdería información. La vista original es una opción más, y
 * es la que viene puesta.
 */
export default function ChartCard({
  chartKey, title, icon: Icon, iconClass, series, children, headerExtra,
  layout, allKeys, color = 'hsl(var(--primary))', className, emptyText = 'Sin datos',
  showPercent = true, unit = '',
}: Props) {
  const canSwitch = !!series && series.length > 0;
  const view: ChartView = canSwitch ? layout.viewOf(chartKey) : 'default';
  const ordered = layout.order(allKeys);
  const pos = ordered.indexOf(chartKey);
  const total = ordered.length;

  const data = series || [];
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const totalValue = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <Card className={cn('gac-shadow', className)}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-display flex items-center gap-2 min-w-0">
            <Icon className={cn('w-4 h-4 shrink-0', iconClass || 'text-muted-foreground')} />
            <span className="truncate">{title}</span>
          </CardTitle>
          <div className="flex items-center gap-0.5 shrink-0">
            {canSwitch && VIEW_BUTTONS.map(b => {
              const B = b.icon;
              return (
                <Button
                  key={b.value}
                  size="icon"
                  variant="ghost"
                  className={cn('h-6 w-6', view === b.value && 'bg-primary/10 text-primary')}
                  title={b.title}
                  onClick={() => layout.setView(chartKey, b.value)}
                >
                  <B className="w-3 h-3" />
                </Button>
              );
            })}
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button
              size="icon" variant="ghost" className="h-6 w-6"
              title="Subir" disabled={pos <= 0}
              onClick={() => layout.move(chartKey, -1, allKeys)}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost" className="h-6 w-6"
              title="Bajar" disabled={pos < 0 || pos >= total - 1}
              onClick={() => layout.move(chartKey, 1, allKeys)}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {headerExtra}
      </CardHeader>

      <CardContent className={view === 'default' ? undefined : 'pt-0'}>
        {view === 'default' ? children : data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">{emptyText}</p>
        ) : view === 'list' ? (
          // Sin barra de proporción detrás, a propósito: el pedido fue explícitamente
          // "tipo lista, NO en gráfico de barras".
          <ul className="divide-y divide-border/60">
            {sorted.map((row, i) => (
              <li key={row.name} className="flex items-center justify-between gap-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                  <span className="text-xs truncate" title={row.name}>{row.name}</span>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-sm font-bold tabular-nums" style={{ color }}>
                    {row.value.toLocaleString('es-VE')}{unit}
                  </span>
                  {showPercent && (
                    <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">
                      {totalValue > 0 ? `${Math.round((row.value / totalValue) * 100)}%` : '0%'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : view === 'bar' ? (
          <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 34)}>
            <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width={180} height={170}>
              <PieChart>
                <Pie data={sorted} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={68} innerRadius={36} paddingAngle={2}>
                  {sorted.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center sm:flex-col sm:gap-1">
              {sorted.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground truncate max-w-[160px]">{s.name}</span>
                  <span className="font-semibold ml-auto">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
