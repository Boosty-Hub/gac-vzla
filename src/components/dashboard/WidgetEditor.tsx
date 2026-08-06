import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveModal, ResponsiveModalHeader, ResponsiveModalTitle, ResponsiveModalFooter } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { DashboardWidget, SOURCES, WIDGET_TYPES, ICON_OPTIONS, COLOR_OPTIONS, getSource, requiresGroupBy, FieldDef, WidgetType, SourceTable } from './widgetSchema';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget: DashboardWidget | null;
  onSaved: () => void;
  dealerships: { id: string; name: string }[];
  statuses: { name: string; label: string }[];
  sources: { value: string; label: string }[];
  salespersons: { id: string; name: string }[];
}

export default function WidgetEditor({ open, onOpenChange, widget, onSaved, dealerships, statuses, sources, salespersons }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [widgetType, setWidgetType] = useState<WidgetType>('kpi');
  const [sourceTable, setSourceTable] = useState<SourceTable>('prospects');
  const [groupBy, setGroupBy] = useState<string>('__none');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [color, setColor] = useState('primary');
  const [icon, setIcon] = useState('Target');
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (widget) {
        setTitle(widget.title);
        setDescription(widget.description || '');
        setWidgetType(widget.widget_type);
        setSourceTable(widget.source_table);
        setGroupBy(widget.group_by || '__none');
        setFilters((widget.filters || {}) as Record<string, string[]>);
        setColor(widget.color || 'primary');
        setIcon(widget.icon || 'Target');
        setSize(widget.size || 'md');
      } else {
        setTitle(''); setDescription(''); setWidgetType('kpi'); setSourceTable('prospects');
        setGroupBy('__none'); setFilters({}); setColor('primary'); setIcon('Target'); setSize('md');
      }
    }
  }, [open, widget]);

  const sourceDef = getSource(sourceTable);
  const groupableFields = sourceDef.fields.filter(f => f.groupable);
  const filterableFields = sourceDef.fields.filter(f => f.filterable && f.type !== 'date');

  const fieldOptions = (f: FieldDef): { value: string; label: string }[] => {
    if (f.options) return f.options;
    if (f.type === 'fk_dealership') return dealerships.map(d => ({ value: d.id, label: d.name }));
    if (f.type === 'fk_status') return statuses.map(s => ({ value: s.name, label: s.label }));
    if (f.type === 'fk_source') return sources.map(s => ({ value: s.value, label: s.label }));
    if (f.type === 'fk_salesperson') return salespersons.map(s => ({ value: s.name, label: s.name }));
    if (f.type === 'boolean') return [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }];
    return [];
  };

  const toggleFilter = (key: string, value: string) => {
    setFilters(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      const out = { ...prev };
      if (next.length === 0) delete out[key]; else out[key] = next;
      return out;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('El título es requerido'); return; }
    if (requiresGroupBy(widgetType) && (!groupBy || groupBy === '__none')) {
      // Vale igual para la lista: sin campo de agrupación no hay nada que enumerar,
      // solo un total suelto — y para eso ya está el KPI.
      toast.error('Elegí un campo de agrupación para este tipo de widget');
      return;
    }
    setSaving(true);
    // Boolean filters → coerce to real booleans
    const cleanFilters: Record<string, unknown> = {};
    Object.entries(filters).forEach(([k, vs]) => {
      if (!vs || vs.length === 0) return;
      const fdef = sourceDef.fields.find(f => f.key === k);
      if (fdef?.type === 'boolean') {
        const bools = vs.map(v => v === 'true');
        cleanFilters[k] = bools.length === 1 ? bools[0] : bools;
      } else {
        cleanFilters[k] = vs.length === 1 ? vs[0] : vs;
      }
    });

    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      widget_type: widgetType,
      source_table: sourceTable,
      aggregation: 'count',
      group_by: requiresGroupBy(widgetType) ? (groupBy === '__none' ? null : groupBy) : null,
      filters: cleanFilters,
      color,
      icon,
      size,
    };

    let error;
    if (widget) {
      ({ error } = await supabase.from('dashboard_widgets' as any).update(payload).eq('id', widget.id));
    } else {
      payload.sort_order = 999;
      ({ error } = await supabase.from('dashboard_widgets' as any).insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Error al guardar: ' + error.message); console.error(error); return; }
    toast.success(widget ? 'Widget actualizado' : 'Widget creado');
    onOpenChange(false);
    onSaved();
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <ResponsiveModalHeader>
        <ResponsiveModalTitle className="font-display text-base">
          {widget ? 'Editar Widget' : 'Nuevo Widget'}
        </ResponsiveModalTitle>
      </ResponsiveModalHeader>
      <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Prospectos por género" className="h-9 text-xs" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Descripción (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Subtítulo o explicación" className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de visualización *</Label>
            <Select value={widgetType} onValueChange={v => setWidgetType(v as WidgetType)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WIDGET_TYPES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fuente de datos *</Label>
            <Select
              value={sourceTable}
              onValueChange={v => {
                // Agrupación y filtros son columnas de la fuente anterior: al cambiarla
                // quedarían apuntando a campos que la nueva tabla no tiene, y el widget
                // se guardaría roto. Se limpian.
                setSourceTable(v as SourceTable);
                setGroupBy('__none');
                setFilters({});
              }}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {requiresGroupBy(widgetType) && (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Agrupar por *</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar campo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin agrupar</SelectItem>
                  {groupableFields.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.hex }} />
                      <span>{c.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ícono</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map(o => {
                  const I = o.icon;
                  return (
                    <SelectItem key={o.value} value={o.value}>
                      <div className="flex items-center gap-2">
                        <I className="w-3.5 h-3.5" />
                        <span>{o.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Tamaño</Label>
            <div className="flex gap-2">
              {[{ v: 'sm', l: 'Pequeño' }, { v: 'md', l: 'Mediano' }, { v: 'lg', l: 'Grande' }].map(s => (
                <Button key={s.v} type="button" size="sm" variant={size === s.v ? 'default' : 'outline'} className="h-8 text-xs flex-1" onClick={() => setSize(s.v as any)}>{s.l}</Button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs font-semibold">Filtros (opcional)</Label>
          <p className="text-[10px] text-muted-foreground">Solo se contabilizan los registros que cumplen TODOS los filtros activos.</p>
          <div className="space-y-2">
            {filterableFields.map(f => {
              const opts = fieldOptions(f);
              if (opts.length === 0) return null;
              const active = filters[f.key] || [];
              return (
                <div key={f.key} className="border rounded-md p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-medium">{f.label}</Label>
                    {active.length > 0 && (
                      <Button type="button" size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={() => setFilters(prev => { const o = { ...prev }; delete o[f.key]; return o; })}>
                        <X className="w-2.5 h-2.5" />Limpiar
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {opts.map(o => {
                      const isOn = active.includes(o.value);
                      return (
                        <Badge
                          key={o.value}
                          variant={isOn ? 'default' : 'outline'}
                          className="text-[10px] cursor-pointer hover:opacity-80"
                          onClick={() => toggleFilter(f.key, o.value)}
                        >
                          {o.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ResponsiveModalFooter className="flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
        <Button onClick={handleSave} disabled={saving} className="gac-gradient w-full sm:w-auto">
          {saving ? 'Guardando…' : widget ? 'Guardar cambios' : 'Crear widget'}
        </Button>
      </ResponsiveModalFooter>
    </ResponsiveModal>
  );
}
