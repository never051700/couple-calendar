import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearNotificationData } from './notifications';

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  userId: null,
  loading: true,
  signOut: async () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user.id;
    if (userId) {
      try {
        await clearNotificationData(userId);
      } catch (cleanupError) {
        // Local logout must remain available. Push cleanup keeps retry metadata
        // whenever its server-side unregister cannot complete.
        console.warn('[auth] notification cleanup failed:', cleanupError);
      }
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }, [session?.user.id]);

  const deleteAccount = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) throw new Error('로그인 정보를 찾을 수 없습니다.');

    const { error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });
    if (error) throw error;

    try {
      await clearNotificationData(userId);
    } catch (cleanupError) {
      console.warn('[auth] deleted-account cleanup failed:', cleanupError);
    }
    await supabase.auth.signOut({ scope: 'local' });
  }, [session?.user.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        userId: session?.user.id ?? null,
        loading,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
