import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, User, Phone, Mail, Car, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useProspectModels } from '@/hooks/useProspectModels';
import { useSalespersons } from '@/hooks/useSalespersons';
import { createKommoLead } from '@/lib/kommo';

/**
 * Formulario de captación de un evento (2026-08-26).
 *
 * Lo que pide el requerimiento: al crear un evento queda listo un formulario corto para que
 * los vendedores carguen leads desde el stand, con el evento y los vendedores del evento ya
 * puestos, y sólo esos vendedores en el desplegable — no el listado completo.
 *
 * POR QUÉ PIDE SESIÓN Y NO ES PÚBLICO. El lead tiene que subir a Kommo exactamente igual que
 * uno cargado desde el panel, y eso lo hace la edge function `kommo-api`, que exige JWT. El
 * formulario público de /prospectos NO lo llama — por eso los leads que entran por ahí se
 * quedan en el sistema y no aparecen en el CRM. Repetir esa arquitectura en el módulo de
 * eventos habría roto justamente lo que el pedido dice que no se toca. Con sesión, el lead
 * entra a Prospectos, sube a Kommo y aparece en el evento, los tres por el mismo camino de
 * siempre. Se abre una vez en el celular o la tablet del stand y se usa todo el día.
 *
 * Escribe en `prospects` con `source = 'evento'` y `event_name` = el nombre del evento: la
 * MISMA columna que lee el módulo de Eventos y que escribe el webhook de Kommo. No hay tabla
 * nueva ni copia de datos.
 */

interface EventInfo {
  id: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  dealership_id: string | null;
  salesperson_ids: string[] | null;
  brands: string[] | null;
  capture_form_enabled: boolean;
  is_active: boolean;
}

