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
  | 'nginx-http-auth' | 'nginx-botsearch'
  | 'postfix' | 'postfix-sasl' | 'dovecot' | 'roundcube-auth';

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

export interface MailAntispamConfig {
  engine: 'basic' | 'rspamd';
  rbl: boolean;
  strictSender: boolean;
  junkScore: number;
  rejectScore: number;
  clamav: boolean;
}

export interface MailQueueItem {
  id: string;
  queue: string;
  arrivalAt: string | null;
  sizeBytes: number;
  sender: string;
  recipients: Array<{ address: string; reason: string | null }>;
}

export interface MailQueueResult {
  items: MailQueueItem[];
  total: number;
}

export interface MailLogsResult {
  lines: string[];
}

export interface MailBackup {
  file: string;
  domain: string;
  local: string | null;
  sizeMb: number;
  createdAt: string;
}

export interface MailStatus {
  installed: boolean;
  configured: boolean;
  hostname: string | null;
  serverIp: string | null;
  services: Record<string, boolean>;
  dovecotVersion: string | null;
  tls: { mode: 'selfsigned' | 'letsencrypt' | null; expiresAt: string | null };
  publicIp: string | null;
  relay: { host: string; port: number; username: string; spfInclude: string | null } | null;
  antispam: MailAntispamConfig;
  webmail: { available: boolean; webServer: boolean; enabled: boolean; active: boolean; url: string | null };
  rspamdAvailable: boolean;
  memoryMb: number;
  clockSynced: boolean | null;
  domainCount: number;
  boxCount: number;
}

export interface MailDomain {
  domain: string;
  suspended: boolean;
  defaultQuotaMb: number;
  boxCount: number;
  dkim: { selector: string; record: string } | null;
  dkimPending: { selector: string; record: string } | null;
  maxBoxes: number;
  sendLimitPerHour: number;
  aliasCount: number;
  catchAll: string | null;
  usedMb?: number;
  createdAt: string;
}

export interface MailAlias {
  address: string;
  local: string;
  destinations: string[];
  createdAt: string;
}

export interface MailVacation {
  enabled: boolean;
  subject: string;
  message: string;
  startDate: string | null;
  endDate: string | null;
}

export interface MailDnsRecord {
  key: string;
  label: string;
  purpose: string;
  required: boolean;
  fqdn: string;
  type: string;
  value: string;
  status: 'ok' | 'missing' | 'different' | 'error';
  current: string | null;
}

export interface MailDnsApplyResult {
  added: string[];
  replaced: string[];
  unchanged: string[];
  conflicts: Array<{ label: string; current: string; expected: string }>;
}

export interface MailDeliverabilityReport {
  ip: string | null;
  ipPrivate: boolean;
  hostname: string;
  hostnameResolves: boolean;
  rdns: { ptr: string[]; matches: boolean } | null;
  port25: { ok: boolean; detail: string };
  relay: { ok: boolean; detail: string } | null;
  blacklists: Array<{ list: string; listed: boolean | null }>;
}

export interface MailTestResult {
  messageId: string;
  status: 'sent' | 'deferred' | 'bounced' | 'pending';
  detail: string;
}

export interface MailBox {
  address: string;
  local: string;
  displayName: string;
  quotaMb: number;
  usedMb: number;
  messages: number | null;
  suspended: boolean;
  forward: { destinations: string[]; keepCopy: boolean } | null;
  vacation: MailVacation | null;
  sendLimitPerHour: number | null;
  effectiveSendLimit: number;
  createdAt: string;
}
