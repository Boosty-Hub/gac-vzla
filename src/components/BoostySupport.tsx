import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Boosty support widget — a single self-contained <script> (no deps, no npm install,
// no API keys). It injects a floating icon that opens a popup to send support tickets
// straight to our team. We inject it at runtime (instead of hardcoding it in index.html)
// so we can prefill the logged-in user's name and email, and only load it for
// authenticated users — never on the public landings or the login screen.
const BOOSTY_SRC = 'https://portal.boosty.digital/boosty-support.js';
const BOOSTY_KEY = 'bw_pk_887c9a608806a32b74f2f7dc2531e5b2';
const BOOSTY_COLOR = '#3b82f6';
const BOOSTY_LABEL = 'Soporte';
const SCRIPT_ID = 'boosty-support-script';

export default function BoostySupport() {
  const { loading, profile } = useAuth();

  useEffect(() => {
    // Wait until auth resolves, and only load for a logged-in user so the ticket
    // always carries the real identity (no anonymous popup on public pages).
    if (loading || !profile) return;
    // The widget self-guards against double init, but keep our own guard so the tag
    // is never appended twice across route changes / re-renders.
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = BOOSTY_SRC;
    script.async = true;
    script.setAttribute('data-boosty-key', BOOSTY_KEY);
    script.setAttribute('data-boosty-color', BOOSTY_COLOR);
    script.setAttribute('data-boosty-label', BOOSTY_LABEL);
    if (profile.full_name) script.setAttribute('data-boosty-user-name', profile.full_name);
    if (profile.email) script.setAttribute('data-boosty-user-email', profile.email);
    document.body.appendChild(script);
  }, [loading, profile]);

  return null;
}
