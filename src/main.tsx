import { createRoot } from "react-dom/client";
import { supabase } from "./integrations/supabase/client";
import App from "./App.tsx";
import "./index.css";

// Try to load custom favicon from branding bucket
(async () => {
  try {
    const { data } = await supabase.storage.from('branding').list('', { search: 'favicon' });
    if (data && data.length > 0) {
      const faviconFile = data[0];
      const { data: urlData } = supabase.storage.from('branding').getPublicUrl(faviconFile.name);
      if (urlData?.publicUrl) {
        const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
        if (link) {
          link.href = urlData.publicUrl + '?t=' + faviconFile.updated_at;
        }
      }
    }
  } catch {
    // Silently fall back to default favicon
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
