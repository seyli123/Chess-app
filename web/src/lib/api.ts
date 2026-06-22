/**
 * Resolve the API base URL.
 *
 * 1. An explicit VITE_API_URL always wins (set it for custom deployments).
 * 2. Otherwise derive it from the browser location so it works without config:
 *    - GitHub Codespaces / port-forwarding hosts look like
 *      `<name>-5173.app.github.dev`; the API is the same host with `-3000`.
 *    - Plain localhost / LAN dev: same host, API on port 3000.
 * 3. Fall back to localhost:3000 (SSR / non-browser contexts).
 */
function resolveApiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Codespaces and most cloud port-forwarders encode the port in the subdomain.
    if (hostname.includes('-5173.')) {
      return `${protocol}//${hostname.replace('-5173.', '-3000.')}`;
    }
    // localhost / LAN: swap the dev-server port for the API port.
    if (port === '5173') {
      return `${protocol}//${hostname}:3000`;
    }
  }
  return 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

const ACCESS_KEY = 'chess.access';
const REFRESH_KEY = 'chess.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    tokens.clear();
    return false;
  }
  const data = await res.json();
  tokens.set(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401 && retry && (await refreshAccess())) {
    return api<T>(path, options, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const API_BASE = API_URL;
