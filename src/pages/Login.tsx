import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import gacLogo from '@/assets/gac-logo.png';
import dfskLogo from '@/assets/dfsk-logo.png';
import imbLogo from '@/assets/imb-logo.png';

const Login = () => {
  const { user, role, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (user && role) {
    const portalPaths: Record<string, string> = {
      admin: '/admin',
      concesionario: '/concesionario',
      cliente: '/usuario',
    };
    const portal = role.redirect_portal || role.name;
    return <Navigate to={portalPaths[portal] || '/usuario'} replace />;
  }

  if (user && !role && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message === 'Invalid login credentials'
            ? 'Credenciales incorrectas'
            : error.message);
        } else {
          toast.success('Sesión iniciada correctamente');
        }
      } else {
        if (!fullName.trim()) {
          toast.error('Por favor ingresa tu nombre completo');
          setSubmitting(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success('Cuenta creada. Revisa tu correo para confirmar tu cuenta.');
          setIsLogin(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with gradient */}
      <header className="imb-gradient px-6 py-10 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(356_95%_46%/0.15),transparent_50%)]" />
        <div className="relative max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-6 mb-3">
            <img src={gacLogo} alt="GAC Motor" className="h-8 brightness-0 invert" />
            <div className="w-px h-8 bg-primary-foreground/30" />
            <img src={dfskLogo} alt="DFSK" className="h-7 brightness-0 invert" />
          </div>
          <h1 className="text-2xl font-display font-bold text-primary-foreground tracking-tight">
            IMB Movilidad
          </h1>
          <p className="text-primary-foreground/70 text-sm mt-1">
            Sistema de Gestión de Servicios y Reservas
          </p>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <Card className="w-full max-w-md imb-shadow">
          <CardHeader className="text-center pb-4">
            <CardTitle className="font-display text-xl">
              {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? 'Ingresa tus credenciales para acceder al sistema'
                : 'Completa los datos para registrarte'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Juan Pérez"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-9"
                      required={!isLogin}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full imb-gradient" disabled={submitting}>
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isLogin ? (
                  'Iniciar Sesión'
                ) : (
                  'Crear Cuenta'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-primary hover:underline"
              >
                {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
              </button>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="bg-muted py-4 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4 mb-1">
          <img src={gacLogo} alt="GAC" className="h-4 opacity-40" />
          <img src={dfskLogo} alt="DFSK" className="h-3.5 opacity-40" />
        </div>
        © 2025 IMB Movilidad · GAC Motor & DFSK Venezuela
      </footer>
    </div>
  );
};

export default Login;
