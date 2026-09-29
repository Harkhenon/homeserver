import type { FastifyInstance } from 'fastify';

export interface AuthBody {
  username?: unknown;
  password?: unknown;
}

export function registerAuthRoutes(app: FastifyInstance, adminUser: string, adminPassword: string): void {
  app.post('/api/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as AuthBody;
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (username !== adminUser || password !== adminPassword) {
      return reply.code(401).send({ error: 'Identifiants invalides' });
    }
    const token = app.jwt.sign({ sub: username, role: 'admin' });
    return { token };
  });
}
