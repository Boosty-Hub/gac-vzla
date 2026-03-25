import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Settings, Pencil, MessageSquare, Info } from 'lucide-react';
import { toast } from 'sonner';

interface MessageTemplate {
  id: string;
  template_key: string;
  name: string;
  content: string;
  description: string | null;
  is_active: boolean;
}

const VARIABLE_HINTS: Record<string, string[]> = {
  prospect_greeting: ['{{prospecto}}', '{{vendedor}}', '{{modelo}}'],
  prospect_assigned: ['{{nombre}}', '{{telefono}}', '{{modelo}}', '{{fuente}}', '{{fecha}}'],
  reservation_confirmed: ['{{cliente}}', '{{fecha}}', '{{hora}}', '{{servicio}}', '{{vehiculo}}', '{{placa}}', '{{concesionario}}', '{{kilometraje}}', '{{notas}}'],
};

const AdminConfiguracion = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [tName, setTName] = useState('');
  const [tContent, setTContent] = useState('');
  const [tDescription, setTDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('message_templates' as any)
      .select('id, template_key, name, content, description, is_active')
      .order('name');
    setTemplates((data || []) as unknown as MessageTemplate[]);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openEdit = (t: MessageTemplate) => {
    setEditing(t);
    setTName(t.name);
    setTContent(t.content);
    setTDescription(t.description || '');
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!tContent.trim()) { toast.error('El contenido no puede estar vacío'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('message_templates' as any)
      .update({ name: tName.trim(), content: tContent.trim(), description: tDescription.trim() || null })
      .eq('id', editing.id);
    if (error) { toast.error('Error al guardar plantilla'); console.error(error); }
    else { toast.success('Plantilla actualizada'); setEditOpen(false); fetchTemplates(); }
    setSaving(false);
  };

  const handleToggle = async (t: MessageTemplate) => {
    await supabase.from('message_templates' as any).update({ is_active: !t.is_active }).eq('id', t.id);
    fetchTemplates();
  };

  const hints = editing ? (VARIABLE_HINTS[editing.template_key] || []) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes generales del sistema</p>
      </div>

      {/* PLANTILLAS */}
      <Card className="gac-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Plantillas de Mensajes
          </CardTitle>
          <p className="text-xs text-muted-foreground">Personaliza los mensajes de WhatsApp enviados desde el sistema</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Cargando plantillas...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <Settings className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No hay plantillas configuradas</p>
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 cursor-pointer" onClick={() => handleToggle(t)}>
                        {t.is_active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">{t.template_key}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1 text-xs" onClick={() => openEdit(t)}>
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap border">
                  {t.content}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* EDIT TEMPLATE DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Editar Plantilla
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={tName} onChange={e => setTName(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Input value={tDescription} onChange={e => setTDescription(e.target.value)} className="h-8 text-xs" placeholder="Descripción interna..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contenido del mensaje *</Label>
              <Textarea
                value={tContent}
                onChange={e => setTContent(e.target.value)}
                rows={6}
                className="text-xs font-mono"
                placeholder="Escribe el mensaje aquí..."
              />
            </div>
            {hints.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1">
                <p className="text-xs font-semibold text-blue-800 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Variables disponibles</p>
                <div className="flex flex-wrap gap-1">
                  {hints.map(v => (
                    <button
                      key={v}
                      type="button"
                      className="text-[11px] font-mono bg-blue-100 text-blue-700 border border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-200 transition-colors"
                      onClick={() => setTContent(prev => prev + v)}
                      title={`Insertar ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-blue-600">Haz clic en una variable para insertarla al final del mensaje.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gac-gradient">
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConfiguracion;
