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
const isDev = !__dirname.includes(`${path.sep}dist${path.sep}`);
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

const workers = new Map<string, ModuleWorker>();

async function startWorker(moduleName: string): Promise<ModuleWorker> {
  const workerFile = path.join(workerDir, moduleName, `worker${workerExt}`);
  const w = new ModuleWorker(workerFile, workerExecArgv);
  await w.start();
  workers.set(moduleName, w);
  w.events.on('crash', () => logger.warn(`module en échec: ${w.name}`));
  w.events.on('disabled', () => logger.error(`module désactivé (crashes répétés): ${w.name}`));
  logger.info(`module démarré: ${w.name} (${w.prefix})`);
  return w;
}

async function startWorkers(): Promise<ModuleWorker[]> {
  const started: ModuleWorker[] = [];
  for (const moduleName of ENABLED_MODULES) {
    try {
      started.push(await startWorker(moduleName));
    } catch (err) {
      logger.error(`échec démarrage module ${moduleName}:`, err);
    }
  }
  return started;
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

  app.get('/api/health', async () => {
    const reports = await Promise.all(
      [...workers.values()].map(async (w) => ({
        module: w.name,
        healthy: await w.ping(),
      })),
    );
    return {
      status: reports.every((r) => r.healthy) ? 'ok' : 'degraded',
      uptime: process.uptime(),
      modules: reports,
    };
  });

  registerAuthRoutes(app, adminUser, adminPassword);
  const started = await startWorkers();
  registerModuleRoutes(app, started);

  await app.listen({ port, host: '0.0.0.0' });
  logger.info(`API Homeserver à l'écoute sur :${port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} reçu, arrêt en cours...`);
    await Promise.allSettled([...workers.values()].map((w) => w.stop()));
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('fatal:', err);
  process.exit(1);
});
