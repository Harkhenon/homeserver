import { detectDistro } from './detect.js';
import { createSystemdActions } from './systemd.js';
import type { Platform } from './types.js';

const SERVICE_MAP: Record<string, { debian: string; rhel: string }> = {
  apache: { debian: 'apache2', rhel: 'httpd' },
  bind9: { debian: 'bind9', rhel: 'named' },
  php: { debian: 'php-fpm', rhel: 'php-fpm' },
  mariadb: { debian: 'mariadb', rhel: 'mariadb' },
};

function buildPlatform(): Platform {
  const { family, prettyName } = detectDistro();
  const services = createSystemdActions();
  return {
    family,
    prettyName,
    serviceName(canonical) {
      const entry = SERVICE_MAP[canonical];
      if (!entry) return canonical;
      if (family === 'debian') return entry.debian;
      if (family === 'rhel') return entry.rhel;
      return canonical;
    },
    services,
  };
}

export const platform: Platform = buildPlatform();
export type { Platform, DistroFamily, ServiceActions } from './types.js';
