import type { FastifyInstance } from 'fastify';
import type { ModuleWorker } from './broker.js';
import type { ModuleManifest } from './types.js';
import { logger } from './logger.js';

export function registerModuleRoutes(app: FastifyInstance, workers: ModuleWorker[]): void {
  app.get('/api/modules', async () => {
    const modules: ModuleManifest[] = [];
    for (const w of workers) {
      const manifest = await w.call<ModuleManifest>('__manifest');
      modules.push(manifest);
    }
    return { modules };
  });

  for (const w of workers) {
    app.post(`/api/${w.prefix}/:action`, async (request, reply) => {
      if (!request.body) request.body = {};
      const { action } = request.params as { action: string };
      try {
        const data = await w.call(action, request.body);
        return { ok: true, data };
      } catch (err) {
        logger.error(`module ${w.name} action ${action}:`, err);
        return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
    logger.info(`routes: POST /api/${w.prefix}/:action (${w.name})`);
  }
}
