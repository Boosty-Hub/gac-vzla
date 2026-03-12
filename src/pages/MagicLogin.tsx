import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wrench, AlertCircle } from 'lucide-react';

const MagicLogin = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg('Link inválido — no se encontró el token.');
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-magic-link', {
          body: { token },
        });

        if (error || data?.error) {
          setStatus('error');
          setErrorMsg(data?.error || error?.message || 'Error al verificar el link');
          return;
        }

        // Use the hashed token to complete auth
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink',
        });

        if (otpError) {
          setStatus('error');
          setErrorMsg('Error al iniciar sesión: ' + otpError.message);
          return;
        }

        // Auth state change will redirect via onAuthStateChange
        // Navigate to root which will redirect based on role
        navigate('/', { replace: true });
      } catch (err) {
        setStatus('error');
        setErrorMsg('Error de conexión');
      }
    };

    verify();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="gac-gradient px-6 py-8 text-center">
        <div className="max-w-md mx-auto flex items-center justify-center gap-3">
          <Wrench className="w-7 h-7 text-primary-foreground" />
          <h1 className="text-2xl font-display font-bold text-primary-foreground tracking-tight">
            GAC Motor Venezuela
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Verificando acceso...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center max-w-sm">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <h2 className="text-lg font-semibold">Error de acceso</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <a href="/login" className="text-sm text-primary hover:underline mt-2">
              Ir al inicio de sesión
            </a>
          </div>
        )}
      </main>
    </div>
  );
};

export default MagicLogin;
