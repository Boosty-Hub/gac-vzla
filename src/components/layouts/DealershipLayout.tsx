import { ReactNode } from 'react';
import NotificationCenter from '@/components/NotificationCenter';
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
  CalendarDays,
  LogOut,
  Users,
  LayoutDashboard,
} from 'lucide-react';
import imbLogo from '@/assets/imb-logo.png';

interface DealershipLayoutProps {
  children: ReactNode;
}

const menuItems = [
  {
    group: 'General',
    items: [
      { label: 'Inicio', icon: LayoutDashboard, path: '/concesionario' },
    ],
  },
  {
    group: 'Operaciones',
    items: [
      { label: 'Reservas', icon: CalendarDays, path: '/concesionario/reservas' },
      { label: 'Prospectos', icon: Users, path: '/concesionario/prospectos' },
    ],
  },
];

export default function DealershipLayout({ children }: DealershipLayoutProps) {
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
            <img src={imbLogo} alt="IMB" className="w-8 h-8 rounded-lg object-contain brightness-0 invert" />
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-display font-bold text-sidebar-foreground">IMB Movilidad</span>
              <span className="text-xs text-sidebar-foreground/60">Concesionario</span>
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
            {menuItems.flatMap(g => g.items).find(i => location.pathname === i.path || (i.path !== '/concesionario' && location.pathname.startsWith(i.path + '/')))?.label || 'Inicio'}
          </h2>
          <div className="ml-auto">
            <NotificationCenter />
          </div>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
