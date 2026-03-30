import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ResponsiveModal, ResponsiveModalHeader, ResponsiveModalTitle, ResponsiveModalFooter } from '@/components/ui/responsive-modal';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Users, Phone, Mail, ExternalLink, MessageCircle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { useSalespersons } from '@/hooks/useSalespersons';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProspectModels } from '@/hooks/useProspectModels';
import { useProspectSources } from '@/hooks/useProspectSources';
import ProspectUpdatesSidebar from '@/components/ProspectUpdatesSidebar';


interface Prospect {
  id: string;
  dealership_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  model_interest: string | null;
  source: string;
  status: string;
  notes: string | null;
  salesperson: string | null;
  created_at: string;
}


const DealershipProspectos = () => {
  const { statuses: PROSPECT_STATUSES } = useProspectStatuses();
  const { sources: PROSPECT_SOURCES } = useProspectSources();
  const { salespersons } = useSalespersons();
  const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading: loadingAccess } = useDealershipAccess();
  const { salesperson: currentSalesperson, isSalesperson } = useCurrentSalesperson();
  const { profile, role } = useAuth();
  const isVendedor = role?.name?.toLowerCase() === 'vendedor';
  const isMobile = useIsMobile();
  const { models: prospectModels, brands: prospectBrands } = useProspectModels();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  const [prosSearch, setProsSearch] = useState('');
  const [prosStatusFilter, setProsStatusFilter] = useState('todos');
  const [prosSourceFilter, setProsSourceFilter] = useState('todos');
  const [prosFechaDesde, setProsFechaDesde] = useState('');
  const [prosFechaHasta, setProsFechaHasta] = useState('');

  // Dialog persisted in sessionStorage to survive navigation
  const SS_KEY = 'dealership_prospectos_dialog';
  const getSS = () => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { return {}; } };
  const [dialogOpen, setDialogOpenRaw] = useState<boolean>(() => !!getSS().dialogOpen);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pName, setPName] = useState<string>(() => getSS().pName || '');
  const [pPhone, setPPhone] = useState<string>(() => getSS().pPhone || '');
  const [pEmail, setPEmail] = useState<string>(() => getSS().pEmail || '');
  const [pModel, setPModel] = useState<string>(() => getSS().pModel || '');
  const [pSource, setPSource] = useState<string>(() => getSS().pSource || 'concesionario');
  const [pStatus, setPStatus] = useState<string>(() => getSS().pStatus || 'nuevo');
  const [pNotes, setPNotes] = useState<string>(() => getSS().pNotes || '');
  const [pSalesperson, setPSalesperson] = useState<string>(() => getSS().pSalesperson || '');
  const [pEventName, setPEventName] = useState<string>(() => getSS().pEventName || '');

  const setDialogOpen = (open: boolean) => {
    setDialogOpenRaw(open);
    if (!open) { try { sessionStorage.removeItem(SS_KEY); } catch {} }
  };

  useEffect(() => {
    if (!dialogOpen) return;
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ dialogOpen, pName, pPhone, pEmail, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName }));
    } catch {}
  }, [dialogOpen, pName, pPhone, pEmail, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName]);
  const [greetingTemplate, setGreetingTemplate] = useState<string>('Hola {{prospecto}}, ¡es un gusto saludarte! Mi nombre es {{vendedor}}, seré el asesor de ventas encargado de brindarte información de nuestros vehículos. ¿En qué puedo ayudarte hoy? 🚗');
  const [updatesSidebarProspect, setUpdatesSidebarProspect] = useState<Prospect | null>(null);


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('message_templates' as any)
        .select('content')
        .eq('template_key', 'prospect_greeting')
        .eq('is_active', true)
        .limit(1);
      if (data && (data as any[]).length > 0) {
        setGreetingTemplate((data as any[])[0].content);
      }
    })();
  }, []);

  const buildProspectWaUrl = (p: Prospect, salespersonName: string) => {
    if (!p.phone) return null;
    const msg = greetingTemplate
      .replace(/{{prospecto}}/g, p.name)
      .replace(/{{vendedor}}/g, salespersonName || 'el asesor')
      .replace(/{{modelo}}/g, p.model_interest || '');
    const phone = p.phone.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const fetchProspects = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    let query = supabase
      .from('prospects')
      .select('*')
      .eq('dealership_id', selectedDealership)
      .order('created_at', { ascending: false });

    // Determine the salesperson name to filter by:
    // 1. Linked salespersons record takes priority
    // 2. Fallback: Vendedor role user uses their profile full_name
    const salespersonName = isSalesperson && currentSalesperson
      ? currentSalesperson.name
      : isVendedor && profile?.full_name
        ? profile.full_name
        : null;

    if (salespersonName) {
      query = query.eq('salesperson', salespersonName);
    }

    const { data } = await query;
    setProspects((data || []) as Prospect[]);
    setLoading(false);
  };

  

  useEffect(() => {
    if (loadingAccess) return;
    if (selectedDealership) { fetchProspects(); }
    else { setLoading(false); }
  }, [selectedDealership, loadingAccess, currentSalesperson]);

  const filteredProspects = prospects.filter(p => {
    if (prosStatusFilter !== 'todos' && p.status !== prosStatusFilter) return false;
    if (prosSourceFilter !== 'todos' && p.source !== prosSourceFilter) return false;
    if (prosFechaDesde && p.created_at.slice(0, 10) < prosFechaDesde) return false;
    if (prosFechaHasta && p.created_at.slice(0, 10) > prosFechaHasta) return false;
    if (prosSearch.trim()) {
      const q = prosSearch.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.phone || '').toLowerCase().includes(q) && !(p.email || '').toLowerCase().includes(q) && !(p.model_interest || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const CLOSED_STATUSES = ['ganado', 'perdido'];
  const [activeTab, setActiveTab] = useState<'abiertos' | 'cerrados'>('abiertos');
  const openProspects = filteredProspects.filter(p => !CLOSED_STATUSES.includes(p.status));
  const closedProspects = filteredProspects.filter(p => CLOSED_STATUSES.includes(p.status));
  const displayedProspects = activeTab === 'abiertos' ? openProspects : closedProspects;

  const autoSalesperson = isSalesperson && currentSalesperson
    ? currentSalesperson.name
    : isVendedor && profile?.full_name
      ? profile.full_name
      : '';

  const resetForm = () => {
    setPName(''); setPPhone(''); setPEmail(''); setPModel('');
    setPSource('concesionario'); setPStatus('nuevo'); setPNotes('');
    setPSalesperson(autoSalesperson);
    setPEventName('');
  };

  const openDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const checkDuplicatePhone = async (phone: string): Promise<boolean> => {
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) return false;
    const { data } = await supabase.from('prospects').select('id, name, phone').not('phone', 'is', null);
    const duplicate = (data || []).find((p: any) => p.phone.replace(/\D/g, '') === normalized);
    if (duplicate) {
      toast.error(`Ya existe un prospecto con ese teléfono: ${duplicate.name}`);
      return true;
    }
    return false;
  };

  const doSave = async () => {
    setSaving(true);
    const phone = pPhone.trim();
    if (phone) {
      const isDuplicate = await checkDuplicatePhone(phone);
      if (isDuplicate) { setSaving(false); return; }
    }
    const { error } = await supabase.from('prospects').insert({
      dealership_id: selectedDealership,
      name: pName.trim(),
      phone: phone || null,
      email: pEmail.trim() || null,
      model_interest: (pModel.trim() && pModel !== '__none') ? pModel.trim() : null,
      source: pSource || 'concesionario',
      status: pStatus || 'nuevo',
      notes: pNotes.trim() || null,
      salesperson: (pSalesperson && pSalesperson !== '__none') ? pSalesperson.trim() : (autoSalesperson || null),
      event_name: pSource === 'evento' ? (pEventName.trim() || null) : null,
    });
    if (error) { toast.error('Error al crear prospecto'); console.error(error); }
    else { toast.success('Prospecto creado'); setDialogOpen(false); setConfirmOpen(false); resetForm(); fetchProspects(); }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!pName.trim()) { toast.error('El nombre es requerido'); return; }
    if (!pPhone.trim()) { toast.error('El teléfono es requerido'); return; }
    const missing: string[] = [];
    if (!pEmail.trim()) missing.push('Correo electrónico');
    if (!pModel.trim() || pModel === '__none') missing.push('Modelo de interés');
    if (!isSalesperson && !isVendedor && (!pSalesperson || pSalesperson === '__none')) missing.push('Vendedor');
    if (missing.length > 0) {
      setMissingFields(missing);
      setConfirmOpen(true);
      return;
    }
    await doSave();
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('prospects').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { fetchProspects(); }
  };

  // Mobile card
  const ProspectCard = ({ p }: { p: Prospect }) => {
    const st = PROSPECT_STATUSES.find(s => s.name === p.status) || PROSPECT_STATUSES[0];
    const src = PROSPECT_SOURCES.find(s => s.value === p.source);
    return (
      <Card className="gac-shadow">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              {!isSalesperson && p.salesperson && <p className="text-[11px] text-muted-foreground">Vendedor: {p.salesperson}</p>}
            </div>
            <Select value={p.status} onValueChange={v => updateStatus(p.id, v)}>
              <SelectTrigger className="h-6 w-auto text-[10px] px-1.5 py-0 border-0 bg-transparent shrink-0">
                <Badge className={cn("text-[10px] px-1.5 py-0", st?.color)}>{st?.label}</Badge>
              </SelectTrigger>
              <SelectContent>
                {PROSPECT_STATUSES.map(s => (
                  <SelectItem key={s.name} value={s.name}>
                    <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
            {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            {p.model_interest && <span className="text-muted-foreground">🚘 {p.model_interest}</span>}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{src?.label || p.source}</Badge>
            <span className="text-muted-foreground ml-auto">{new Date(p.created_at).toLocaleDateString('es-VE')}</span>
            {p.phone && (() => {
              const waUrl = buildProspectWaUrl(p, autoSalesperson || p.salesperson || '');
              return waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp al prospecto" className="text-green-600 hover:text-green-700">
                  <MessageCircle className="w-3.5 h-3.5" />
                </a>
              ) : null;
            })()}
            <button onClick={() => setUpdatesSidebarProspect(p)} title="Ver actualizaciones" className="text-primary hover:text-primary/80">
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Prospectos</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {prospects.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {showSelector && (
            <Select value={selectedDealership} onValueChange={setSelectedDealership}>
              <SelectTrigger className="w-[150px] sm:w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/prospectos`); toast.success('Enlace copiado al portapapeles'); }} className="gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Landing</span>
          </Button>
          <Button size="sm" onClick={openDialog} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 sm:mr-1" /> <span className="hidden sm:inline">Nuevo Prospecto</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'abiertos' | 'cerrados')} className="space-y-3">
        <TabsList>
          <TabsTrigger value="abiertos" className="text-xs gap-1">
            Abiertos <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{openProspects.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cerrados" className="text-xs gap-1">
            Cerrados <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{closedProspects.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-0 sm:min-w-[180px] sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-8 h-8 text-xs" value={prosSearch} onChange={e => setProsSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={prosStatusFilter} onValueChange={setProsStatusFilter}>
                <SelectTrigger className="w-[110px] sm:w-[130px] h-8 text-xs shrink-0"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {PROSPECT_STATUSES.map(s => <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={prosSourceFilter} onValueChange={setProsSourceFilter}>
                <SelectTrigger className="w-[110px] sm:w-[140px] h-8 text-xs shrink-0"><SelectValue placeholder="Fuente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">Desde</span>
              <Input type="date" value={prosFechaDesde} onChange={e => setProsFechaDesde(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground shrink-0">Hasta</span>
              <Input type="date" value={prosFechaHasta} onChange={e => setProsFechaHasta(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            {(prosFechaDesde || prosFechaHasta || prosStatusFilter !== 'todos' || prosSourceFilter !== 'todos') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setProsFechaDesde(''); setProsFechaHasta(''); setProsStatusFilter('todos'); setProsSourceFilter('todos'); setProsSearch(''); }}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <Card className="gac-shadow">
            <CardContent className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando prospectos...</p>
            </CardContent>
          </Card>
        ) : displayedProspects.length === 0 ? (
          <Card className="gac-shadow">
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {activeTab === 'abiertos' ? 'No hay prospectos abiertos' : 'No hay prospectos cerrados'}
              </p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          <div className="space-y-2">
            {displayedProspects.map(p => <ProspectCard key={p.id} p={p} />)}
          </div>
        ) : (
          <Card className="gac-shadow">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Modelo</TableHead>
                  {!isSalesperson && !isVendedor && <TableHead>Vendedor</TableHead>}
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedProspects.map(p => {
                  const st = PROSPECT_STATUSES.find(s => s.name === p.status) || PROSPECT_STATUSES[0];
                  const src = PROSPECT_SOURCES.find(s => s.value === p.source);
                  return (
                    <TableRow key={p.id} className="[&>td]:py-1.5">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{p.phone}</div>}
                        {p.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{p.email}</div>}
                      </TableCell>
                      <TableCell>{p.model_interest || '-'}</TableCell>
                      {!isSalesperson && !isVendedor && <TableCell className="text-muted-foreground">{p.salesperson || '-'}</TableCell>}
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{src?.label || p.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={v => updateStatus(p.id, v)}>
                          <SelectTrigger className="h-6 w-[110px] text-[10px] px-1.5 py-0 border-0 bg-transparent">
                            <Badge className={cn("text-[10px] px-1.5 py-0", st?.color)}>{st?.label}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {PROSPECT_STATUSES.map(s => (
                              <SelectItem key={s.name} value={s.name}>
                                <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span>{new Date(p.created_at).toLocaleDateString('es-VE')}</span>
                          {p.phone && (() => {
                            const waUrl = buildProspectWaUrl(p, autoSalesperson || p.salesperson || '');
                            return waUrl ? (
                              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp al prospecto" className="text-green-600 hover:text-green-700 shrink-0">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            ) : null;
                          })()}
                          <button onClick={(e) => { e.stopPropagation(); setUpdatesSidebarProspect(p); }} title="Ver actualizaciones" className="text-primary hover:text-primary/80 shrink-0">
                            <Activity className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </Tabs>

      {/* CREATE PROSPECT DIALOG */}
      <ResponsiveModal open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="font-display">Nuevo Prospecto</ResponsiveModalTitle>
          </ResponsiveModalHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Nombre *</Label>
                <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="Nombre completo" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono *</Label>
                <Input value={pPhone} onChange={e => setPPhone(e.target.value)} placeholder="+58 412 1234567" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="correo@ejemplo.com" className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modelo de interés</Label>
                <Select value={pModel} onValueChange={setPModel}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Seleccionar modelo">
                      {pModel && !prospectModels.some(m => `${m.brand} ${m.name}` === pModel) ? pModel : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin modelo</SelectItem>
                    {prospectBrands.map(brand => (
                      <SelectGroup key={brand}>
                        <SelectLabel className="text-[10px] font-bold uppercase text-muted-foreground">{brand}</SelectLabel>
                        {prospectModels.filter(m => m.brand === brand).map(m => (
                          <SelectItem key={m.id} value={`${m.brand} ${m.name}`}>{m.brand} {m.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de contacto</Label>
                <Select value={pSource} onValueChange={v => { setPSource(v); if (v !== 'evento') setPEventName(''); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {pSource === 'evento' && (
                <div className="space-y-1">
                  <Label className="text-xs">Nombre de evento</Label>
                  <Input value={pEventName} onChange={e => setPEventName(e.target.value)} placeholder="Ej: Expo Auto 2026" className="h-9 text-xs" />
                </div>
              )}
              {autoSalesperson ? (
                <div className="space-y-1">
                  <Label className="text-xs">Vendedor</Label>
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-xs font-medium text-muted-foreground">
                    {autoSalesperson}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Vendedor</Label>
                  <Select value={pSalesperson} onValueChange={setPSalesperson}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                    <SelectContent>
                      {salespersons.map(sp => (
                        <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Estado</Label>
                <Select value={pStatus} onValueChange={setPStatus}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROSPECT_STATUSES.map(s => (
                      <SelectItem key={s.name} value={s.name}>
                        <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea value={pNotes} onChange={e => setPNotes(e.target.value)} rows={2} className="text-xs" placeholder="Observaciones..." />
            </div>
          </div>
          <ResponsiveModalFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient w-full sm:w-auto">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Prospecto'}
            </Button>
          </ResponsiveModalFooter>
      </ResponsiveModal>

      {/* CONFIRM PARTIAL CREATE */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear prospecto con información incompleta?</AlertDialogTitle>
            <AlertDialogDescription>
              Los siguientes campos no fueron completados:
              <ul className="mt-2 list-disc list-inside space-y-0.5">
                {missingFields.map(f => <li key={f} className="text-foreground font-medium">{f}</li>)}
              </ul>
              <span className="block mt-2">Se guardarán como valores vacíos. ¿Desea continuar de todas formas?</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver y completar</AlertDialogCancel>
            <AlertDialogAction onClick={doSave} className="gac-gradient" disabled={saving}>
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sí, crear de todas formas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* UPDATES SIDEBAR */}
      {updatesSidebarProspect && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setUpdatesSidebarProspect(null)} />
          <ProspectUpdatesSidebar
            prospectId={updatesSidebarProspect.id}
            prospectName={updatesSidebarProspect.name}
            onClose={() => setUpdatesSidebarProspect(null)}
          />
        </>
      )}
    </div>
  );
};

export default DealershipProspectos;
