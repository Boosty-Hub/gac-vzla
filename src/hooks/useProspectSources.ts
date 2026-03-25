import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectSource {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export const useProspectSources = () => {
  const [sources, setSources] = useState<ProspectSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = async () => {
    const { data } = await supabase
      .from('prospect_sources' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setSources((data || []) as unknown as ProspectSource[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSources();
  }, []);

  return { sources, loading, fetchSources };
};
