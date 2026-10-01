import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';

interface FirewallStatus {
  backend: string;
  active: boolean;
  rules: string[];
}

function validateRuleInput(payload: Record<string, unknown>): { port: number; proto: 'tcp' | 'udp'; rule: 'allow' | 'deny' } {
  const port = typeof payload.port === 'number' && Number.isInteger(payload.port) && payload.port >= 1 && payload.port <= 65535
    ? payload.port
    : null;
  if (port === null) throw new Error('Port invalide (1-65535)');
  if (port === 22) throw new Error('Port SSH protégé — modifiez-le via la config système');
  const proto = payload.proto === 'udp' ? 'udp' : 'tcp';
  const rule = payload.rule === 'deny' ? 'deny' : 'allow';
  return { port, proto, rule };
}

const definition: ModuleDefinition = {
  name: 'firewall',
  prefix: 'firewall',
  actions: {
    'status': {
      summary: 'État du pare-feu (ufw ou firewalld) et règles',
      handler: () => callHelper<FirewallStatus>({ action: 'firewall_status' }),
    },
    'enable': {
      summary: 'Activer/désactiver le pare-feu (payload: { enabled })',
      handler: (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.enabled !== 'boolean') throw new Error('enabled (booléen) requis');
        return callHelper<{ active: boolean }>({ action: 'firewall_enable', enable: p.enabled });
      },
    },
    'rules.add': {
      summary: 'Ajouter une règle de port (payload: { port, proto?, rule? })',
      handler: (payload) => {
        const input = validateRuleInput((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'firewall_rule_add', ...input });
      },
    },
    'rules.remove': {
      summary: 'Retirer une règle de port (payload: { port, proto?, rule? })',
      handler: (payload) => {
        const input = validateRuleInput((payload ?? {}) as Record<string, unknown>);
        return callHelper({ action: 'firewall_rule_remove', ...input });
      },
    },
  },
};

if (!parentPort) throw new Error('firewall worker must run in a worker thread');
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
