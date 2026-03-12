import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CurrentSalesperson {
  id: string;
  name: string;
}

/**
 * Checks if the logged-in user is linked to a salesperson record.
 * Returns the salesperson name so we can filter prospects assigned to them.
 */
export function useCurrentSalesperson() {
  const { user, role } = useAuth();
  const [salesperson, setSalesperson] = useState<CurrentSalesperson | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = role?.name === 'superadmin' || role?.name === 'admin';

  useEffect(() => {
    const check = async () => {
      if (!user || isAdmin) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('salespersons' as any)
        .select('id, name')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (data && (data as any[]).length > 0) {
        setSalesperson((data as any[])[0] as CurrentSalesperson);
      }
      setLoading(false);
    };
    check();
  }, [user, isAdmin]);

  return { salesperson, loading, isSalesperson: !!salesperson };
}
