import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Upload, Image as ImageIcon, Globe, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import gacLogoDefault from '@/assets/gac-logo.png';
import dfskLogoDefault from '@/assets/dfsk-logo.png';

interface LogoConfig {
  key: string;
  label: string;
  description: string;
  defaultSrc: string;
  accept: string;
}

const logoConfigs: LogoConfig[] = [
  {
    key: 'logo_gac',
    label: 'Logo GAC Motor',
    description: 'Logo principal de la marca GAC. Formato PNG o SVG recomendado.',
    defaultSrc: gacLogoDefault,
    accept: 'image/png,image/svg+xml,image/webp',
  },
  {
    key: 'logo_dfsk',
    label: 'Logo DFSK',
    description: 'Logo principal de la marca DFSK. Formato PNG o SVG recomendado.',
    defaultSrc: dfskLogoDefault,
    accept: 'image/png,image/svg+xml,image/webp',
  },
  {
    key: 'favicon',
    label: 'Favicon',
    description: 'Icono que aparece en la pestaña del navegador. Tamaño recomendado: 32×32 o 64×64 px.',
    defaultSrc: '/gac-logo.png',
    accept: 'image/png,image/x-icon,image/svg+xml',
  },
];

const AdminGeneral = () => {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = async (config: LogoConfig, file: File) => {
    setUploading(config.key);
    try {
      const ext = file.name.split('.').pop();
      const path = `branding/${config.key}.${ext}`;

      const { error } = await supabase.storage
        .from('public')
        .upload(path, file, { upsert: true });

      if (error) {
        toast.error(`Error al subir ${config.label}: ${error.message}`);
      } else {
        toast.success(`${config.label} actualizado correctamente`);
      }
    } catch (err) {
      toast.error('Error inesperado al subir archivo');
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = (config: LogoConfig, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('El archivo no debe superar 2MB');
      return;
    }

    handleUpload(config, file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">General</h1>
        <p className="text-sm text-muted-foreground">Identidad visual y configuración general del sistema</p>
      </div>

      {/* Brand Identity */}
      <Card className="imb-shadow">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Identidad Visual
          </CardTitle>
          <CardDescription>
            Gestiona los logos de las marcas y el favicon del sistema. Los logos se usan en el login, sidebar y reportes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {logoConfigs.map((config, idx) => (
            <div key={config.key}>
              {idx > 0 && <Separator className="mb-6" />}
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/50 shrink-0 overflow-hidden">
                  <img
                    src={config.defaultSrc}
                    alt={config.label}
                    className="max-w-full max-h-full object-contain p-2"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <Label className="text-sm font-medium">{config.label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept={config.accept}
                      className="hidden"
                      ref={el => { fileRefs.current[config.key] = el; }}
                      onChange={(e) => handleFileChange(config, e)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileRefs.current[config.key]?.click()}
                      disabled={uploading === config.key}
                    >
                      {uploading === config.key ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Subir nuevo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="imb-shadow">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Información del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre del Sistema</Label>
              <p className="text-sm font-medium">IMB Movilidad</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Marcas</Label>
              <p className="text-sm font-medium">GAC Motor · DFSK</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Eslogan GAC</Label>
              <p className="text-sm font-medium italic">"Esto Si Es Otra Cosa"</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Eslogan DFSK</Label>
              <p className="text-sm font-medium italic">"Impulsamos Tu Futuro"</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Versión</Label>
              <p className="text-sm font-medium">1.0.0</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">País</Label>
              <p className="text-sm font-medium">Venezuela 🇻🇪</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Color Palette */}
      <Card className="imb-shadow">
        <CardHeader>
          <CardTitle className="text-lg">Paleta de Colores</CardTitle>
          <CardDescription>Colores oficiales de las marcas utilizados en el sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">GAC Motor</h4>
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: '#1D1D1B' }} />
                  <span className="text-[10px] text-muted-foreground">#1D1D1B</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: '#EB0A1E' }} />
                  <span className="text-[10px] text-muted-foreground">#EB0A1E</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }} />
                  <span className="text-[10px] text-muted-foreground">#FFFFFF</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">DFSK</h4>
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: '#1D1D1B' }} />
                  <span className="text-[10px] text-muted-foreground">#1D1D1B</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg" style={{ backgroundColor: '#E30613' }} />
                  <span className="text-[10px] text-muted-foreground">#E30613</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: '#FFFFFF' }} />
                  <span className="text-[10px] text-muted-foreground">#FFFFFF</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGeneral;
