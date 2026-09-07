import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Settings, Pencil, MessageSquare, Info, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface MessageTemplate {
  id: string;
  template_key: string;
  name: string;
  content: string;
  description: string | null;
  is_active: boolean;
}

/**
 * Correos que no identifican a nadie: los de relleno que llegan desde Kommo (na@na.com y
 * compañía). `fn_resolve_or_create_client_for_prospect` los descarta como llave de
 * deduplicación y el cartel de identidad de WonProspectDialog los usa para avisar antes de
 * enganchar una venta a la ficha equivocada. Aparecen seguido, así que la lista se administra
 * acá y no por SQL. Ver supabase/migrations/20260907210000_blindaje_dueno_vehiculo.sql.
 */
interface BlocklistEmail {
  email: string;
  motivo: string | null;
  created_at: string;
}

/** Igual que la comparación de la base (`b.email = lower(trim(p.email))`): sin esto, un
 *  correo cargado con mayúsculas queda en la lista sin bloquear nada. */
const normalizeBlocklistEmail = (raw: string): string => raw.trim().toLowerCase();

const VARIABLE_HINTS: Record<string, string[]> = {
  prospect_greeting: ['{{prospecto}}', '{{vendedor}}', '{{modelo}}'],
  prospect_assigned: ['{{nombre}}', '{{telefono}}', '{{modelo}}', '{{fuente}}', '{{fecha}}'],
  reservation_confirmed: ['{{cliente}}', '{{fecha}}', '{{hora}}', '{{servicio}}', '{{vehiculo}}', '{{placa}}', '{{concesionario}}', '{{kilometraje}}'],
};

const AdminConfiguracion = () => {
  const { role } = useAuth();
  const roleName = role?.name?.toLowerCase() || '';
  // Mismo criterio que el resto del blindaje: la policy de escritura de la tabla exige
  // is_admin_user(), y la pantalla no muestra lo que el servidor va a rechazar.
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
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

  const [blocklist, setBlocklist] = useState<BlocklistEmail[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(true);
  const [blocklistError, setBlocklistError] = useState(false);
  const [newBlockedEmail, setNewBlockedEmail] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('');
  const [blocklistSaving, setBlocklistSaving] = useState(false);
  const [removingBlocked, setRemovingBlocked] = useState<BlocklistEmail | null>(null);

  const fetchBlocklist = async () => {
    setBlocklistLoading(true);
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('identity_blocklist_emails' as any)
      .select('email, motivo, created_at')
      .order('email');
    if (error) console.error('Error cargando la lista de correos de relleno:', error);
    setBlocklistError(!!error);
    setBlocklist((data || []) as unknown as BlocklistEmail[]);
    setBlocklistLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchBlocklist(); }, [isAdmin]);

  const handleAddBlockedEmail = async () => {
    const email = normalizeBlocklistEmail(newBlockedEmail);
    if (!email) { toast.error('Escribe el correo que quieres marcar como relleno'); return; }
    if (blocklist.some(b => b.email === email)) { toast.error('Ese correo ya está en la lista'); return; }
    setBlocklistSaving(true);
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('identity_blocklist_emails' as any)
      .insert({ email, motivo: newBlockedReason.trim() || null });
    setBlocklistSaving(false);
    if (error) {
      console.error(error);
      // La llave primaria es el propio correo: un 23505 sólo puede ser una carrera contra
      // otra pestaña, no un dato inválido.
      toast.error(error.code === '23505' ? 'Ese correo ya está en la lista' : 'No se pudo agregar el correo');
      return;
    }
    toast.success(`${email} ya no identifica a ningún cliente.`);
    setNewBlockedEmail('');
    setNewBlockedReason('');
    fetchBlocklist();
  };

  const handleRemoveBlockedEmail = async () => {
    if (!removingBlocked) return;
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('identity_blocklist_emails' as any)
      .delete()
      .eq('email', removingBlocked.email);
    if (error) { console.error(error); toast.error('No se pudo quitar el correo'); return; }
    toast.success(`${removingBlocked.email} vuelve a contar como identidad.`);
    setRemovingBlocked(null);
    fetchBlocklist();
  };

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

      {/* CORREOS DE RELLENO */}
      {isAdmin && (
        <Card className="gac-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Correos que no identifican al cliente
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Correos de relleno (na@na.com y parecidos) que llegan repetidos desde Kommo. Un correo de
              esta lista deja de servir para reconocer al comprador de un prospecto ganado, así que la
              venta ya no se engancha a la ficha equivocada.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Correo</Label>
                <Input
                  value={newBlockedEmail}
                  onChange={e => setNewBlockedEmail(e.target.value)}
                  placeholder="na@na.com"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Motivo</Label>
                <Input
                  value={newBlockedReason}
                  onChange={e => setNewBlockedReason(e.target.value)}
                  placeholder="Ej: relleno de Kommo, lo comparten cientos de leads"
                  className="h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                className="gac-gradient h-8 text-xs"
                disabled={blocklistSaving || !newBlockedEmail.trim()}
                onClick={handleAddBlockedEmail}
              >
                {blocklistSaving
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Plus className="w-3.5 h-3.5 mr-1" /> Agregar</>}
              </Button>
            </div>

            {blocklistLoading ? (
              <p className="text-xs text-muted-foreground py-2">Cargando lista...</p>
            ) : blocklistError ? (
              <p className="text-xs text-destructive py-2">
                No se pudo cargar la lista. Actualiza la página e inténtalo de nuevo.
              </p>
            ) : blocklist.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                La lista está vacía: hoy cualquier correo cuenta como identidad del comprador.
              </p>
            ) : (
              <div className="space-y-1.5">
                {blocklist.map(b => (
                  <div key={b.email} className="border rounded-md p-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold font-mono truncate">{b.email}</p>
                      {b.motivo && <p className="text-[11px] text-muted-foreground">{b.motivo}</p>}
                      <p className="text-[10px] text-muted-foreground">
                        Agregado el {format(new Date(b.created_at), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive shrink-0"
                      onClick={() => setRemovingBlocked(b)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!removingBlocked} onOpenChange={open => { if (!open) setRemovingBlocked(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar {removingBlocked?.email} de la lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Ese correo vuelve a servir para reconocer al comprador de un prospecto ganado. Si lo
              comparten varios clientes, las ventas pueden volver a engancharse a la ficha equivocada.
              Puedes agregarlo de nuevo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveBlockedEmail}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
