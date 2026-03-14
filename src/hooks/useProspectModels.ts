import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectModel {
  id: string;
  brand: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export const useProspectModels = () => {
  const [models, setModels] = useState<ProspectModel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('prospect_models' as any)
      .select('id, brand, name, sort_order, is_active')
      .eq('is_active', true)
      .order('brand')
      .order('sort_order');
    setModels((data || []) as unknown as ProspectModel[]);
    setLoading(false);
  };

  useEffect(() => { fetchModels(); }, []);

  const brands = Array.from(new Set(models.map(m => m.brand)));

  return { models, brands, loading, fetchModels };
};
