import { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ResponsiveModal, ResponsiveModalHeader, ResponsiveModalTitle, ResponsiveModalFooter } from '@/components/ui/responsive-modal';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Users, Phone, Mail, ExternalLink, MessageCircle, Activity, Pencil, Download, Upload, FileText, X, CheckCircle2, AlertTriangle, Tag, MapPin, Car, CalendarDays, User, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
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
import { createKommoLead, updateKommoLeadStage } from '@/lib/kommo';


const VENEZUELA_STATES = ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes','Delta Amacuro','Dependencias Federales','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia'];

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
  event_name: string | null;
  'Estado de Vnzla': string | null;
  kommo_lead_id: number | null;
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
  const [prosEstadoVzlaFilter, setProsEstadoVzlaFilter] = useState('todos');
  const [prosFechaDesde, setProsFechaDesde] = useState('');
  const [prosFechaHasta, setProsFechaHasta] = useState('');

  // Dialog persisted in sessionStorage to survive navigation
  const SS_KEY = 'dealership_prospectos_dialog';
  const getSS = () => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { return {}; } };
  const [dialogOpen, setDialogOpenRaw] = useState<boolean>(() => !!getSS().dialogOpen);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
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
  const [pEstadoVzla, setPEstadoVzla] = useState<string>(() => getSS().pEstadoVzla || '');

  const setDialogOpen = (open: boolean) => {
    setDialogOpenRaw(open);
    if (!open) { setEditingProspect(null); try { sessionStorage.removeItem(SS_KEY); } catch {} }
  };

  useEffect(() => {
    if (!dialogOpen) return;
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ dialogOpen, pName, pPhone, pEmail, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName, pEstadoVzla }));
    } catch {}
  }, [dialogOpen, pName, pPhone, pEmail, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName]);
  // Import/Export
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ row: number; name: string; phone: string; email: string; brand: string; model: string; source: string; status: string; notes: string; salesperson: string; event_name: string; estado_vzla: string; fecha: string; errors: string[] }>>([]);
  const [importing, setImporting] = useState(false);

  const [greetingTemplate, setGreetingTemplate] = useState<string>('Hola {{prospecto}}, ¡es un gusto saludarte! Mi nombre es {{vendedor}}, seré el asesor de ventas encargado de brindarte información de nuestros vehículos. ¿En qué puedo ayudarte hoy? 🚗');
  const [updatesSidebarProspect, setUpdatesSidebarProspect] = useState<Prospect | null>(null);

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const applyThisMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setProsFechaDesde(new Date(y, m, 1).toISOString().slice(0, 10));
    setProsFechaHasta(new Date(y, m + 1, 0).toISOString().slice(0, 10));
    setCurrentPage(1);
  };
  const applyLastMonth = () => {
    const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
    setProsFechaDesde(new Date(y, m - 1, 1).toISOString().slice(0, 10));
    setProsFechaHasta(new Date(y, m, 0).toISOString().slice(0, 10));
    setCurrentPage(1);
  };

  // Sort & pagination
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setCurrentPage(1);
  };
  const SortIcon = ({ field }: { field: string }) => sortField !== field
    ? <ChevronsUpDown className="w-3 h-3 ml-0.5 text-muted-foreground/40 inline" />
    : sortDir === 'asc' ? <ChevronUp className="w-3 h-3 ml-0.5 inline" /> : <ChevronDown className="w-3 h-3 ml-0.5 inline" />;

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'status' | 'model' | 'estadoVzla' | 'source' | 'eventName' | 'salesperson' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);


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
    if (prosEstadoVzlaFilter !== 'todos' && (p['Estado de Vnzla'] || '') !== prosEstadoVzlaFilter) return false;
    if (prosFechaDesde && p.created_at.slice(0, 10) < prosFechaDesde) return false;
    if (prosFechaHasta && p.created_at.slice(0, 10) > prosFechaHasta) return false;
    if (prosSearch.trim()) {
      const q = prosSearch.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.phone || '').toLowerCase().includes(q) && !(p.email || '').toLowerCase().includes(q) && !(p.salesperson || '').toLowerCase().includes(q) && !(p.model_interest || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sortedProspects = [...filteredProspects].sort((a, b) => {
    let av = '', bv = '';
    if (sortField === 'name') { av = a.name; bv = b.name; }
    else if (sortField === 'salesperson') { av = a.salesperson || ''; bv = b.salesperson || ''; }
    else if (sortField === 'status') { av = a.status; bv = b.status; }
    else if (sortField === 'source') { av = a.source; bv = b.source; }
    else if (sortField === 'model_interest') { av = a.model_interest || ''; bv = b.model_interest || ''; }
    else { av = a.created_at; bv = b.created_at; }
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const CLOSED_STATUSES = ['ganado', 'perdido'];
  const [activeTab, setActiveTab] = useState<'abiertos' | 'cerrados'>('abiertos');
  const openProspects = sortedProspects.filter(p => !CLOSED_STATUSES.includes(p.status));
  const closedProspects = sortedProspects.filter(p => CLOSED_STATUSES.includes(p.status));
  const displayedProspects = activeTab === 'abiertos' ? openProspects : closedProspects;
  const totalPages = Math.ceil(displayedProspects.length / PAGE_SIZE);
  const paginatedProspects = displayedProspects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (paginatedProspects.length > 0 && paginatedProspects.every(p => selectedIds.has(p.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedProspects.map(p => p.id)));
    }
  };

  const executeBulkUpdate = async (payload: Record<string, any>) => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('prospects').update(payload).in('id', ids);
    if (error) toast.error('Error al actualizar prospectos');
    else { toast.success(`${ids.length} prospecto(s) actualizados`); setSelectedIds(new Set()); setBulkAction(null); setBulkValue(''); setBulkBrand(''); fetchProspects(); }
    setBulkLoading(false);
  };

  const handleBulkApply = async () => {
    if (!bulkAction) return;
    let payload: Record<string, any> = {};
    switch (bulkAction) {
      case 'status': if (!bulkValue || bulkValue === '__none') return; payload = { status: bulkValue }; break;
      case 'estadoVzla': payload = { 'Estado de Vnzla': (!bulkValue || bulkValue === '__clear') ? null : bulkValue }; break;
      case 'model': payload = { model_interest: (!bulkValue || bulkValue === '__none') ? null : (bulkBrand ? `${bulkBrand} ${bulkValue}` : bulkValue) }; break;
      case 'source': if (!bulkValue || bulkValue === '__none') return; payload = { source: bulkValue }; break;
      case 'eventName': payload = { event_name: bulkValue.trim() || null }; break;
      case 'salesperson': payload = { salesperson: (!bulkValue || bulkValue === '__none') ? null : bulkValue }; break;
      default: return;
    }
    await executeBulkUpdate(payload);
  };

  const autoSalesperson = isSalesperson && currentSalesperson
    ? currentSalesperson.name
    : isVendedor && profile?.full_name
      ? profile.full_name
      : '';

  const BRANDS_LIST = ['GAC', 'DFSK', 'SHINERAY'];

  const exportToXLSX = () => {
    if (prospects.length === 0) { toast.error('No hay prospectos para exportar'); return; }
    const rows = prospects.map(p => {
      const parts = (p.model_interest || '').split(' ');
      const brand = (parts.length > 1 && BRANDS_LIST.includes(parts[0])) ? parts[0] : '';
      const model = brand ? parts.slice(1).join(' ') : (p.model_interest || '');
      return {
        nombre: p.name,
        telefono: p.phone || '',
        email: p.email || '',
        marca: brand,
        modelo: model,
        fuente: PROSPECT_SOURCES.find(s => s.value === p.source)?.label || p.source,
        estado: PROSPECT_STATUSES.find(s => s.name === p.status)?.label || p.status,
        vendedor: p.salesperson || '',
        estado_vzla: p['Estado de Vnzla'] || '',
        notas: p.notes || '',
        fecha: new Date(p.created_at).toLocaleDateString('es-VE'),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:25},{wch:20},{wch:28},{wch:12},{wch:25},{wch:20},{wch:18},{wch:20},{wch:18},{wch:35},{wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');
    XLSX.writeFile(wb, `prospectos_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success(`${rows.length} prospecto(s) exportados`);
  };

  const downloadTemplate = () => {
    const headers = ['nombre','telefono','email','marca','modelo','fuente','estado','notas','vendedor','nombre_evento','estado_vzla','fecha'];
    const example = ['Juan Pérez','+58 412 1234567','juan@email.com','GAC','GS4',
      PROSPECT_SOURCES.map(s => s.value).join(' | ') || 'concesionario',
      PROSPECT_STATUSES.map(s => s.name).join(' | ') || 'nuevo',
      'Interesado en SUV', autoSalesperson || 'Carlos Gómez', '', '', '2026-04-07'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{wch:25},{wch:20},{wch:28},{wch:12},{wch:25},{wch:25},{wch:20},{wch:30},{wch:20},{wch:20},{wch:18},{wch:18}];
    const wsNotes = XLSX.utils.aoa_to_sheet([
      ['INSTRUCCIONES:'],
      ['- nombre y telefono son obligatorios'],
      ['- marca debe ser GAC o DFSK'],
      ['- FECHA: usa la fecha real del prospecto (YYYY-MM-DD o DD/MM/YYYY)'],
      ['  Si se deja vacía se usa la fecha de hoy'],
      ['- estado_vzla: nombre del estado venezolano (ej: Distrito Capital, Miranda)'],
    ]);
    wsNotes['!cols'] = [{wch:65}];
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');
    XLSX.utils.book_append_sheet(wb, wsNotes, 'Instrucciones');
    XLSX.writeFile(wb, 'plantilla_prospectos.xlsx');
  };

  const parseXLSX = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (raw.length === 0) { toast.error('El archivo no contiene filas de datos'); return; }
        const VALID_SOURCES = PROSPECT_SOURCES.map(s => s.value);
        const VALID_STATUSES = PROSPECT_STATUSES.map(s => s.name);
        const rows: typeof importRows = [];
        raw.forEach((row, i) => {
          const errors: string[] = [];
          const name = String(row['nombre'] ?? '').trim();
          const phone = String(row['telefono'] ?? '').trim();
          const email = String(row['email'] ?? '').trim();
          const brand = String(row['marca'] ?? '').trim().toUpperCase();
          const model = String(row['modelo'] ?? '').trim();
          const notes = String(row['notas'] ?? '').trim();
          const salesperson = String(row['vendedor'] ?? '').trim();
          const event_name = String(row['nombre_evento'] ?? '').trim();
          const estado_vzla = String(row['estado_vzla'] ?? '').trim();
          let source = String(row['fuente'] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
          let status = String(row['estado'] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
          let fecha = String(row['fecha'] ?? '').trim();
          if (fecha) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { /* ok */ }
            else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
              const parts = fecha.split('/');
              fecha = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            } else { errors.push(`Fecha inválida: "${fecha}"`); fecha = ''; }
          }
          if (!name) errors.push('Nombre vacío');
          if (!phone) errors.push('Teléfono vacío');
          if (brand && !BRANDS_LIST.includes(brand)) errors.push(`Marca inválida: "${brand}"`);
          if (source && !VALID_SOURCES.includes(source)) { errors.push(`Fuente inválida: "${source}"`); source = VALID_SOURCES[0] || 'concesionario'; }
          if (!source) source = VALID_SOURCES[0] || 'concesionario';
          if (status && !VALID_STATUSES.includes(status)) { errors.push(`Estado inválido: "${status}"`); status = VALID_STATUSES[0] || 'nuevo'; }
          if (!status) status = VALID_STATUSES[0] || 'nuevo';
          rows.push({ row: i + 2, name, phone, email, brand, model, source, status, notes, salesperson, event_name, estado_vzla, fecha, errors });
        });
        setImportRows(rows);
        setImportOpen(true);
      } catch (err) {
        toast.error('Error al leer el archivo. Use la plantilla correcta.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkImport = async () => {
    if (!selectedDealership) { toast.error('No hay concesionario seleccionado'); return; }
    const validRows = importRows.filter(r => r.name.trim() && r.phone.trim());
    if (validRows.length === 0) { toast.error('No hay filas válidas para importar'); return; }
    setImporting(true);
    const payload = validRows.map(r => ({
      dealership_id: selectedDealership,
      name: r.name,
      phone: r.phone || null,
      email: r.email || null,
      model_interest: r.brand && r.model ? `${r.brand} ${r.model}` : (r.brand || r.model || null),
      source: r.source,
      status: r.status,
      notes: r.notes || null,
      salesperson: r.salesperson || autoSalesperson || null,
      event_name: r.event_name || null,
      'Estado de Vnzla': r.estado_vzla || null,
      created_at: r.fecha || undefined,
    }));
    const { error } = await supabase.from('prospects').insert(payload);
    if (error) { toast.error('Error al importar: ' + error.message); console.error(error); }
    else { toast.success(`${validRows.length} prospecto(s) importados`); setImportOpen(false); setImportRows([]); fetchProspects(); }
    setImporting(false);
  };

  const resetForm = () => {
    setPName(''); setPPhone(''); setPEmail(''); setPModel('');
    setPSource('concesionario'); setPStatus('nuevo'); setPNotes('');
    setPSalesperson(autoSalesperson);
    setPEventName(''); setPEstadoVzla('');
  };

  const openDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (p: Prospect) => {
    setEditingProspect(p);
    setPName(p.name);
    setPPhone(p.phone || '');
    setPEmail(p.email || '');
    setPModel(p.model_interest || '');
    setPSource(p.source || 'concesionario');
    setPStatus(p.status || 'nuevo');
    setPNotes(p.notes || '');
    setPSalesperson(p.salesperson || autoSalesperson);
    setPEventName(p.event_name || '');
    setPEstadoVzla(p['Estado de Vnzla'] || '');
    setDialogOpenRaw(true);
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
    if (editingProspect) {
      const { error } = await supabase.from('prospects').update({
        name: pName.trim(),
        phone: phone || null,
        email: pEmail.trim() || null,
        model_interest: (pModel.trim() && pModel !== '__none') ? pModel.trim() : null,
        source: pSource || 'concesionario',
        status: pStatus || 'nuevo',
        notes: pNotes.trim() || null,
        salesperson: (pSalesperson && pSalesperson !== '__none') ? pSalesperson.trim() : (autoSalesperson || null),
        event_name: pSource === 'evento' ? (pEventName.trim() || null) : null,
        'Estado de Vnzla': pEstadoVzla.trim() || null,
      }).eq('id', editingProspect.id);
      if (error) { toast.error('Error al actualizar prospecto'); console.error(error); }
      else { toast.success('Prospecto actualizado'); setDialogOpen(false); setConfirmOpen(false); resetForm(); fetchProspects(); }
    } else {
      if (phone) {
        const isDuplicate = await checkDuplicatePhone(phone);
        if (isDuplicate) { setSaving(false); return; }
      }
      const { data: inserted, error } = await supabase.from('prospects').insert({
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
        'Estado de Vnzla': pEstadoVzla.trim() || null,
      }).select().single();
      if (error) { toast.error('Error al crear prospecto'); console.error(error); }
      else {
        toast.success('Prospecto creado');
        setDialogOpen(false); setConfirmOpen(false); resetForm(); fetchProspects();
        createKommoLead(inserted.id).catch(console.error);
      }
    }
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
    else {
      fetchProspects();
      const p = prospects.find(x => x.id === id);
      if (p?.kommo_lead_id) updateKommoLeadStage(id, p.kommo_lead_id, newStatus).catch(console.error);
    }
  };

  // Mobile card
  const ProspectCard = ({ p }: { p: Prospect }) => {
    const st = PROSPECT_STATUSES.find(s => s.name === p.status) || PROSPECT_STATUSES[0];
    const src = PROSPECT_SOURCES.find(s => s.value === p.source);
    return (
      <Card className="gac-shadow">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <input type="checkbox" className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 accent-primary cursor-pointer shrink-0"
                checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                {!isSalesperson && p.salesperson && <p className="text-[11px] text-muted-foreground">Vendedor: {p.salesperson}</p>}
              </div>
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
            <button onClick={() => openEditDialog(p)} title="Editar prospecto" className="text-muted-foreground hover:text-foreground">
              <Pencil className="w-3.5 h-3.5" />
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
          <Button size="sm" variant="outline" onClick={exportToXLSX} className="gap-1" title="Exportar prospectos">
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1" title="Descargar plantilla de importación">
            <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Plantilla</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1" title="Importar prospectos desde XLSX">
            <Upload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Importar</span>
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseXLSX(f); e.target.value = ''; }} />
          <Button size="sm" onClick={openDialog} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 sm:mr-1" /> <span className="hidden sm:inline">Nuevo Prospecto</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as 'abiertos' | 'cerrados'); setSelectedIds(new Set()); setCurrentPage(1); }} className="space-y-3">
        <TabsList>
          <TabsTrigger value="abiertos" className="text-xs gap-1">
            Abiertos <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{openProspects.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cerrados" className="text-xs gap-1">
            Cerrados <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">{closedProspects.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters — single row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <div className="relative min-w-[160px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8 h-8 text-xs" value={prosSearch} onChange={e => { setProsSearch(e.target.value); setCurrentPage(1); }} />
          </div>
          <Select value={prosStatusFilter} onValueChange={v => { setProsStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-[130px] shrink-0"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {PROSPECT_STATUSES.map(s => <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prosSourceFilter} onValueChange={v => { setProsSourceFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-[120px] shrink-0"><SelectValue placeholder="Fuente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las fuentes</SelectItem>
              {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prosEstadoVzlaFilter} onValueChange={v => { setProsEstadoVzlaFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-[130px] shrink-0"><SelectValue placeholder="Estado (Vzla)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 text-xs shrink-0 gap-1.5", (prosFechaDesde || prosFechaHasta) && "border-primary text-primary")}>
                <CalendarDays className="w-3.5 h-3.5" />
                {prosFechaDesde || prosFechaHasta
                  ? `${prosFechaDesde ? new Date(prosFechaDesde + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '…'} – ${prosFechaHasta ? new Date(prosFechaHasta + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '…'}`
                  : 'Fecha'}
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
                  <Input type="date" value={prosFechaDesde} onChange={e => { setProsFechaDesde(e.target.value); setCurrentPage(1); }} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Hasta</span>
                  <Input type="date" value={prosFechaHasta} onChange={e => { setProsFechaHasta(e.target.value); setCurrentPage(1); }} className="h-8 text-xs" />
                </div>
              </div>
              {(prosFechaDesde || prosFechaHasta) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs w-full text-muted-foreground" onClick={() => { setProsFechaDesde(''); setProsFechaHasta(''); setCurrentPage(1); }}>
                  Quitar rango
                </Button>
              )}
            </PopoverContent>
          </Popover>
          {(prosSearch || prosFechaDesde || prosFechaHasta || prosStatusFilter !== 'todos' || prosSourceFilter !== 'todos' || prosEstadoVzlaFilter !== 'todos') && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground shrink-0 gap-1" onClick={() => { setProsFechaDesde(''); setProsFechaHasta(''); setProsStatusFilter('todos'); setProsSourceFilter('todos'); setProsEstadoVzlaFilter('todos'); setProsSearch(''); setCurrentPage(1); }}>
              <X className="w-3 h-3" />Limpiar
            </Button>
          )}
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
                  <TableHead className="w-8 pl-3">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                      checked={paginatedProspects.length > 0 && paginatedProspects.every(p => selectedIds.has(p.id))}
                      onChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('name')}>Nombre<SortIcon field="name" /></TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('model_interest')}>Marca<SortIcon field="model_interest" /></TableHead>
                  <TableHead>Modelo</TableHead>
                  {!isSalesperson && !isVendedor && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('salesperson')}>Vendedor<SortIcon field="salesperson" /></TableHead>}
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('source')}>Fuente<SortIcon field="source" /></TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('status')}>Estado<SortIcon field="status" /></TableHead>
                  <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('created_at')}>Fecha<SortIcon field="created_at" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProspects.map(p => {
                  const st = PROSPECT_STATUSES.find(s => s.name === p.status) || PROSPECT_STATUSES[0];
                  const src = PROSPECT_SOURCES.find(s => s.value === p.source);
                  return (
                    <TableRow key={p.id} className="[&>td]:py-1.5">
                      <TableCell className="pl-3">
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                          checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{p.phone}</div>}
                        {p.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{p.email}</div>}
                      </TableCell>
                      <TableCell>{(() => { const parts = (p.model_interest || '').split(' '); const hasBrand = ['GAC','DFSK','SHINERAY'].includes(parts[0]); return hasBrand ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{parts[0]}</Badge> : '-'; })()}</TableCell>
                      <TableCell>{(() => { const parts = (p.model_interest || '').split(' '); const hasBrand = ['GAC','DFSK','SHINERAY'].includes(parts[0]); return hasBrand ? (parts.slice(1).join(' ') || '-') : (p.model_interest || '-'); })()}</TableCell>
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
                          <button onClick={(e) => { e.stopPropagation(); openEditDialog(p); }} title="Editar prospecto" className="text-muted-foreground hover:text-foreground shrink-0">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t text-[11px] text-muted-foreground">
                <span>{displayedProspects.length} prospectos · pág. {currentPage} de {totalPages}</span>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>«</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>‹</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>»</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </Tabs>

      {/* CREATE PROSPECT DIALOG */}
      <ResponsiveModal open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="font-display">{editingProspect ? 'Editar Prospecto' : 'Nuevo Prospecto'}</ResponsiveModalTitle>
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
              <div className="space-y-1">
                <Label className="text-xs">Estado de Venezuela</Label>
                <Select value={pEstadoVzla} onValueChange={v => setPEstadoVzla(v === '__none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin estado</SelectItem>
                    {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editingProspect ? 'Guardar Cambios' : 'Crear Prospecto'}
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

      {/* IMPORT PREVIEW DIALOG */}
      <Dialog open={importOpen} onOpenChange={open => { if (!importing) { setImportOpen(open); if (!open) setImportRows([]); } }}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">Vista previa de importación — {importRows.length} fila(s)</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[380px] border rounded-md">
            <Table className="text-[11px]">
              <TableHeader>
                <TableRow className="[&>th]:py-1.5 [&>th]:text-[10px] [&>th]:font-semibold">
                  <TableHead className="w-6">#</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Estado Vzla</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Errores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map(r => (
                  <TableRow key={r.row} className={cn('[&>td]:py-1', r.errors.length > 0 ? 'bg-red-50 dark:bg-red-950/20' : '')}>
                    <TableCell className="text-muted-foreground">{r.row}</TableCell>
                    <TableCell className="font-medium max-w-[120px] truncate">{r.name || <span className="text-red-500 italic">vacío</span>}</TableCell>
                    <TableCell>{r.phone || <span className="text-red-500 italic">vacío</span>}</TableCell>
                    <TableCell>{r.brand || '-'}</TableCell>
                    <TableCell>{r.model || '-'}</TableCell>
                    <TableCell>{r.source}</TableCell>
                    <TableCell>{r.salesperson || autoSalesperson || '-'}</TableCell>
                    <TableCell>{r.estado_vzla || '-'}</TableCell>
                    <TableCell>{r.fecha || <span className="text-muted-foreground italic">hoy</span>}</TableCell>
                    <TableCell>
                      {r.errors.length > 0 ? (
                        <div className="flex items-start gap-1 text-red-600">
                          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{r.errors.join('; ')}</span>
                        </div>
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {importRows.some(r => r.errors.length > 0) && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Las filas con errores serán omitidas. Solo se importarán las filas con nombre y teléfono válidos.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setImportOpen(false); setImportRows([]); }} disabled={importing}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleBulkImport} disabled={importing || importRows.filter(r => r.name && r.phone).length === 0} className="gac-gradient">
              {importing
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                : <Upload className="w-3.5 h-3.5 mr-1" />}
              Importar {importRows.filter(r => r.name && r.phone).length} prospecto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-1 bg-gray-900 text-white rounded-2xl shadow-2xl px-3 py-2 border border-gray-700 max-w-[calc(100vw-2rem)] overflow-x-auto">
            <span className="text-xs font-bold whitespace-nowrap text-primary bg-primary/20 px-2 py-0.5 rounded-full shrink-0">
              {selectedIds.size} sel.
            </span>
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('status'); setBulkValue(''); }}>
              <Tag className="w-3 h-3" /> Estado
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('estadoVzla'); setBulkValue(''); }}>
              <MapPin className="w-3 h-3" /> Ubicación
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('model'); setBulkValue(''); setBulkBrand(''); }}>
              <Car className="w-3 h-3" /> Modelo
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('source'); setBulkValue(''); }}>
              <Tag className="w-3 h-3" /> Fuente
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('eventName'); setBulkValue(''); }}>
              <CalendarDays className="w-3 h-3" /> Evento
            </Button>
            {!isSalesperson && !isVendedor && (
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
                onClick={() => { setBulkAction('salesperson'); setBulkValue(''); }}>
                <User className="w-3 h-3" /> Vendedor
              </Button>
            )}
            <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
            <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/10 hover:text-white h-7 w-7 p-0 shrink-0"
              onClick={() => setSelectedIds(new Set())}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* BULK ACTION DIALOG */}
      <Dialog open={bulkAction !== null} onOpenChange={open => { if (!open) { setBulkAction(null); setBulkValue(''); setBulkBrand(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-display">
              {bulkAction === 'status' && 'Cambiar estado'}
              {bulkAction === 'estadoVzla' && 'Cambiar ubicación'}
              {bulkAction === 'model' && 'Cambiar marca / modelo'}
              {bulkAction === 'source' && 'Cambiar fuente'}
              {bulkAction === 'eventName' && 'Cambiar nombre de evento'}
              {bulkAction === 'salesperson' && 'Cambiar vendedor'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-1 space-y-3">
            <p className="text-xs text-muted-foreground">Se aplicará a <strong>{selectedIds.size}</strong> prospecto(s) seleccionado(s).</p>
            {bulkAction === 'status' && (
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
                <SelectContent>
                  {PROSPECT_STATUSES.map(s => (
                    <SelectItem key={s.name} value={s.name}>
                      <Badge className={cn("text-[10px] px-1.5 py-0", s.color)}>{s.label}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {bulkAction === 'estadoVzla' && (
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar estado venezolano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear">Sin estado</SelectItem>
                  {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {bulkAction === 'model' && (
              <div className="space-y-2">
                <Select value={bulkBrand || '__none'} onValueChange={v => { setBulkBrand(v === '__none' ? '' : v); setBulkValue(''); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar marca" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin marca</SelectItem>
                    {prospectBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={bulkValue || '__none'} onValueChange={setBulkValue} disabled={!bulkBrand}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={bulkBrand ? 'Seleccionar modelo' : 'Primero seleccione marca'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin modelo</SelectItem>
                    {prospectModels.filter(m => m.brand === bulkBrand).map(m => (
                      <SelectItem key={m.id} value={`${m.brand} ${m.name}`}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {bulkAction === 'source' && (
              <Select value={bulkValue} onValueChange={setBulkValue}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar fuente" /></SelectTrigger>
                <SelectContent>
                  {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {bulkAction === 'eventName' && (
              <Input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Nombre del evento" className="h-9 text-xs" />
            )}
            {bulkAction === 'salesperson' && (
              <Select value={bulkValue || '__none'} onValueChange={setBulkValue}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin vendedor</SelectItem>
                  {salespersons.map(sp => <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkAction(null); setBulkValue(''); setBulkBrand(''); }}>Cancelar</Button>
            <Button size="sm" className="gac-gradient" disabled={bulkLoading || (bulkAction !== 'eventName' && bulkAction !== 'estadoVzla' && (!bulkValue || bulkValue === '__none'))} onClick={handleBulkApply}>
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipProspectos;
