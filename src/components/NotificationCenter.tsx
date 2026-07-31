import { useState } from 'react';
import { Bell, Check, CheckCheck, CalendarDays, Users, Car, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { getStatusTransition } from '@/lib/notificationText';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { icon: typeof Bell; label: string; colorClass: string }> = {
  prospect_new: { icon: Users, label: 'Prospecto', colorClass: 'text-blue-500' },
  prospect_status: { icon: Users, label: 'Prospecto', colorClass: 'text-indigo-500' },
  reservation_new: { icon: CalendarDays, label: 'Reserva', colorClass: 'text-green-500' },
  reservation_cancelled: { icon: CalendarDays, label: 'Reserva', colorClass: 'text-destructive' },
  reservation_completed: { icon: Check, label: 'Servicio', colorClass: 'text-emerald-600' },
  reservation_status: { icon: CalendarDays, label: 'Reserva', colorClass: 'text-amber-500' },
  warranty: { icon: AlertTriangle, label: 'Garantía', colorClass: 'text-orange-500' },
  info: { icon: Info, label: 'Info', colorClass: 'text-muted-foreground' },
};

function getConfig(type: string) {
  return typeConfig[type] || typeConfig.info;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
}

function NotificationItem({ notification, onMarkAsRead }: { notification: Notification; onMarkAsRead: (id: string) => void }) {
  const config = getConfig(notification.type);
  const Icon = config.icon;
  // Two status changes on the same record seconds apart share a title and an icon, so the
  // pair reads as one event repeated. Showing the transition makes them distinguishable.
  const transition = getStatusTransition(notification.metadata);

  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
        !notification.is_read && 'bg-accent/30'
      )}
      onClick={() => !notification.is_read && onMarkAsRead(notification.id)}
    >
      <div className={cn('mt-0.5 shrink-0', config.colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold truncate">{notification.title}</span>
          {!notification.is_read && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        {transition && (
          <p className="text-[10px] font-medium text-foreground/70">
            {transition.from} <span aria-hidden="true">→</span> {transition.to}
          </p>
        )}
        <span className="text-[10px] text-muted-foreground/70">{timeAgo(notification.created_at)}</span>
      </div>
    </button>
  );
}

export default function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-bold flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notificaciones</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllAsRead}>
              <CheckCheck className="w-3.5 h-3.5" />
              Marcar todas
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Sin notificaciones</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(n => (
                <NotificationItem key={n.id} notification={n} onMarkAsRead={markAsRead} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