const EventoCaptura = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { dealerships } = useDealershipAccess();
  const { models, brands } = useProspectModels();
  const { salespersons } = useSalespersons();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastName, setLastName] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [dealershipId, setDealershipId] = useState('');
  const [notes, setNotes] = useState('');
  const [testDrive, setTestDrive] = useState(false);
  // Aviso de teléfono repetido. Obliga a confirmar una segunda vez en vez de bloquear: en un
  // stand el mismo número vuelve, y perder el lead es peor que tener dos.
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  useEffect(() => {
    if (!eventId) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('prospect_events')
      .select('id, name, location, start_date, end_date, dealership_id, salesperson_ids, brands, capture_form_enabled, is_active')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error(error);
        if (!data) setNotFound(true);
        else {
          const ev = data as unknown as EventInfo;
          setEvent(ev);
          if (ev.dealership_id) setDealershipId(ev.dealership_id);
        }
        setLoading(false);
      });
  }, [eventId]);

  // El concesionario del evento manda; si no tiene, se usa el del usuario que abrió el
  // formulario. Sin concesionario la RLS rechaza el insert, así que nunca queda vacío.
  useEffect(() => {
    if (!dealershipId && dealerships.length > 0) setDealershipId(dealerships[0].id);
  }, [dealerships, dealershipId]);

  // Sólo los vendedores del evento. Si el evento no cargó ninguno, se ofrecen todos: es
  // preferible a un desplegable vacío que no deja registrar nada.
  const eventSalespersons = useMemo(() => {
    const ids = event?.salesperson_ids || [];
    if (ids.length === 0) return salespersons;
    return salespersons.filter(s => ids.includes(s.id));
  }, [event, salespersons]);

  const usingAllSalespersons = (event?.salesperson_ids || []).length === 0;

  // Las marcas del evento primero; el catálogo completo detrás, por si aparece un interesado
  // en algo que no se llevó al stand.
  const brandOptions = useMemo(() => {
    const eventBrands = (event?.brands || []).filter(b => brands.includes(b));
    const rest = brands.filter(b => !eventBrands.includes(b));
    return { eventBrands, rest };
  }, [event, brands]);

  const resetForm = () => {
    setName(''); setPhone(''); setEmail(''); setBrand(''); setModel('');
    setNotes(''); setTestDrive(false); setDuplicateWarning(false);
    // El vendedor NO se limpia: en un stand lo carga la misma persona toda la tarde.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    if (!name.trim()) { toast.error('El nombre y apellido es requerido'); return; }
    if (!phone.trim()) { toast.error('El teléfono es requerido'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('El correo no es válido');
      return;
    }
    if (!brand) { toast.error('El modelo de interés es requerido'); return; }
    if (!salesperson) { toast.error('Elegí el vendedor que atiende'); return; }
    if (!dealershipId) { toast.error('No hay concesionario asignado. Cargalo en el evento.'); return; }

    setSaving(true);

    if (!duplicateWarning) {
      const { data: exists } = await supabase.rpc('prospect_phone_exists', { p_phone: phone.trim() });
      if (exists) {
        setDuplicateWarning(true);
        setSaving(false);
        return;
      }
    }

    // Mismos campos que el alta desde el panel. `source: 'evento'` es el que ya usan
    // Prospectos y la importación; cambiarlo rompería los filtros y el mapeo de etapas de
    // Kommo. El estado NO se manda: lo pone la base con el de entrada del catálogo.
    const payload = {
      dealership_id: dealershipId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      model_interest: `${brand} ${model}`.trim(),
      source: 'evento',
      notes: notes.trim() || null,
      salesperson,
      event_name: event.name,
      test_drive: testDrive,
    };

    const { data: inserted, error } = await supabase
      .from('prospects')
      .insert(payload)
      .select('id')
      .single();

    if (error || !inserted) {
      setSaving(false);
      console.error(error);
      toast.error('No se pudo registrar el lead. Revisá los datos e intentá de nuevo.');
      return;
    }

    // Unidad de interés, igual que en el panel. Un fallo acá no invalida el lead: el
    // `model_interest` de arriba ya guarda lo mismo en texto.
    if (brand.trim()) {
      const { error: unitError } = await supabase.from('prospect_vehicles').insert({
        prospect_id: inserted.id,
        brand: brand.trim(),
        model: model.trim() || null,
        sort_order: 0,
      });
      if (unitError) console.error('[evento] unidad no guardada:', unitError);
    }

    // Kommo, sin await y sin bloquear: el lead ya está en el sistema. Es el MISMO llamado que
    // hace Prospectos al crear desde el panel.
    createKommoLead(inserted.id).catch(console.error);

    setSaving(false);
    setLastName(name.trim());
    resetForm();
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando el evento...
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-2">
            <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Este evento no existe</p>
            <p className="text-xs text-muted-foreground">
              Revisá el enlace o pedí uno nuevo desde el módulo de Eventos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!event.capture_form_enabled || !event.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-2">
            <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{event.name}</p>
            <p className="text-xs text-muted-foreground">
              {event.is_active
                ? 'El formulario de captación de este evento está apagado.'
                : 'Este evento está cerrado, así que ya no acepta registros.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se vuelve a prender desde Eventos → Editar.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 py-8">
        <Sonner />
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Lead registrado</h2>
            <p className="text-muted-foreground text-sm">
              <strong>{lastName}</strong> ya está en Prospectos y en el evento{' '}
              <strong>{event.name}</strong>.
            </p>
            <Button className="gac-gradient" onClick={() => setSubmitted(false)}>
              Registrar otro lead
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const modelsOfBrand = models.filter(m => m.brand === brand);

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 py-8">
      <Sonner />
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-1">
            <img src="/gac-logo.png" alt="Logo" className="h-9 mx-auto" />
          </div>
          <CardTitle className="text-lg font-display">{event.name}</CardTitle>
          <CardDescription className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {event.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              Registro: {new Date().toLocaleDateString('es-VE')}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre y apellido *</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={e => { setName(e.target.value); setDuplicateWarning(false); }}
                  placeholder="Nombre completo"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Teléfono *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setDuplicateWarning(false); }}
                    placeholder="04141234567"
                    className="pl-9"
                    inputMode="tel"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Correo</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Opcional"
                    className="pl-9"
                    inputMode="email"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Marca de interés *</Label>
                <Select value={brand} onValueChange={v => { setBrand(v); setModel(''); }}>
                  <SelectTrigger><SelectValue placeholder="Elegí la marca" /></SelectTrigger>
                  <SelectContent>
                    {brandOptions.eventBrands.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase text-muted-foreground">En el evento</SelectLabel>
                        {brandOptions.eventBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectGroup>
                    )}
                    {brandOptions.rest.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] uppercase text-muted-foreground">Otras marcas</SelectLabel>
                        {brandOptions.rest.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo</Label>
                <Select value={model} onValueChange={setModel} disabled={!brand}>
                  <SelectTrigger>
                    <SelectValue placeholder={brand ? 'Elegí el modelo' : 'Primero la marca'} />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsOfBrand.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Vendedor que atiende *</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger><SelectValue placeholder="Elegí el vendedor" /></SelectTrigger>
                <SelectContent>
                  {eventSalespersons.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {usingAllSalespersons && (
                <p className="text-[10px] text-muted-foreground">
                  Este evento no tiene vendedores asignados, así que se muestran todos. Se
                  cargan desde Eventos → Editar.
                </p>
              )}
            </div>

            {dealerships.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Concesionario</Label>
                <Select value={dealershipId} onValueChange={setDealershipId}>
                  <SelectTrigger><SelectValue placeholder="Elegí el concesionario" /></SelectTrigger>
                  <SelectContent>
                    {dealerships.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Lo que haya que recordar de la conversación"
                className="min-h-[60px] text-sm"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={testDrive} onCheckedChange={v => setTestDrive(!!v)} />
              <span className="text-xs">Hizo test drive en el evento</span>
            </label>

            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
              <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                Se registra en el evento{' '}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{event.name}</Badge>
              </p>
            </div>

            {duplicateWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-1">
                <p className="text-[11px] text-amber-900">
                  Ya hay un registro con este teléfono. Puede ser un cliente que vuelve, o el
                  mismo lead cargado dos veces.
                </p>
                <p className="text-[11px] text-amber-800">
                  Tocá <strong>Registrar lead</strong> otra vez para guardarlo igual.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full gac-gradient" disabled={saving}>
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Registrar lead'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EventoCaptura;
