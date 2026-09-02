import { ReactNode } from 'react';
import NotificationCenter from '@/components/NotificationCenter';
import ProspectReminderPopup from '@/components/ProspectReminderPopup';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  CalendarDays, LogOut, Users, LayoutDashboard, ShieldCheck, ClipboardList,
  Car, BookOpen, MapPin, UserCheck, KeyRound, CalendarCheck, Globe,
} from 'lucide-react';
import imbLogo from '@/assets/imb-logo.png';

interface DealershipLayoutProps { children: ReactNode; }

// ALL modules are listed here. What appears is controlled entirely by hasPermission().
// The portal/vista only determines layout + redirect — NOT which modules are visible.
const menuGroups = [
  {
    group: 'General',
    items: [
      { label: 'Inicio',               icon: LayoutDashboard, path: '/concesionario',             module: 'dashboard'      },
      { label: 'Dashboard Global',     icon: Globe,           path: '/concesionario/dashboard-global', module: 'dashboard_global' },
    ],
  },
  {
    group: 'Servicios',
    items: [
      { label: 'Reservas / Servicios', icon: CalendarDays,    path: '/concesionario/reservas',    module: 'reservas'       },
      { label: 'Garantías',            icon: ShieldCheck,     path: '/concesionario/garantias',   module: 'garantias'      },
      { label: 'Historial',            icon: ClipboardList,   path: '/concesionario/historial',   module: 'historial'      },
    ],
  },
  {
    group: 'Ventas',
    items: [
      { label: 'Prospectos',           icon: Users,           path: '/concesionario/prospectos',  module: 'prospectos'     },
      { label: 'Eventos',              icon: CalendarCheck,   path: '/concesionario/eventos',     module: 'eventos'        },
    ],
  },
  {
    group: 'Inventario',
    items: [
      { label: 'Vehículos',            icon: Car,             path: '/concesionario/vehiculos',   module: 'vehiculos'      },
      { label: 'Modelos',              icon: BookOpen,        path: '/concesionario/modelos',     module: 'modelos'        },
    ],
  },
  {
    group: 'Administración',
    items: [
      { label: 'Clientes',             icon: UserCheck,       path: '/concesionario/clientes',    module: 'clientes'       },
      { label: 'Concesionarios',       icon: MapPin,          path: '/concesionario/concesionarios', module: 'concesionarios' },
      { label: 'Usuarios',             icon: UserCheck,       path: '/concesionario/usuarios',    module: 'usuarios'       },
      { label: 'Roles',                icon: KeyRound,        path: '/concesionario/roles',       module: 'roles'          },
    ],
  },
];

export default function DealershipLayout({ children }: DealershipLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role, signOut, hasPermission } = useAuth();

  const roleName = role?.name?.toLowerCase() || '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const isVendedor = roleName === 'vendedor';

  // Permissions determine what's visible — portal is only the layout
  const filteredGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        isAdmin || ['view', 'create', 'edit', 'delete'].some(a => hasPermission(`${item.module}.${a}`))
      ),
    }))
    .filter(group => group.items.length > 0);

  const allItems = filteredGroups.flatMap(g => g.items);

  // If user lands on /concesionario without dashboard.view, redirect to first available module
  if (location.pathname === '/concesionario' && !isAdmin && !hasPermission('dashboard.view') && allItems.length > 0) {
    return <Navigate to={allItems[0].path} replace />;
  }

  // No modules at all — show "no access" page
  if (allItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Sin módulos asignados</h2>
          <p className="text-sm text-muted-foreground">
            El rol <strong className="capitalize">"{role?.name}"</strong> no tiene permisos de visualización en ningún módulo. Contacta al administrador.
          </p>
          <Button variant="outline" onClick={async () => { await signOut(); navigate('/login'); }}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  const activeLabel = allItems.find(i =>
    location.pathname === i.path ||
    (i.path !== '/concesionario' && location.pathname.startsWith(i.path + '/'))
  )?.label || 'Inicio';

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <img src={imbLogo} alt="IMB" className="w-8 h-8 rounded-lg object-contain brightness-0 invert" />
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-display font-bold text-sidebar-foreground">IMB Movilidad</span>
              <span className="text-xs text-sidebar-foreground/60">
                {isVendedor ? 'Sesión Ventas' : 'Concesionario'}
              </span>
            </div>
          </div>
        </SidebarHeader>

        <Separator className="bg-sidebar-border" />

        <SidebarContent>
          {filteredGroups.map(group => (
            <SidebarGroup key={group.group}>
              <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map(item => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.path || (item.path !== '/concesionario' && location.pathname.startsWith(item.path + '/'))}
                        tooltip={item.label}
                        onClick={() => navigate(item.path)}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <Separator className="bg-sidebar-border" />
          <div className="p-2">
            <div className="flex items-center gap-3 px-2 py-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || profile?.email}
                </span>
                <span className="text-xs text-sidebar-foreground/60 capitalize">{role?.name || 'Sin rol'}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h2 className="text-sm font-medium text-muted-foreground">{activeLabel}</h2>
          <div className="ml-auto"><NotificationCenter /></div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <ProspectReminderPopup />
    </SidebarProvider>
  );
}
