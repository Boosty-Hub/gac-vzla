import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Users, Plus, Search, Phone, Mail, MapPin, CalendarDays, User, FileText, Upload, Download, AlertTriangle, CheckCircle2, X, Trash2, Settings2, UserCog, MessageCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import ProspectStatusManager from '@/components/ProspectStatusManager';
import SalespersonManager from '@/components/SalespersonManager';
import { useSalespersons } from '@/hooks/useSalespersons';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

interface VehicleModel {
  id: string;
  name: string;
  brand: string;
}

interface Dealership {
  id: string;
  name: string;
  city: string | null;
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
  created_at: string;
  dealerships: { name: string } | null;
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

const FALLBACK_STATUS = { id: '', name: 'unknown', label: 'Desconocido', color: 'bg-gray-100 text-gray-800', sort_order: 0, is_active: true };

const AdminProspectos = () => {
  const { statuses: PROSPECT_STATUSES, fetchStatuses: refetchStatuses } = useProspectStatuses();
  const { salespersons, fetchSalespersons: refetchSalespersons } = useSalespersons();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const canCreate = hasPermission('prospectos.create');
  const canEdit = hasPermission('prospectos.edit');
  const canDelete = hasPermission('prospectos.delete');
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [salespersonManagerOpen, setSalespersonManagerOpen] = useState(false);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [dealershipFilter, setDealershipFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [sourceFilter, setSourceFilter] = useState('todos');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [saving, setSaving] = useState(false);
  const [pDealership, setPDealership] = useState('');
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pModel, setPModel] = useState('');
  const [pSource, setPSource] = useState('presencial');
  const [pStatus, setPStatus] = useState('nuevo');
  const [pNotes, setPNotes] = useState('');
  const [pSalesperson, setPSalesperson] = useState('');

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);

