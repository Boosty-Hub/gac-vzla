import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, List, BarChart2, PieChart as PieIcon, Target, ChevronUp, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardWidget, WidgetType, getField, getSource, getColorHex } from './widgetSchema';
import { widgetPrefKey, type DashboardLayoutApi } from '@/hooks/useDashboardLayout';

interface Props {
  widget: DashboardWidget;
  globalFilters: { fechaDesde?: string; fechaHasta?: string; dealershipId?: string };
  canEdit: boolean;
  dealershipNames: Map<string, string>;
  statusLabels: Map<string, string>;
  sourceLabels: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Preferencias del usuario. El tipo guardado en `dashboard_widgets` lo define el admin y
   * es el que ven todos; esto lo pisa SOLO para quien lo haya cambiado. Así uno puede
   * mirar el mismo widget como lista sin cambiárselo al resto.
   */
  layout: DashboardLayoutApi;
  /** Claves de todos los widgets, en su orden por defecto — para poder moverlos. */
  allKeys: string[];
}

/** Clave con la que este widget guarda su preferencia, distinta de los gráficos fijos. */
const VIEW_BUTTONS: { value: WidgetType; icon: typeof List; title: string }[] = [
  { value: 'kpi',  icon: Target,    title: 'Indicador' },
  { value: 'list', icon: List,      title: 'Lista de conteos' },
  { value: 'bar',  icon: BarChart2, title: 'Gráfico de barras' },
  { value: 'pie',  icon: PieIcon,   title: 'Gráfico de torta' },
];

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

