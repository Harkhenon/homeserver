import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import { ModuleWorker } from './core/broker.js';
import { registerModuleRoutes } from './core/router.js';
import { registerAuthRoutes } from './auth/routes.js';
import { AuthStore } from './auth/store.js';
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

// --- Sécurité : secret JWT obligatoire en prod (fail-fast) -----------------------
const jwtSecret = process.env.HS_JWT_SECRET ?? '';
const INSECURE_SECRETS = new Set(['', 'dev-secret-change-me', 'changeme']);
if (!isDev && INSECURE_SECRETS.has(jwtSecret)) {
  logger.error("fatal: HS_JWT_SECRET absent ou valeur par défaut — refuse de démarrer en prod.");
  logger.error("  génère un secret avec : openssl rand -hex 32  (fichier .env, chmod 600)");
  process.exit(1);
}
if (isDev && INSECURE_SECRETS.has(jwtSecret)) {
  logger.warn('dev: HS_JWT_SECRET manquant — secret éphémère généré pour cette session');
}
const effectiveJwtSecret = INSECURE_SECRETS.has(jwtSecret)
  ? randomBytes(32).toString('hex') // secret éphémère en dev uniquement
  : jwtSecret;

const adminUser = process.env.HS_ADMIN_USER ?? 'admin';
const adminPassword = process.env.HS_ADMIN_PASSWORD ?? 'changeme';
const authStorePath = process.env.HS_AUTH_STORE ?? '/var/lib/homeserver/auth.json';
const authStore = new AuthStore(authStorePath, adminUser, adminPassword);
const secureCookies = (process.env.HS_SECURE_COOKIES ?? 'true') === 'true';

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
  const app = Fastify({ logger: false, trustProxy: true });
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = String(body).trim();
      if (text === '') return done(null, {});
      try { done(null, JSON.parse(text)); } catch (err: unknown) { err instanceof SyntaxError ? done(err, undefined) : done(new Error('JSON invalide'), undefined); }
    },
  );

  // --- Sécurité : cookies, headers, rate-limit -----------------------------------
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // En dev, Vite (@vitejs/plugin-react) injecte un script inline (preamble
        // react-refresh) dans index.html — bloqué par script-src 'self'.
        // On autorise ce cas en dev uniquement ; la prod (build Vite) reste strict 'self'.
        scriptSrc: isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Mantine inline styles
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.HS_FORCE_HTTPS === 'true' ? [] : null,
      },
    },
    hsts: process.env.HS_FORCE_HTTPS === 'true' ? { maxAge: 31536000, includeSubDomains: true } : false, // activer HS_FORCE_HTTPS dès que le panel est derrière du TLS
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  // CORS restreint : origine explicite via HS_ALLOWED_ORIGIN, sinon même origine uniquement
  const allowedOrigin = process.env.HS_ALLOWED_ORIGIN ?? '';
  await app.register(cors, allowedOrigin ? { origin: allowedOrigin.split(',').map((o) => o.trim()), credentials: true } : { origin: false });
  await app.register(jwt, { secret: effectiveJwtSecret });

  const CSRF_COOKIE = 'hs_csrf';

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (request.url === '/api/auth/login' || request.url === '/api/health') {
      // Cookie CSRF (double-submit) émis dès l'arrivée sur le login
      if (!request.cookies?.[CSRF_COOKIE]) {
        reply.setCookie(CSRF_COOKIE, randomBytes(16).toString('hex'), {
          httpOnly: false, // lisible par le JS du panel pour être renvoyé en header
          sameSite: 'strict',
          secure: secureCookies,
          path: '/',
          maxAge: 12 * 60 * 60,
        });
      }
      return;
    }
    // Cookie httpOnly en priorité, Bearer pour compat (updater / scripts)
    const cookieToken = request.cookies?.['hs_session'];
    if (cookieToken) {
      try {
        request.headers.authorization = `Bearer ${cookieToken}`;
      } catch { /* ignore */ }
    }
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Non authentifié' });
    }
    // Révocation : les JWT émis avant la génération courante sont invalides (logout-all)
    const { gen } = (request.user ?? {}) as { gen?: number };
    if (typeof gen !== 'number' || gen < authStore.getSessionGen()) {
      return reply.code(401).send({ error: 'Session révoquée' });
    }
    // CSRF double-submit pour les requêtes avec cookie httpOnly (les Bearer sont immunisés)
    if (cookieToken && request.method !== 'GET') {
      const csrfCookie = request.cookies?.[CSRF_COOKIE] ?? '';
      const csrfHeader = request.headers['x-csrf-token'];
      if (!csrfCookie || csrfCookie !== (Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader)) {
        return reply.code(403).send({ error: 'CSRF invalide' });
      }
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

  registerAuthRoutes(app, authStore, { secureCookies });

  const started = await startWorkers();
  registerModuleRoutes(app, started);

  const frontDir = path.resolve(__dirname, isDev ? '../../../front/dist' : '../../../../front/dist');
  const hasFront = existsSync(frontDir);
  if (hasFront) {
    await app.register(fastifyStatic, { root: frontDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Route inconnue' });
      }
      return reply.sendFile('index.html');
    });
  }

  // Écoute : 127.0.0.1 par défaut (derrière reverse-proxy nginx/Apache avec TLS).
  // HS_HOST=0.0.0.0 pour exposer directement — fortement déconseillé sans HTTPS.
  const host = process.env.HS_HOST ?? '127.0.0.1';
  await app.listen({ port, host });
  logger.info(`API Homeserver à l'écoute sur ${host}:${port}`);
  if (host === '0.0.0.0' && process.env.HS_FORCE_HTTPS !== 'true') {
    logger.warn('sécurité: écoute sur 0.0.0.0 en HTTP — utilise un reverse-proxy TLS ou HS_FORCE_HTTPS=true');
  }

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
