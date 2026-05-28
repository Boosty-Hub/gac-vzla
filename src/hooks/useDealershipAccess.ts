import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Dealership {
  id: string;
  name: string;
  state: string | null;
}

/**
 * Resolves which dealership(s) the current user has access to.
 * - concesionario role: only their linked dealership via dealership_users
 * - vendedor role: all active dealerships (can pick any)
 * - admin/superadmin: all active dealerships (with selector)
 */
export function useDealershipAccess() {
  const { user, role } = useAuth();
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [selectedDealership, setSelectedDealership] = useState('');
  const [loading, setLoading] = useState(true);
  const roleName = role?.name?.toLowerCase() || '';
  const isAdmin = roleName === 'superadmin' || roleName === 'admin';
  const isVendedor = roleName === 'vendedor';

  useEffect(() => {
    const resolve = async () => {
      if (!user) { setLoading(false); return; }

      if (isAdmin) {
        // Admins see all active dealerships, default to first alphabetically
        const { data } = await supabase
          .from('dealerships')
          .select('id, name, state')
          .eq('is_active', true)
          .order('name');
        if (data && data.length > 0) {
          setDealerships(data);
          setSelectedDealership(data[0].id);
        }
      } else if (isVendedor) {
        // Vendedores see all active dealerships (can switch via selector)
        // but default to their linked dealership (dealership_users) so their
        // own prospects are visible without having to manually pick.
        const [{ data: allDealerships }, { data: links }] = await Promise.all([
          supabase.from('dealerships').select('id, name, state').eq('is_active', true).order('name'),
          supabase.from('dealership_users').select('dealership_id').eq('profile_id', user.id).limit(1),
        ]);
        if (allDealerships && allDealerships.length > 0) {
          setDealerships(allDealerships);
          const linkedId = (links as Array<{ dealership_id: string }> | null)?.[0]?.dealership_id;
          const defaultDealer = linkedId
            ? (allDealerships.find(d => d.id === linkedId) || allDealerships[0])
            : allDealerships[0];
          setSelectedDealership(defaultDealer.id);
        }
      } else {
        // Concesionario: get linked dealership
        const { data: links } = await supabase
          .from('dealership_users')
          .select('dealership_id, dealerships(id, name, state)')
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
  }, [user, isAdmin, isVendedor]);

  return {
    dealerships,
    selectedDealership,
    setSelectedDealership,
    loading,
    isAdmin,
    showSelector: dealerships.length > 1,
  };
}
