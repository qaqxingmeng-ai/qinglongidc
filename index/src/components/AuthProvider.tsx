'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  level: string;
  phone?: string;
  inviteCode?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me', { method: 'GET' });
      const json = await res.json();
      if (json.success && json.data) {
        setUser(json.data);
        return;
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const isValidRef =
      typeof ref === 'string' &&
      ref.length >= 4 &&
      ref.length <= 64 &&
      /^[A-Za-z0-9_-]+$/.test(ref);
    if (isValidRef && ref) {
      localStorage.setItem('aff_ref', ref);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (json.success) {
      setUser(json.data.user);
      return { success: true, user: json.data.user };
    }
    const errMsg = typeof json.error === 'string' ? json.error : json.error?.message || '登录失败';
    return { success: false, error: errMsg };
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
