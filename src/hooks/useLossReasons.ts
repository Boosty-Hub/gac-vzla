import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LossReason {
  id: string;
  kommoId: number;
  name: string;
  sortOrder: number;
}

export const useLossReasons = () => {
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLossReasons = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('prospect_loss_reasons' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name');

      if (queryError) {
        setError(queryError as unknown as Error);
        setLossReasons([]);
        return;
      }

      const mapped = ((data || []) as any[]).map((r) => ({
        id: r.id,
        kommoId: r.kommo_loss_reason_id,
        name: r.name,
        sortOrder: r.sort_order,
      })) as LossReason[];

      setError(null);
      setLossReasons(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLossReasons();
  }, []);

  return { lossReasons, loading, error };
};
