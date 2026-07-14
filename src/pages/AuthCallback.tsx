import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Wrench, AlertCircle } from 'lucide-react';

/**
 * SSO landing for the Boosty Hub workspace. The Hub mints a standard Supabase
 * magic-link that lands here with the session in the URL hash; supabase-js
 * (detectSessionInUrl, default on) consumes it into localStorage. We just wait
 * for the session and forward into the app. localStorage survives the Hub's
 * cross-site iframe, so the embedded app stays logged in.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      navigate('/', { replace: true });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    const timeout = setTimeout(() => {
      if (!done) setStatus('error');
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
      {status === 'loading' ? (
        <>
          <Wrench className="w-7 h-7 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Iniciando sesión…</p>
        </>
      ) : (
        <>
          <AlertCircle className="w-7 h-7 text-destructive" />
          <p className="text-sm font-medium">No se pudo iniciar sesión automáticamente.</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-sm text-primary underline"
          >
            Ir al login
          </button>
        </>
      )}
    </div>
  );
};

export default AuthCallback;
