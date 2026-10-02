'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';

type User = { uid: string; name: string };
type AuthState = {
  user: User | null;
  loading: boolean;
  /** True when Supabase is not configured and everyone is the local dev user */
  devMode: boolean;
  getToken: () => Promise<string | null>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const DEV_USER: User = { uid: 'dev-user', name: 'Local dev' };

const toUser = (u: SupabaseUser | null | undefined): User | null =>
  u ? { uid: u.id, name: u.user_metadata?.full_name || u.user_metadata?.name || u.email || 'You' } : null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(supabaseConfigured ? null : DEV_USER);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    if (!supabaseConfigured) return;
    // Also finishes a Google sign-in when the page loads with the redirect's session in the URL.
    supabase().auth.getSession().then(({ data }) => {
      setUser(toUser(data.session?.user));
      setLoading(false);
    });
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      // Keep the same object while the user is unchanged, so token refreshes don't re-render everything.
      const next = toUser(session?.user);
      setUser((prev) => (prev?.uid === next?.uid && prev?.name === next?.name ? prev : next));
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const getToken = useCallback(async () => {
    if (!supabaseConfigured) return null;
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const signIn = useCallback(async () => {
    const { error } = await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseConfigured) await supabase().auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, loading, devMode: !supabaseConfigured, getToken, signIn, signOut }),
    [user, loading, getToken, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
