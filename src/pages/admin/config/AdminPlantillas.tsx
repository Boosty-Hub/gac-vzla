import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageCircle, Pencil, Plus, Eye, Info } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
  id: string;
  template_key: string;
  name: string;
  content: string;
  description: string | null;
  is_active: boolean;
}

const TEMPLATE_VAR_GROUPS: Record<string, { key: string; desc: string }[]> = {
  reservation_confirmed: [
    { key: 'cliente', desc: 'Nombre del cliente' },
    { key: 'fecha', desc: 'Fecha de la reserva' },
    { key: 'hora', desc: 'Hora de la reserva' },
    { key: 'servicio', desc: 'Tipo de servicio' },
    { key: 'vehiculo', desc: 'Marca, modelo y año del vehículo' },
    { key: 'placa', desc: 'Placa del vehículo' },
    { key: 'concesionario', desc: 'Nombre del concesionario' },
    { key: 'kilometraje', desc: 'Kilometraje actual' },
    { key: 'notas', desc: 'Notas adicionales' },
  ],
  prospect_assigned: [
    { key: 'nombre', desc: 'Nombre del prospecto' },
    { key: 'telefono', desc: 'Teléfono del prospecto' },
    { key: 'email', desc: 'Email del prospecto' },
    { key: 'modelo', desc: 'Modelo de interés' },
    { key: 'concesionario', desc: 'Nombre del concesionario' },
    { key: 'fuente', desc: 'Fuente del prospecto' },
    { key: 'estado', desc: 'Estado del prospecto' },
    { key: 'notas', desc: 'Notas del prospecto' },
    { key: 'fecha', desc: 'Fecha de creación' },
  ],
};

const ALL_VARS = Object.values(TEMPLATE_VAR_GROUPS).flat().filter((v, i, arr) => arr.findIndex(x => x.key === v.key) === i);

function processPreview(template: string): string {
  const sampleVars: Record<string, string> = {
    cliente: 'Juan Pérez',
    fecha: 'martes, 18 de marzo de 2026',
    hora: '8:00 AM',
    servicio: 'Alineación y balanceo',
    vehiculo: 'DFSK Glory 500 2025',
    placa: 'AH963OD',
    concesionario: 'Automotores La Florida C.A.',
    kilometraje: '30,000',
    notas: 'Revisar frenos traseros',
    nombre: 'María González',
    telefono: '0412-1234567',
    email: 'maria@email.com',
    modelo: 'GAC GS4 2025',
    fuente: 'Instagram',
    estado: 'Nuevo',
  };

  let result = template;
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return sampleVars[key] ? content : '';
  });
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVars[key] || `{{${key}}}`);
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

const AdminPlantillas = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [current, setCurrent] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', template_key: '', content: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .order('name');
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openEdit = (t?: Template) => {
    if (t) {
      setCurrent(t);
      setForm({ name: t.name, template_key: t.template_key, content: t.content, description: t.description || '' });
    } else {
      setCurrent(null);
      setForm({ name: '', template_key: '', content: '', description: '' });
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.template_key || !form.content) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }
    setSaving(true);
    if (current) {
      const { error } = await supabase
        .from('message_templates')
        .update({ name: form.name, content: form.content, description: form.description || null })
        .eq('id', current.id);
      if (error) toast.error('Error al guardar');
      else toast.success('Plantilla actualizada');
    } else {
      const { error } = await supabase
        .from('message_templates')
        .insert({ name: form.name, template_key: form.template_key, content: form.content, description: form.description || null });
      if (error) toast.error(error.message);
      else toast.success('Plantilla creada');
    }
    setSaving(false);
    setEditOpen(false);
    fetchTemplates();
  };

  const toggleActive = async (t: Template) => {
    await supabase.from('message_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    fetchTemplates();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Plantillas de Mensajes</h1>
          <p className="text-sm text-muted-foreground">Personaliza los mensajes de WhatsApp enviados a los clientes</p>
        </div>
        <Button onClick={() => openEdit()} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Nueva Plantilla
        </Button>
      </div>

      {/* Variables reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            Variables disponibles
          </CardTitle>
          <CardDescription className="text-xs">
            Usa {'{{variable}}'} para insertar datos. Para bloques condicionales usa {'{{#variable}}...{{/variable}}'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_VARS.map(v => (
              <Badge key={v.key} variant="outline" className="text-xs font-mono">
                {`{{${v.key}}}`} <span className="ml-1 font-sans text-muted-foreground">– {v.desc}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Templates list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No hay plantillas creadas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="w-4 h-4 text-green-600 shrink-0" />
                      <h3 className="font-semibold text-sm">{t.name}</h3>
                      <Badge variant="outline" className="text-xs font-mono">{t.template_key}</Badge>
                      {!t.is_active && <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
                    <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap max-h-32 overflow-auto">
                      {t.content}
                    </pre>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                    <Button variant="ghost" size="icon" onClick={() => { setCurrent(t); setPreviewOpen(true); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current ? 'Editar Plantilla' : 'Nueva Plantilla'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Reserva Confirmada" />
              </div>
              <div>
                <Label>Clave única</Label>
                <Input
                  value={form.template_key}
                  onChange={e => setForm(f => ({ ...f, template_key: e.target.value }))}
                  placeholder="Ej: reservation_confirmed"
                  disabled={!!current}
                />
              </div>
            </div>
            <div>
              <Label>Descripción (opcional)</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe cuándo se usa esta plantilla" />
            </div>
            <div>
              <Label>Contenido del mensaje</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12}
                className="font-mono text-sm"
                placeholder="Escribe el mensaje usando las variables disponibles..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Vista previa
            </DialogTitle>
          </DialogHeader>
          {current && (
            <div className="bg-[#e5ddd5] rounded-lg p-4">
              <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[85%] ml-auto shadow-sm">
                <pre className="text-sm whitespace-pre-wrap font-sans text-[#303030] leading-relaxed">
                  {processPreview(current.content)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPlantillas;
