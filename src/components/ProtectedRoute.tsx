import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  allowedPortals?: string[];
  /**
   * Módulo que hay que poder ver para entrar. Se cumple con cualquiera de
   * `<module>.view|create|edit|delete`, el mismo criterio con el que los menús deciden si
   * muestran el ítem — así la barra lateral y la URL no pueden contradecirse.
   *
   * Existe porque hasta ahora las rutas sólo miraban el PORTAL. El menú escondía lo que no
   * correspondía, pero escribir la dirección a mano entraba igual: un vendedor podía abrir
   * /concesionario/roles y ver la matriz completa de roles y permisos, o /concesionario/
   * concesionarios y ver todos los concesionarios del país.
   */
  requiredModule?: string;
}

const ACCIONES = ['view', 'create', 'edit', 'delete'];

const portalPaths: Record<string, string> = {
  admin: '/admin',
  concesionario: '/concesionario',
  cliente: '/usuario',
};

function getRedirectPath(role: { name: string; redirect_portal?: string } | null): string {
  if (!role) return '/login';
  const portal = role.redirect_portal || role.name?.toLowerCase();
  return portalPaths[portal] || '/usuario';
}

export function ProtectedRoute({ children, allowedRoles, allowedPortals, requiredModule }: ProtectedRouteProps) {
  const { user, role, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role) {
    const roleName = (role.name || '').toLowerCase();
    let hasAccess = false;
    if (allowedRoles) {
      hasAccess = allowedRoles.some(r => r?.toLowerCase() === roleName);
    }
    if (!hasAccess && allowedPortals) {
      hasAccess = allowedPortals.includes(role.redirect_portal || '');
    }
    // No restrictions = allow
    if (!allowedRoles && !allowedPortals) hasAccess = true;

    if (!hasAccess) {
      const redirect = getRedirectPath(role);
      // Escape anti-bucle: si el destino del redirect ES esta misma ruta, redirigir la
      // dejaría girando para siempre, así que se renderiza.
      //
      // La comparación tiene que ser EXACTA. Con `startsWith` alcanzaba con que la ruta
      // empezara igual que el portal: un rol de portal admin sin `allowedRoles` entrando a
      // /admin/configuracion/roles calculaba redirect='/admin', y como
      // '/admin/configuracion/roles'.startsWith('/admin') da true, la página se renderizaba
      // igual. Ese agujero abría las nueve pantallas de configuración — roles, usuarios,
      // plantillas, automatizaciones — a cualquiera con portal admin.
      const rutaActual = typeof window !== 'undefined' ? window.location.pathname : '';
      const mismaRuta = rutaActual === redirect || rutaActual === `${redirect}/`;
      if (mismaRuta) {
        return <>{children}</>;
      }
      return <Navigate to={redirect} replace />;
    }

    // Permiso de módulo. Va después del chequeo de portal para que quien no debería estar en
    // este portal se vaya al suyo, en vez de rebotar contra un permiso que igual no tiene.
    //
    // No se aplica a la home de cada portal: ahí el layout ya manda al primer módulo
    // disponible, y ponerle guarda acá crearía el bucle que el escape de arriba tapa
    // renderizando — o sea, dejaría entrar igual.
    if (requiredModule && !ACCIONES.some(a => hasPermission(`${requiredModule}.${a}`))) {
      return <Navigate to={getRedirectPath(role)} replace />;
    }
  }

  return <>{children}</>;
}

export function RedirectByRole() {
  const { user, role, loading } = useAuth();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    // Give profile loading a moment to complete after auth
    if (user && !role && !loading) {
      const timer = setTimeout(() => setWaited(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [user, role, loading]);

  if (loading || (user && !role && !waited)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role) {
    return <Navigate to={getRedirectPath(role)} replace />;
  }

  return <Navigate to="/usuario" replace />;
}
