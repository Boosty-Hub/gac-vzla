import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, User, Phone, Mail, MessageSquare, CheckCircle2, Plus, X } from 'lucide-react';
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

// re3: a prospect can hold multiple vehicle units (brand + model). The units are
// stored in `prospect_vehicles`; `prospects.model_interest` stays as the denormalized
// primary-unit mirror ("BRAND MODEL") that the list/detail/Kommo integration reads.
type ProspectUnit = { brand: string; model: string };
const MAX_PROSPECT_UNITS = 5;

// Denormalized mirror = first non-empty unit as "BRAND MODEL" (or just brand), else null.
const unitsToModelInterest = (units: ProspectUnit[]): string | null => {
  const valid = units.filter(u => u.brand.trim());
  if (valid.length === 0) return null;
  const primary = valid[0];
  return `${primary.brand} ${primary.model}`.trim();
};

const PublicProspectos = () => {
  const [models, setModels] = useState<ProspectModel[]>([]);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pUnits, setPUnits] = useState<ProspectUnit[]>([{ brand: '', model: '' }]);
  const [source, setSource] = useState('pagina_web');
  const [dealershipId, setDealershipId] = useState('');
  const [eventName, setEventName] = useState('');
  const [notes, setNotes] = useState('');
  const [testDrive, setTestDrive] = useState(false);
  const [personType, setPersonType] = useState('');
  const [gender, setGender] = useState('');
  const [ageRange, setAgeRange] = useState('');

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

  const updateUnit = (index: number, patch: Partial<ProspectUnit>) =>
    setPUnits(prev => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  const addUnit = () => setPUnits(prev => (prev.length >= MAX_PROSPECT_UNITS ? prev : [...prev, { brand: '', model: '' }]));
  const removeUnit = (index: number) => setPUnits(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) { toast.error('El nombre es requerido'); return; }
    if (!phone.trim()) { toast.error('El teléfono es requerido'); return; }
    if (!email.trim()) { toast.error('El correo es requerido'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('El correo no es válido'); return; }
    if (!pUnits.some(u => u.brand.trim() && u.model.trim())) { toast.error('El modelo de interés es requerido'); return; }
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
    // Anon can INSERT but not SELECT prospects (RLS), so we cannot read the id back.
    // Generate it client-side and reuse it for the prospect_vehicles rows.
    const prospectId = crypto.randomUUID();
    const { error } = await supabase.from('prospects').insert({
      id: prospectId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      model_interest: unitsToModelInterest(pUnits),
      source,
      status: 'nuevo',
      dealership_id: dealershipId,
      event_name: source === 'evento' ? eventName.trim() : null,
      notes: notes.trim() || null,
      test_drive: testDrive,
      person_type: personType || null,
      gender: gender || null,
      age_range: ageRange || null,
    } as any);

    if (error) {
      setSaving(false);
      toast.error('Error al enviar. Intenta de nuevo.');
      console.error(error);
      return;
    }

    // Persist every vehicle unit (anon INSERT policy allows it). model_interest above
    // already mirrors the primary unit for the list/detail/Kommo integration.
    const validUnits = pUnits.filter(u => u.brand.trim());
    if (validUnits.length > 0) {
      await supabase.from('prospect_vehicles' as any).insert(
        validUnits.map((u, i) => ({
          prospect_id: prospectId,
          brand: u.brand.trim(),
          model: u.model.trim() || null,
          sort_order: i,
        })),
      );
    }

    setSaving(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 py-8">
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
            <Button onClick={() => { setSubmitted(false); setName(''); setPhone(''); setEmail(''); setPUnits([{ brand: '', model: '' }]); setSource('pagina_web'); setDealershipId(dealerships.length === 1 ? dealerships[0].id : ''); setEventName(''); setNotes(''); setTestDrive(false); setPersonType(''); setGender(''); setAgeRange(''); }} variant="outline">
              Registrar otro
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center p-4 py-8">
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
              <Label>Modelos de interés *</Label>
              {pUnits.map((unit, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select value={unit.brand} onValueChange={(v) => updateUnit(idx, { brand: v, model: '' })}>
                    <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                    <SelectContent>
                      {brands.map(brand => (
                        <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Select value={unit.model} onValueChange={(v) => updateUnit(idx, { model: v })} disabled={!unit.brand}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder={unit.brand ? 'Modelo' : 'Primero la marca'} /></SelectTrigger>
                      <SelectContent>
                        {models.filter(m => m.brand === unit.brand).map(m => (
                          <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pUnits.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeUnit(idx)} title="Quitar modelo">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {pUnits.length < MAX_PROSPECT_UNITS && (
                <Button type="button" variant="outline" size="sm" onClick={addUnit}>
                  <Plus className="h-4 w-4 mr-1" /> Agregar modelo
                </Button>
              )}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de persona</Label>
                <Select value={personType} onValueChange={setPersonType}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="natural">Natural</SelectItem>
                    <SelectItem value="juridica">Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Género</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="femenino">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rango de edad</Label>
                <Select value={ageRange} onValueChange={setAgeRange}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20-30">20 a 30</SelectItem>
                    <SelectItem value="30-40">30 a 40</SelectItem>
                    <SelectItem value="40+">40 o más</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2 cursor-pointer h-10">
                  <Checkbox checked={testDrive} onCheckedChange={v => setTestDrive(!!v)} />
                  <span className="text-sm">Solicito Test Drive</span>
                </label>
              </div>
            </div>

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
