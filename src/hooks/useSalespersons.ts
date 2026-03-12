import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Salesperson {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
}

export const useSalespersons = () => {
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSalespersons = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('salespersons' as any)
      .select('*')
      .eq('is_active', true)
      .order('name');
    setSalespersons((data || []) as unknown as Salesperson[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSalespersons();
  }, []);

  return { salespersons, loading, fetchSalespersons };
};
