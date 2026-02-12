import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Dealership {
  id: string;
  name: string;
}

/**
 * Resolves which dealership(s) the current user has access to.
 * - concesionario role: only their linked dealership via dealership_users
 * - admin/superadmin: all active dealerships (with selector)
 */
export function useDealershipAccess() {
  const { user, role } = useAuth();
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [selectedDealership, setSelectedDealership] = useState('');
  const [loading, setLoading] = useState(true);
  const isAdmin = role?.name === 'superadmin' || role?.name === 'admin';

  useEffect(() => {
    const resolve = async () => {
      if (!user) { setLoading(false); return; }

      if (isAdmin) {
        // Admins see all dealerships
        const { data } = await supabase
          .from('dealerships')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        if (data && data.length > 0) {
          setDealerships(data);
          setSelectedDealership(data[0].id);
        }
      } else {
        // Concesionario: get linked dealership
        const { data: links } = await supabase
          .from('dealership_users')
          .select('dealership_id, dealerships(id, name)')
          .eq('profile_id', user.id);

        if (links && links.length > 0) {
          const mapped = links
            .map((l: any) => l.dealerships)
            .filter(Boolean) as Dealership[];
          if (mapped.length > 0) {
            setDealerships(mapped);
            setSelectedDealership(mapped[0].id);
          }
        }
      }
      setLoading(false);
    };
    resolve();
  }, [user, isAdmin]);

  return {
    dealerships,
    selectedDealership,
    setSelectedDealership,
    loading,
    isAdmin,
    showSelector: isAdmin && dealerships.length > 1,
  };
}
