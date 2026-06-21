import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokens } from './api';

export interface Me {
  id: string;
  username: string;
  email: string;
  ratings: { category: string; rating: number; gamesPlayed: number }[];
  stats: { wins: number; losses: number; draws: number; total: number };
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!tokens.access) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/users/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function login(login: string, password: string) {
    const data = await api<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    tokens.set(data.accessToken, data.refreshToken);
    await loadMe();
  }

  async function register(email: string, username: string, password: string) {
    const data = await api<{ accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
    tokens.set(data.accessToken, data.refreshToken);
    await loadMe();
  }

  function logout() {
    if (tokens.refresh) {
      api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: tokens.refresh }),
      }).catch(() => undefined);
    }
    tokens.clear();
    setMe(null);
  }

  return (
    <AuthContext.Provider value={{ me, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
