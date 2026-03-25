import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'superadmin' | 'admin' | 'concesionario' | 'cliente';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RoleData {
  id: string;
  name: UserRole;
  description: string | null;
  redirect_portal: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: RoleData | null;
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fetch profile data outside of React state to avoid closure issues
async function loadUserProfile(userId: string) {
  // 1. Get profile with role join
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*, roles(id, name, description, redirect_portal)')
    .eq('id', userId)
    .single();

  if (profileError || !profileData) {
    console.error('Error fetching profile:', profileError);
    return null;
  }

  const { roles: roleData, ...profileOnly } = profileData as any;

  // 2. Get permissions if role exists
  let permNames: string[] = [];
  if (roleData?.id) {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('permissions(name)')
      .eq('role_id', roleData.id);

    if (rolePerms) {
      permNames = rolePerms.map((rp: any) => rp.permissions?.name).filter(Boolean);
    }
  }

  return {
    profile: profileOnly as Profile,
    role: roleData as RoleData | null,
    permissions: permNames,
  };
}

// Wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleData | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const applyProfile = useCallback((data: Awaited<ReturnType<typeof loadUserProfile>>) => {
    if (data) {
      setProfile(data.profile);
      setRole(data.role);
      setPermissions(data.permissions);
    }
  }, []);

  const clearProfile = useCallback(() => {
    setProfile(null);
    setRole(null);
    setPermissions([]);
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Initialize from existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const data = await withTimeout(loadUserProfile(session.user.id), 8000);
        if (mounted) applyProfile(data);
      }
      if (mounted) setLoading(false);
    });

    // 2. Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === 'INITIAL_SESSION') return;

        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_OUT') {
          clearProfile();
          setLoading(false);
          return;
        }

        if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          // Use setTimeout to avoid blocking the auth state change callback
          // This ensures the Supabase client has the new token before we make requests
          setTimeout(async () => {
            if (!mounted) return;
            setLoading(true);
            const data = await withTimeout(loadUserProfile(session.user.id), 8000);
            if (mounted) {
              applyProfile(data);
              setLoading(false);
            }
          }, 0);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applyProfile, clearProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    clearProfile();
    await supabase.auth.signOut();
  };

  const hasPermission = (permission: string) => {
    if (role?.name === 'superadmin') return true;
    return permissions.includes(permission);
  };

  const refreshProfile = async () => {
    if (user) {
      const data = await loadUserProfile(user.id);
      applyProfile(data);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role,
        permissions,
        loading,
        signIn,
        signUp,
        signOut,
        hasPermission,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
