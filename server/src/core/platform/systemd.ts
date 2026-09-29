import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ServiceActions } from './types.js';

const run = promisify(execFile);

export function createSystemdActions(): ServiceActions {
  const systemctl = async (...args: string[]): Promise<string> => {
    const { stdout } = await run('systemctl', args, { timeout: 30_000 });
    return stdout;
  };
  return {
    async start(service) { await systemctl('start', service); },
    async stop(service) { await systemctl('stop', service); },
    async restart(service) { await systemctl('restart', service); },
    async reload(service) { await systemctl('reload', service); },
    async isEnabled(service) {
      try { await systemctl('is-enabled', service); return true; } catch { return false; }
    },
    async enable(service) { await systemctl('enable', service); },
    async status(service) {
      const [activeRes, enabledRes] = await Promise.allSettled([
        systemctl('is-active', service),
        systemctl('is-enabled', service),
      ]);
      return {
        active: activeRes.status === 'fulfilled' && activeRes.value.trim() === 'active',
        enabled: enabledRes.status === 'fulfilled' && enabledRes.value.trim() === 'enabled',
      };
    },
  };
}
