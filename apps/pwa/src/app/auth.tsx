import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../shared/api/client';
import type { AuthUser } from '../entities/types';

interface AuthState {
  user: AuthUser | null;
  login: (externalId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = 'vsm.user';

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw && getToken() ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readUser);

  const logout = useCallback(() => {
    setToken(null);
    try { localStorage.removeItem(USER_KEY); } catch { /* нет хранилища */ }
    setUser(null);
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const login = useCallback(async (externalId: string, password: string) => {
    const response = await api<{ accessToken: string; user: AuthUser }>('/auth/login', { externalId, password });
    setToken(response.accessToken);
    try { localStorage.setItem(USER_KEY, JSON.stringify(response.user)); } catch { /* нет хранилища */ }
    setUser(response.user);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth вне AuthProvider');
  return context;
}

export function isStaff(user: AuthUser | null): boolean {
  return Boolean(user && ['methodologist', 'supervisor', 'admin'].includes(user.role));
}
