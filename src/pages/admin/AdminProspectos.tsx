import { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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
import { ResponsiveModal, ResponsiveModalHeader, ResponsiveModalTitle, ResponsiveModalFooter } from '@/components/ui/responsive-modal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Users, Plus, Search, Phone, Mail, MapPin, CalendarDays, User, FileText, Upload, Download, AlertTriangle, CheckCircle2, X, Trash2, Settings2, UserCog, MessageCircle, Car, ExternalLink, Activity, Tag } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import ProspectStatusManager from '@/components/ProspectStatusManager';
import SalespersonManager from '@/components/SalespersonManager';
import ProspectModelManager from '@/components/ProspectModelManager';
import { useProspectModels } from '@/hooks/useProspectModels';
import { useSalespersons } from '@/hooks/useSalespersons';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import ProspectUpdatesSidebar from '@/components/ProspectUpdatesSidebar';
import ProspectSourceManager from '@/components/ProspectSourceManager';
import { useProspectSources } from '@/hooks/useProspectSources';


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
  salesperson: string | null;
  event_name: string | null;
  'Estado de Vnzla': string | null;
  created_at: string;
  updated_at: string;
  dealerships: { name: string } | null;
}


const FALLBACK_STATUS = { id: '', name: 'unknown', label: 'Desconocido', color: 'bg-gray-100 text-gray-800', sort_order: 0, is_active: true };

const VENEZUELA_STATES = ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes','Delta Amacuro','Dependencias Federales','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia'];

