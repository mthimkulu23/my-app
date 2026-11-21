import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { apiRequest, type AppUser } from './api';
import { clearSession, readSession, writeSession } from './session';

type AuthResponse = { token: string; user: AppUser };

type AuthContextValue = {
  user: AppUser | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const savedToken = await readSession();
        if (!savedToken) return;
        const currentUser = await apiRequest<AppUser>('/api/me', {}, savedToken);
        if (active) {
          setToken(savedToken);
          setUser(currentUser);
        }
      } catch {
        await clearSession();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    const heartbeat = () => apiRequest('/api/presence', { method: 'PUT' }, token).catch(() => undefined);
    void heartbeat();
    const interval = setInterval(heartbeat, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  async function authenticate(path: '/auth/login' | '/auth/register', body: object) {
    const result = await apiRequest<AuthResponse>(path, { method: 'POST', body: JSON.stringify(body) });
    await writeSession(result.token);
    setToken(result.token);
    setUser(result.user);
  }

  async function signIn(email: string, password: string) {
    await authenticate('/auth/login', { email, password });
  }

  async function signUp(displayName: string, email: string, password: string) {
    await authenticate('/auth/register', { displayName, email, password });
  }

  async function signOut() {
    if (token) await apiRequest('/api/presence/offline', { method: 'POST' }, token).catch(() => undefined);
    await clearSession();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}