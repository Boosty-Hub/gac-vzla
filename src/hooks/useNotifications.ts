import { useEffect, useState, useCallback } from 'react';
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

  const isAdmin = role?.name === 'superadmin' || role?.name === 'admin';

  const fetchNotifications = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    // Admin/superadmin: ven todas las notificaciones.
    // Resto: solo las suyas (recipient_profile_id = su id) o las generales (recipient_profile_id IS NULL).
    if (!isAdmin) {
      query = query.or(`recipient_profile_id.eq.${user.id},recipient_profile_id.is.null`);
    }

    const { data } = await query;
    const items = (data || []) as Notification[];
    setNotifications(items);
    setUnreadCount(items.filter(n => !n.is_read).length);
    setLoading(false);
  }, [user, isAdmin]);

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
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [notifications]);

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
            if (forSomeoneElse) return;
          }

          setNotifications(prev => [newNotif, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, user, isAdmin]);

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, fetchNotifications };
};
