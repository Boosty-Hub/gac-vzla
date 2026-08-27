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

/**
 * Formulario de captación de un evento. Link público: se abre y se llena sin iniciar sesión.
 *
 * Lo que pide el requerimiento: al crear un evento queda listo un formulario corto para cargar
 * leads desde el stand, con el evento y los vendedores del evento ya puestos, y sólo esos
 * vendedores en el desplegable — no el listado completo.
 *
 * POR QUÉ NO LEE TABLAS. Antes esta pantalla pedía sesión, y la razón era Kommo: el lead tiene
 * que subir al CRM igual que uno cargado desde el panel, y eso lo hacía la edge function
 * `kommo-api`, que exige JWT. Abrirla a `anon` habría sido exponer el proxy completo del CRM.
 * Así que la pantalla dejó de tocar tablas y de llamar a la edge function: todo pasa por dos
 * funciones de base (`event_capture_form` y `submit_event_lead`) que devuelven exactamente lo
 * que el formulario necesita y disparan Kommo desde el servidor con la llave del vault.
 * Resultado: el link queda abierto, `prospect_events` / `salespersons` / `prospect_vehicles`
 * siguen cerradas a `anon`, y el lead entra a Prospectos, sube a Kommo y aparece en el evento
 * por el mismo camino de siempre.
 *
 * El evento se apaga desde Eventos → Editar, con cualquiera de sus dos interruptores
 * (`is_active` y el del formulario). La base los vuelve a revisar al guardar, no sólo al
 * pintar: un evento que se cierra mientras alguien tiene el link abierto deja de aceptar leads.
 */

interface CaptureEvent {
  id: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  brands: string[];
  exhibited_vehicles: string[];
  has_dealership: boolean;
}

interface CaptureModel {
  brand: string;
  name: string;
}

interface CapturePerson {
  id: string;
  name: string;
}

interface CaptureForm {
  ok: boolean;
  reason?: string;
  name?: string;
  event?: CaptureEvent;
  models?: CaptureModel[];
  salespersons?: CapturePerson[];
}

/** `supabase.rpc` usa `this` adentro; guardarlo suelto lo desprende del cliente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, params?: Record<string, unknown>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, params);

/**
 * Motivos que devuelve `submit_event_lead`. Se traducen acá y no en la base para que el mensaje
 * se pueda cambiar sin migración. `duplicate_phone` no está en la lista: no es un error, abre el
 * aviso de confirmación.
 */
const SUBMIT_ERRORS: Record<string, string> = {
  not_found:           'Este evento ya no existe. Pedí un enlace nuevo.',
  closed:              'El evento se cerró y ya no acepta registros.',
  disabled:            'El formulario de este evento se apagó.',
  no_dealership:       'Este evento no tiene concesionario asignado. Cargalo en Eventos → Editar.',
  missing_name:        'El nombre y apellido es requerido.',
  missing_phone:       'El teléfono es requerido.',
  invalid_email:       'El correo no es válido.',
  invalid_salesperson: 'Ese vendedor ya no está habilitado para el evento. Elegí otro.',
  rate_limited:        'Se recibieron demasiados registros seguidos. Esperá un momento y reintentá.',
};

const EventoCaptura = () => {
  const { eventId } = useParams<{ eventId: string }>();

  const [form, setForm] = useState<CaptureForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [lastName, setLastName] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [notes, setNotes] = useState('');
  const [testDrive, setTestDrive] = useState(false);
  // Aviso de teléfono repetido. Obliga a confirmar una segunda vez en vez de bloquear: en un
  // stand el mismo número vuelve, y perder el lead es peor que tener dos.
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  useEffect(() => {
    if (!eventId) { setForm({ ok: false, reason: 'not_found' }); setLoading(false); return; }
    let alive = true;
    rpc('event_capture_form', { p_event_id: eventId })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error); setForm({ ok: false, reason: 'not_found' }); }
        else setForm((data as CaptureForm) ?? { ok: false, reason: 'not_found' });
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        console.error(e);
        setForm({ ok: false, reason: 'not_found' });
        setLoading(false);
      });
    return () => { alive = false; };
  }, [eventId]);

  const event = form?.ok ? form.event ?? null : null;
  const salespersons = useMemo(() => form?.salespersons ?? [], [form]);
  const models = useMemo(() => form?.models ?? [], [form]);
  const allBrands = useMemo(
    () => Array.from(new Set(models.map(m => m.brand))),
    [models],
  );

  // Las marcas del evento primero; el catálogo completo detrás, por si aparece un interesado
  // en algo que no se llevó al stand.
  const brandOptions = useMemo(() => {
    const eventBrands = (event?.brands || []).filter(b => allBrands.includes(b));
    const rest = allBrands.filter(b => !eventBrands.includes(b));
    return { eventBrands, rest };
  }, [event, allBrands]);

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

    setSaving(true);

    // Una sola llamada: valida, guarda la unidad de interés y encola el lead de Kommo. El
    // navegador no toca ninguna tabla, así que no hay alta a medias si algo falla.
    const { data, error } = await rpc('submit_event_lead', {
      p_event_id:        event.id,
      p_name:            name.trim(),
      p_phone:           phone.trim(),
      p_email:           email.trim() || null,
      p_brand:           brand || null,
      p_model:           model || null,
      p_salesperson:     salesperson || null,
      p_notes:           notes.trim() || null,
      p_test_drive:      testDrive,
      p_allow_duplicate: duplicateWarning,
    });

    setSaving(false);

    if (error) {
      console.error(error);
      toast.error('No se pudo registrar el lead. Revisá la conexión e intentá de nuevo.');
      return;
    }

    const result = data as { ok?: boolean; reason?: string } | null;

    if (!result?.ok) {
      if (result?.reason === 'duplicate_phone') { setDuplicateWarning(true); return; }
      toast.error(SUBMIT_ERRORS[result?.reason ?? ''] ?? 'No se pudo registrar el lead.');
      return;
    }

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

  if (!form?.ok || !event) {
    const reason = form?.reason;
    const closed = reason === 'closed' || reason === 'disabled';
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-2">
            <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{closed ? form?.name : 'Este evento no existe'}</p>
            <p className="text-xs text-muted-foreground">
              {reason === 'disabled'
                ? 'El formulario de captación de este evento está apagado.'
                : reason === 'closed'
                  ? 'Este evento está cerrado, así que ya no acepta registros.'
                  : 'Revisá el enlace o pedí uno nuevo desde el módulo de Eventos.'}
            </p>
            {closed && (
              <p className="text-xs text-muted-foreground">
                Se vuelve a prender desde Eventos → Editar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sin concesionario en el evento la base rechaza el alta. Se avisa acá en vez de dejar
  // llenar todo el formulario para que falle recién al tocar el botón.
  if (!event.has_dealership) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-2">
            <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{event.name}</p>
            <p className="text-xs text-muted-foreground">
              Este evento todavía no tiene concesionario asignado, así que no puede recibir leads.
            </p>
            <p className="text-xs text-muted-foreground">
              Se carga desde Eventos → Editar → Concesionario.
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
                    {modelsOfBrand.map(m => <SelectItem key={`${m.brand}-${m.name}`} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Vendedor que atiende *</Label>
              <Select value={salesperson} onValueChange={setSalesperson}>
                <SelectTrigger><SelectValue placeholder="Elegí el vendedor" /></SelectTrigger>
                <SelectContent>
                  {salespersons.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

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
