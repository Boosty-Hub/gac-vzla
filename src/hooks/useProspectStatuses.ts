import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectStatus {
  id: string;
  name: string;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export const useProspectStatuses = () => {
  const [statuses, setStatuses] = useState<ProspectStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = async () => {
    const { data } = await supabase
      .from('prospect_statuses' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setStatuses((data || []) as unknown as ProspectStatus[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const getStatus = (name: string) => {
    return statuses.find(s => s.name === name) || statuses[0];
  };

  return { statuses, loading, fetchStatuses, getStatus };
};
