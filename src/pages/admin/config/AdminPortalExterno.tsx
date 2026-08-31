import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  externalPortalAdminSessions, externalPortalCloseSession, externalPortalAdminAttempts,
  setExternalPortalEnabled, type PortalSession, type PortalAttempt,
} from '@/lib/externalPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import {
  Car, CheckCircle2, XCircle, LogOut, RefreshCw, ShieldAlert, Users2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Portal Mi Flota (/mi-flota) — clientes externos entran con placa + teléfono y ven su flota
 * y su historial de servicio. Esta pantalla es el interruptor y la auditoría del portal.
 *
 * SÍ es un módulo nuevo (`portal_externo`), a diferencia de Convenios: es una pantalla de
 * seguridad, no una vista de datos de Clientes.
 *
 * Sesiones y freno de fuerza bruta viven en tablas SIN policies (a propósito): todo pasa por
 * RPC SECURITY DEFINER. `session_key` que se muestra es un hash del token real, nunca el
 * token — cerrar sesión no necesita el token en texto plano.
 *
 * Ver supabase/migrations/20260831150000_convenios_y_portal_externo.sql.
 */

const AdminPortalExterno = () => {
  const { role, hasPermission } = useAuth();
  const roleName = role?.name?.toLowerCase() ?? '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const canView = isAdmin || hasPermission('portal_externo.view');
  const canEdit = isAdmin || hasPermission('portal_externo.edit');

  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  const [sessions, setSessions] = useState<PortalSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [closingKey, setClosingKey] = useState<string | null>(null);

  const [attempts, setAttempts] = useState<PortalAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('integration_configs' as any)
      .select('is_active')
      .eq('integration_name', 'external_portal')
      .single();
    setIsActive((data as any)?.is_active ?? false);
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try { setSessions(await externalPortalAdminSessions()); }
    catch (e) { console.error(e); toast.error('No se pudieron cargar las sesiones'); }
    setLoadingSessions(false);
  };

  const fetchAttempts = async () => {
    setLoadingAttempts(true);
    try { setAttempts(await externalPortalAdminAttempts(50)); }
    catch (e) { console.error(e); toast.error('No se pudieron cargar los intentos fallidos'); }
    setLoadingAttempts(false);
  };

  useEffect(() => {
    fetchConfig();
    if (canView) { fetchSessions(); fetchAttempts(); }
  }, [canView]);

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    try {
      await setExternalPortalEnabled(next);
      setIsActive(next);
      toast.success(next ? 'Portal Mi Flota activado' : 'Portal Mi Flota desactivado');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cambiar el estado del portal');
    }
    setToggling(false);
  };

  const handleCloseSession = async (key: string) => {
    setClosingKey(key);
    try {
      await externalPortalCloseSession(key);
      toast.success('Sesión cerrada');
      fetchSessions();
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cerrar la sesión');
    }
    setClosingKey(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });

  if (!canView) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No tenés permiso para ver esta pantalla.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Portal Mi Flota</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acceso público para clientes externos (placa + teléfono) a su flota y su historial de servicio.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="w-4 h-4" />
            Estado del portal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isActive === null ? (
                <Badge variant="outline">Cargando...</Badge>
              ) : isActive ? (
                <Badge className="bg-green-100 text-green-800 border-0 gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                </Badge>
              ) : (
                <Badge className="bg-red-100 text-red-800 border-0 gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Inactivo
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">/mi-flota</span>
            </div>
            {canEdit && isActive !== null && (
              <Switch checked={isActive} disabled={toggling} onCheckedChange={handleToggle} />
            )}
          </div>
          {isActive === false && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-800">
              Con el portal apagado, ningún cliente externo puede entrar a /mi-flota: el login
              rechaza cualquier placa y teléfono con un mensaje de "portal deshabilitado
              temporalmente". No se borra ninguna sesión ni dato al apagarlo.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users2 className="w-4 h-4" />
              Sesiones activas
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{sessions.length}</Badge>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchSessions} disabled={loadingSessions}>
              <RefreshCw className={cn('w-3.5 h-3.5', loadingSessions && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin sesiones activas.</p>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:py-1.5 [&>th]:text-[11px] [&>th]:font-semibold">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Entró</TableHead>
                  <TableHead>Vence</TableHead>
                  {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(s => (
                  <TableRow key={s.session_key} className="[&>td]:py-1.5">
                    <TableCell className="font-medium">{s.client_name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.expires_at)}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                          disabled={closingKey === s.session_key}
                          onClick={() => handleCloseSession(s.session_key)}
                          title="Cerrar sesión"
                        >
                          <LogOut className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Intentos fallidos recientes
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchAttempts} disabled={loadingAttempts}>
              <RefreshCw className={cn('w-3.5 h-3.5', loadingAttempts && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingAttempts ? (
            <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
          ) : attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin intentos fallidos recientes.</p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">
                5 intentos fallidos con la misma placa en 15 minutos bloquean esa placa temporalmente.
              </p>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {attempts.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <span className="font-mono font-medium">{a.plate}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(a.attempted_at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Separator />
    </div>
  );
};

export default AdminPortalExterno;