const AdminProspectos = () => {
  const { statuses: PROSPECT_STATUSES, fetchStatuses: refetchStatuses } = useProspectStatuses();
  const { sources: PROSPECT_SOURCES, fetchSources: refetchSources } = useProspectSources();
  const { salespersons, fetchSalespersons: refetchSalespersons } = useSalespersons();
  const { hasPermission } = useAuth();
  const isMobile = useIsMobile();
  const canCreate = hasPermission('prospectos.create');
  const canEdit = hasPermission('prospectos.edit');
  const canDelete = hasPermission('prospectos.delete');
  const { models: prospectModels, brands: prospectBrands, fetchModels: refetchProspectModels } = useProspectModels();
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [salespersonManagerOpen, setSalespersonManagerOpen] = useState(false);
  const [modelManagerOpen, setModelManagerOpen] = useState(false);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [dealershipFilter, setDealershipFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [sourceFilter, setSourceFilter] = useState('todos');
  const [salespersonFilter, setSalespersonFilter] = useState('todos');
  const [estadoVzlaFilter, setEstadoVzlaFilter] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Create/Edit dialog — persisted in sessionStorage to survive navigation
  const SS_KEY = 'admin_prospectos_dialog';
  const getSS = () => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { return {}; } };
  const [dialogOpen, setDialogOpenRaw] = useState<boolean>(() => !!getSS().dialogOpen);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [pDealership, setPDealership] = useState<string>(() => getSS().pDealership || '');
  const [pName, setPName] = useState<string>(() => getSS().pName || '');
  const [pPhone, setPPhone] = useState<string>(() => getSS().pPhone || '');
  const [pEmail, setPEmail] = useState<string>(() => getSS().pEmail || '');
  const [pBrand, setPBrand] = useState<string>(() => getSS().pBrand || '');
  const [pModel, setPModel] = useState<string>(() => getSS().pModel || '');
  const [pSource, setPSource] = useState<string>(() => getSS().pSource || 'concesionario');
  const [pStatus, setPStatus] = useState<string>(() => getSS().pStatus || 'nuevo');
  const [pNotes, setPNotes] = useState<string>(() => getSS().pNotes || '');
  const [pSalesperson, setPSalesperson] = useState<string>(() => getSS().pSalesperson || '');
  const [pEventName, setPEventName] = useState<string>(() => getSS().pEventName || '');
  const [pEstadoVzla, setPEstadoVzla] = useState<string>(() => getSS().pEstadoVzla || '');

  const setDialogOpen = (open: boolean) => {
    setDialogOpenRaw(open);
    if (!open) { try { sessionStorage.removeItem(SS_KEY); } catch {} }
  };

  useEffect(() => {
    if (!dialogOpen) return;
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ dialogOpen, pDealership, pName, pPhone, pEmail, pBrand, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName, pEstadoVzla }));
    } catch {}
  }, [dialogOpen, pDealership, pName, pPhone, pEmail, pBrand, pModel, pSource, pStatus, pNotes, pSalesperson, pEventName]);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProspect, setDetailProspect] = useState<Prospect | null>(null);

  // Import XLSX
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ row: number; name: string; phone: string; email: string; brand: string; model: string; source: string; status: string; dealership: string; notes: string; salesperson: string; event_name: string; fecha: string; errors: string[] }>>([]);
  const [importing, setImporting] = useState(false);
  const [importDealership, setImportDealership] = useState('');

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendingWa, setSendingWa] = useState<string | null>(null);

  // Updates sidebar
  const [updatesSidebarProspect, setUpdatesSidebarProspect] = useState<Prospect | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  type BulkActionType = 'status' | 'model' | 'estadoVzla' | 'source' | 'eventName' | 'salesperson' | null;
  const [bulkAction, setBulkAction] = useState<BulkActionType>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkConfirmDeleteOpen, setBulkConfirmDeleteOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchDealerships = async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, city')
      .eq('is_active', true)
      .order('name');
    if (data) setDealerships(data);
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
    fetchProspects();
  }, []);

  const filteredProspects = prospects.filter(p => {
    if (dealershipFilter !== 'todos' && p.dealership_id !== dealershipFilter) return false;
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (sourceFilter !== 'todos' && p.source !== sourceFilter) return false;
    if (salespersonFilter !== 'todos' && (p.salesperson || '') !== salespersonFilter) return false;
    if (estadoVzlaFilter !== 'todos' && (p['Estado de Vnzla'] || '') !== estadoVzlaFilter) return false;
    if (fechaDesde && p.created_at.slice(0, 10) < fechaDesde) return false;
    if (fechaHasta && p.created_at.slice(0, 10) > fechaHasta) return false;
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

  const resetForm = () => {
    setEditing(null);
    setPDealership(dealerships.length > 0 ? dealerships[0].id : '');
    setPName(''); setPPhone(''); setPEmail(''); setPBrand(''); setPModel('');
    setPSource('concesionario'); setPStatus('nuevo'); setPNotes(''); setPSalesperson('');
    setPEventName(''); setPEstadoVzla('');
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: Prospect) => {
    setEditing(p);
    setPDealership(p.dealership_id);
    setPName(p.name);
    setPPhone(p.phone || '');
    setPEmail(p.email || '');
    // Extraer marca del model_interest si tiene formato "MARCA MODELO"
    const modelParts = (p.model_interest || '').split(' ');
    if (modelParts.length > 1 && ['GAC', 'DFSK'].includes(modelParts[0])) {
      setPBrand(modelParts[0]);
      setPModel(modelParts.slice(1).join(' '));
    } else {
      setPBrand('');
      setPModel(p.model_interest || '');
    }
    setPSource(p.source);
    setPStatus(p.status);
    setPNotes(p.notes || '');
    setPSalesperson(p.salesperson || '');
    setPEventName(p.event_name || '');
    setPEstadoVzla(p['Estado de Vnzla'] || '');
    setDialogOpen(true);
  };

  const buildPayload = () => ({
    dealership_id: pDealership,
    name: pName.trim(),
    phone: pPhone.trim() || null,
    email: pEmail.trim() || null,
    model_interest: (pModel.trim() && pModel !== '__none') 
      ? (pBrand ? `${pBrand} ${pModel.trim()}` : pModel.trim()) 
      : null,
    source: pSource || 'concesionario',
    status: pStatus || 'nuevo',
    notes: pNotes.trim() || null,
    salesperson: (pSalesperson && pSalesperson !== '__none') ? pSalesperson : null,
    event_name: pSource === 'evento' ? (pEventName.trim() || null) : null,
    'Estado de Vnzla': pEstadoVzla.trim() || null,
  });

  const checkDuplicatePhone = async (phone: string, excludeId?: string): Promise<boolean> => {
    const normalized = phone.replace(/\D/g, '');
    if (!normalized) return false;
    const { data } = await supabase.from('prospects').select('id, name, phone').not('phone', 'is', null);
    const duplicate = (data || []).find((p: any) => {
      if (excludeId && p.id === excludeId) return false;
      return p.phone.replace(/\D/g, '') === normalized;
    });
    if (duplicate) {
      toast.error(`Ya existe un prospecto con ese teléfono: ${duplicate.name}`);
      return true;
    }
    return false;
  };

  const doSave = async () => {
    setSaving(true);
    const payload = buildPayload();
    if (editing) {
      if (payload.phone) {
        const isDuplicate = await checkDuplicatePhone(payload.phone, editing.id);
        if (isDuplicate) { setSaving(false); return; }
      }
      const { error } = await supabase.from('prospects').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error al actualizar prospecto'); console.error(error); }
      else { toast.success('Prospecto actualizado'); setDialogOpen(false); setConfirmOpen(false); resetForm(); fetchProspects(); }
    } else {
      if (payload.phone) {
        const isDuplicate = await checkDuplicatePhone(payload.phone);
        if (isDuplicate) { setSaving(false); return; }
      }
      const { error } = await supabase.from('prospects').insert(payload);
      if (error) { toast.error('Error al crear prospecto'); console.error(error); }
      else { toast.success('Prospecto creado'); setDialogOpen(false); setConfirmOpen(false); resetForm(); fetchProspects(); }
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!pName.trim()) { toast.error('El nombre es requerido'); return; }
    if (!pPhone.trim()) { toast.error('El teléfono es requerido'); return; }
    if (!pDealership) { toast.error('Seleccione un concesionario'); return; }
    // When editing, allow saving directly (all fields were previously validated)
    if (editing) { await doSave(); return; }
    const missing: string[] = [];
    if (!pEmail.trim()) missing.push('Correo electrónico');
    if (!pModel.trim() || pModel === '__none') missing.push('Modelo de interés');
    if (!pSalesperson || pSalesperson === '__none') missing.push('Vendedor');
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

    // Fetch template from DB
    let template = `🚗 *Nuevo Prospecto Asignado*\n\n▪️ *Nombre:* {{nombre}}\n{{#telefono}}▪️ *Teléfono:* {{telefono}}\n{{/telefono}}{{#email}}▪️ *Email:* {{email}}\n{{/email}}{{#modelo}}▪️ *Modelo de interés:* {{modelo}}\n{{/modelo}}{{#concesionario}}▪️ *Concesionario:* {{concesionario}}\n{{/concesionario}}▪️ *Fuente:* {{fuente}}\n▪️ *Estado:* {{estado}}\n{{#notas}}▪️ *Notas:* {{notas}}\n{{/notas}}▪️ *Fecha:* {{fecha}}`;
    try {
      const { data: tplData } = await supabase
        .from('message_templates')
        .select('content')
        .eq('template_key', 'prospect_assigned')
        .eq('is_active', true)
        .single();
      if (tplData?.content) template = tplData.content;
    } catch { /* use default */ }

    const vars: Record<string, string | undefined> = {
      nombre: p.name,
      telefono: p.phone || undefined,
      email: p.email || undefined,
      modelo: p.model_interest || undefined,
      concesionario: p.dealerships?.name || undefined,
      fuente: src?.label || p.source,
      estado: st.label,
      notas: p.notes || undefined,
      fecha: new Date(p.created_at).toLocaleDateString('es-VE'),
    };

    // Process template
    let message = template;
    message = message.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => vars[key] ? content : '');
    message = message.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
    message = message.replace(/\n{3,}/g, '\n\n').trim();

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

  // XLSX Export
  const exportToXLSX = () => {
    if (filteredProspects.length === 0) { toast.error('No hay prospectos para exportar'); return; }
    const BRANDS_LIST = ['GAC', 'DFSK', 'SHINERAY'];
    const rows = filteredProspects.map(p => {
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
        concesionario: p.dealerships?.name || '',
        estado_vzla: p['Estado de Vnzla'] || '',
        notas: p.notes || '',
        fecha: new Date(p.created_at).toLocaleDateString('es-VE'),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:25},{wch:20},{wch:28},{wch:12},{wch:25},{wch:20},{wch:18},{wch:20},{wch:28},{wch:18},{wch:35},{wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');
    XLSX.writeFile(wb, `prospectos_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success(`${rows.length} prospecto(s) exportados`);
  };

  // XLSX Template download
  const downloadTemplate = () => {
    const headers = [
      'nombre', 'telefono', 'email', 'marca', 'modelo',
      'fuente', 'estado', 'notas', 'vendedor', 'nombre_evento', 'fecha',
    ];
    const example = [
      'Juan Pérez', '+58 412 1234567', 'juan@email.com', 'GAC', 'GS4',
      PROSPECT_SOURCES.map(s => s.value).join(' | ') || 'concesionario',
      PROSPECT_STATUSES.map(s => s.name).join(' | ') || 'nuevo',
      'Interesado en SUV', 'Carlos Gómez', '', '2026-04-07',
    ];
    const validSources = PROSPECT_SOURCES.map(s => `${s.value} = ${s.label}`).join('\n');
    const validStatuses = PROSPECT_STATUSES.map(s => `${s.name} = ${s.label}`).join('\n');
    const notes = [
      ['--- VALORES VÁLIDOS PARA "fuente" ---'],
      [validSources],
      [''],
      ['--- VALORES VÁLIDOS PARA "estado" ---'],
      [validStatuses],
      [''],
      ['INSTRUCCIONES:'],
      ['- nombre y telefono son obligatorios'],
      ['- marca debe ser GAC o DFSK'],
      ['- FECHA: usa la fecha real del prospecto en formato YYYY-MM-DD o DD/MM/YYYY'],
      ['  Ejemplo: 2026-01-15 o 15/01/2026'],
      ['  Si se deja vacía, se usará la fecha de importación (hoy)'],
      ['  IMPORTANTE: la fecha del Excel es la que quedará registrada en el sistema'],
      ['- fuente y estado deben coincidir exactamente con las claves listadas arriba'],
      ['- nombre_evento solo se usa cuando fuente = evento'],
      ['- No modificar los encabezados de la primera hoja'],
    ];

    const wb = XLSX.utils.book_new();

    // Main data sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [
      { wch: 25 }, // nombre
      { wch: 20 }, // telefono
      { wch: 28 }, // email
      { wch: 12 }, // marca
      { wch: 25 }, // modelo
      { wch: 25 }, // fuente
      { wch: 20 }, // estado
      { wch: 30 }, // notas
      { wch: 20 }, // vendedor
      { wch: 20 }, // nombre_evento
      { wch: 18 }, // fecha
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Prospectos');

    // Instructions sheet
    const wsNotes = XLSX.utils.aoa_to_sheet(notes);
    wsNotes['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsNotes, 'Instrucciones');

    XLSX.writeFile(wb, 'plantilla_prospectos.xlsx');
  };

  const VALID_SOURCES = PROSPECT_SOURCES.map(s => s.value);
  const VALID_STATUSES = PROSPECT_STATUSES.map(s => s.name);

  const parseXLSX = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

        if (raw.length === 0) { toast.error('El archivo no contiene filas de datos'); return; }

        const rows: typeof importRows = [];
        raw.forEach((row, i) => {
          const errors: string[] = [];
          const name = String(row['nombre'] ?? '').trim();
          const phone = String(row['telefono'] ?? '').trim();
          const email = String(row['email'] ?? '').trim();
          const brand = String(row['marca'] ?? '').trim().toUpperCase();
          const model = String(row['modelo'] ?? row['modelo_interes'] ?? '').trim();
          let fecha = String(row['fecha'] ?? '').trim();
          let source = String(row['fuente'] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
          let status = String(row['estado'] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
          const notes = String(row['notas'] ?? '').trim();
          const salesperson = String(row['vendedor'] ?? '').trim();
          const event_name = String(row['nombre_evento'] ?? '').trim();

          // Validar y formatear fecha
          if (fecha) {
            // Intentar parsear diferentes formatos de fecha
            if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
              // Ya está en formato correcto YYYY-MM-DD
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
              // Formato DD/MM/YYYY -> convertir a YYYY-MM-DD
              const [d, m, y] = fecha.split('/');
              fecha = `${y}-${m}-${d}`;
            } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
              // Formato D/M/YYYY -> convertir a YYYY-MM-DD
              const parts = fecha.split('/');
              fecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
              errors.push(`Formato de fecha inválido: "${fecha}"`);
              fecha = '';
            }
          }

          if (!name) errors.push('Nombre vacío');
          if (brand && !['GAC', 'DFSK'].includes(brand)) {
            errors.push(`Marca inválida: "${brand}" (debe ser GAC o DFSK)`);
          }
          if (!phone) errors.push('Teléfono vacío');
          if (source && !VALID_SOURCES.includes(source)) {
            errors.push(`Fuente inválida: "${source}"`);
            source = VALID_SOURCES[0] || 'concesionario';
          }
          if (!source) source = VALID_SOURCES[0] || 'concesionario';
          if (status && !VALID_STATUSES.includes(status)) {
            errors.push(`Estado inválido: "${status}"`);
            status = VALID_STATUSES[0] || 'nuevo';
          }
          if (!status) status = VALID_STATUSES[0] || 'nuevo';
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email inválido');

          rows.push({ row: i + 2, name, phone, email, brand, model, source, status, dealership: '', notes, salesperson, event_name, fecha, errors });
        });
        setImportRows(rows);
        setImportOpen(true);
      } catch (err) {
        toast.error('Error al leer el archivo XLSX. Asegúrese de usar la plantilla correcta.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseXLSX(file);
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    if (!importDealership) { toast.error('Seleccione un concesionario para la importación'); return; }
    const validRows = importRows.filter(r => r.name.trim() && r.phone.trim());
    if (validRows.length === 0) { toast.error('No hay filas válidas para importar'); return; }

    setImporting(true);
    const payload = validRows.map(r => {
      const modelInterest = r.brand && r.model 
        ? `${r.brand} ${r.model}` 
        : (r.brand || r.model || null);
      return {
        dealership_id: importDealership,
        name: r.name,
        phone: r.phone || null,
        email: r.email || null,
        model_interest: modelInterest,
        source: r.source,
        status: r.status,
        notes: r.notes || null,
        salesperson: r.salesperson || null,
        event_name: r.event_name || null,
        created_at: r.fecha || undefined, // Usar fecha del Excel si existe
      };
    });

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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (displayedProspects.length > 0 && displayedProspects.every(p => selectedIds.has(p.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedProspects.map(p => p.id)));
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

  const executeBulkDelete = async () => {
    setBulkLoading(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('prospects').delete().in('id', ids);
    if (error) toast.error('Error al eliminar prospectos');
    else { toast.success(`${ids.length} prospecto(s) eliminados`); setSelectedIds(new Set()); setBulkConfirmDeleteOpen(false); fetchProspects(); }
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

  // Mobile prospect card
  const ProspectCard = ({ p }: { p: Prospect }) => {
    const st = PROSPECT_STATUSES.find(s => s.name === p.status) || FALLBACK_STATUS;
    const src = PROSPECT_SOURCES.find(s => s.value === p.source);
    return (
      <Card className="gac-shadow" onClick={() => openDetail(p)}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <input type="checkbox" className="h-3.5 w-3.5 mt-0.5 rounded border-gray-300 accent-primary cursor-pointer shrink-0"
                checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} onClick={e => e.stopPropagation()} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{p.dealerships?.name || '-'}</p>
              </div>
            </div>
            <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", st.color)}>{st.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {p.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
            {p.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</span>}
            {p.model_interest && <span className="flex items-center gap-1">🚘 {p.model_interest}</span>}
            {p['Estado de Vnzla'] && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p['Estado de Vnzla']}</span>}
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
          <Button size="sm" variant="outline" onClick={() => setModelManagerOpen(true)} className="gap-1">
            <Car className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Modelos</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSourceManagerOpen(true)} className="gap-1">
            <MapPin className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Tipos contacto</span>
          </Button>
          {canCreate && (
            <>
              <Button size="sm" variant="outline" onClick={exportToXLSX} className="gap-1 hidden sm:flex">
                <Download className="w-3.5 h-3.5" /> Exportar
              </Button>
              <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1 hidden sm:flex">
                <FileText className="w-3.5 h-3.5" /> Plantilla
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1 hidden sm:flex">
                <Upload className="w-3.5 h-3.5" /> Importar XLSX
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileUpload} />
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/prospectos`); toast.success('Enlace copiado al portapapeles'); }} className="gap-1">
                <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Landing</span>
              </Button>
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

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as 'abiertos' | 'cerrados'); setSelectedIds(new Set()); }} className="space-y-3">
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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8 h-8 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* Filters grid */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <Select value={dealershipFilter} onValueChange={setDealershipFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Concesionario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los concesionarios</SelectItem>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {PROSPECT_STATUSES.map(s => <SelectItem key={s.name} value={s.name}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Fuente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las fuentes</SelectItem>
                {PROSPECT_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los vendedores</SelectItem>
                {salespersons.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={estadoVzlaFilter} onValueChange={setEstadoVzlaFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Estado (Vzla)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {VENEZUELA_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Date range */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground shrink-0">Desde</span>
              <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            </div>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground shrink-0">Hasta</span>
              <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            </div>
            {(fechaDesde || fechaHasta || statusFilter !== 'todos' || sourceFilter !== 'todos' || salespersonFilter !== 'todos' || dealershipFilter !== 'todos' || estadoVzlaFilter !== 'todos') && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground shrink-0" onClick={() => { setFechaDesde(''); setFechaHasta(''); setStatusFilter('todos'); setSourceFilter('todos'); setSalespersonFilter('todos'); setDealershipFilter('todos'); setEstadoVzlaFilter('todos'); setSearch(''); }}>
                Limpiar
              </Button>
            )}
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
                  <TableHead className="w-8 pl-3">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                      checked={displayedProspects.length > 0 && displayedProspects.every(p => selectedIds.has(p.id))}
                      onChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Concesionario</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Estado Vzla</TableHead>
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
                      <TableCell className="pl-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-primary cursor-pointer"
                          checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-2.5 h-2.5" />{p.phone}</div>}
                        {p.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-2.5 h-2.5" />{p.email}</div>}
                      </TableCell>
                      <TableCell>{(() => { const parts = (p.model_interest || '').split(' '); return (parts.length > 1 && ['GAC','DFSK','SHINERAY'].includes(parts[0])) ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold">{parts[0]}</Badge> : '-'; })()}</TableCell>
                      <TableCell>{(() => { const parts = (p.model_interest || '').split(' '); return (parts.length > 1 && ['GAC','DFSK','SHINERAY'].includes(parts[0])) ? parts.slice(1).join(' ') : (p.model_interest || '-'); })()}</TableCell>
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
                        {p['Estado de Vnzla'] || '-'}
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
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Ver actualizaciones" onClick={(e) => { e.stopPropagation(); setUpdatesSidebarProspect(p); }}>
                            <Activity className="w-3.5 h-3.5 text-primary" />
                          </Button>
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
      <ResponsiveModal open={detailOpen} onOpenChange={setDetailOpen} className="max-w-md">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="font-display flex items-center gap-2">
              <User className="w-4 h-4" /> Detalle del Prospecto
            </ResponsiveModalTitle>
          </ResponsiveModalHeader>
          {detailProspect && (() => {
            const st = PROSPECT_STATUSES.find(s => s.name === detailProspect.status) || FALLBACK_STATUS;
            const src = PROSPECT_SOURCES.find(s => s.value === detailProspect.source);
            const Field = ({ label, icon: Icon, value, children }: { label: string; icon?: any; value?: string | null; children?: React.ReactNode }) => (
              value || children ? (
                <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 pt-0.5">
                    {Icon && <Icon className="w-3 h-3 shrink-0" />}{label}
                  </div>
                  <div className="flex-1 text-sm text-foreground min-w-0">
                    {children || <span className="truncate block">{value}</span>}
                  </div>
                </div>
              ) : null
            );
            return (
              <div className="py-1 space-y-3">
                {/* Header: name + status */}
                <div className="flex items-start justify-between gap-3 pb-2 border-b">
                  <div>
                    <p className="font-semibold text-base leading-tight">{detailProspect.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{detailProspect.dealerships?.name || ''}</p>
                  </div>
                  <Badge className={cn("text-xs px-2 py-0.5 shrink-0 mt-0.5", st.color)}>{st.label}</Badge>
                </div>

                {/* Fields */}
                <div className="divide-y divide-border/50">
                  <Field label="Teléfono" icon={Phone} value={detailProspect.phone} />
                  <Field label="Email" icon={Mail} value={detailProspect.email} />
                  <Field label="Modelo" icon={Car} value={detailProspect.model_interest} />
                  <Field label="Concesionario" icon={MapPin} value={detailProspect.dealerships?.name} />
                  <Field label="Vendedor" icon={User} value={detailProspect.salesperson} />
                  <Field label="Fuente" icon={Tag}>
                    <Badge variant="outline" className="text-xs capitalize">{src?.label || detailProspect.source}</Badge>
                  </Field>
                  {detailProspect.source === 'evento' && (
                    <Field label="Evento" icon={CalendarDays} value={detailProspect.event_name} />
                  )}
                  <Field label="Registro" icon={CalendarDays} value={new Date(detailProspect.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })} />
                  {detailProspect.updated_at && detailProspect.updated_at !== detailProspect.created_at && (
                    <Field label="Actualizado" icon={CalendarDays} value={new Date(detailProspect.updated_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })} />
                  )}
                </div>

                {detailProspect.notes && (
                  <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Notas</p>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{detailProspect.notes}</p>
                  </div>
                )}

                <ResponsiveModalFooter className="flex-col sm:flex-row gap-2 pt-1">
                  {canEdit && (
                    <Button size="sm" variant="outline" className="text-xs w-full sm:w-auto" onClick={() => { setDetailOpen(false); openEdit(detailProspect); }}>Editar</Button>
                  )}
                </ResponsiveModalFooter>
              </div>
            );
          })()}
      </ResponsiveModal>

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
                      <TableHead>Marca</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Evento</TableHead>
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
                          <TableCell>{r.brand || '-'}</TableCell>
                          <TableCell>{r.model || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">{r.fecha || '-'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0">{PROSPECT_SOURCES.find(s => s.value === r.source)?.label || r.source}</Badge></TableCell>
                          <TableCell><Badge className={cn("text-[10px] px-1 py-0", PROSPECT_STATUSES.find(s => s.name === r.status)?.color || FALLBACK_STATUS.color)}>{PROSPECT_STATUSES.find(s => s.name === r.status)?.label || r.status}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{r.salesperson || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">{r.event_name || '-'}</TableCell>
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
      <ResponsiveModal open={dialogOpen} onOpenChange={setDialogOpen}>
          <ResponsiveModalHeader>
            <ResponsiveModalTitle className="font-display">{editing ? 'Editar Prospecto' : 'Nuevo Prospecto'}</ResponsiveModalTitle>
          </ResponsiveModalHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Concesionario *</Label>
              <Select value={pDealership} onValueChange={setPDealership}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar concesionario" /></SelectTrigger>
                <SelectContent>
                  {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}{d.city ? ` — ${d.city}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                <Label className="text-xs">Marca</Label>
                <Select value={pBrand} onValueChange={(v) => { setPBrand(v === '__none' ? '' : v); setPModel(''); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Seleccionar marca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin marca</SelectItem>
                    {prospectBrands.map(brand => (
                      <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modelo de interés</Label>
                <Select value={pModel} onValueChange={setPModel} disabled={!pBrand}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={pBrand ? "Seleccionar modelo" : "Primero seleccione marca"}>
                      {pModel && !prospectModels.some(m => m.name === pModel) ? pModel : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin modelo</SelectItem>
                    {prospectModels.filter(m => m.brand === pBrand).map(m => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
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
              <div className="space-y-1">
                <Label className="text-xs">Vendedor</Label>
                <Select value={pSalesperson} onValueChange={setPSalesperson}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Seleccionar vendedor">
                      {pSalesperson && !salespersons.some(sp => sp.name === pSalesperson) ? pSalesperson : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin vendedor</SelectItem>
                    {salespersons.map(sp => (
                      <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : editing ? 'Guardar Cambios' : 'Crear Prospecto'}
            </Button>
          </ResponsiveModalFooter>
      </ResponsiveModal>

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

      {/* CONFIRM PARTIAL CREATE */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className={cn(isMobile && "max-w-[calc(100vw-2rem)]")}>
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
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Volver y completar</AlertDialogCancel>
            <AlertDialogAction onClick={doSave} className="gac-gradient w-full sm:w-auto" disabled={saving}>
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sí, crear de todas formas'}
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

      {/* PROSPECT MODEL MANAGER */}
      <ProspectModelManager
        open={modelManagerOpen}
        onOpenChange={setModelManagerOpen}
        onModelsChanged={refetchProspectModels}
      />

      {/* PROSPECT SOURCE MANAGER */}
      <ProspectSourceManager
        open={sourceManagerOpen}
        onOpenChange={setSourceManagerOpen}
        onSourcesChanged={refetchSources}
      />

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
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
              onClick={() => { setBulkAction('salesperson'); setBulkValue(''); }}>
              <User className="w-3 h-3" /> Vendedor
            </Button>
            {canDelete && (
              <>
                <div className="w-px h-4 bg-gray-700 shrink-0 mx-1" />
                <Button size="sm" variant="ghost" className="text-red-400 hover:bg-white/10 hover:text-red-300 h-7 text-xs gap-1 shrink-0 whitespace-nowrap px-2"
                  onClick={() => setBulkConfirmDeleteOpen(true)}>
                  <Trash2 className="w-3 h-3" /> Eliminar
                </Button>
              </>
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
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
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
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
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setBulkAction(null); setBulkValue(''); setBulkBrand(''); }}>Cancelar</Button>
            <Button size="sm" className="flex-1 gac-gradient" disabled={bulkLoading || (bulkAction !== 'eventName' && bulkAction !== 'estadoVzla' && (!bulkValue || bulkValue === '__none'))} onClick={handleBulkApply}>
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK DELETE CONFIRMATION */}
      <AlertDialog open={bulkConfirmDeleteOpen} onOpenChange={setBulkConfirmDeleteOpen}>
        <AlertDialogContent className={cn(isMobile && "max-w-[calc(100vw-2rem)]")}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} prospecto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente <strong>{selectedIds.size}</strong> prospecto(s) seleccionados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={bulkLoading} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} disabled={bulkLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto">
              {bulkLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Eliminar ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProspectos;
