import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, User, Phone, Mail, MessageSquare, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

interface ProspectModel {
  id: string;
  brand: string;
  name: string;
}

interface Dealership {
  id: string;
  name: string;
  city: string | null;
}

const PROSPECT_SOURCES = [
  { value: 'pagina_web', label: 'Página Web' },
  { value: 'redes_sociales', label: 'Redes Sociales' },
  { value: 'referido', label: 'Referido' },
  { value: 'evento', label: 'Evento' },
];

const PublicProspectos = () => {
  const [models, setModels] = useState<ProspectModel[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [modelInterest, setModelInterest] = useState('');
  const [source, setSource] = useState('pagina_web');
  const [dealershipId, setDealershipId] = useState('');
  const [eventName, setEventName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const [modelsRes, dealershipsRes] = await Promise.all([
        supabase.from('prospect_models' as any).select('id, brand, name').eq('is_active', true).order('brand').order('sort_order'),
        supabase.from('dealerships').select('id, name, city').eq('is_active', true).order('name'),
      ]);
      setModels((modelsRes.data || []) as unknown as ProspectModel[]);
      setDealerships(dealershipsRes.data || []);
      if (dealershipsRes.data?.length === 1) {
        setDealershipId(dealershipsRes.data[0].id);
      }
    };
    fetchData();
  }, []);

  const brands = Array.from(new Set(models.map(m => m.brand)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) { toast.error('El nombre es requerido'); return; }
    if (!phone.trim()) { toast.error('El teléfono es requerido'); return; }
    if (!email.trim()) { toast.error('El correo es requerido'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('El correo no es válido'); return; }
    if (!modelInterest) { toast.error('El modelo de interés es requerido'); return; }
    if (!dealershipId) { toast.error('El concesionario es requerido'); return; }

    const normalizedPhone = phone.trim().replace(/\D/g, '');
    if (normalizedPhone) {
      const { data: existing } = await supabase.from('prospects').select('id, name, phone').not('phone', 'is', null);
      const duplicate = (existing || []).find((p: any) => p.phone.replace(/\D/g, '') === normalizedPhone);
      if (duplicate) {
        toast.error(`Ya existe un registro con ese teléfono: ${duplicate.name}`);
        return;
      }
    }

    setSaving(true);
    const { error } = await supabase.from('prospects').insert({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      model_interest: modelInterest,
      source,
      status: 'nuevo',
      dealership_id: dealershipId,
      event_name: source === 'evento' ? eventName.trim() : null,
      notes: notes.trim() || null,
    } as any);

    setSaving(false);
    if (error) {
      toast.error('Error al enviar. Intenta de nuevo.');
      console.error(error);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Sonner />
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">¡Registro exitoso!</h2>
            <p className="text-muted-foreground text-sm">
              Gracias por tu interés. Un asesor se pondrá en contacto contigo pronto.
            </p>
            <Button onClick={() => { setSubmitted(false); setName(''); setPhone(''); setEmail(''); setModelInterest(''); setSource('pagina_web'); setDealershipId(dealerships.length === 1 ? dealerships[0].id : ''); setEventName(''); setNotes(''); }} variant="outline">
              Registrar otro
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Sonner />
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2">
            <img src="/gac-logo.png" alt="Logo" className="h-10 mx-auto" />
          </div>
          <CardTitle className="text-xl font-display">¿Interesado en un vehículo?</CardTitle>
          <CardDescription>Déjanos tus datos y un asesor te contactará</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo *</Label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" className="pl-9" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+58 412 1234567" className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="pl-9" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Modelo de interés *</Label>
              <Select value={modelInterest} onValueChange={setModelInterest}>
                <SelectTrigger><SelectValue placeholder="Selecciona un modelo" /></SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectGroup key={brand}>
                      <SelectLabel>{brand}</SelectLabel>
                      {models.filter(m => m.brand === brand).map(m => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dealerships.length > 1 && (
              <div className="space-y-2">
                <Label>Concesionario de preferencia *</Label>
                <Select value={dealershipId} onValueChange={setDealershipId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un concesionario" /></SelectTrigger>
                  <SelectContent>
                    {dealerships.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}{d.city ? ` — ${d.city}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>¿Cómo nos conociste?</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROSPECT_SOURCES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {source === 'evento' && (
              <div className="space-y-2">
                <Label>Nombre del evento</Label>
                <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Ej: Expo Auto 2026" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Comentarios (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="¿Algún detalle adicional?" rows={3} />
            </div>

            <Button type="submit" className="w-full gac-gradient" disabled={saving}>
              {saving ? 'Enviando...' : 'Enviar solicitud'}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Al enviar este formulario aceptas que te contactemos por los medios indicados.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicProspectos;
