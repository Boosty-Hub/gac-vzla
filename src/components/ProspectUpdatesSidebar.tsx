import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  X, Send, Paperclip, Mic, MicOff, CornerDownRight,
  FileText, Image, Download, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface ProspectUpdate {
  id: string;
  prospect_id: string;
  user_id: string;
  content: string | null;
  type: 'note' | 'voice' | 'file';
  file_url: string | null;
  file_name: string | null;
  parent_id: string | null;
  mentions: string[];
  created_at: string;
  profiles?: { full_name: string | null; email: string } | null;
  replies?: ProspectUpdate[];
}

interface Props {
  prospectId: string;
  prospectName: string;
  onClose: () => void;
}

export default function ProspectUpdatesSidebar({ prospectId, prospectName, onClose }: Props) {
  const { user } = useAuth();
  const [updates, setUpdates] = useState<ProspectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // composer
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ProspectUpdate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // file attachment
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // voice recording
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // @mention
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionAnchor, setMentionAnchor] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').eq('is_active', true);
    setProfiles((data || []) as Profile[]);
  }, []);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_updates' as any)
      .select('*, profiles(full_name, email)')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: true });

    if (!data) { setLoading(false); return; }

    const all = (data as unknown as ProspectUpdate[]);
    const roots = all.filter(u => !u.parent_id);
    const replies = all.filter(u => u.parent_id);
    const threaded = roots.map(r => ({
      ...r,
      replies: replies.filter(rep => rep.parent_id === r.id),
    }));
    setUpdates(threaded);
    setLoading(false);
  }, [prospectId]);

  useEffect(() => {
    fetchProfiles();
    fetchUpdates();

    // realtime subscription
    const channel = supabase
      .channel(`prospect_updates_${prospectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'prospect_updates',
        filter: `prospect_id=eq.${prospectId}`,
      }, () => { fetchUpdates(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [prospectId, fetchUpdates, fetchProfiles]);

  // scroll to bottom on new updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [updates]);

  // ---- MENTION HANDLING ----
  const handleTextChange = (val: string) => {
    setText(val);
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionAnchor(cursor - match[0].length);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const filteredProfiles = mentionQuery === '' ? profiles.slice(0, 8) : profiles.filter(p =>
    (p.full_name || p.email).toLowerCase().includes(mentionQuery)
  ).slice(0, 8);

  const insertMention = (profile: Profile) => {
    const displayName = profile.full_name || profile.email;
    const before = text.slice(0, mentionAnchor);
    const after = text.slice(textareaRef.current?.selectionStart ?? text.length);
    const newText = `${before}@${displayName} ${after}`;
    setText(newText);
    setShowMentions(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const extractMentionedIds = (content: string): string[] => {
    const ids: string[] = [];
    profiles.forEach(p => {
      const name = p.full_name || p.email;
      if (content.includes(`@${name}`)) ids.push(p.id);
    });
    return ids;
  };

  // ---- VOICE RECORDING ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error('No se pudo acceder al micrófono');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const discardVoice = () => {
    setAudioBlob(null);
    setAudioUrl(null);
  };

  // ---- UPLOAD FILE ----
  const uploadToStorage = async (file: File, folder: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${user?.id}/${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('prospect-updates').upload(path, file);
    if (error) { toast.error('Error al subir archivo'); return null; }
    const { data } = supabase.storage.from('prospect-updates').getPublicUrl(path);
    return data.publicUrl;
  };

  // ---- SUBMIT ----
  const handleSubmit = async () => {
    if (!user) return;
    const hasText = text.trim().length > 0;
    const hasFile = !!attachFile;
    const hasVoice = !!audioBlob;
    if (!hasText && !hasFile && !hasVoice) return;

    setSubmitting(true);
    setUploading(hasFile || hasVoice);

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let type: 'note' | 'voice' | 'file' = 'note';

    if (hasVoice && audioBlob) {
      type = 'voice';
      const voiceFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      fileUrl = await uploadToStorage(voiceFile, 'voice');
      fileName = 'Nota de voz';
    } else if (hasFile && attachFile) {
      type = 'file';
      fileUrl = await uploadToStorage(attachFile, 'files');
      fileName = attachFile.name;
    }

    setUploading(false);

    const mentions = extractMentionedIds(text);

    const { error } = await supabase.from('prospect_updates' as any).insert({
      prospect_id: prospectId,
      user_id: user.id,
      content: text.trim() || null,
      type,
      file_url: fileUrl,
      file_name: fileName,
      parent_id: replyTo?.id ?? null,
      mentions,
    });

    if (error) { toast.error('Error al publicar actualización'); console.error(error); }
    else {
      setText('');
      setAttachFile(null);
      setAudioBlob(null);
      setAudioUrl(null);
      setReplyTo(null);
      if (replyTo) {
        setExpandedReplies(prev => new Set([...prev, replyTo.id]));
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('prospect_updates' as any).delete().eq('id', id);
  };

  const toggleReplies = (id: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  };

  const renderContent = (content: string | null) => {
    if (!content) return null;
    const parts = content.split(/(@\S+)/g);
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} className="text-primary font-semibold">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  const isOwn = (u: ProspectUpdate) => u.user_id === user?.id;

  const UpdateBubble = ({ u, isReply = false }: { u: ProspectUpdate; isReply?: boolean }) => {
    const own = isOwn(u);
    const name = u.profiles?.full_name || u.profiles?.email || 'Usuario';
    const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

    return (
      <div className={cn('flex gap-2 group', own ? 'flex-row-reverse' : 'flex-row', isReply && 'ml-6 mt-1')}>
        <div className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
          own ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}>
          {initials}
        </div>
        <div className={cn('max-w-[80%] space-y-0.5', own ? 'items-end' : 'items-start', 'flex flex-col')}>
          <div className={cn('flex items-center gap-1.5 text-[10px] text-muted-foreground', own && 'flex-row-reverse')}>
            <span className="font-medium">{own ? 'Tú' : name}</span>
            <span>{formatTime(u.created_at)}</span>
          </div>
          <div className={cn(
            'rounded-2xl px-3 py-2 text-xs',
            own
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}>
            {u.type === 'voice' && u.file_url && (
              <audio controls src={u.file_url} className="h-8 w-48 max-w-full" />
            )}
            {u.type === 'file' && u.file_url && (
              <a href={u.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 underline underline-offset-2">
                {u.file_url.match(/\.(jpg|jpeg|png|gif|webp)/i)
                  ? <Image className="w-3.5 h-3.5 shrink-0" />
                  : <FileText className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate max-w-[160px]">{u.file_name || 'Archivo'}</span>
                <Download className="w-3 h-3 shrink-0" />
              </a>
            )}
            {u.content && <p className="whitespace-pre-wrap leading-relaxed">{renderContent(u.content)}</p>}
          </div>
          <div className={cn('flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity', own && 'flex-row-reverse')}>
            {!isReply && (
              <button
                onClick={() => setReplyTo(u)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                <CornerDownRight className="w-3 h-3" /> Responder
              </button>
            )}
            {own && (
              <button
                onClick={() => handleDelete(u.id)}
                className="text-[10px] text-destructive/70 hover:text-destructive flex items-center gap-0.5"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-sm bg-background border-l shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Actualizaciones</p>
          <p className="text-[11px] text-muted-foreground truncate">{prospectName}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading ? (
          <div className="text-center py-10">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Cargando...</p>
          </div>
        ) : updates.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-xs">Sin actualizaciones todavía.</p>
            <p className="text-[11px] mt-1">Sé el primero en publicar una nota.</p>
          </div>
        ) : (
          updates.map(u => (
            <div key={u.id}>
              <UpdateBubble u={u} />
              {/* Replies toggle */}
              {u.replies && u.replies.length > 0 && (
                <div className="ml-9 mt-1">
                  <button
                    onClick={() => toggleReplies(u.id)}
                    className="text-[10px] text-primary flex items-center gap-0.5 hover:underline"
                  >
                    {expandedReplies.has(u.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {u.replies.length} {u.replies.length === 1 ? 'respuesta' : 'respuestas'}
                  </button>
                  {expandedReplies.has(u.id) && (
                    <div className="mt-1 space-y-2">
                      {u.replies.map(r => <UpdateBubble key={r.id} u={r} isReply />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t bg-background shrink-0 px-3 py-2 space-y-2">
        {/* Reply banner */}
        {replyTo && (
          <div className="flex items-center justify-between bg-muted/60 rounded-md px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground truncate">
              <CornerDownRight className="w-3 h-3 inline mr-1" />
              Respondiendo a <span className="font-medium text-foreground">{replyTo.profiles?.full_name || replyTo.profiles?.email || 'Usuario'}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className="ml-2 text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Attach preview */}
        {attachFile && (
          <div className="flex items-center justify-between bg-muted/60 rounded-md px-2.5 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 truncate">
              <FileText className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span className="truncate">{attachFile.name}</span>
            </span>
            <button onClick={() => setAttachFile(null)} className="ml-2 text-muted-foreground hover:text-destructive shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Voice preview */}
        {audioUrl && (
          <div className="flex items-center gap-2 bg-muted/60 rounded-md px-2.5 py-1.5">
            <audio controls src={audioUrl} className="h-8 flex-1 min-w-0" />
            <button onClick={discardVoice} className="text-muted-foreground hover:text-destructive shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mention dropdown */}
        {showMentions && filteredProfiles.length > 0 && (
          <div className="bg-popover border rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto">
            {filteredProfiles.map(p => (
              <button
                key={p.id}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                onMouseDown={e => { e.preventDefault(); insertMention(p); }}
              >
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                  {(p.full_name || p.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium">{p.full_name || p.email}</span>
                {p.full_name && <span className="text-muted-foreground text-[10px] truncate">{p.email}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Text input */}
        {!audioUrl && (
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => handleTextChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
              placeholder={replyTo ? 'Escribe una respuesta... (@ para mencionar)' : 'Escribe una actualización... (@ para mencionar)'}
              rows={2}
              className="text-xs resize-none pr-2"
            />
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-1">
          {/* File attach */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setAttachFile(f); setAudioBlob(null); setAudioUrl(null); }
              e.target.value = '';
            }}
          />
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar archivo"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </Button>

          {/* Voice record */}
          {recording ? (
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-red-500 animate-pulse"
              onClick={stopRecording}
              title="Detener grabación"
            >
              <MicOff className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => { if (!audioBlob) startRecording(); }}
              disabled={!!audioBlob}
              title="Grabar nota de voz"
            >
              <Mic className="w-3.5 h-3.5" />
            </Button>
          )}

          {recording && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 animate-pulse">
              REC
            </Badge>
          )}

          <div className="flex-1" />

          <Button
            size="sm"
            className="h-7 gap-1 text-xs gac-gradient px-3"
            onClick={handleSubmit}
            disabled={submitting || uploading || recording || (!text.trim() && !attachFile && !audioBlob)}
          >
            {submitting || uploading
              ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Send className="w-3.5 h-3.5" /> Publicar</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
