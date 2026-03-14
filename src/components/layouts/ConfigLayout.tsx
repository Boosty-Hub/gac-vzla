import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ArrowLeft, Users, Shield, KeyRound, Settings, Wrench, ShieldCheck, SlidersHorizontal, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import imbLogo from '@/assets/imb-logo.png';

interface ConfigLayoutProps {
  children: ReactNode;
}

const configMenu = [
  { label: 'General', icon: SlidersHorizontal, path: '/admin/configuracion/general' },
  { label: 'Usuarios', icon: Users, path: '/admin/configuracion/usuarios' },
  { label: 'Roles', icon: Shield, path: '/admin/configuracion/roles' },
  { label: 'Permisos', icon: KeyRound, path: '/admin/configuracion/permisos' },
  { label: 'Servicios', icon: Wrench, path: '/admin/configuracion/servicios' },
  { label: 'Garantías', icon: ShieldCheck, path: '/admin/configuracion/garantias' },
  { label: 'Plantillas', icon: MessageCircle, path: '/admin/configuracion/plantillas' },
];

export default function ConfigLayout({ children }: ConfigLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role } = useAuth();

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Settings className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-display font-bold">Configuración</span>
              <span className="text-xs text-sidebar-foreground/60">IMB Movilidad</span>
            </div>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <div className="p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => navigate('/admin')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al panel
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        <div className="p-3 flex-1">
          <nav className="space-y-0.5">
            {configMenu.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <Separator className="bg-sidebar-border" />
        <div className="p-2">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{profile?.full_name || profile?.email}</span>
              <span className="text-xs text-sidebar-foreground/60 capitalize">{role?.name || 'Sin rol'}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-6 shrink-0">
          <h2 className="text-sm font-medium text-muted-foreground">
            {configMenu.find(i => i.path === location.pathname)?.label || 'Configuración'}
          </h2>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
