import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokens } from './api';

export interface Me {
  id: string;
  username: string;
  email: string;
  ratings: { category: string; rating: number; gamesPlayed: number }[];
  stats: { wins: number; losses: number; draws: number; total: number };
  /** Play-money wallet balance in tokens (string-safe integer). */
  balance: number;
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch the current user (e.g. after a wager settles or a faucet claim). */
  refresh: () => Promise<void>;
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
      const data = await api<Me>('/users/me');
      // balance is serialised as a string (BigInt) — coerce to a number.
      setMe({ ...data, balance: Number(data.balance ?? 0) });
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
    <AuthContext.Provider value={{ me, loading, login, register, logout, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
