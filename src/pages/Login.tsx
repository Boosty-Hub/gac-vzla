import { useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Mail, Lock, User, Eye, EyeOff, Car, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import gacLogo from '@/assets/gac-logo.png';
import dfskLogo from '@/assets/dfsk-logo.png';

const Login = () => {
  const { user, role, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Plate login state
  const [plate, setPlate] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);

  // PIN login state
  const [pinCode, setPinCode] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

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

  const handlePlateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim()) {
      toast.error('Ingresa la placa de tu vehículo');
      return;
    }
    setPlateLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('login-by-plate', {
        body: { plate: plate.trim() },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Error al buscar la placa');
        setPlateLoading(false);
        return;
      }

      // Verify the OTP to establish the session
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      });

      if (verifyError) {
        toast.error('Error al iniciar sesión: ' + verifyError.message);
      } else {
        toast.success(`Bienvenido, ${data.client_name || 'Cliente'}`);
      }
    } catch (err) {
      toast.error('Error inesperado al iniciar sesión');
    } finally {
      setPlateLoading(false);
    }
  };

  const handlePinLogin = async (value: string) => {
    if (value.length !== 4) return;
    setPinCode(value);
    setPinLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('login-by-pin', {
        body: { pin: value },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Código PIN no válido');
        setPinCode('');
        setPinLoading(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      });

      if (verifyError) {
        toast.error('Error al iniciar sesión: ' + verifyError.message);
        setPinCode('');
      } else {
        toast.success(`Bienvenido, ${data.user_name || 'Usuario'}`);
      }
    } catch (err) {
      toast.error('Error inesperado al iniciar sesión');
      setPinCode('');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
          <CardHeader className="text-center pb-2">
            <CardTitle className="font-display text-xl">Acceder al Sistema</CardTitle>
            <CardDescription>
              Ingresa con tu PIN, placa de vehículo o credenciales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pin" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="pin" className="text-xs gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> PIN
                </TabsTrigger>
                <TabsTrigger value="plate" className="text-xs gap-1.5">
                  <Car className="w-3.5 h-3.5" /> Placa
                </TabsTrigger>
                <TabsTrigger value="credentials" className="text-xs gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Correo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pin">
                <div className="space-y-4">
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center mb-2">
                    <KeyRound className="w-10 h-10 text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Ingresa tu código PIN de 4 dígitos para acceder al sistema
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={4}
                      value={pinCode}
                      onChange={(value) => {
                        setPinCode(value);
                        if (value.length === 4) {
                          handlePinLogin(value);
                        }
                      }}
                      disabled={pinLoading}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="w-14 h-14 text-2xl" />
                        <InputOTPSlot index={1} className="w-14 h-14 text-2xl" />
                        <InputOTPSlot index={2} className="w-14 h-14 text-2xl" />
                        <InputOTPSlot index={3} className="w-14 h-14 text-2xl" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {pinLoading && (
                    <div className="flex justify-center">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="credentials">
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
              </TabsContent>

              <TabsContent value="plate">
                <form onSubmit={handlePlateLogin} className="space-y-4">
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center mb-2">
                    <Car className="w-10 h-10 text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Ingresa la placa de tu vehículo para acceder directamente a tu portal de cliente
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plate">Placa del Vehículo</Label>
                    <div className="relative">
                      <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="plate"
                        type="text"
                        placeholder="ABC123"
                        value={plate}
                        onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        className="pl-9 uppercase font-mono text-lg tracking-widest"
                        required
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full imb-gradient" disabled={plateLoading}>
                    {plateLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Acceder con mi Placa'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
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
