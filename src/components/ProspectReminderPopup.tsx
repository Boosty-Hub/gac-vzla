import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSalesperson } from '@/hooks/useCurrentSalesperson';
import { useDealershipAccess } from '@/hooks/useDealershipAccess';
import { useProspectStatuses } from '@/hooks/useProspectStatuses';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StaleProspect {
  id: string;
  name: string;
  status: string;
  status_updated_at: string;
  days: number;
  priority: 'urgente' | 'alta';
}

const CLOSED_STATUSES = ['ganado', 'perdido'];
// Shown once per browser session per day so the reminder is hard to miss without nagging on every navigation.
const SESSION_KEY = 'vendedor_prospect_reminder_day';

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function ProspectReminderPopup() {
  const { role, profile } = useAuth();
  const { salesperson: currentSalesperson, isSalesperson, loading: loadingSp } = useCurrentSalesperson();
  const { selectedDealership } = useDealershipAccess();
  const { statuses } = useProspectStatuses();

  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stale, setStale] = useState<StaleProspect[]>([]);

  const isVendedor = role?.name?.toLowerCase() === 'vendedor' || isSalesperson;
  const salespersonName = isSalesperson && currentSalesperson
    ? currentSalesperson.name
    : (role?.name?.toLowerCase() === 'vendedor' && profile?.full_name) ? profile.full_name : null;

  useEffect(() => {
    if (loadingSp || !isVendedor || !salespersonName || !selectedDealership) return;

    // Only once per day per session.
    const today = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(SESSION_KEY) === today) return;

    const run = async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('prospects')
        .select('id, name, status, status_updated_at')
        .eq('dealership_id', selectedDealership)
        .eq('salesperson', salespersonName)
        .not('status', 'in', '(ganado,perdido)')
        .lt('status_updated_at', twoDaysAgo)
        .order('status_updated_at', { ascending: true })
        .limit(100);

      const rows: StaleProspect[] = (data || [])
        .map((p: { id: string; name: string; status: string; status_updated_at: string | null }) => {
          const ref = p.status_updated_at || new Date().toISOString();
          const days = daysSince(ref);
          return { id: p.id, name: p.name, status: p.status, status_updated_at: ref, days,
            priority: (days >= 3 ? 'urgente' : 'alta') as 'urgente' | 'alta' };
        })
        .filter(r => !CLOSED_STATUSES.includes(r.status) && r.days >= 2)
        .sort((a, b) => b.days - a.days);

      if (rows.length > 0) {
        setStale(rows);
        setOpen(true);
        sessionStorage.setItem(SESSION_KEY, today);
      }
    };
    run();
  }, [loadingSp, isVendedor, salespersonName, selectedDealership]);

  if (!open) return null;

  // Navigate to the prospects module filtered to this prospect (by name) so the
  // vendedor lands right on it. DealershipProspectos seeds its search from ?q=.
  const goToProspect = (name: string) => {
    setOpen(false);
    navigate(`/concesionario/prospectos?q=${encodeURIComponent(name)}`);
  };

  const statusLabel = (s: string) => statuses.find(st => st.name === s)?.label || s;
  const urgentes = stale.filter(s => s.priority === 'urgente').length;
  const altas = stale.filter(s => s.priority === 'alta').length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Prospectos por revisar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tenés <strong>{stale.length}</strong> prospecto(s) sin mover el estado.
            {urgentes > 0 && <> <span className="text-red-600 font-semibold">{urgentes} urgente(s)</span></>}
            {urgentes > 0 && altas > 0 && ' ·'}
            {altas > 0 && <> <span className="text-amber-600 font-semibold">{altas} de prioridad alta</span></>}.
          </p>

          <div className="max-h-[320px] overflow-y-auto divide-y rounded-md border">
            {stale.map(p => (
              <button
                key={p.id}
                onClick={() => goToProspect(p.name)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {statusLabel(p.status)} · hace {p.days} día{p.days === 1 ? '' : 's'} sin cambios
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={cn('text-[10px] px-1.5 py-0',
                    p.priority === 'urgente' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>
                    {p.priority === 'urgente' ? 'Urgente revisar' : 'Prioridad alta'}
                  </Badge>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>Más tarde</Button>
          <Button className="gac-gradient gap-1" onClick={() => { setOpen(false); navigate('/concesionario/prospectos'); }}>
            Ver mis prospectos <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
