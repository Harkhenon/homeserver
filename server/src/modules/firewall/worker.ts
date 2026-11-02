import { parentPort } from 'node:worker_threads';
import type { RpcRequest, RpcReply, ModuleDefinition } from '../../core/types.js';
import { callHelper } from '../../core/privileged/client.js';
import { FAIL2BAN_JAILS, FAIL2BAN_LIMITS, isValidIp, validateFail2banConfig } from '../../core/privileged/contract.js';
import type { Fail2banConfigResult, Fail2banJailName, Fail2banStatusResult } from '../../core/privileged/contract.js';

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

function validateBanInput(payload: Record<string, unknown>, jailRequired: boolean): { ip: string; jail?: Fail2banJailName } {
  const ip = typeof payload.ip === 'string' ? payload.ip.trim() : '';
  if (!isValidIp(ip)) throw new Error('Adresse IP invalide (IPv4 ou IPv6)');
  if (payload.jail === undefined && !jailRequired) return { ip };
  if (!(FAIL2BAN_JAILS as readonly unknown[]).includes(payload.jail)) throw new Error('Jail inconnue');
  return { ip, jail: payload.jail as Fail2banJailName };
}

/** Serveur web du panel, pour choisir la jail web à l'installation de fail2ban. */
function panelWebServer(): 'apache' | 'nginx' | undefined {
  const mods = (process.env.HS_MODULES ?? '').split(',').map((m) => m.trim());
  return mods.includes('nginx') && !mods.includes('apache') ? 'nginx' : mods.includes('apache') && !mods.includes('nginx') ? 'apache' : undefined;
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
    'fail2ban.status': {
      summary: 'État fail2ban : service, jails actives, IP bannies par jail',
      handler: () => callHelper<Fail2banStatusResult>({ action: 'fail2ban_status' }),
    },
    'fail2ban.config': {
      summary: 'Configuration fail2ban gérée par le panel (durées, liste blanche, jails)',
      handler: () => callHelper<Fail2banConfigResult>({ action: 'fail2ban_config_get' }),
    },
    'fail2ban.config.set': {
      summary: 'Appliquer la configuration fail2ban (payload: { config }) — testée puis rechargée, rollback si refusée',
      handler: (payload) => {
        const config = validateFail2banConfig(((payload ?? {}) as Record<string, unknown>).config);
        if (!config) {
          const l = FAIL2BAN_LIMITS;
          throw new Error(`Configuration invalide : bantime ${l.bantime.min}-${l.bantime.max} s, findtime ${l.findtime.min}-${l.findtime.max} s, maxretry ${l.maxretry.min}-${l.maxretry.max}, liste blanche de ${l.ignoreip} IP/CIDR au plus`);
        }
        return callHelper({ action: 'fail2ban_config_set', config });
      },
    },
    'fail2ban.service': {
      summary: 'Activer/désactiver fail2ban au démarrage et maintenant (payload: { enabled })',
      handler: async (payload) => {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (typeof p.enabled !== 'boolean') throw new Error('enabled (booléen) requis');
        const verbs = p.enabled ? (['enable', 'start'] as const) : (['stop', 'disable'] as const);
        for (const verb of verbs) await callHelper({ action: 'systemctl', unit: 'fail2ban', verb });
        return { enabled: p.enabled };
      },
    },
    'fail2ban.install': {
      summary: 'Installer et activer fail2ban (jails sshd + serveur web)',
      handler: () => {
        const web = panelWebServer();
        return callHelper<{ installed: boolean; active: boolean; jails: string[] }>(
          web ? { action: 'fail2ban_setup', web } : { action: 'fail2ban_setup' }, undefined, 1_800_000);
      },
    },
    'fail2ban.ban': {
      summary: 'Bannir une IP dans une jail (payload: { ip, jail })',
      handler: (payload) => {
        const { ip, jail } = validateBanInput((payload ?? {}) as Record<string, unknown>, true);
        return callHelper({ action: 'fail2ban_ban', ip, jail: jail as Fail2banJailName });
      },
    },
    'fail2ban.unban': {
      summary: 'Débannir une IP (payload: { ip, jail? } — toutes les jails si absente)',
      handler: (payload) => {
        const input = validateBanInput((payload ?? {}) as Record<string, unknown>, false);
        return callHelper<{ unbanned: string[]; ip: string }>(
          input.jail ? { action: 'fail2ban_unban', ip: input.ip, jail: input.jail } : { action: 'fail2ban_unban', ip: input.ip });
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
