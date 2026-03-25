import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Download, Eye, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  reservationId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  readonly?: boolean;
}

export function TechnicalReportUploader({ reservationId, value, onChange, readonly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10 MB');
      return;
    }
    setUploading(true);
    const path = `${reservationId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { error } = await supabase.storage
      .from('technical-reports')
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error('Error al subir el archivo');
      console.error(error);
    } else {
      const { data: urlData } = supabase.storage
        .from('technical-reports')
        .getPublicUrl(path);
      onChange(urlData.publicUrl);
      toast.success('Informe técnico subido');
    }
    setUploading(false);
  };

  const handleRemove = () => {
    onChange(null);
  };

  const fileName = value
    ? decodeURIComponent(value.split('/').pop() || 'informe.pdf').replace(/^\d+_/, '')
    : null;

  if (readonly) {
    if (!value) return null;
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-medium text-blue-800 truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              onClick={() => setPreviewOpen(true)}
              title="Previsualizar"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
              asChild
              title="Descargar"
            >
              <a href={value} download target="_blank" rel="noopener noreferrer">
                <Download className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>
        </div>
        {previewOpen && (
          <div className="mt-3 border rounded overflow-hidden">
            <iframe src={value} className="w-full h-64" title="Informe Técnico" />
            <Button size="sm" variant="ghost" className="w-full text-xs h-7" onClick={() => setPreviewOpen(false)}>
              Cerrar vista previa
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {!value ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors",
            "hover:border-primary hover:bg-primary/5",
            uploading && "pointer-events-none opacity-60"
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1.5">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Subiendo PDF...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <p className="text-xs font-medium">Cargar Informe Técnico (PDF)</p>
              <p className="text-[10px] text-muted-foreground">Arrastra y suelta o haz clic · Máx. 10 MB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-medium text-blue-800 truncate">{fileName}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                onClick={() => setPreviewOpen(v => !v)}
                title="Previsualizar"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                asChild
                title="Descargar"
              >
                <a href={value} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-3.5 h-3.5" />
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
                onClick={handleRemove}
                title="Eliminar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          {previewOpen && (
            <div className="border rounded overflow-hidden">
              <iframe src={value} className="w-full h-64" title="Informe Técnico" />
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs h-7"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
            Reemplazar PDF
          </Button>
        </div>
      )}
    </div>
  );
}
