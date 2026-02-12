import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { KeyRound, Eye, Plus, Pencil, Trash2, Check } from 'lucide-react';

interface Permission {
  id: string;
  name: string;
  module: string;
}

const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

const ACTION_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
  view: { label: 'Ver', icon: Eye },
  create: { label: 'Crear', icon: Plus },
  edit: { label: 'Editar', icon: Pencil },
  delete: { label: 'Eliminar', icon: Trash2 },
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  clientes: 'Clientes',
  vehiculos: 'Vehículos',
  modelos: 'Modelos',
  concesionarios: 'Concesionarios',
  reservas: 'Reservas',
  garantias: 'Garantías',
  historial: 'Historial',
  usuarios: 'Usuarios',
  roles: 'Roles',
};

const AdminPermisos = () => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('permissions')
      .select('id, name, module')
      .order('module')
      .order('name');
    setPermissions(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPermissions(); }, []);

  // Group by module
  const modules = [...new Set(permissions.map(p => p.module))];

  const hasPermission = (mod: string, action: string) => {
    return permissions.some(p => p.name === `${mod}.${action}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-display font-bold">Permisos del Sistema</h1>
          <Badge variant="outline" className="gap-1 text-xs">
            <KeyRound className="w-3 h-3" /> {permissions.length}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Matriz de permisos por módulo. Los permisos se asignan a los roles desde la sección de Roles.
      </p>

      <Card className="gac-shadow">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Cargando permisos...</p>
          </CardContent>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead className="min-w-[140px]">Módulo</TableHead>
                {ACTIONS.map(a => {
                  const { label, icon: Icon } = ACTION_LABELS[a];
                  return (
                    <TableHead key={a} className="text-center w-[90px]">
                      <div className="flex items-center justify-center gap-1">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map(mod => (
                <TableRow key={mod} className="[&>td]:py-2">
                  <TableCell className="font-medium capitalize">{MODULE_LABELS[mod] || mod}</TableCell>
                  {ACTIONS.map(a => (
                    <TableCell key={a} className="text-center">
                      {hasPermission(mod, a) ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default AdminPermisos;
