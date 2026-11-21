import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, whenSignedOut } from './api';

export interface Admin {
  id: string;
  email: string | null;
  name: string;
  role: 'owner' | 'staff';
}

interface Session {
  admin: Admin | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setAdmin(await api.get<Admin>('/auth/me'));
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    whenSignedOut(() => setAdmin(null));
    api
      .get<Admin>('/auth/me')
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAdmin(null);
  }, []);

  return (
    <SessionContext.Provider value={{ admin, loading, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be inside SessionProvider');
  return session;
}
