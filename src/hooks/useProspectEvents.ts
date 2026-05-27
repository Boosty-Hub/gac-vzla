import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectEvent {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export const useProspectEvents = () => {
  const [events, setEvents] = useState<ProspectEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('prospect_events' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    setEvents((data || []) as unknown as ProspectEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  return { events, loading, fetchEvents };
};
