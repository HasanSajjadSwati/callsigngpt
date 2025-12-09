'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type SessionLike = {
  access_token?: string;
  user?: {
    email?: string | null;
    user_metadata?: Record<string, any>;
    [k: string]: any;
  } | null;
  [k: string]: any;
};

type AuthCtx = {
  session: SessionLike | null;
  user: SessionLike['user'] | null;
  accessToken?: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    name?: string,
    phone?: string
  ) => Promise<{ error?: string }>;
  signInWithGoogle: (returnPath?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<string | null>; // returns error string or null
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  accessToken: undefined,
  loading: true,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signInWithGoogle: async () => ({}),
  signOut: async () => {},
  updatePassword: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncedToken, setLastSyncedToken] = useState<string | null>(null);

  // --- Helpers ---------------------------------------------------------------

  async function syncUser(
    token?: string,
    profile?: { name?: string; phone?: string }
  ) {
    // Best-effort: create/update your app user row
    if (!token) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile ?? {}),
      });
    } catch {
      // ignore — your API guard can lazily create on first protected call
    }
  }

  // --- Bootstrap & listener --------------------------------------------------

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession((session as any) ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession((sess as any) ?? null);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
      mounted = false;
    };
  }, []);

  const accessToken = session?.access_token as string | undefined;
  const user = session?.user ?? null;

  // --- API methods -----------------------------------------------------------

  const signIn: AuthCtx['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    setSession((data.session as any) ?? null);
    return {};
  };

  const signUp: AuthCtx['signUp'] = async (email, password, name, phone) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone } }, // store display name + phone in user_metadata
    });
    if (error) return { error: error.message };

    setSession((data.session as any) ?? null);

    return {};
  };

  const signInWithGoogle: AuthCtx['signInWithGoogle'] = async (returnPath = '/') => {
    const redirectPath = returnPath.startsWith('/') ? returnPath : `/${returnPath}`;
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}${redirectPath}` : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) return { error: error.message };
    if (data?.url) {
      window.location.assign(data.url);
      return {};
    }

    return { error: 'Unable to start Google sign-in. Please try again.' };
  };

  const signOut: AuthCtx['signOut'] = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[auth] signOut failed:', error.message);
    }
    setSession(null);
  };

  const updatePassword: AuthCtx['updatePassword'] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error?.message ?? null;
  };

  const value = useMemo(
    () => ({
      session,
      user,
      accessToken,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      updatePassword,
    }),
    [session, user, accessToken, loading]
  );

  // Best-effort: keep app user row in sync (handles OAuth flows too)
  useEffect(() => {
    const token = session?.access_token;
    if (!token || token === lastSyncedToken) return;

    const metadata = session?.user?.user_metadata || {};
    const name = metadata.name || metadata.full_name;
    const phone = metadata.phone as string | undefined;

    (async () => {
      try {
        await syncUser(token, { name, phone });
      } catch (err) {
        console.warn('[auth] syncUser after sign-in failed:', (err as any)?.message || err);
      } finally {
        setLastSyncedToken(token);
      }
    })();
  }, [session?.access_token, session?.user?.user_metadata, lastSyncedToken]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
