import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  metadata: Record<string, any> | null;
  recipient_profile_id: string | null;
  recipient_dealership_id: string | null;
}

export const useNotifications = () => {
  const { user, role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Ids already applied to state, so a realtime event can never render the same row twice.
  // This matters because AuthContext hands out a fresh `user` object on every
  // TOKEN_REFRESHED (periodically and on tab focus), which tears down and re-creates the
  // channel below. A straggler delivery from the closing channel can arrive after the new
  // channel's fetch has already landed the same row.
  const seenIds = useRef<Set<string>>(new Set());

  const isAdmin = role?.name === 'superadmin' || role?.name === 'admin';
  // Concesionario managers see all dealership-wide notifications (recipient_profile_id IS NULL) + their own.
  // Vendedores only see notifications explicitly addressed to their profile_id.
  const isConcesionario = role?.name === 'concesionario';

  const applyFilter = useCallback((q: any): any => {
    if (isAdmin) return q;
    if (isConcesionario) return q.or(`recipient_profile_id.eq.${user!.id},recipient_profile_id.is.null`);
    return q.eq('recipient_profile_id', user!.id);
  }, [user, isAdmin, isConcesionario]);

  const fetchNotifications = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    const listQ = applyFilter(supabase.from('notifications').select('*'))
      .order('created_at', { ascending: false })
      .limit(50);

    // Count query has no limit → badge shows the real total unread
    const countQ = applyFilter(
      supabase.from('notifications').select('*', { count: 'exact', head: true })
    ).eq('is_read', false);

    const [{ data }, { count }] = await Promise.all([listQ, countQ]);

    const rows = (data || []) as Notification[];
    // The fetch is the source of truth: rebuild the seen set from it so ids that fell out
    // of the 50-row window do not pin memory forever.
    seenIds.current = new Set(rows.map(n => n.id));
    setNotifications(rows);
    setUnreadCount(count ?? 0);
    setLoading(false);
  }, [user, isAdmin, isConcesionario, applyFilter]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    await applyFilter(
      supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    );
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [unreadCount, applyFilter]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    // Realtime: escuchar nuevas notificaciones
    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new as Notification;

          // Filtrar igual que en el fetch:
          // - Admin ve todo
          // - Otros: solo suyas o sin destinatario específico
          if (!isAdmin) {
            const forSomeoneElse =
              newNotif.recipient_profile_id !== null &&
              newNotif.recipient_profile_id !== user.id;
          if (isConcesionario) {
            if (forSomeoneElse) return;
          } else {
            // Vendedor: only their own
            if (newNotif.recipient_profile_id !== user.id) return;
          }
          }

          if (seenIds.current.has(newNotif.id)) return;
          seenIds.current.add(newNotif.id);

          setNotifications(prev => [newNotif, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, user, isAdmin, isConcesionario]);

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, fetchNotifications };
};
