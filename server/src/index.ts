import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';
import { ModuleWorker } from './core/broker.js';
import { registerModuleRoutes } from './core/router.js';
import { registerAuthRoutes } from './auth/routes.js';
import { logger } from './core/logger.js';
import { platform } from './core/platform/index.js';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = __dirname.includes(`${path.sep}src`);
const workerDir = path.join(__dirname, 'modules');
const workerExt = isDev ? '.ts' : '.js';
const workerExecArgv = isDev ? ['--import', 'tsx'] : [];

const ENABLED_MODULES = (process.env.HS_MODULES ?? 'system,apache')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const port = Number(process.env.HS_PORT ?? 3000);
const jwtSecret = process.env.HS_JWT_SECRET ?? 'dev-secret-change-me';
const adminUser = process.env.HS_ADMIN_USER ?? 'admin';
const adminPassword = process.env.HS_ADMIN_PASSWORD ?? 'changeme';

async function startWorkers(): Promise<ModuleWorker[]> {
  const workers: ModuleWorker[] = [];
  for (const moduleName of ENABLED_MODULES) {
    const workerFile = path.join(workerDir, moduleName, `worker${workerExt}`);
    const w = new ModuleWorker(workerFile, workerExecArgv);
    try {
      await w.start();
      workers.push(w);
      logger.info(`module démarré: ${w.name} (${w.prefix})`);
    } catch (err) {
      logger.error(`échec démarrage module ${moduleName}:`, err);
    }
  }
  return workers;
}

async function main(): Promise<void> {
  logger.info(`plateforme: ${platform.prettyName} (${platform.family})`);

  const app = Fastify({ logger: false });
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = String(body).trim();
      if (text === '') return done(null, {});
      try { done(null, JSON.parse(text)); } catch (err: unknown) { err instanceof SyntaxError ? done(err, undefined) : done(new Error('JSON invalide'), undefined); }
    },
  );
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: jwtSecret });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/auth/login' || request.url === '/api/health') return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Non authentifié' });
    }
  });

  app.get('/api/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  registerAuthRoutes(app, adminUser, adminPassword);

  const workers = await startWorkers();
  registerModuleRoutes(app, workers);

  await app.listen({ port, host: '0.0.0.0' });
  logger.info(`API Homeserver à l'écoute sur :${port}`);
}

main().catch((err) => {
  logger.error('fatal:', err);
  process.exit(1);
});
