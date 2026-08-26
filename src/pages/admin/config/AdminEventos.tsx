import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, CalendarDays, Users, Car, DollarSign, Trophy, Link2, Copy,
  ExternalLink, X, MapPin, ClipboardList, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSalespersons } from '@/hooks/useSalespersons';
import { useProspectModels } from '@/hooks/useProspectModels';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { formatInvestment, costPerLead, costPerSale, eventDateRange } from '@/lib/eventRoi';

/**
 * Módulo de Eventos (reescrito 2026-08-26).
 *
 * Antes era un catálogo de nombres: se creaba "Expo Zulia" para que apareciera en un selector
 * de Prospectos y ahí terminaba. No respondía la única pregunta que un evento tiene que
 * responder — cuánto costó y cuánto trajo.
 *
 * Ahora cada evento guarda quién participa, qué se lleva, cuánto se invirtió, y muestra los
 * leads que entraron con ese nombre junto con su estado.
 *
 * ESPEJO, NO COPIA. Los leads NO se guardan acá ni se editan acá. Se leen de `prospects`
 * filtrando por `event_name`, que es la misma columna que escriben Prospectos, la importación
 * de Excel y el webhook de Kommo. Por eso un lead creado en Kommo aparece solo, sin que este
 * módulo toque nada, y por eso editarlo se hace donde nace: en Prospectos. Cada fila tiene su
 * enlace directo.
 *
 * Los conteos salen de la vista `prospect_event_stats`, que corre con `security_invoker`: un
 * concesionario ve su parte del evento, no la de otra sede, igual que en Prospectos.
 */

interface ProspectEvent {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  dealership_id: string | null;
  brands: string[] | null;
  exhibited_vehicles: string[] | null;
  salesperson_ids: string[] | null;
  investment: number | null;
  investment_currency: string;
  capture_form_enabled: boolean;
}

interface EventStats {
  event_id: string;
  leads_total: number;
  ganados: number;
  perdidos: number;
  en_gestion: number;
  test_drives: number;
  visitas_showroom: number;
}

interface EventLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  model_interest: string | null;
  status: string;
  salesperson: string | null;
  created_at: string;
  sold_plate: string | null;
}

const CURRENCIES = ['USD', 'VES', 'EUR'];

// La aritmética del retorno vive en `@/lib/eventRoi` y tiene pruebas: es la única parte del
// módulo que puede estar mal sin que se note, y decide dónde se pone la plata del mes.

/**
 * Lista de etiquetas editable: agregar escribiendo o eligiendo de un catálogo.
 *
 * El pedido pide explícitamente las dos formas ("puede ser una lista de selección o puede ser
 * de escritura manual") y con razón: a un evento se puede llevar una unidad que todavía no
 * está en el catálogo, y obligar a darla de alta primero frena la carga del evento.
 */
