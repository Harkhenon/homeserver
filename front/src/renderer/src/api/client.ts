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
  constructor(readonly status: number, message: string, readonly need2fa?: boolean) {
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
    credentials: 'include', // cookie httpOnly hs_session
    body: body === undefined ? undefined : JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, (json.error as string) ?? `Erreur ${res.status}`, json.need2fa === true);
  }
  if (json.ok === false) {
    throw new ApiError(res.status, (json.error as string) ?? 'Erreur inconnue');
  }
  return (json.data as T) ?? (json as T);
}

export async function login(username: string, password: string, totp?: string): Promise<{ token: string; username: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (json.error as string) ?? 'Identifiants invalides', json.need2fa === true);
  localStorage.setItem('hs_username', username);
  return json as { token: string; username: string };
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* le cookie sera nettoyé côté client de toute façon */ }
  setToken(null);
}

export function call<T = unknown>(prefix: string, action: string, payload?: unknown): Promise<T> {
  return request<T>(`/api/${prefix}/${action}`, payload ?? {});
}

// --- Endpoints d'authentification (routes directes, pas de préfixe module) ---
export const authApi = {
  me: (): Promise<{ username: string; totpEnabled: boolean }> =>
    request<{ username: string; totpEnabled: boolean }>('/api/auth/me'),
  attempts: (): Promise<{ attempts: Array<{ at: string; ip: string; username: string; success: boolean }> }> =>
    request<{ attempts: Array<{ at: string; ip: string; username: string; success: boolean }> }>('/api/auth/attempts'),
  clearAttempts: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('/api/auth/attempts/clear', {}),
  totpSetup: (): Promise<{ secret?: string; otpauthUrl?: string; error?: string }> =>
    request<{ secret: string; otpauthUrl: string }>('/api/auth/totp/setup', {}),
  totpEnable: (secret: string, code: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('/api/auth/totp/enable', { secret, code }),
  totpDisable: (password: string, code: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>('/api/auth/totp/disable', { password, code }),
};

export async function health(): Promise<{
  status: string;
  uptime: number;
  modules: Array<{ module: string; healthy: boolean }>;
}> {
  return request('/api/health');
}
