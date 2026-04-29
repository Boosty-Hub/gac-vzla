import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, GripVertical } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardWidget, getField, getSource, getColorHex } from './widgetSchema';

interface Props {
  widget: DashboardWidget;
  globalFilters: { fechaDesde?: string; fechaHasta?: string; dealershipId?: string };
  canEdit: boolean;
  dealershipNames: Map<string, string>;
  statusLabels: Map<string, string>;
  sourceLabels: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
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

export default function DynamicWidget({ widget, globalFilters, canEdit, dealershipNames, statusLabels, sourceLabels, onEdit, onDelete }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const sourceDef = getSource(widget.source_table);
  const groupField = widget.group_by ? getField(widget.source_table, widget.group_by) : null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Always fetch only needed columns. For brand_extract group_by, we need model_interest.
      const cols: string[] = ['id', 'created_at', 'dealership_id'];
      if (widget.group_by) {
        if (widget.group_by === 'brand') cols.push('model_interest');
        else cols.push(`"${widget.group_by}"`);
      }
      // Add filter columns
      Object.keys(widget.filters || {}).forEach(k => {
        if (k === 'brand') { if (!cols.includes('model_interest')) cols.push('model_interest'); }
        else if (!cols.includes(`"${k}"`)) cols.push(`"${k}"`);
      });

      let q: any = supabase.from(widget.source_table).select(cols.join(','));

      // Global filters
      if (globalFilters.fechaDesde) q = q.gte('created_at', globalFilters.fechaDesde);
      if (globalFilters.fechaHasta) q = q.lte('created_at', globalFilters.fechaHasta + 'T23:59:59');
      if (globalFilters.dealershipId && globalFilters.dealershipId !== 'todos') {
        q = q.eq('dealership_id', globalFilters.dealershipId);
      }

      // Widget-specific filters
      Object.entries(widget.filters || {}).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return;
        if (k === 'brand') return; // handled client-side
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
  }, [widget, globalFilters.fechaDesde, globalFilters.fechaHasta, globalFilters.dealershipId]);

  const labelForGroup = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return 'Sin valor';
    const v = String(value);
    if (key === 'dealership_id') return dealershipNames.get(v) || v;
    if (key === 'status') return statusLabels.get(v) || v;
    if (key === 'source') return sourceLabels.get(v) || v;
    if (key === 'test_drive') return v === 'true' || v === 't' || v === '1' ? 'Sí' : 'No';
    const opt = groupField?.options?.find(o => o.value === v);
    return opt ? opt.label : v;
  };

  const extractBrand = (modelInterest: unknown): string | null => {
    if (!modelInterest) return null;
    const parts = String(modelInterest).split(' ');
    return ['GAC','DFSK','SHINERAY'].includes(parts[0]) ? parts[0] : null;
  };

  // Apply client-side brand filter & brand-aware grouping
  const processedRows = useMemo(() => {
    let r = rows;
    const brandFilter = (widget.filters || {})['brand'] as string | string[] | undefined;
    if (brandFilter && (Array.isArray(brandFilter) ? brandFilter.length > 0 : brandFilter)) {
      const allowed = Array.isArray(brandFilter) ? brandFilter : [brandFilter];
      r = r.filter(row => {
        const b = extractBrand(row.model_interest);
        return b && allowed.includes(b);
      });
    }
    return r;
  }, [rows, widget.filters]);

  const aggregated = useMemo(() => {
    if (!widget.group_by) {
      return [{ name: widget.title, value: processedRows.length }];
    }
    const map = new Map<string, number>();
    processedRows.forEach(row => {
      let key: unknown;
      if (widget.group_by === 'brand') key = extractBrand(row.model_interest) || 'Sin marca';
      else key = (row as any)[widget.group_by!];
      const k = key === null || key === undefined || key === '' ? '__empty__' : String(key);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([k, v]) => ({
        name: k === '__empty__' ? 'Sin valor' : labelForGroup(widget.group_by!, k),
        value: v,
      }))
      .sort((a, b) => b.value - a.value);
  }, [processedRows, widget.group_by]);

  const total = processedRows.length;
  const colorHex = getColorHex(widget.color);
  const IconCmp = (widget.icon && (Icons as any)[widget.icon]) || Icons.Activity;

  const colSpan =
    widget.size === 'sm' ? 'col-span-1' :
    widget.size === 'lg' ? 'col-span-1 sm:col-span-2 lg:col-span-3' :
    'col-span-1 sm:col-span-2';

  return (
    <Card className={cn('gac-shadow group relative', colSpan)}>
      {canEdit && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onEdit} title="Editar widget"><Pencil className="w-3 h-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={onDelete} title="Eliminar widget"><Trash2 className="w-3 h-3" /></Button>
        </div>
      )}
      <CardContent className="p-3 sm:p-4">
        {widget.widget_type === 'kpi' ? (
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
            ) : widget.widget_type === 'bar' ? (
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
