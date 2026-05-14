import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, FileText, Download, Eye, Trash2, Loader2, Image, FileSpreadsheet, File } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MAX_FILES = 4;

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

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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
function getFileName(url: string) {
  return decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'archivo').replace(/^\d+_/, '');
}

function FileTypeIcon({ url, className }: { url: string; className?: string }) {
  const ext = getExt(url);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <Image className={className} />;
  if (['xls', 'xlsx'].includes(ext)) return <FileSpreadsheet className={className} />;
  if (ext === 'pdf') return <FileText className={className} />;
  return <File className={className} />;
}

interface FileChipProps {
  url: string;
  onPreview: () => void;
  onRemove?: () => void;
  readonly?: boolean;
}

function FileChip({ url, onPreview, onRemove, readonly }: FileChipProps) {
  const name = getFileName(url);
  return (
    <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileTypeIcon url={url} className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-xs font-medium text-blue-800 truncate">{name}</span>
        <span className="text-xs text-blue-500 shrink-0">({fileLabel(url)})</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-100" onClick={onPreview} title="Previsualizar">
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-700 hover:bg-blue-100" asChild title="Descargar">
          <a href={url} download target="_blank" rel="noopener noreferrer">
            <Download className="w-3.5 h-3.5" />
          </a>
        </Button>
        {!readonly && onRemove && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-red-50" onClick={onRemove} title="Eliminar">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface Props {
  reservationId?: string;
  /** Pipe-separated URLs: "url1|url2|url3" */
  value: string | null;
  onChange: (value: string | null) => void;
  readonly?: boolean;
}

export function TechnicalReportUploader({ reservationId, value, onChange, readonly = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const urls = value ? value.split('|').filter(Boolean) : [];

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const available = MAX_FILES - urls.length;
    if (available <= 0) {
      toast.error(`Máximo ${MAX_FILES} archivos por reserva`);
      return;
    }
    const toUpload = fileArray.slice(0, available);
    if (fileArray.length > available) {
      toast.warning(`Solo se subirán ${available} archivo(s) (límite de ${MAX_FILES})`);
    }

    setUploading(true);
    const newUrls: string[] = [];
    const folder = reservationId || crypto.randomUUID();

    for (const file of toUpload) {
      const validMime = ACCEPTED_MIME.has(file.type);
      const validExt = ACCEPTED_EXT.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!validMime && !validExt) {
        toast.error(`"${file.name}": formato no soportado`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`"${file.name}": supera el límite de 20 MB`);
        continue;
      }

      const safeName = sanitizeFileName(file.name);
      const path = `${folder}/${Date.now()}_${safeName}`;

      const { error } = await supabase.storage
        .from('technical-reports')
        .upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });

      if (error) {
        toast.error(`Error al subir "${file.name}": ${error.message}`);
        console.error(error);
      } else {
        const { data: urlData } = supabase.storage.from('technical-reports').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);
      }
    }

    if (newUrls.length > 0) {
      const allUrls = [...urls, ...newUrls];
      onChange(allUrls.join('|'));
      toast.success(newUrls.length === 1 ? 'Archivo subido' : `${newUrls.length} archivos subidos`);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeUrl = (urlToRemove: string) => {
    const newUrls = urls.filter(u => u !== urlToRemove);
    onChange(newUrls.length > 0 ? newUrls.join('|') : null);
  };

  const previewFileName = previewUrl ? getFileName(previewUrl) : '';

  const PreviewModal = (
    <Dialog open={!!previewUrl} onOpenChange={open => { if (!open) setPreviewUrl(null); }}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-medium min-w-0">
            {previewUrl && <FileTypeIcon url={previewUrl} className="w-4 h-4 shrink-0" />}
            <span className="truncate">{previewFileName}</span>
            {previewUrl && <span className="text-muted-foreground font-normal shrink-0">({fileLabel(previewUrl)})</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden min-h-0">
          {previewUrl && detectType(previewUrl) === 'pdf' && (
            <iframe src={previewUrl} className="w-full h-[60vh] rounded border" title="Vista previa" />
          )}
          {previewUrl && detectType(previewUrl) === 'image' && (
            <div className="flex items-center justify-center h-[60vh] bg-muted/20 rounded border overflow-hidden">
              <img src={previewUrl} alt={previewFileName} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {previewUrl && detectType(previewUrl) === 'other' && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <File className="w-12 h-12 opacity-40" />
              <p className="text-sm text-center">Este tipo de archivo no puede previsualizarse en el navegador.<br />Descárgalo para abrirlo.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPreviewUrl(null)}>Cerrar</Button>
          {previewUrl && (
            <Button asChild className="gac-gradient">
              <a href={previewUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4 mr-2" /> Descargar
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (readonly) {
    if (urls.length === 0) return null;
    return (
      <>
        {PreviewModal}
        <div className="space-y-1.5">
          {urls.map(url => (
            <FileChip key={url} url={url} onPreview={() => setPreviewUrl(url)} readonly />
          ))}
        </div>
      </>
    );
  }

  const canAddMore = urls.length < MAX_FILES;

  return (
    <>
      {PreviewModal}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={e => e.target.files && e.target.files.length > 0 && handleFiles(e.target.files)}
      />
      <div className="space-y-1.5">
        {urls.map(url => (
          <FileChip key={url} url={url} onPreview={() => setPreviewUrl(url)} onRemove={() => removeUrl(url)} />
        ))}
        {canAddMore && (
          <div
            className={cn(
              'border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors',
              'hover:border-primary hover:bg-primary/5',
              uploading && 'pointer-events-none opacity-60'
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
            }}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-1.5">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Subiendo archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="w-6 h-6 text-muted-foreground" />
                <p className="text-xs font-medium">
                  {urls.length === 0 ? 'Adjuntar archivos' : `Agregar más (${urls.length}/${MAX_FILES})`}
                </p>
                <p className="text-[10px] text-muted-foreground">PDF · Word · Excel · Imágenes · Arrastra o haz clic · Máx. 20 MB</p>
              </div>
            )}
          </div>
        )}
        {!canAddMore && (
          <p className="text-[10px] text-muted-foreground text-center">Límite de {MAX_FILES} archivos alcanzado</p>
        )}
      </div>
    </>
  );
}
