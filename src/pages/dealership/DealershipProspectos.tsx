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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Users, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { useSalespersons } from '@/hooks/useSalespersons';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { useIsMobile } from '@/hooks/use-mobile';

interface VehicleModel {
  id: string;
  name: string;
  brand: string;
}

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

const PROSPECT_SOURCES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefono', label: 'Teléfono' },
  { value: 'web', label: 'Web' },
  { value: 'redes_sociales', label: 'Redes Sociales' },
  { value: 'referido', label: 'Referido' },
  { value: 'evento', label: 'Evento' },
  { value: 'otro', label: 'Otro' },
];

const DealershipProspectos = () => {
  const { statuses: PROSPECT_STATUSES } = useProspectStatuses();
  const { salespersons } = useSalespersons();
  const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading: loadingAccess } = useDealershipAccess();
  const { salesperson: currentSalesperson, isSalesperson } = useCurrentSalesperson();
  const isMobile = useIsMobile();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);

  const [prosSearch, setProsSearch] = useState('');
  const [prosStatusFilter, setProsStatusFilter] = useState('todos');
  const [prosSourceFilter, setProsSourceFilter] = useState('todos');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pModel, setPModel] = useState('');
  const [pSource, setPSource] = useState('presencial');
  const [pStatus, setPStatus] = useState('nuevo');
  const [pNotes, setPNotes] = useState('');
  const [pSalesperson, setPSalesperson] = useState('');

  const fetchModels = async () => {
    const { data } = await supabase
      .from('vehicle_models')
      .select('id, name, brand')
      .eq('is_active', true)
      .order('brand')
      .order('name');
    if (data) setVehicleModels(data as VehicleModel[]);
  };

  const fetchProspects = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    const { data } = await supabase
      .from('prospects')
      .select('*')
      .eq('dealership_id', selectedDealership)
      .order('created_at', { ascending: false });
    setProspects((data || []) as Prospect[]);
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  useEffect(() => {
    if (loadingAccess) return;
    if (selectedDealership) { fetchProspects(); }
    else { setLoading(false); }
  }, [selectedDealership, loadingAccess]);

  const filteredProspects = prospects.filter(p => {
    if (prosStatusFilter !== 'todos' && p.status !== prosStatusFilter) return false;
    if (prosSourceFilter !== 'todos' && p.source !== prosSourceFilter) return false;
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

  const openDialog = () => {
    setPName(''); setPPhone(''); setPEmail(''); setPModel('');
    setPSource('presencial'); setPStatus('nuevo'); setPNotes(''); setPSalesperson('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!pName.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const { error } = await supabase.from('prospects').insert({
      dealership_id: selectedDealership,
      name: pName.trim(),
      phone: pPhone.trim() || null,
      email: pEmail.trim() || null,
      model_interest: (pModel.trim() && pModel !== '__none') ? pModel.trim() : null,
      source: pSource,
      status: pStatus,
      notes: pNotes.trim() || null,
      salesperson: (pSalesperson.trim() && pSalesperson !== '__none') ? pSalesperson.trim() : null,
    });
    if (error) { toast.error('Error al crear prospecto'); console.error(error); }
    else { toast.success('Prospecto creado'); setDialogOpen(false); fetchProspects(); }
    setSaving(false);
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
              {p.salesperson && <p className="text-[11px] text-muted-foreground">Vendedor: {p.salesperson}</p>}
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[180px] sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8 h-8 text-xs" value={prosSearch} onChange={e => setProsSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
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
                  <TableHead>Vendedor</TableHead>
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
                      <TableCell className="text-muted-foreground">{p.salesperson || '-'}</TableCell>
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
                        {new Date(p.created_at).toLocaleDateString('es-VE')}
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={cn(isMobile && "max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto")}>
          <DialogHeader>
            <DialogTitle className="font-display">Nuevo Prospecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Nombre *</Label>
                <Input value={pName} onChange={e => setPName(e.target.value)} placeholder="Nombre completo" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input value={pPhone} onChange={e => setPPhone(e.target.value)} placeholder="+58 412 1234567" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="correo@ejemplo.com" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modelo de interés</Label>
                <Select value={pModel} onValueChange={setPModel}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar modelo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin especificar</SelectItem>
                    {Array.from(new Set(vehicleModels.map(m => m.brand))).map(brand => (
                      <SelectGroup key={brand}>
                        <SelectLabel className="text-[10px] font-bold uppercase text-muted-foreground">{brand}</SelectLabel>
                        {vehicleModels.filter(m => m.brand === brand).map(m => (
                          <SelectItem key={m.id} value={`${m.brand} ${m.name}`}>{m.brand} {m.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fuente</Label>
                <Select value={pSource} onValueChange={setPSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vendedor</Label>
                <Select value={pSalesperson} onValueChange={setPSalesperson}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin asignar</SelectItem>
                    {salespersons.map(sp => (
                      <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Estado</Label>
                <Select value={pStatus} onValueChange={setPStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient w-full sm:w-auto">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Crear Prospecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipProspectos;
