import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, FileText, Download, Eye, Trash2, Loader2, Image, FileSpreadsheet, File } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);
const ACCEPTED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ACCEPT_ATTR = ACCEPTED_EXT.join(',');

function getExt(url: string) {
  return (url.split('?')[0].split('.').pop() || '').toLowerCase();
}
function detectType(url: string): 'pdf' | 'image' | 'other' {
  const ext = getExt(url);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}
function fileLabel(url: string) {
  const ext = getExt(url);
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx'].includes(ext)) return 'Word';
  if (['xls', 'xlsx'].includes(ext)) return 'Excel';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Imagen';
  return 'Archivo';
}

function FileTypeIcon({ url, className }: { url: string; className?: string }) {
  const ext = getExt(url);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <Image className={className} />;
  if (['xls', 'xlsx'].includes(ext)) return <FileSpreadsheet className={className} />;
  if (ext === 'pdf') return <FileText className={className} />;
  return <File className={className} />;
}

interface Props {
  reservationId?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  readonly?: boolean;
}

export function TechnicalReportUploader({ reservationId, value, onChange, readonly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFile = async (file: File) => {
    const validMime = ACCEPTED_MIME.has(file.type);
    const validExt = ACCEPTED_EXT.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!validMime && !validExt) {
      toast.error('Formato no soportado. Usa PDF, Word, Excel o imagen.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('El archivo no puede superar 20 MB');
      return;
    }
    setUploading(true);
    const folder = reservationId || crypto.randomUUID();
    const path = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { error } = await supabase.storage
      .from('technical-reports')
      .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });

    if (error) {
      toast.error('Error al subir el archivo: ' + error.message);
      console.error(error);
    } else {
      const { data: urlData } = supabase.storage.from('technical-reports').getPublicUrl(path);
      onChange(urlData.publicUrl);
      toast.success('Archivo adjunto subido');
    }
    setUploading(false);
  };

  const fileName = value
    ? decodeURIComponent(value.split('/').pop()?.split('?')[0] || 'archivo').replace(/^\d+_/, '')
    : null;

  const PreviewModal = value ? (
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-medium min-w-0">
            <FileTypeIcon url={value} className="w-4 h-4 shrink-0" />
            <span className="truncate">{fileName}</span>
            <span className="text-muted-foreground font-normal shrink-0">({fileLabel(value)})</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden min-h-0">
          {detectType(value) === 'pdf' && (
            <iframe src={value} className="w-full h-[60vh] rounded border" title="Vista previa" />
          )}
          {detectType(value) === 'image' && (
            <div className="flex items-center justify-center h-[60vh] bg-muted/20 rounded border overflow-hidden">
              <img src={value} alt={fileName || ''} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {detectType(value) === 'other' && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <File className="w-12 h-12 opacity-40" />
              <p className="text-sm text-center">Este tipo de archivo no puede previsualizarse en el navegador.<br />Descárgalo para abrirlo.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPreviewOpen(false)}>Cerrar</Button>
          <Button asChild className="gac-gradient">
            <a href={value} download target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4 mr-2" /> Descargar
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const FileChip = value ? (
    <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileTypeIcon url={value} className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-xs font-medium text-blue-800 truncate">{fileName}</span>
        <span className="text-xs text-blue-500 shrink-0">({fileLabel(value)})</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-100" onClick={() => setPreviewOpen(true)} title="Previsualizar">
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-100" asChild title="Descargar">
          <a href={value} download target="_blank" rel="noopener noreferrer">
            <Download className="w-3.5 h-3.5" />
          </a>
        </Button>
        {!readonly && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-red-50" onClick={() => onChange(null)} title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  ) : null;

  if (readonly) {
    if (!value) return null;
    return (
      <>
        {PreviewModal}
        {FileChip}
      </>
    );
  }

  return (
    <>
      {PreviewModal}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {value ? (
        <div className="space-y-2">
          {FileChip}
          <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
            Reemplazar archivo
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors',
            'hover:border-primary hover:bg-primary/5',
            uploading && 'pointer-events-none opacity-60'
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1.5">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Subiendo archivo...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <p className="text-xs font-medium">Adjuntar archivo</p>
              <p className="text-[10px] text-muted-foreground">PDF · Word · Excel · Imágenes · Arrastra o haz clic · Máx. 20 MB</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
