export interface Vhost {
  id: string;
  domain: string;
  docroot: string;
  enabled: boolean;
  aliases: string[];
  ssl: boolean;
  phpVersion: string | null;
  nodePort: number | null;
  serverAdmin: string | null;
  confFile: string | null;
}

export interface NginxVhost {
  id: string;
  domain: string;
  docroot: string;
  enabled: boolean;
  aliases: string[];
  ssl: boolean;
  phpVersion: string | null;
  nodePort: number | null;
  confFile: string;
}

export interface NodeApp {
  name: string;
  port: number;
  user: string;
  active: boolean;
}

export interface Zone {
  id: string;
  domain: string;
  nsCount?: number;
  redundantNs?: boolean;
  external?: boolean;
  registrar?: string | null;
  file: string;
  serial: number;
  records?: DnsRecord[];
  recordCount?: number;
}

export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
}

export interface SftpUser {
  username: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

export interface FsEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  sizeBytes: number;
  mode: string;
  owner: string;
  group: string;
  modifiedAt: string;
}

export interface BackupInfo {
  file: string;
  site: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CronJob {
  name: string;
  schedule: string;
  command: string;
  user: string;
  enabled: boolean;
}

export interface CertInfo {
  domain: string;
  subject: string;
  issuer: string;
  expiresAt: string | null;
  daysLeft: number | null;
  autoRenew: boolean;
}

export interface DatabaseInfo {
  databases?: string[];
  users?: Array<{ user: string; host: string }>;
  grants?: Array<{ user: string; host: string; database: string; privilege: string }>;
}

export interface FirewallStatus {
  backend: string;
  active: boolean;
  rules: string[];
}

// Miroir de server/src/core/privileged/contract.ts (Fail2ban*)
export type Fail2banJailName =
  | 'sshd' | 'recidive'
  | 'apache-auth' | 'apache-badbots' | 'apache-noscript'
  | 'nginx-http-auth' | 'nginx-botsearch';

export interface Fail2banStatus {
  installed: boolean;
  active: boolean;
  enabled: boolean;
  jails: Array<{ name: string; currentlyBanned: number; totalBanned: number; bannedIps: string[] }>;
}

export interface Fail2banJailConfig {
  name: Fail2banJailName;
  enabled: boolean;
  bantime: number | null;
  findtime: number | null;
  maxretry: number | null;
}

export interface Fail2banConfig {
  defaults: { bantime: number; findtime: number; maxretry: number };
  ignoreip: string[];
  jails: Fail2banJailConfig[];
}

export interface Fail2banConfigInfo {
  installed: boolean;
  config: Fail2banConfig;
  available: Fail2banJailName[];
  file: string;
}

export interface MonitorSample {
  at: string;
  cpuLoad: [number, number, number];
  memUsagePercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
}

export interface ServiceStatus {
  unit: string;
  active: boolean;
  enabled: boolean;
}

export interface MailStatus {
  installed: boolean;
  configured: boolean;
  hostname: string | null;
  serverIp: string | null;
  services: Record<string, boolean>;
  dovecotVersion: string | null;
  tls: { mode: 'selfsigned' | 'letsencrypt' | null; expiresAt: string | null };
  domainCount: number;
  boxCount: number;
}

export interface MailDomain {
  domain: string;
  suspended: boolean;
  defaultQuotaMb: number;
  boxCount: number;
  dkim: { selector: string; record: string } | null;
  createdAt: string;
}

export interface MailBox {
  address: string;
  local: string;
  displayName: string;
  quotaMb: number;
  usedMb: number;
  suspended: boolean;
  createdAt: string;
}
