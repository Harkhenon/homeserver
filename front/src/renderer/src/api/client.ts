const API_BASE = import.meta.env.VITE_API_URL ?? '';

let token: string | null = localStorage.getItem('hs_token') ?? null;

export function setToken(newToken: string | null): void {
  token = newToken;
  if (newToken) localStorage.setItem('hs_token', newToken);
  else localStorage.removeItem('hs_token');
}

export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, (json.error as string) ?? `Erreur ${res.status}`);
  }
  if (json.ok === false) {
    throw new ApiError(res.status, (json.error as string) ?? 'Erreur inconnue');
  }
  return (json.data as T) ?? (json as T);
}

export async function login(username: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (json.error as string) ?? 'Identifiants invalides');
  return json as { token: string };
}

export function call<T = unknown>(prefix: string, action: string, payload?: unknown): Promise<T> {
  return request<T>(`/api/${prefix}/${action}`, payload ?? {});
}

export async function health(): Promise<{
  status: string;
  uptime: number;
  modules: Array<{ module: string; healthy: boolean }>;
}> {
  return request('/api/health');
}
