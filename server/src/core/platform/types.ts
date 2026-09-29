export type DistroFamily = 'debian' | 'rhel' | 'unknown';

export interface ServiceActions {
  start(service: string): Promise<void>;
  stop(service: string): Promise<void>;
  restart(service: string): Promise<void>;
  reload(service: string): Promise<void>;
  isEnabled(service: string): Promise<boolean>;
  enable(service: string): Promise<void>;
  status(service: string): Promise<{ active: boolean; enabled: boolean }>;
}

export interface Platform {
  readonly family: DistroFamily;
  readonly prettyName: string;
  /** Nom canonique → nom de service/paquet selon la distro (apache → apache2 | httpd) */
  serviceName(canonical: string): string;
  services: ServiceActions;
}
