import { ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3,
  CalendarDays,
  Car,
  LogOut,
  MapPin,
  ShieldCheck,
  Users,
  Wrench,
  ClipboardList,
  Settings,
  BookOpen,
  UserCheck,
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

// Each item has a `module` for permission checking (module.view)
const menuItems = [
  {
    group: 'General',
    items: [
      { label: 'Dashboard', icon: BarChart3, path: '/admin', module: 'dashboard' },
    ],
  },
  {
    group: 'Operaciones',
    items: [
      { label: 'Reservas', icon: CalendarDays, path: '/admin/reservas', module: 'reservas' },
      { label: 'Garantías', icon: ShieldCheck, path: '/admin/garantias', module: 'garantias' },
      { label: 'Historial de Servicios', icon: ClipboardList, path: '/admin/historial', module: 'historial' },
    ],
  },
  {
    group: 'Gestión',
    items: [
      { label: 'Clientes', icon: UserCheck, path: '/admin/clientes', module: 'clientes' },
      { label: 'Prospectos', icon: Users, path: '/admin/prospectos', module: 'prospectos' },
      { label: 'Modelos', icon: BookOpen, path: '/admin/modelos', module: 'modelos' },
      { label: 'Concesionarios', icon: MapPin, path: '/admin/concesionarios', module: 'concesionarios' },
      { label: 'Vehículos', icon: Car, path: '/admin/vehiculos', module: 'vehiculos' },
    ],
  },
  {
    group: 'Administración',
    items: [
      { label: 'Configuración', icon: Settings, path: '/admin/configuracion', module: 'configuracion' },
    ],
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-display font-bold text-sidebar-foreground">GAC Motor</span>
              <span className="text-xs text-sidebar-foreground/60">Panel Admin</span>
            </div>
          </div>
        </SidebarHeader>

        <Separator className="bg-sidebar-border" />

        <SidebarContent>
          {menuItems.map((group) => (
            <SidebarGroup key={group.group}>
              <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
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
                <span className="text-xs text-sidebar-foreground/60 capitalize">
                  {role?.name || 'Sin rol'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                onClick={handleSignOut}
              >
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
          <h2 className="text-sm font-medium text-muted-foreground">
            {menuItems.flatMap(g => g.items).find(i => i.path === location.pathname || location.pathname.startsWith(i.path + '/'))?.label || 'Dashboard'}
          </h2>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