const TagList = ({
  values, onChange, options, placeholder, emptyLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  options?: string[];
  placeholder: string;
  emptyLabel: string;
}) => {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (values.some(v => v.toLowerCase() === value.toLowerCase())) { setDraft(''); return; }
    onChange([...values, value]);
    setDraft('');
  };

  const remaining = (options || []).filter(
    o => !values.some(v => v.toLowerCase() === o.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>}
        {values.map(v => (
          <Badge key={v} variant="secondary" className="text-[11px] gap-1 pr-1">
            {v}
            <button
              type="button"
              className="rounded-sm hover:bg-background/60 p-0.5"
              onClick={() => onChange(values.filter(x => x !== v))}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => add(draft)}>
          Agregar
        </Button>
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.slice(0, 24).map(o => (
            <button
              key={o}
              type="button"
              onClick={() => add(o)}
              className="text-[10px] rounded-full border px-2 py-0.5 hover:bg-muted transition-colors"
            >
              + {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminEventos = () => {
  const navigate = useNavigate();
  const { role, hasPermission } = useAuth();
  const roleName = role?.name?.toLowerCase() ?? '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const canCreate = isAdmin || hasPermission('eventos.create');
  const canEdit = isAdmin || hasPermission('eventos.edit');
  const canDelete = isAdmin || hasPermission('eventos.delete');
  // Desde dónde se abrió el módulo decide a qué Prospectos se enlaza: las dos pantallas
  // aceptan `?event_name=` y filtran sola, así que el espejo abre exactamente ese evento.
  const prospectsPath = roleName === 'concesionario' || roleName === 'vendedor'
    ? '/concesionario/prospectos'
    : '/admin/prospectos';

  const { salespersons } = useSalespersons();
  const { models, brands: catalogBrands } = useProspectModels();
  const { statuses } = useProspectStatuses();

  const [events, setEvents] = useState<ProspectEvent[]>([]);
  const [stats, setStats] = useState<Map<string, EventStats>>(new Map());
  const [dealerships, setDealerships] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProspectEvent | null>(null);

  // ------------------------------------------------------------------ formulario
  const [fName, setFName] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [fDealership, setFDealership] = useState('');
  const [fBrands, setFBrands] = useState<string[]>([]);
  const [fVehicles, setFVehicles] = useState<string[]>([]);
  const [fSalespersons, setFSalespersons] = useState<string[]>([]);
  const [fInvestment, setFInvestment] = useState('');
  const [fCurrency, setFCurrency] = useState('USD');
  const [fSortOrder, setFSortOrder] = useState('');
  const [fFormEnabled, setFFormEnabled] = useState(true);

  // ---------------------------------------------------------------------- detalle
  const [detail, setDetail] = useState<ProspectEvent | null>(null);
  const [leads, setLeads] = useState<EventLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState('todos');

  const modelOptions = useMemo(
    () => models.map(m => `${m.brand} ${m.name}`.trim()),
    [models],
  );

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const [eventsRes, statsRes] = await Promise.all([
      supabase
        .from('prospect_events')
        .select('*')
        .order('is_active', { ascending: false })
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('sort_order')
        .order('name'),
      supabase.from('prospect_event_stats').select('*'),
    ]);
    setEvents((eventsRes.data || []) as unknown as ProspectEvent[]);
    const map = new Map<string, EventStats>();
    ((statsRes.data || []) as unknown as EventStats[]).forEach(s => map.set(s.event_id, s));
    setStats(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    supabase.from('dealerships').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setDealerships((data || []) as { id: string; name: string }[]));
  }, []);

  // Los leads se piden al abrir el evento, no con la lista: son 359 filas para un solo evento
  // y nadie mira trece listas a la vez.
  const openDetail = async (ev: ProspectEvent) => {
    setDetail(ev);
    setLeads([]);
    setLeadStatusFilter('todos');
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('prospects')
      .select('id, name, phone, email, model_interest, status, salesperson, created_at, sold_plate')
      .eq('event_name', ev.name)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) { console.error(error); toast.error('No se pudieron cargar los leads del evento'); }
    setLeads((data || []) as unknown as EventLead[]);
    setLoadingLeads(false);
  };

  const resetForm = () => {
    setFName(''); setFDescription(''); setFStart(''); setFEnd(''); setFLocation('');
    setFDealership(''); setFBrands([]); setFVehicles([]); setFSalespersons([]);
    setFInvestment(''); setFCurrency('USD'); setFFormEnabled(true);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    const maxOrder = events.length > 0 ? Math.max(...events.map(e => e.sort_order || 0)) : 0;
    setFSortOrder(String(maxOrder + 10));
    setDialogOpen(true);
  };

  const openEdit = (ev: ProspectEvent) => {
    setEditing(ev);
    setFName(ev.name);
    setFDescription(ev.description || '');
    setFStart(ev.start_date || '');
    setFEnd(ev.end_date || '');
    setFLocation(ev.location || '');
    setFDealership(ev.dealership_id || '');
    setFBrands(ev.brands || []);
    setFVehicles(ev.exhibited_vehicles || []);
    setFSalespersons(ev.salesperson_ids || []);
    setFInvestment(ev.investment != null ? String(ev.investment) : '');
    setFCurrency(ev.investment_currency || 'USD');
    setFSortOrder(String(ev.sort_order ?? 0));
    setFFormEnabled(ev.capture_form_enabled);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!fName.trim()) { toast.error('El nombre del evento es requerido'); return; }
    if (fStart && fEnd && fEnd < fStart) {
      toast.error('La fecha de cierre no puede ser anterior a la de inicio');
      return;
    }
    const investment = fInvestment.trim() ? Number(fInvestment.trim()) : null;
    if (investment != null && (!Number.isFinite(investment) || investment < 0)) {
      toast.error('La inversión tiene que ser un número válido');
      return;
    }

    setSaving(true);
    const payload = {
      name: fName.trim(),
      description: fDescription.trim() || null,
      start_date: fStart || null,
      end_date: fEnd || null,
      location: fLocation.trim() || null,
      dealership_id: fDealership || null,
      brands: fBrands,
      exhibited_vehicles: fVehicles,
      salesperson_ids: fSalespersons,
      investment,
      investment_currency: fCurrency,
      capture_form_enabled: fFormEnabled,
      sort_order: parseInt(fSortOrder) || 0,
      is_active: editing ? editing.is_active : true,
    };

    // `.select('id')` no es cosmético: cuando una política RLS rechaza la fila, PostgREST
    // escribe cero filas y devuelve 204 SIN error. Sin leerlas, un usuario sin permiso vería
    // un cartel verde sobre un evento que nunca se guardó.
    const query = editing
      ? supabase.from('prospect_events').update(payload).eq('id', editing.id).select('id')
      : supabase.from('prospect_events').insert(payload).select('id');
    const { data, error } = await query;
    setSaving(false);

    if (error) {
      // El trigger corta el rename cuando el evento ya tiene leads: renombrarlo los dejaría
      // colgados de un nombre que ya no existe.
      if (error.message.includes('evento_con_leads')) {
        const count = error.message.split('evento_con_leads:')[1]?.split(/\D/)[0] || '';
        toast.error(
          `No se puede renombrar: este evento ya tiene ${count} lead(s) enlazados por su nombre. ` +
          'Creá un evento nuevo con el nombre correcto.',
        );
        return;
      }
      if (error.message.includes('prospect_events_name_key')) {
        toast.error('Ya existe un evento con ese nombre.');
        return;
      }
      console.error(error);
      toast.error(editing ? 'Error al actualizar el evento' : 'Error al crear el evento');
      return;
    }
    if (!data || data.length === 0) {
      toast.error('No se guardó: tu usuario no tiene permiso sobre Eventos. Se otorga en Configuración → Roles.');
      return;
    }

    toast.success(editing ? 'Evento actualizado' : 'Evento creado. Ya tenés su formulario de captación.');
    setDialogOpen(false);
    setEditing(null);
    fetchEvents();
  };

  const handleToggleActive = async (ev: ProspectEvent) => {
    const { data, error } = await supabase
      .from('prospect_events')
      .update({ is_active: !ev.is_active })
      .eq('id', ev.id)
      .select('id');
    if (error || !data || data.length === 0) toast.error('No se pudo actualizar el evento');
    else { toast.success(ev.is_active ? 'Evento cerrado' : 'Evento reabierto'); fetchEvents(); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase
      .from('prospect_events').delete().eq('id', deleteTarget.id).select('id');
    if (error || !data || data.length === 0) toast.error('No se pudo eliminar el evento');
    else { toast.success('Evento eliminado'); setDeleteTarget(null); fetchEvents(); }
  };

  const captureUrl = (ev: ProspectEvent) => `${window.location.origin}/captura/${ev.id}`;

  const copyCaptureUrl = async (ev: ProspectEvent) => {
    try {
      await navigator.clipboard.writeText(captureUrl(ev));
      toast.success('Enlace del formulario copiado');
    } catch {
      toast.error('No se pudo copiar. Copialo a mano desde la barra de direcciones.');
    }
  };

  const statusLabel = (name: string) =>
    statuses.find(s => s.name === name)?.label
    || name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  const visibleEvents = showInactive ? events : events.filter(e => e.is_active);

  const detailStats = detail ? stats.get(detail.id) : undefined;
  const detailSalespersons = detail
    ? salespersons.filter(s => (detail.salesperson_ids || []).includes(s.id))
    : [];
  const filteredLeads = leadStatusFilter === 'todos'
    ? leads
    : leads.filter(l => l.status === leadStatusFilter);
  // Los estados que realmente aparecen en ESTE evento. Ofrecer los doce del catálogo cuando
  // el evento tiene tres deja diez filtros que devuelven vacío.
  const leadStatusesPresent = [...new Set(leads.map(l => l.status))].sort();

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold">Eventos</h1>
          <p className="text-sm text-muted-foreground">
            Control de exhibiciones y ferias: quién participa, qué se lleva, cuánto costó y
            cuántos leads compraron.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Ver cerrados
          </label>
          {canCreate && (
            <Button size="sm" className="gac-gradient gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Nuevo Evento
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Cargando...</div>
      ) : visibleEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CalendarDays className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {events.length === 0 ? 'No hay eventos configurados' : 'No hay eventos abiertos'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {events.length === 0
                ? 'Creá el primero para empezar a medir su retorno'
                : 'Activá "Ver cerrados" para ver los que ya terminaron'}
            </p>
            {canCreate && events.length === 0 && (
              <Button size="sm" className="gac-gradient gap-1.5" onClick={openCreate}>
                <Plus className="w-4 h-4" /> Crear Evento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleEvents.map(ev => {
            const st = stats.get(ev.id);
            const leadsTotal = st?.leads_total ?? 0;
            const ganados = st?.ganados ?? 0;
            const porLead = costPerLead(ev.investment, leadsTotal);
            const porVenta = costPerSale(ev.investment, ganados);
            return (
              <Card
                key={ev.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${ev.is_active ? '' : 'opacity-70'}`}
                onClick={() => openDetail(ev)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{ev.name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 shrink-0" /> {eventDateRange(ev.start_date, ev.end_date)}
                      </p>
                      {ev.location && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" /> {ev.location}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={ev.is_active ? 'default' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {ev.is_active ? 'Abierto' : 'Cerrado'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-muted rounded-md p-1.5">
                      <p className="text-sm font-bold">{leadsTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Leads</p>
                    </div>
                    <div className="bg-muted rounded-md p-1.5">
                      <p className="text-sm font-bold text-green-700">{ganados}</p>
                      <p className="text-[10px] text-muted-foreground">Ganados</p>
                    </div>
                    <div className="bg-muted rounded-md p-1.5">
                      <p className="text-sm font-bold truncate">{formatInvestment(ev.investment, ev.investment_currency)}</p>
                      <p className="text-[10px] text-muted-foreground">Inversión</p>
                    </div>
                  </div>

                  {/* El retorno sólo se puede decir cuando hay inversión cargada. Mostrar
                      "$0 por venta" cuando nadie cargó el costo sería inventar el dato. */}
                  {ev.investment != null && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 shrink-0" />
                      {porLead != null ? `${formatInvestment(porLead, ev.investment_currency)} por lead` : 'Sin leads todavía'}
                      {porVenta != null && ` · ${formatInvestment(porVenta, ev.investment_currency)} por venta`}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-1">
                      {(ev.brands || []).slice(0, 3).map(b => (
                        <Badge key={b} variant="outline" className="text-[10px] px-1.5 py-0">{b}</Badge>
                      ))}
                      {(ev.brands || []).length > 3 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{ev.brands!.length - 3}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar" onClick={() => openEdit(ev)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setDeleteTarget(ev)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- DETALLE */}
      <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> {detail?.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{eventDateRange(detail.start_date, detail.end_date)}</span>
                {detail.location && <><span>·</span><span>{detail.location}</span></>}
                <Badge variant={detail.is_active ? 'default' : 'secondary'} className="text-[10px]">
                  {detail.is_active ? 'Abierto' : 'Cerrado'}
                </Badge>
                {canEdit && (
                  <Button size="sm" variant="outline" className="h-6 text-[11px] ml-auto" onClick={() => handleToggleActive(detail)}>
                    {detail.is_active ? 'Cerrar evento' : 'Reabrir evento'}
                  </Button>
                )}
              </div>

              {detail.description && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-md p-2">
                  {detail.description}
                </p>
              )}

              {/* MÉTRICAS + RETORNO */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <p className="text-lg font-bold">{detailStats?.leads_total ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Leads captados</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-lg font-bold text-green-700">{detailStats?.ganados ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Ganados</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-lg font-bold">{detailStats?.en_gestion ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">En gestión</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-lg font-bold text-muted-foreground">{detailStats?.perdidos ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Perdidos</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-md border p-2.5">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Inversión
                  </p>
                  <p className="text-sm font-bold">{formatInvestment(detail.investment, detail.investment_currency)}</p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" /> Costo por lead
                  </p>
                  <p className="text-sm font-bold">
                    {formatInvestment(costPerLead(detail.investment, detailStats?.leads_total), detail.investment_currency)}
                  </p>
                </div>
                <div className="rounded-md border p-2.5">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Costo por venta
                  </p>
                  <p className="text-sm font-bold">
                    {formatInvestment(costPerSale(detail.investment, detailStats?.ganados), detail.investment_currency)}
                  </p>
                </div>
              </div>

              {/* EQUIPO Y UNIDADES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Vendedores</p>
                  {detailSalespersons.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Sin vendedores asignados</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {detailSalespersons.map(s => (
                        <Badge key={s.id} variant="secondary" className="text-[10px]">{s.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Marcas</p>
                  {(detail.brands || []).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Sin marcas cargadas</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {detail.brands!.map(b => <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>)}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Vehículos exhibidos</p>
                {(detail.exhibited_vehicles || []).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Sin vehículos cargados</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {detail.exhibited_vehicles!.map(v => <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>)}
                  </div>
                )}
              </div>

              {/* FORMULARIO DE CAPTACIÓN */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-semibold flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Formulario de captación</p>
                <p className="text-[11px] text-muted-foreground">
                  {detail.capture_form_enabled
                    ? 'Los vendedores cargan leads desde este enlace. Ya viene con el evento y los vendedores de este evento cargados; el lead entra a Prospectos y sube a Kommo igual que si se cargara desde el panel.'
                    : 'El formulario está apagado: el enlace ya no acepta registros. Se prende desde Editar.'}
                </p>
                {detail.capture_form_enabled && (
                  <>
                    <code className="block text-[10px] bg-background border rounded px-2 py-1 break-all">
                      {captureUrl(detail)}
                    </code>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyCaptureUrl(detail)}>
                        <Copy className="w-3 h-3 mr-1" /> Copiar enlace
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => window.open(captureUrl(detail), '_blank')}>
                        <ExternalLink className="w-3 h-3 mr-1" /> Abrir formulario
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <Separator />

              {/* ESPEJO DE LEADS */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">
                    Leads del evento
                    <span className="text-muted-foreground font-normal"> · {filteredLeads.length} de {leads.length}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                      <SelectTrigger className="h-7 text-[11px] w-[170px]">
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos los estados</SelectItem>
                        {leadStatusesPresent.map(s => (
                          <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => navigate(`${prospectsPath}?event_name=${encodeURIComponent(detail.name)}`)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" /> Ver en Prospectos
                    </Button>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Espejo de sólo lectura. Los leads se gestionan en Prospectos, que es donde
                  nacen — desde el panel o desde Kommo. Tocá una fila para abrirla ahí.
                </p>

                {loadingLeads ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Cargando leads...</p>
                ) : filteredLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    {leads.length === 0
                      ? 'Todavía no hay leads con este evento.'
                      : 'Ningún lead en ese estado.'}
                  </p>
                ) : (
                  <div className="rounded-md border divide-y max-h-[320px] overflow-y-auto">
                    {filteredLeads.map(l => (
                      <button
                        key={l.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                        onClick={() => navigate(`${prospectsPath}?event_name=${encodeURIComponent(detail.name)}`)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{l.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[l.phone, l.model_interest, l.salesperson].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {l.sold_plate && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{l.sold_plate}</Badge>
                            )}
                            <Badge
                              variant={l.status === 'ganado' ? 'default' : l.status === 'perdido' ? 'secondary' : 'outline'}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {statusLabel(l.status)}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              {new Date(l.created_at).toLocaleDateString('es-VE')}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------- CREAR / EDITAR */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {editing ? 'Editar Evento' : 'Nuevo Evento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Nombre del evento *</Label>
              <Input
                value={fName}
                onChange={e => setFName(e.target.value)}
                placeholder="Ej. Exhibición Farmatodo Baruta"
                className="h-9 text-sm"
              />
              {editing && (
                <p className="text-[10px] text-muted-foreground">
                  El nombre es lo que enlaza los leads con el evento. Si ya tiene leads, no se
                  puede renombrar: habría que crear un evento nuevo.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fecha de inicio</Label>
                <Input type="date" value={fStart} onChange={e => setFStart(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha de cierre</Label>
                <Input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Lugar</Label>
                <Input
                  value={fLocation}
                  onChange={e => setFLocation(e.target.value)}
                  placeholder="Ej. C.C. Líder, Baruta"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Concesionario responsable</Label>
                <Select value={fDealership || 'ninguno'} onValueChange={v => setFDealership(v === 'ninguno' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin asignar</SelectItem>
                    {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                value={fDescription}
                onChange={e => setFDescription(e.target.value)}
                placeholder="Notas del evento: horario del stand, acuerdos, lo que haga falta."
                className="text-sm min-h-[60px]"
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Vendedores que participan</Label>
              <p className="text-[10px] text-muted-foreground">
                Son los que va a ofrecer el formulario de captación del evento — no el listado completo.
              </p>
              <div className="rounded-md border p-2 max-h-[150px] overflow-y-auto space-y-1">
                {salespersons.length === 0 && <p className="text-[11px] text-muted-foreground">No hay vendedores activos.</p>}
                {salespersons.map(s => {
                  const checked = fSalespersons.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setFSalespersons(prev =>
                          checked ? prev.filter(x => x !== s.id) : [...prev, s.id],
                        )}
                        className="rounded border-input"
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Marcas que se llevan</Label>
              <TagList
                values={fBrands}
                onChange={setFBrands}
                options={catalogBrands}
                placeholder="Escribí una marca y Enter"
                emptyLabel="Sin marcas cargadas"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Vehículos exhibidos</Label>
              <TagList
                values={fVehicles}
                onChange={setFVehicles}
                options={modelOptions}
                placeholder="Escribí un vehículo y Enter"
                emptyLabel="Sin vehículos cargados"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Inversión</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fInvestment}
                  onChange={e => setFInvestment(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Moneda</Label>
                <Select value={fCurrency} onValueChange={setFCurrency}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Con la inversión cargada, el evento muestra el costo por lead y el costo por venta.
              Sin ella los conteos siguen, pero el retorno no se puede calcular.
            </p>

            <Separator />

            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-xs">Formulario de captación</Label>
                <p className="text-[10px] text-muted-foreground">
                  Al crear el evento queda listo un enlace para que los vendedores carguen leads
                  desde el stand. Apagalo cuando el evento termine.
                </p>
              </div>
              <Switch checked={fFormEnabled} onCheckedChange={setFFormEnabled} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Orden de aparición</Label>
              <Input
                type="number"
                value={fSortOrder}
                onChange={e => setFSortOrder(e.target.value)}
                placeholder="100"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Número más bajo aparece primero en el selector de Prospectos</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" className="gac-gradient" onClick={handleSave} disabled={saving}>
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : editing ? 'Guardar' : 'Crear evento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- ELIMINAR */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina <strong>{deleteTarget?.name}</strong> y su configuración. Los{' '}
              {stats.get(deleteTarget?.id ?? '')?.leads_total ?? 0} lead(s) que tienen este
              evento NO se borran: siguen en Prospectos con el nombre del evento escrito, pero
              dejan de tener una ficha donde verse juntos. Si el evento terminó, conviene
              cerrarlo en lugar de eliminarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEventos;
