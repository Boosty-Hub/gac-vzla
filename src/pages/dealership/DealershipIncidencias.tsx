import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Plus, Search, User, Car, CalendarDays, FileText, Hash, X } from 'lucide-react';
import { TechnicalReportUploader } from '@/components/TechnicalReportUploader';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';

const INCIDENCIA_STATUSES: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  agendada: { label: 'Agendada', color: 'bg-blue-100 text-blue-800' },
  en_proceso: { label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  culminado: { label: 'Culminado', color: 'bg-green-100 text-green-800' },
};

interface Incidencia {
  id: string;
  dealership_id: string;
  client_id: string | null;
  vehicle_id: string | null;
  reservation_date: string;
  service_type: string;
  notes: string | null;
  current_mileage: number;
  status: string;
  technical_report_url: string | null;
  created_at: string;
  clients: { full_name: string; cedula: string | null; phone: string | null } | null;
  vehicles: { plate: string | null; year: number; vehicle_models: { name: string; brand: string } | null } | null;
}

interface ClientResult {
  id: string;
  full_name: string;
}

interface VehicleResult {
  id: string;
  plate: string | null;
  year: number;
  vehicle_models: { name: string; brand: string } | null;
}

const DealershipIncidencias = () => {
  const { dealerships, selectedDealership, setSelectedDealership, showSelector, loading: loadingAccess } = useDealershipAccess();
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Incidencia | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fClientSearch, setFClientSearch] = useState('');
  const [fClientResults, setFClientResults] = useState<ClientResult[]>([]);
  const [fClientId, setFClientId] = useState<string>('');
  const [fClientName, setFClientName] = useState<string>('');
  const [fClientDropdown, setFClientDropdown] = useState(false);
  const [fVehicleId, setFVehicleId] = useState<string>('');
  const [fVehicles, setFVehicles] = useState<VehicleResult[]>([]);
  const [fDate, setFDate] = useState<string>('');
  const [fDescription, setFDescription] = useState<string>('');
  const [fMileage, setFMileage] = useState<string>('');
  const [fMediaUrls, setFMediaUrls] = useState<string | null>(null);

  const clientSearchRef = useRef<HTMLDivElement>(null);

  const hoy = new Date().toISOString().split('T')[0];

  const fetchIncidencias = async () => {
    if (!selectedDealership) return;
    setLoading(true);
    const { data } = await supabase
      .from('reservations')
      .select('*, clients(full_name, cedula, phone), vehicles(plate, year, vehicle_models(name, brand))')
      .eq('dealership_id', selectedDealership)
      .eq('service_type', 'Incidencia')
      .order('reservation_date', { ascending: false })
      .limit(200);
    setIncidencias((data || []) as unknown as Incidencia[]);
    setLoading(false);
  };

  useEffect(() => {
    if (loadingAccess) return;
    if (selectedDealership) { fetchIncidencias(); }
    else { setLoading(false); }
  }, [selectedDealership, loadingAccess]);

  // Client search autocomplete
  useEffect(() => {
    if (!fClientSearch.trim() || fClientId) {
      setFClientResults([]);
      setFClientDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .ilike('full_name', `%${fClientSearch.trim()}%`)
        .limit(8);
      setFClientResults((data || []) as ClientResult[]);
      setFClientDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [fClientSearch, fClientId]);

  // Fetch vehicles when client is selected
  useEffect(() => {
    if (!fClientId) {
      setFVehicles([]);
      setFVehicleId('');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id, plate, year, vehicle_models(name, brand)')
        .eq('client_id', fClientId);
      setFVehicles((data || []) as unknown as VehicleResult[]);
    })();
  }, [fClientId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setFClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCreate = () => {
    setFClientSearch('');
    setFClientResults([]);
    setFClientId('');
    setFClientName('');
    setFClientDropdown(false);
    setFVehicleId('');
    setFVehicles([]);
    setFDate(hoy);
    setFDescription('');
    setFMileage('');
    setFMediaUrls(null);
    setCreateOpen(true);
  };

  const selectClient = (client: ClientResult) => {
    setFClientId(client.id);
    setFClientName(client.full_name);
    setFClientSearch(client.full_name);
    setFClientDropdown(false);
    setFClientResults([]);
  };

  const clearClient = () => {
    setFClientId('');
    setFClientName('');
    setFClientSearch('');
    setFClientResults([]);
    setFClientDropdown(false);
    setFVehicleId('');
    setFVehicles([]);
  };

  const handleSave = async () => {
    if (!fDate) { toast.error('La fecha es requerida'); return; }
    if (!fDescription.trim()) { toast.error('La descripción de la falla es requerida'); return; }

    setSaving(true);
    const payload = {
      dealership_id: selectedDealership,
      client_id: fClientId || null,
      vehicle_id: fVehicleId || null,
      reservation_date: fDate,
      reservation_time: '08:00',
      service_type: 'Incidencia',
      notes: fDescription.trim(),
      current_mileage: fMileage ? parseInt(fMileage) : 0,
      status: 'pendiente',
      technical_report_url: fMediaUrls || null,
    };

    const { error } = await supabase.from('reservations').insert(payload);
    if (error) {
      toast.error('Error al crear incidencia');
      console.error(error);
    } else {
      toast.success('Incidencia creada exitosamente');
      setCreateOpen(false);
      fetchIncidencias();
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('reservations').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); console.error(error); }
    else { toast.success('Estado actualizado'); fetchIncidencias(); }
  };

  const filteredIncidencias = incidencias.filter(inc => {
    if (statusFilter !== 'todos' && inc.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const client = (inc.clients?.full_name || '').toLowerCase();
      const notes = (inc.notes || '').toLowerCase();
      if (!client.includes(q) && !notes.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Incidencias</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <AlertTriangle className="w-3 h-3" /> {incidencias.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {showSelector && (
            <Select value={selectedDealership} onValueChange={setSelectedDealership}>
              <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={openCreate} className="gac-gradient">
            <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Incidencia
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o descripción..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs shrink-0"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(INCIDENCIA_STATUSES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== 'todos' || search) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setStatusFilter('todos'); setSearch(''); }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando incidencias...</p>
          </CardContent>
        ) : filteredIncidencias.length === 0 ? (
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No hay incidencias registradas</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente / Vehículo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIncidencias.map(inc => {
                const st = INCIDENCIA_STATUSES[inc.status] || INCIDENCIA_STATUSES.pendiente;
                const clientName = inc.clients?.full_name || '-';
                const vehicleInfo = inc.vehicles
                  ? `${inc.vehicles.vehicle_models?.brand || ''} ${inc.vehicles.vehicle_models?.name || ''} ${inc.vehicles.year}`.trim()
                  : '-';
                const plate = inc.vehicles?.plate || '-';
                const truncatedNotes = inc.notes && inc.notes.length > 60 ? inc.notes.slice(0, 60) + '…' : (inc.notes || '-');
                return (
                  <TableRow key={inc.id} className="[&>td]:py-1.5">
                    <TableCell className="font-medium">{inc.reservation_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground shrink-0" />{clientName}</div>
                      {inc.vehicles && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Car className="w-3 h-3 shrink-0" />{vehicleInfo} · {plate}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <span className="text-muted-foreground">{truncatedNotes}</span>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select
                        value={inc.status}
                        onValueChange={val => updateStatus(inc.id, val)}
                      >
                        <SelectTrigger className={cn('h-6 text-[10px] px-1.5 py-0 border-0 font-medium w-[110px]', st.color)}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(INCIDENCIA_STATUSES).map(([k, v]) => (
                            <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => { setDetailItem(inc); setDetailOpen(true); }}
                      >
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* DETAIL DIALOG */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Detalle de Incidencia
            </DialogTitle>
          </DialogHeader>
          {detailItem && (() => {
            const st = INCIDENCIA_STATUSES[detailItem.status] || INCIDENCIA_STATUSES.pendiente;
            return (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <Badge className={cn('text-xs px-2 py-0.5', st.color)}>{st.label}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {detailItem.created_at ? new Date(detailItem.created_at).toLocaleDateString('es-VE') : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">Fecha del reporte:</span>
                    <span>{detailItem.reservation_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">Cliente:</span>
                    <span>{detailItem.clients?.full_name || '-'}</span>
                    {detailItem.clients?.cedula && <span className="text-muted-foreground">· {detailItem.clients.cedula}</span>}
                    {detailItem.clients?.phone && <span className="text-muted-foreground">· {detailItem.clients.phone}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">Vehículo:</span>
                    {detailItem.vehicles ? (
                      <span>
                        {detailItem.vehicles.vehicle_models?.brand} {detailItem.vehicles.vehicle_models?.name} {detailItem.vehicles.year}
                        {detailItem.vehicles.plate && <span className="text-muted-foreground"> · {detailItem.vehicles.plate}</span>}
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </div>
                  {detailItem.current_mileage > 0 && (
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">Kilometraje:</span>
                      <span>{detailItem.current_mileage.toLocaleString()} km</span>
                    </div>
                  )}
                </div>
                <Separator />
                {detailItem.notes && (
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <p className="font-semibold mb-1 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Descripción de la falla</p>
                    <p className="text-muted-foreground whitespace-pre-wrap">{detailItem.notes}</p>
                  </div>
                )}
                {detailItem.technical_report_url && (
                  <div className="space-y-1">
                    <p className="font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-600" /> Archivos adjuntos</p>
                    <TechnicalReportUploader readonly value={detailItem.technical_report_url} onChange={() => {}} />
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Nueva Incidencia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Cliente */}
            <div className="space-y-1" ref={clientSearchRef}>
              <Label className="text-xs">Cliente</Label>
              <div className="relative">
                <div className="flex items-center gap-1">
                  <Input
                    value={fClientSearch}
                    onChange={e => {
                      setFClientSearch(e.target.value);
                      if (fClientId) { setFClientId(''); setFClientName(''); }
                    }}
                    placeholder="Buscar por nombre..."
                    className="h-8 text-xs"
                    disabled={!!fClientId}
                  />
                  {fClientId && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={clearClient}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {fClientDropdown && fClientResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {fClientResults.map(c => (
                      <div
                        key={c.id}
                        className="px-3 py-2 text-xs cursor-pointer hover:bg-accent"
                        onMouseDown={() => selectClient(c)}
                      >
                        {c.full_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {fClientId && (
                <p className="text-[10px] text-green-700 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" /> {fClientName} seleccionado
                </p>
              )}
            </div>

            {/* Vehículo */}
            {fClientId && (
              <div className="space-y-1">
                <Label className="text-xs">Vehículo</Label>
                {fVehicles.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">Este cliente no tiene vehículos registrados</p>
                ) : (
                  <Select value={fVehicleId} onValueChange={setFVehicleId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar vehículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {fVehicles.map(v => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          {v.vehicle_models?.brand} {v.vehicle_models?.name} {v.year}{v.plate ? ` · ${v.plate}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Fecha */}
            <div className="space-y-1">
              <Label className="text-xs">Fecha del reporte *</Label>
              <Input
                type="date"
                value={fDate}
                onChange={e => setFDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-1">
              <Label className="text-xs">Descripción de la falla *</Label>
              <Textarea
                value={fDescription}
                onChange={e => setFDescription(e.target.value)}
                rows={4}
                placeholder="Describa la falla, desperfecto o problema observado..."
                className="text-xs resize-none"
              />
            </div>

            {/* Kilometraje */}
            <div className="space-y-1">
              <Label className="text-xs">Kilometraje actual</Label>
              <Input
                type="number"
                value={fMileage}
                onChange={e => setFMileage(e.target.value)}
                placeholder="Ej: 25000"
                className="h-8 text-xs"
              />
            </div>

            {/* Archivos adjuntos */}
            <div className="space-y-1">
              <Label className="text-xs">Archivos adjuntos (fotos/videos)</Label>
              <TechnicalReportUploader maxSizeMB={100} value={fMediaUrls} onChange={setFMediaUrls} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Crear Incidencia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DealershipIncidencias;
