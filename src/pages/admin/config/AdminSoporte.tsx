import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';

// The Boosty support widget exposes a global to open its popup by code.
declare global {
  interface Window {
    BoostySupport?: { open: () => void };
  }
}

export default function AdminSoporte() {
  const openTicket = () => {
    if (window.BoostySupport?.open) {
      window.BoostySupport.open();
    } else {
      toast.error('El widget de soporte aún se está cargando. Intenta de nuevo en un momento.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold">Soporte</h1>
        <p className="text-sm text-muted-foreground">Envía un ticket a nuestro equipo de soporte</p>
      </div>

      <Card className="gac-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <LifeBuoy className="w-4 h-4" /> Centro de Soporte
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            ¿Encontraste un problema o necesitas ayuda? Crea un ticket y nuestro equipo lo atenderá.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            También puedes usar el ícono flotante de <strong>Soporte</strong> disponible en la
            esquina inferior derecha de cualquier pantalla del sistema.
          </p>
          <Button className="gac-gradient gap-2" onClick={openTicket}>
            <LifeBuoy className="w-4 h-4" /> Crear ticket de soporte
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