export default function DynamicWidget({ widget, globalFilters, canEdit, dealershipNames, statusLabels, sourceLabels, onEdit, onDelete, layout, allKeys }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Memoizado para que la identidad sea estable y el efecto de carga pueda depender de él
  // sin volver a consultar en cada render.
  const sourceDef = useMemo(() => getSource(widget.source_table), [widget.source_table]);
  const groupField = widget.group_by ? getField(widget.source_table, widget.group_by) : null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Solo las columnas necesarias. Cuáles son depende de la fuente: `created_at` y
      // `dealership_id` estaban clavados, y `dealership_id` no existe en clients ni en
      // vehicles — pedirlo ahí devuelve error y el widget queda en cero sin explicación.
      const cols: string[] = ['id', sourceDef.dateColumn];
      if (sourceDef.dealershipColumn) cols.push(sourceDef.dealershipColumn);
      (sourceDef.relations || []).forEach(rel => cols.push(rel));

      const addFieldCols = (key: string) => {
        const def = getField(widget.source_table, key);
        // Estos dos no son columnas: uno se deduce de un texto libre, el otro viaja en la
        // relación que ya se agregó arriba.
        if (def?.type === 'brand_extract') { if (!cols.includes('model_interest')) cols.push('model_interest'); return; }
        if (def?.type === 'model_brand') return;
        if (!cols.includes(`"${key}"`)) cols.push(`"${key}"`);
      };
      if (widget.group_by) addFieldCols(widget.group_by);
      Object.keys(widget.filters || {}).forEach(addFieldCols);

      let q: any = supabase.from(widget.source_table).select(cols.join(','));

      // Global filters
      if (globalFilters.fechaDesde) q = q.gte(sourceDef.dateColumn, globalFilters.fechaDesde);
      if (globalFilters.fechaHasta) q = q.lte(sourceDef.dateColumn, globalFilters.fechaHasta + 'T23:59:59');
      if (sourceDef.dealershipColumn && globalFilters.dealershipId && globalFilters.dealershipId !== 'todos') {
        q = q.eq(sourceDef.dealershipColumn, globalFilters.dealershipId);
      }

      // Widget-specific filters
      Object.entries(widget.filters || {}).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return;
        if (getField(widget.source_table, k)?.type === 'brand_extract') return; // handled client-side
        if (Array.isArray(v)) q = q.in(k, v);
        else q = q.eq(k, v);
      });

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        console.error('Widget query error', widget.title, error);
        setRows([]);
      } else {
        setRows((data as any[]) || []);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [widget, sourceDef, globalFilters.fechaDesde, globalFilters.fechaHasta, globalFilters.dealershipId]);

  // La etiqueta se resuelve por TIPO de campo, no por nombre de columna. `status` existe
  // en prospectos y en reservas con valores distintos: mapear por nombre etiquetaba una
  // reserva "completada" con el catálogo de estados de prospecto.
  const labelForGroup = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'Sin valor';
    const v = String(value);
    switch (groupField?.type) {
      case 'fk_dealership': return dealershipNames.get(v) || v;
      case 'fk_status':     return statusLabels.get(v) || v;
      case 'fk_source':     return sourceLabels.get(v) || v;
      case 'boolean':       return v === 'true' || v === 't' || v === '1' ? 'Sí' : 'No';
      default: {
        const opt = groupField?.options?.find(o => o.value === v);
        return opt ? opt.label : v;
      }
    }
  };

  const extractBrand = (modelInterest: unknown): string | null => {
    if (!modelInterest) return null;
    const parts = String(modelInterest).split(' ');
    return ['GAC','DFSK','SHINERAY'].includes(parts[0]) ? parts[0] : null;
  };

  // Apply client-side brand filter & brand-aware grouping
  const processedRows = useMemo(() => {
    let r = rows;
    const brandKey = getSource(widget.source_table).fields.find(f => f.type === 'brand_extract')?.key;
    const brandFilter = brandKey ? ((widget.filters || {})[brandKey] as string | string[] | undefined) : undefined;
    if (brandFilter && (Array.isArray(brandFilter) ? brandFilter.length > 0 : brandFilter)) {
      const allowed = Array.isArray(brandFilter) ? brandFilter : [brandFilter];
      r = r.filter(row => {
        const b = extractBrand(row.model_interest);
        return b && allowed.includes(b);
      });
    }
    return r;
  }, [rows, widget.filters, widget.source_table]);

  const aggregated = useMemo(() => {
    if (!widget.group_by) {
      return [{ name: widget.title, value: processedRows.length }];
    }
    const map = new Map<string, number>();
    processedRows.forEach(row => {
      let key: unknown;
      if (groupField?.type === 'brand_extract') key = extractBrand(row.model_interest) || 'Sin marca';
      // La marca real viaja en la relación, no en una columna de la tabla.
      else if (groupField?.type === 'model_brand') key = row.vehicle_models?.brand;
      else key = (row as any)[widget.group_by!];
      const k = key === null || key === undefined || key === '' ? '__empty__' : String(key);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([k, v]) => ({
        name: k === '__empty__' ? 'Sin valor' : labelForGroup(k),
        value: v,
      }))
      .sort((a, b) => b.value - a.value);
  }, [processedRows, widget.group_by, groupField]);

  const total = processedRows.length;
  const colorHex = getColorHex(widget.color);

  // Tipo efectivo: lo que el usuario eligió, o el que dejó el admin si nunca lo tocó.
  // Sin `group_by` no hay categorías que listar ni repartir, así que ese widget se queda
  // como KPI y solo se puede mover.
  const prefKey = widgetPrefKey(widget.id);
  const pref = layout.viewOf(prefKey);
  const canSwitch = !!widget.group_by;
  const viewType: WidgetType = !canSwitch
    ? widget.widget_type
    : pref === 'default' ? widget.widget_type : (pref as WidgetType);

  const ordered = layout.order(allKeys);
  const pos = ordered.indexOf(prefKey);
  const IconCmp = (widget.icon && (Icons as any)[widget.icon]) || Icons.Activity;

  const colSpan =
    widget.size === 'sm' ? 'col-span-1' :
    widget.size === 'lg' ? 'col-span-1 sm:col-span-2 lg:col-span-3' :
    'col-span-1 sm:col-span-2';

  return (
    <Card className={cn('gac-shadow group relative', colSpan)}>
      {/* La barra de vista/orden NO está detrás de `canEdit`: cambiar cómo mirás un widget
          y dónde lo tenés es tuyo y no altera el widget para nadie más. Editarlo y
          borrarlo sí siguen siendo del admin. */}
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10 bg-background/90 rounded-md px-0.5">
        {canSwitch && VIEW_BUTTONS.map(b => {
          const B = b.icon;
          return (
            <Button
              key={b.value} size="sm" variant="ghost"
              className={cn('h-6 w-6 p-0', viewType === b.value && 'bg-primary/10 text-primary')}
              title={b.title}
              onClick={() => layout.setView(prefKey, b.value === widget.widget_type ? 'default' : b.value as never)}
            >
              <B className="w-3 h-3" />
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Mover a la izquierda"
          disabled={pos <= 0} onClick={() => layout.move(prefKey, -1, allKeys)}>
          <ChevronUp className="w-3 h-3 -rotate-90" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Mover a la derecha"
          disabled={pos < 0 || pos >= ordered.length - 1} onClick={() => layout.move(prefKey, 1, allKeys)}>
          <ChevronDown className="w-3 h-3 -rotate-90" />
        </Button>
        {canEdit && (
          <>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit} title="Editar widget"><Pencil className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={onDelete} title="Eliminar widget"><Trash2 className="w-3 h-3" /></Button>
          </>
        )}
      </div>
      <CardContent className="p-3 sm:p-4">
        {viewType === 'kpi' ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: colorHex + '22' }}>
              <IconCmp className="w-5 h-5" style={{ color: colorHex }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{widget.title}</p>
              <p className="text-2xl font-bold leading-tight" style={{ color: colorHex }}>
                {loading ? '…' : total.toLocaleString('es-VE')}
              </p>
              {widget.description && <p className="text-[10px] text-muted-foreground truncate">{widget.description}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <IconCmp className="w-3.5 h-3.5 shrink-0" style={{ color: colorHex }} />
                <p className="text-xs font-semibold truncate">{widget.title}</p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">{total}</Badge>
            </div>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Cargando…</div>
            ) : aggregated.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">Sin datos</div>
            ) : viewType === 'list' ? (
              // Lista de conteos: "Vendedores: Julio 3, Nacarid 2, Elsy 1". Pedida
              // explicitamente COMO LISTA, no como grafico — por eso no lleva barra de
              // proporcion detras: eso volveria a leerse como un grafico de barras.
              // `aggregated` ya viene ordenado de mayor a menor.
              <ul className="max-h-[200px] overflow-y-auto divide-y divide-border/60">
                {aggregated.map((row, i) => (
                  <li key={row.name} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <span className="text-xs truncate" title={row.name}>{row.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className="text-sm font-bold tabular-nums" style={{ color: colorHex }}>
                        {row.value.toLocaleString('es-VE')}
                      </span>
                      {/* El porcentaje se calcula sobre el total YA filtrado, que es el
                          mismo numero del badge de arriba: los dos tienen que cerrar. */}
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {total > 0 ? `${Math.round((row.value / total) * 100)}%` : '0%'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : viewType === 'bar' ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={aggregated} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="value" fill={colorHex} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={aggregated} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.value}`} labelLine={false}>
                    {aggregated.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {widget.description && <p className="text-[10px] text-muted-foreground text-center">{widget.description}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
