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
// bottom-left: the widget renders inside a Shadow DOM, so external CSS can't move
// it — its own data-boosty-position is the only lever. We anchor it bottom-LEFT so
// the floating button stops covering the bottom-right pagination controls (reported
// on prospectos). Only 'bottom-right' (default) and 'bottom-left' are supported.
const BOOSTY_POSITION = 'bottom-left';
const SCRIPT_ID = 'boosty-support-script';
// The floating button hardcodes `bottom: 20px` inside its (open) Shadow DOM, which
// external CSS can't reach. We lift it a bit so it clears the bottom-left user label.
// Injecting a <style> into the open shadowRoot is the only clean override.
const FAB_BOTTOM_PX = 80;
const OVERRIDE_STYLE_ID = 'boosty-position-override';

export default function BoostySupport() {
  const { loading, profile, role } = useAuth();

  useEffect(() => {
    // Wait until auth resolves, and only load for an ADMIN user: Soporte is
    // admin-only (dealership/vendedor/cliente never see the floating widget).
    // The config page is already route-gated; this closes the widget gap.
    if (loading || !profile) return;
    if (role?.name !== 'superadmin' && role?.name !== 'admin') return;
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
    script.setAttribute('data-boosty-position', BOOSTY_POSITION);
    if (profile.full_name) script.setAttribute('data-boosty-user-name', profile.full_name);
    if (profile.email) script.setAttribute('data-boosty-user-email', profile.email);
    document.body.appendChild(script);

    // The widget mounts asynchronously into an open Shadow DOM. Poll until it exists,
    // then inject an override style that raises the floating button off the bottom edge.
    const injectOverride = (): boolean => {
      const host = document.querySelector('[data-boosty-support]') as HTMLElement | null;
      const shadow = host?.shadowRoot;
      if (!shadow) return false;
      if (shadow.getElementById(OVERRIDE_STYLE_ID)) return true;
      const style = document.createElement('style');
      style.id = OVERRIDE_STYLE_ID;
      style.textContent = `.bw-fab.bw-bottom-left{ bottom: ${FAB_BOTTOM_PX}px !important; }`;
      shadow.appendChild(style);
      return true;
    };

    if (!injectOverride()) {
      const interval = window.setInterval(() => {
        if (injectOverride()) window.clearInterval(interval);
      }, 300);
      // Stop polling after ~15s so we never leak the interval if the widget fails to load.
      window.setTimeout(() => window.clearInterval(interval), 15000);
    }
  }, [loading, profile, role]);

  return null;
}
