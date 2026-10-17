import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthStore } from './store.js';
import { verifyTotp, generateTotpSecret } from './crypto.js';

export interface AuthBody {
  username?: unknown;
  password?: unknown;
  totp?: unknown;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const COOKIE_NAME = 'hs_session';

interface Attempt {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

const attempts = new Map<string, Attempt>();

function isBlocked(key: string): boolean {
  const a = attempts.get(key);
  return a !== undefined && a.blockedUntil > Date.now();
}

function recordFailure(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now, blockedUntil: 0 });
    return;
  }
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.blockedUntil = now + BLOCK_MS;
    a.count = 0;
    a.windowStart = now;
  }
}

function recordSuccess(key: string): void {
  attempts.delete(key);
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 12 * 60 * 60, // 12h
  });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  store: AuthStore,
  opts: { secureCookies: boolean },
): void {
  app.post('/api/auth/login', async (request, reply) => {
    const key = request.ip;
    const body = (request.body ?? {}) as AuthBody;
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const totp = typeof body.totp === 'string' ? body.totp : '';

    if (isBlocked(key)) {
      return reply.code(429).send({ error: 'Trop de tentatives, réessayez plus tard' });
    }

    const state = store.load();
    const usernameOk = username === state.adminUser;
    const { ok: passwordOk } = await store.verifyPassword(password);

    // Journaliser la tentative (avant toute réponse)
    void store.recordAttempt({
      at: new Date().toISOString(),
      ip: key,
      username: username.slice(0, 64),
      success: usernameOk && passwordOk,
    }).catch(() => undefined);

    if (!usernameOk || !passwordOk) {
      recordFailure(key);
      return reply.code(401).send({ error: 'Identifiants invalides' });
    }

    // 2FA : si activée, le code est requis et doit être valide
    if (state.totpSecret) {
      if (!totp) {
        return reply.code(401).send({ error: 'Code 2FA requis', need2fa: true });
      }
      if (!verifyTotp(state.totpSecret, totp)) {
        recordFailure(key);
        return reply.code(401).send({ error: 'Code 2FA invalide', need2fa: true });
      }
    }

    recordSuccess(key);
    const token = app.jwt.sign({ sub: username, role: 'admin' });
    setSessionCookie(reply, token, opts.secureCookies);
    return { token, username }; // token conservé pour compat clients non-cookie (updater, API script)
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async () => {
    const state = store.load();
    return {
      username: state.adminUser,
      totpEnabled: Boolean(state.totpSecret),
    };
  });

  app.get('/api/auth/attempts', async () => {
    return { attempts: store.getAttempts().slice(0, 50) };
  });

  // --- 2FA ---
  app.post('/api/auth/totp/setup', async () => {
    const state = store.load();
    if (state.totpSecret) {
      return { error: '2FA déjà activée — désactive-la d\'abord' };
    }
    const { secret, otpauthUrl } = generateTotpSecret(state.adminUser);
    // Le secret n'est PAS persisté ici : le client doit confirmer avec un code valide.
    return { secret, otpauthUrl };
  });

  app.post('/api/auth/totp/enable', async (request, reply) => {
    const body = (request.body ?? {}) as { secret?: unknown; code?: unknown };
    const secret = typeof body.secret === 'string' ? body.secret : '';
    const code = typeof body.code === 'string' ? body.code : '';
    if (!secret || !code) return reply.code(400).send({ error: 'secret et code requis' });
    if (!verifyTotp(secret, code)) return reply.code(400).send({ error: 'Code invalide — réessaie' });
    await store.setTotp(secret);
    return { ok: true, totpEnabled: true };
  });

  app.post('/api/auth/totp/disable', async (request, reply) => {
    const body = (request.body ?? {}) as { password?: unknown; code?: unknown };
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const state = store.load();
    if (!state.totpSecret) return { ok: true, totpEnabled: false };
    const { ok: passwordOk } = await store.verifyPassword(password);
    if (!passwordOk) return reply.code(401).send({ error: 'Mot de passe incorrect' });
    if (!verifyTotp(state.totpSecret, code)) return reply.code(400).send({ error: 'Code 2FA invalide' });
    await store.setTotp(undefined);
    return { ok: true, totpEnabled: false };
  });
}