  // Import CSV
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ row: number; name: string; phone: string; email: string; model: string; source: string; status: string; dealership: string; notes: string; errors: string[] }>>([]);
  const [importing, setImporting] = useState(false);
  const [importDealership, setImportDealership] = useState('');

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendingWa, setSendingWa] = useState<string | null>(null);

  const fetchDealerships = async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, city')
      .eq('is_active', true)
      .order('name');
    if (data) setDealerships(data);
  };

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
    setLoading(true);
    const { data } = await supabase
      .from('prospects')
      .select('*, dealerships(name)')
      .order('created_at', { ascending: false });
    setProspects((data || []) as Prospect[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchDealerships();
    fetchModels();
    fetchProspects();
  }, []);

  const filteredProspects = prospects.filter(p => {
    if (dealershipFilter !== 'todos' && p.dealership_id !== dealershipFilter) return false;
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (sourceFilter !== 'todos' && p.source !== sourceFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !(p.phone || '').toLowerCase().includes(q) &&
        !(p.email || '').toLowerCase().includes(q) &&
        !(p.model_interest || '').toLowerCase().includes(q) &&
        !(p.dealerships?.name || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setPDealership(dealerships.length > 0 ? dealerships[0].id : '');
    setPName(''); setPPhone(''); setPEmail(''); setPModel('');
    setPSource('presencial'); setPStatus('nuevo'); setPNotes(''); setPSalesperson('');
    setDialogOpen(true);
  };

  const openEdit = (p: Prospect) => {
    setEditing(p);
    setPDealership(p.dealership_id);
    setPName(p.name);
    setPPhone(p.phone || '');
    setPEmail(p.email || '');
    setPModel(p.model_interest || '');
    setPSource(p.source);
    setPStatus(p.status);
    setPNotes(p.notes || '');
    setPSalesperson((p as any).salesperson || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!pName.trim()) { toast.error('El nombre es requerido'); return; }
    if (!pDealership) { toast.error('Seleccione un concesionario'); return; }
    setSaving(true);

    const payload = {
      dealership_id: pDealership,
      name: pName.trim(),
      phone: pPhone.trim() || null,
      email: pEmail.trim() || null,
      model_interest: (pModel.trim() && pModel !== '__none') ? pModel.trim() : null,
      source: pSource,
      status: pStatus,
      notes: pNotes.trim() || null,
      salesperson: (pSalesperson && pSalesperson !== '__none') ? pSalesperson : null,
    };

    if (editing) {
      const { error } = await supabase.from('prospects').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar prospecto'); console.error(error); }
      else { toast.success('Prospecto actualizado'); setDialogOpen(false); fetchProspects(); }
    } else {
      const { error } = await supabase.from('prospects').insert(payload);
      if (error) { toast.error('Error al crear prospecto'); console.error(error); }
      else { toast.success('Prospecto creado'); setDialogOpen(false); fetchProspects(); }
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('prospects').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { fetchProspects(); }
  };

  const openDetail = (p: Prospect) => {
    setDetailProspect(p);
    setDetailOpen(true);
  };

  const confirmDelete = (p: Prospect) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('prospects').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Error al eliminar prospecto'); console.error(error); }
    else { toast.success('Prospecto eliminado'); setDeleteOpen(false); setDeleteTarget(null); fetchProspects(); }
    setDeleting(false);
  };

  const handleWhatsAppSalesperson = async (p: Prospect) => {
    const spName = (p as any).salesperson;
    const sp = salespersons.find(s => s.name === spName);
    if (!sp?.phone) {
      toast.error('El vendedor no tiene teléfono registrado');
      return;
    }

    setSendingWa(p.id);
    const st = PROSPECT_STATUSES.find(s => s.name === p.status) || FALLBACK_STATUS;
    const src = PROSPECT_SOURCES.find(s => s.value === p.source);

    let message = `🚗 *Nuevo Prospecto Asignado*\n\n`;
    message += `▪️ *Nombre:* ${p.name}\n`;
    if (p.phone) message += `▪️ *Teléfono:* ${p.phone}\n`;
    if (p.email) message += `▪️ *Email:* ${p.email}\n`;
    if (p.model_interest) message += `▪️ *Modelo de interés:* ${p.model_interest}\n`;
    message += `▪️ *Concesionario:* ${p.dealerships?.name || '-'}\n`;
    message += `▪️ *Fuente:* ${src?.label || p.source}\n`;
    message += `▪️ *Estado:* ${st.label}\n`;
    if (p.notes) message += `▪️ *Notas:* ${p.notes}\n`;
    message += `▪️ *Fecha:* ${new Date(p.created_at).toLocaleDateString('es-VE')}\n`;

    if (sp.profile_id) {
      try {
        const { data, error } = await supabase.functions.invoke('generate-magic-link', {
          body: { user_id: sp.profile_id },
        });
        if (!error && data?.token) {
          const magicUrl = `${window.location.origin}/magic-login?token=${data.token}`;
          message += `\n🔗 *Accede a la plataforma:*\n${magicUrl}`;
        }
      } catch (err) {
        console.error('Error generating magic link:', err);
      }
    }

    const phone = sp.phone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    setSendingWa(null);
  };

  // CSV Template download
  const downloadTemplate = () => {
    const headers = 'nombre,telefono,email,modelo_interes,fuente,estado,notas';
    const example = 'Juan Pérez,+58 412 1234567,juan@email.com,GS8,presencial,nuevo,Interesado en SUV';
    const csv = `${headers}\n${example}`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plantilla_prospectos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const VALID_SOURCES = PROSPECT_SOURCES.map(s => s.value);
  const VALID_STATUSES = PROSPECT_STATUSES.map(s => s.name);

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast.error('El archivo debe tener al menos una fila de datos además del encabezado'); return; }

    const rows: typeof importRows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const errors: string[] = [];
      const name = (cols[0] || '').trim();
      const phone = (cols[1] || '').trim();
      const email = (cols[2] || '').trim();
      const model = (cols[3] || '').trim();
      let source = (cols[4] || '').trim().toLowerCase().replace(/\s+/g, '_');
      let status = (cols[5] || '').trim().toLowerCase().replace(/\s+/g, '_');
      const notes = (cols[6] || '').trim();

      if (!name) errors.push('Nombre vacío');
      if (source && !VALID_SOURCES.includes(source)) { errors.push(`Fuente inválida: "${cols[4]?.trim()}"`); source = 'otro'; }
      if (!source) source = 'presencial';
      if (status && !VALID_STATUSES.includes(status)) { errors.push(`Estado inválido: "${cols[5]?.trim()}"`); status = 'nuevo'; }
      if (!status) status = 'nuevo';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email inválido');

      rows.push({ row: i + 1, name, phone, email, model, source, status, dealership: '', notes, errors });
    }
    setImportRows(rows);
    setImportOpen(true);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',' || ch === ';') { result.push(current); current = ''; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    if (!importDealership) { toast.error('Seleccione un concesionario para la importación'); return; }
    const validRows = importRows.filter(r => r.name.trim() && r.errors.filter(e => e === 'Nombre vacío').length === 0);
    if (validRows.length === 0) { toast.error('No hay filas válidas para importar'); return; }

    setImporting(true);
    const payload = validRows.map(r => ({
      dealership_id: importDealership,
      name: r.name,
      phone: r.phone || null,
      email: r.email || null,
      model_interest: r.model || null,
      source: r.source,
      status: r.status,
      notes: r.notes || null,
    }));

    const { error } = await supabase.from('prospects').insert(payload);
    if (error) { toast.error('Error al importar prospectos'); console.error(error); }
    else { toast.success(`${validRows.length} prospecto(s) importados exitosamente`); setImportOpen(false); setImportRows([]); fetchProspects(); }
    setImporting(false);
  };

  const removeImportRow = (idx: number) => {
    setImportRows(prev => prev.filter((_, i) => i !== idx));
  };

  const CLOSED_STATUSES = ['ganado', 'perdido'];

  const [activeTab, setActiveTab] = useState<'abiertos' | 'cerrados'>('abiertos');

  // Stats
  const totalNuevos = prospects.filter(p => p.status === 'nuevo').length;
  const totalInteresados = prospects.filter(p => !CLOSED_STATUSES.includes(p.status) && p.status !== 'nuevo').length;
  const totalGanados = prospects.filter(p => p.status === 'ganado').length;

  const openProspects = filteredProspects.filter(p => !CLOSED_STATUSES.includes(p.status));
  const closedProspects = filteredProspects.filter(p => CLOSED_STATUSES.includes(p.status));
  const displayedProspects = activeTab === 'abiertos' ? openProspects : closedProspects;

  // Mobile prospect card
  const ProspectCard = ({ p }: { p: Prospect }) => {
    const st = PROSPECT_STATUSES.find(s => s.name === p.status) || FALLBACK_STATUS;
    const src = PROSPECT_SOURCES.find(s => s.value === p.source);
    return (
      <Card className="gac-shadow" onClick={() => openDetail(p)}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{p.dealerships?.name || '-'}</p>
            </div>
            <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", st.color)}>{st.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
            {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
            {p.model_interest && <span className="flex items-center gap-1">🚘 {p.model_interest}</span>}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{src?.label || p.source}</Badge>
              <span className="text-[10px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString('es-VE')}</span>
            </div>
            <div className="flex items-center gap-1">
              {(p as any).salesperson && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={sendingWa === p.id}
                  onClick={(e) => { e.stopPropagation(); handleWhatsAppSalesperson(p); }}>
                  {sendingWa === p.id
                    ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : <MessageCircle className="w-4 h-4 text-green-600" />}
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); confirmDelete(p); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Prospectos</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> {prospects.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setStatusManagerOpen(true)} className="gap-1">
            <Settings2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Estados</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSalespersonManagerOpen(true)} className="gap-1">
            <UserCog className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Vendedores</span>
          </Button>
          {canCreate && (
            <>
              <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1 hidden sm:flex">
                <Download className="w-3.5 h-3.5" /> Plantilla
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1 hidden sm:flex">
                <Upload className="w-3.5 h-3.5" /> Importar CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
              <Button size="sm" onClick={openCreate} className="gac-gradient">
                <Plus className="w-3.5 h-3.5 sm:mr-1" /> <span className="hidden sm:inline">Nuevo Prospecto</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="gac-shadow">
          <CardContent className="p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{totalNuevos}</p>
            <p className="text-[10px] text-muted-foreground">Nuevos</p>
          </CardContent>
        </Card>
        <Card className="gac-shadow">
          <CardContent className="p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-purple-600">{totalInteresados}</p>
            <p className="text-[10px] text-muted-foreground">En proceso</p>
          </CardContent>
        </Card>
        <Card className="gac-shadow">
          <CardContent className="p-2 sm:p-3 text-center">
            <p className="text-xl sm:text-2xl font-bold text-green-600">{totalGanados}</p>
            <p className="text-[10px] text-muted-foreground">Ganados</p>
          </CardContent>
        </Card>
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
            <Input placeholder="Buscar..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Select value={dealershipFilter} onValueChange={setDealershipFilter}>
              <SelectTrigger className="w-[140px] sm:w-[170px] h-8 text-xs shrink-0"><SelectValue placeholder="Concesionario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px] sm:w-[130px] h-8 text-xs shrink-0"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {PROSPECT_STATUSES.map(s => <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[110px] sm:w-[140px] h-8 text-xs shrink-0"><SelectValue placeholder="Fuente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content: Cards on mobile, Table on desktop */}
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
                  <TableHead>Concesionario</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedProspects.map(p => {
                  const st = PROSPECT_STATUSES.find(s => s.name === p.status) || FALLBACK_STATUS;
                  const src = PROSPECT_SOURCES.find(s => s.value === p.source);
                  return (
                    <TableRow key={p.id} className="[&>td]:py-1.5 cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p)}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{p.phone}</div>}
                        {p.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{p.email}</div>}
                      </TableCell>
                      <TableCell>{p.model_interest || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {salespersons.find(sp => sp.name === (p as any).salesperson)?.name || (p as any).salesperson || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
                          <span>{p.dealerships?.name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{src?.label || p.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={v => { updateStatus(p.id, v); }}>
                          <SelectTrigger className="h-6 w-[110px] text-[10px] px-1.5 py-0 border-0 bg-transparent" onClick={e => e.stopPropagation()}>
                            <Badge className={cn("text-[10px] px-1.5 py-0", st.color)}>{st.label}</Badge>
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(p as any).salesperson && (
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Enviar prospecto por WhatsApp al vendedor" disabled={sendingWa === p.id}
                              onClick={(e) => { e.stopPropagation(); handleWhatsAppSalesperson(p); }}>
                              {sendingWa === p.id
                                ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                : <MessageCircle className="w-3.5 h-3.5 text-green-600" />}
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                              Editar
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-1.5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); confirmDelete(p); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
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

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className={cn("max-w-md", isMobile && "max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto")}>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <User className="w-4 h-4" /> Detalle del Prospecto
            </DialogTitle>
          </DialogHeader>
          {detailProspect && (() => {
            const st = PROSPECT_STATUSES.find(s => s.name === detailProspect.status) || FALLBACK_STATUS;
            const src = PROSPECT_SOURCES.find(s => s.value === detailProspect.source);
            return (
              <div className="space-y-4 py-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{detailProspect.name}</h3>
                  <Badge className={cn("text-xs px-2 py-0.5", st.color)}>{st.label}</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  {detailProspect.phone && (
                    <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground shrink-0" /><span>{detailProspect.phone}</span></div>
                  )}
                  {detailProspect.email && (
                    <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground shrink-0" /><span className="truncate">{detailProspect.email}</span></div>
                  )}
                  {detailProspect.model_interest && (
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground shrink-0" /><span>Interés: {detailProspect.model_interest}</span></div>
                  )}
                  <Separator />
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground shrink-0" /><span>{detailProspect.dealerships?.name || '-'}</span></div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{src?.label || detailProspect.source}</Badge>
                  </div>
                  <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" /><span>{new Date(detailProspect.created_at).toLocaleDateString('es-VE')}</span></div>
                </div>
                {detailProspect.notes && (
                  <div className="bg-muted/50 rounded-md p-2.5 text-xs">
                    <p className="font-semibold mb-1">Notas</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{detailProspect.notes}</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  {canEdit && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => { setDetailOpen(false); openEdit(detailProspect); }}>Editar</Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* IMPORT PREVIEW DIALOG */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className={cn("max-w-3xl max-h-[85vh] flex flex-col", isMobile && "max-w-[calc(100vw-1rem)] max-h-[95vh]")}>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-sm">
              <Upload className="w-4 h-4" /> Importación Masiva
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-1">
              <Label className="text-xs">Concesionario *</Label>
              <Select value={importDealership} onValueChange={setImportDealership}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                <SelectContent>
                  {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}{d.city ? ` — ${d.city}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="flex items-center gap-1 text-muted-foreground"><FileText className="w-3.5 h-3.5" /> {importRows.length} fila(s)</span>
              {importRows.filter(r => r.errors.length > 0).length > 0 && (
                <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> {importRows.filter(r => r.errors.length > 0).length} advertencias</span>
              )}
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> {importRows.filter(r => r.name.trim()).length} válidas</span>
            </div>

            {isMobile ? (
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {importRows.map((r, idx) => {
                    const hasErrors = r.errors.length > 0;
                    return (
                      <Card key={idx} className={cn("p-2", hasErrors && "border-amber-300 bg-amber-50/50")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-medium truncate">{r.name || <span className="italic text-destructive">vacío</span>}</p>
                            <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                              {r.phone && <span>{r.phone}</span>}
                              {r.email && <span>{r.email}</span>}
                              {r.model && <span>{r.model}</span>}
                            </div>
                            {hasErrors && <p className="text-[10px] text-amber-600">{r.errors.join(', ')}</p>}
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => removeImportRow(idx)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <ScrollArea className="flex-1 border rounded-md">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.map((r, idx) => {
                      const hasErrors = r.errors.length > 0;
                      const isCritical = !r.name.trim();
                      return (
                        <TableRow key={idx} className={cn("[&>td]:py-1", isCritical && "bg-red-50", hasErrors && !isCritical && "bg-amber-50")}>
                          <TableCell className="text-muted-foreground">{r.row}</TableCell>
                          <TableCell className={cn("font-medium", !r.name.trim() && "text-red-600")}>{r.name || <span className="italic text-red-500">vacío</span>}</TableCell>
                          <TableCell>{r.phone || '-'}</TableCell>
                          <TableCell>{r.email || '-'}</TableCell>
                          <TableCell>{r.model || '-'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0">{PROSPECT_SOURCES.find(s => s.value === r.source)?.label || r.source}</Badge></TableCell>
                          <TableCell><Badge className={cn("text-[10px] px-1 py-0", PROSPECT_STATUSES.find(s => s.name === r.status)?.color || FALLBACK_STATUS.color)}>{PROSPECT_STATUSES.find(s => s.name === r.status)?.label || r.status}</Badge></TableCell>
                          <TableCell className="max-w-[120px] truncate" title={r.notes}>{r.notes || '-'}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeImportRow(idx)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {importRows.some(r => r.errors.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs space-y-1 max-h-24 overflow-y-auto">
                <p className="font-semibold text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Advertencias</p>
                {importRows.filter(r => r.errors.length > 0).map((r, i) => (
                  <p key={i} className="text-amber-700">Fila {r.row}: {r.errors.join(', ')}</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportRows([]); }} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleBulkImport} disabled={importing || importRows.filter(r => r.name.trim()).length === 0} className="gac-gradient w-full sm:w-auto">
              {importing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Importar ${importRows.filter(r => r.name.trim()).length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE/EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={cn(isMobile && "max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto")}>
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar Prospecto' : 'Nuevo Prospecto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Concesionario *</Label>
              <Select value={pDealership} onValueChange={setPDealership}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                <SelectContent>
                  {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}{d.city ? ` — ${d.city}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar Cambios' : 'Crear Prospecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className={cn(isMobile && "max-w-[calc(100vw-2rem)]")}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar prospecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente al prospecto <strong>{deleteTarget?.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={deleting} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto">
              {deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* STATUS MANAGER */}
      <ProspectStatusManager
        open={statusManagerOpen}
        onOpenChange={setStatusManagerOpen}
        onStatusesChanged={refetchStatuses}
      />

      {/* SALESPERSON MANAGER */}
      <SalespersonManager
        open={salespersonManagerOpen}
        onOpenChange={setSalespersonManagerOpen}
        onSalespersonsChanged={refetchSalespersons}
      />
    </div>
  );
};

export default AdminProspectos;
