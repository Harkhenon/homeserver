import type { FastifyInstance } from 'fastify';

export interface AuthBody {
  username?: unknown;
  password?: unknown;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;

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

export function registerAuthRoutes(app: FastifyInstance, adminUser: string, adminPassword: string): void {
  app.post('/api/auth/login', async (request, reply) => {
    const key = request.ip;
    if (isBlocked(key)) {
      return reply.code(429).send({ error: 'Trop de tentatives, réessayez plus tard' });
    }
    const body = (request.body ?? {}) as AuthBody;
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (username !== adminUser || password !== adminPassword) {
      recordFailure(key);
      return reply.code(401).send({ error: 'Identifiants invalides' });
    }
    recordSuccess(key);
    const token = app.jwt.sign({ sub: username, role: 'admin' });
    return { token };
  });
}
