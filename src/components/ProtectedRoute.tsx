import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  allowedPortals?: string[];
}

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

export function ProtectedRoute({ children, allowedRoles, allowedPortals }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

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
      // Avoid redirect loop: if redirect path is the SAME route, just render to prevent infinite loop
      if (typeof window !== 'undefined' && window.location.pathname.startsWith(redirect)) {
        return <>{children}</>;
      }
      return <Navigate to={redirect} replace />;
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
