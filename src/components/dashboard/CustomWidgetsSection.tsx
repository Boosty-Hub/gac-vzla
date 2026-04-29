import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, BarChart2, CalendarDays, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { useProspectSources } from '@/hooks/useProspectSources';
import { useSalespersons } from '@/hooks/useSalespersons';
import DynamicWidget from './DynamicWidget';
import WidgetEditor from './WidgetEditor';
import { DashboardWidget } from './widgetSchema';
import { cn } from '@/lib/utils';

interface Props {
  dealerships: { id: string; name: string }[];
}

export default function CustomWidgetsSection({ dealerships }: Props) {
  const { hasPermission, role } = useAuth();
  const isAdmin = role?.name?.toLowerCase() === 'admin' || role?.name?.toLowerCase() === 'superadmin';
  const canEdit = isAdmin;

  const { statuses } = useProspectStatuses();
  const { sources } = useProspectSources();
  const { salespersons } = useSalespersons();

  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);

  // Global filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [dealershipId, setDealershipId] = useState('todos');
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWidgets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('dashboard_widgets' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) console.error(error);
    setWidgets(((data as any[]) || []) as DashboardWidget[]);
    setLoading(false);
  };

  useEffect(() => { fetchWidgets(); }, []);

  const dealershipNames = useMemo(() => new Map(dealerships.map(d => [d.id, d.name])), [dealerships]);
  const statusLabels = useMemo(() => new Map(statuses.map(s => [s.name, s.label])), [statuses]);
  const sourceLabels = useMemo(() => new Map(sources.map(s => [s.value, s.label])), [sources]);

  const applyThisMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setFechaDesde(new Date(y, m, 1).toISOString().slice(0, 10));
    setFechaHasta(new Date(y, m + 1, 0).toISOString().slice(0, 10));
  };
  const applyLastMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setFechaDesde(new Date(y, m - 1, 1).toISOString().slice(0, 10));
    setFechaHasta(new Date(y, m, 0).toISOString().slice(0, 10));
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from('dashboard_widgets' as any).delete().eq('id', deletingId);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Widget eliminado');
    setDeletingId(null);
    fetchWidgets();
  };

  const globalFilters = { fechaDesde, fechaHasta, dealershipId };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 items-center justify-between">
        <div className="flex flex-wrap gap-1.5 items-center">
        <Select value={dealershipId} onValueChange={setDealershipId}>
          <SelectTrigger className="h-8 text-xs w-[180px] shrink-0"><SelectValue placeholder="Concesionario" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los concesionarios</SelectItem>
            {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs shrink-0 gap-1.5", (fechaDesde || fechaHasta) && "border-primary text-primary")}>
              <CalendarDays className="w-3.5 h-3.5" />
              {fechaDesde || fechaHasta
                ? `${fechaDesde ? new Date(fechaDesde + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '…'} – ${fechaHasta ? new Date(fechaHasta + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '…'}`
                : 'Rango de fechas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 space-y-3" align="start">
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={applyThisMonth}>Este mes</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={applyLastMonth}>Mes pasado</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Desde</span>
                <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Hasta</span>
                <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            {(fechaDesde || fechaHasta) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full text-muted-foreground" onClick={() => { setFechaDesde(''); setFechaHasta(''); }}>
                Quitar rango
              </Button>
            )}
          </PopoverContent>
        </Popover>
        {(fechaDesde || fechaHasta || dealershipId !== 'todos') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground shrink-0 gap-1" onClick={() => { setFechaDesde(''); setFechaHasta(''); setDealershipId('todos'); }}>
            <X className="w-3 h-3" />Limpiar
          </Button>
        )}
        </div>
        {canEdit && (
          <Button size="sm" className="gac-gradient h-8 text-xs gap-1 shrink-0" onClick={() => { setEditingWidget(null); setEditorOpen(true); }}>
            <Plus className="w-3.5 h-3.5" />Nuevo widget
          </Button>
        )}
      </div>

      {loading ? (
        <Card className="gac-shadow"><CardContent className="p-8 text-center text-xs text-muted-foreground">Cargando widgets…</CardContent></Card>
      ) : widgets.length === 0 ? (
        <Card className="gac-shadow">
          <CardContent className="p-8 text-center space-y-2">
            <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Aún no hay widgets personalizados.</p>
            {canEdit && (
              <Button size="sm" className="gac-gradient gap-1 mt-2" onClick={() => { setEditingWidget(null); setEditorOpen(true); }}>
                <Plus className="w-3.5 h-3.5" />Crear el primero
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {widgets.map(w => (
            <DynamicWidget
              key={w.id}
              widget={w}
              globalFilters={globalFilters}
              canEdit={canEdit}
              dealershipNames={dealershipNames}
              statusLabels={statusLabels}
              sourceLabels={sourceLabels}
              onEdit={() => { setEditingWidget(w); setEditorOpen(true); }}
              onDelete={() => setDeletingId(w.id)}
            />
          ))}
        </div>
      )}

      <WidgetEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        widget={editingWidget}
        onSaved={fetchWidgets}
        dealerships={dealerships}
        statuses={statuses.map(s => ({ name: s.name, label: s.label }))}
        sources={sources.map(s => ({ value: s.value, label: s.label }))}
        salespersons={salespersons.map(s => ({ id: s.id, name: s.name }))}
      />

      <AlertDialog open={!!deletingId} onOpenChange={open => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este widget?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
