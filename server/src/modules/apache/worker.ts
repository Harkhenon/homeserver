import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';

interface Vhost {
  id: string;
  domain: string;
  docroot: string;
  enabled: boolean;
  phpVersion: string;
  ssl: boolean;
}

const VHOSTS: Vhost[] = [
  { id: 'vh-001', domain: 'example.com', docroot: '/var/www/example.com/public', enabled: true, phpVersion: '8.3', ssl: true },
  { id: 'vh-002', domain: 'blog.example.com', docroot: '/var/www/blog/public', enabled: false, phpVersion: '8.2', ssl: false },
  { id: 'vh-003', domain: 'shop.test', docroot: '/var/www/shop/public', enabled: true, phpVersion: '8.3', ssl: false },
];

const definition: ModuleDefinition = {
  name: 'apache',
  prefix: 'apache',
  actions: {
    'vhosts.list': {
      summary: 'Lister les virtualhosts',
      handler: () => VHOSTS,
    },
    'vhosts.get': {
      summary: 'Détail d\'un virtualhost',
      handler: (payload) => {
        const { id } = payload as { id: string };
        const vh = VHOSTS.find((v) => v.id === id);
        if (!vh) throw new Error(`Virtualhost introuvable: ${id}`);
        return vh;
      },
    },
    'service.status': {
      summary: 'État du service Apache (factice)',
      handler: () => ({ active: true, enabled: true, version: '2.4.62' }),
    },
    'service.restart': {
      summary: 'Redémarrer Apache (fonction de test : console uniquement)',
      handler: (payload) => {
        console.log('[apache:mock] service.restart', payload ?? {});
        return { restarted: true, mocked: true };
      },
    },
  },
};

if (!parentPort) throw new Error('apache worker must run in a worker thread');
const port = parentPort;

port.on('message', (msg: RpcRequest) => {
  const respond = (res: RpcReply): void => {
    port.postMessage({ ...res, id: msg.id });
  };
  if (msg.action === '__manifest') {
    respond({
      ok: true,
      data: {
        name: definition.name,
        prefix: definition.prefix,
        actions: Object.entries(definition.actions).map(([action, a]) => ({
          action,
          summary: a.summary,
        })),
      },
    });
    return;
  }
  const entry = definition.actions[msg.action];
  if (!entry) {
    respond({ ok: false, error: `Unknown action: ${msg.action}` });
    return;
  }
  Promise.resolve()
    .then(() => entry.handler(msg.payload))
    .then((data) => respond({ ok: true, data }))
    .catch((err: unknown) => respond({ ok: false, error: err instanceof Error ? err.message : String(err) }));
});
