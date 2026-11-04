import { useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, Group, NumberInput, Select, SimpleGrid, Stack, Switch, Table, TagsInput, Text, TextInput, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconShieldCheck, IconShieldOff } from '@tabler/icons-react';
import { useModuleQuery } from '../api/hooks';
import { call } from '../api/client';
import { LoadingBlock, ErrorBlock } from './StateBlocks';
import type { Fail2banConfig, Fail2banConfigInfo, Fail2banJailConfig, Fail2banJailName, Fail2banStatus } from '../types';

const JAIL_INFO: Record<Fail2banJailName, string> = {
  'sshd': 'Échecs de connexion SSH',
  'recidive': 'Récidivistes : IP bannies plusieurs fois (ban long)',
  'apache-auth': 'Apache — échecs d\'authentification HTTP',
  'apache-badbots': 'Apache — robots malveillants connus',
  'apache-noscript': 'Apache — recherche de scripts inexistants',
  'nginx-http-auth': 'Nginx — échecs d\'authentification HTTP',
  'nginx-botsearch': 'Nginx — scans d\'URL d\'administration',
  postfix: 'Postfix — connexions SMTP refusées',
  'postfix-sasl': 'Postfix — échecs d\'authentification',
  dovecot: 'Dovecot — échecs de connexion IMAP et POP3',
  'roundcube-auth': 'Webmail — échecs de connexion',
};

// Bornes du contrat (secondes côté serveur, minutes dans l'interface)
const LIMITS = {
  bantime: { min: 1, max: 525_600 },
  findtime: { min: 1, max: 10_080 },
  maxretry: { min: 1, max: 100 },
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]*:[0-9a-fA-F:.]*$/;

function isIp(v: string): boolean {
  return IPV4.test(v) || IPV6.test(v);
}

function isIpOrCidr(v: string): boolean {
  const [ip = '', prefix, ...rest] = v.split('/');
  if (rest.length > 0 || !isIp(ip)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (IPV4.test(ip) ? 32 : 128);
}

function humanDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} j`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${Math.round(seconds / 60)} min`;
}

const toMinutes = (s: number | null) => (s === null ? '' : Math.round(s / 60));
const fromNumberInput = (v: string | number): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function Fail2banPanel() {
  const status = useModuleQuery<Fail2banStatus>('firewall', 'fail2ban.status', undefined, { refetchInterval: 15_000 });
  const conf = useModuleQuery<Fail2banConfigInfo>('firewall', 'fail2ban.config');
  const [draft, setDraft] = useState<Fail2banConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banIp, setBanIp] = useState('');
  const [banJail, setBanJail] = useState<string | null>('sshd');

  useEffect(() => {
    if (conf.data) setDraft(conf.data.config);
  }, [conf.data]);

  // Les notifications d'erreur lisent l'exception directement (pas l'état d'un hook, en retard d'un rendu)
  const run = async <T,>(key: string, action: string, payload: unknown, success: (r: T) => string): Promise<T | null> => {
    setBusy(key);
    try {
      const res = await call<T>('firewall', action, payload);
      notifications.show({ message: success(res), color: 'green' });
      return res;
    } catch (err) {
      notifications.show({ message: err instanceof Error ? err.message : 'Erreur', color: 'red', autoClose: 10_000 });
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (status.loading || conf.loading) return <LoadingBlock />;
  if (status.error) return <ErrorBlock error={status.error} />;
  if (conf.error) return <ErrorBlock error={conf.error} />;

  const st = status.data;
  const info = conf.data;
  if (!st || !info || !draft) return null;

  const reloadAll = () => { void status.reload(true); void conf.reload(true); };

  if (!st.installed) {
    return (
      <Alert color="orange" icon={<IconShieldOff size={18} />} title="Fail2ban n'est pas installé">
        <Stack gap="xs">
          <Text size="sm">Sans fail2ban, rien ne bloque les tentatives de connexion en force brute sur SSH et sur les sites.</Text>
          <Button
            size="xs"
            w="fit-content"
            loading={busy === 'install'}
            onClick={() => void run<{ jails: string[] }>('install', 'fail2ban.install', {}, (r) => `Fail2ban installé (jails : ${r.jails.join(', ') || 'aucune'})`).then(reloadAll)}
          >
            Installer et activer fail2ban
          </Button>
        </Stack>
      </Alert>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(info.config);
  const available = new Set(info.available);
  const jailStatus = new Map(st.jails.map((j) => [j.name, j]));
  const setDefault = (k: keyof Fail2banConfig['defaults'], v: number | null) => {
    if (v !== null) setDraft({ ...draft, defaults: { ...draft.defaults, [k]: v } });
  };
  const setJail = (name: Fail2banJailName, patch: Partial<Fail2banJailConfig>) => {
    setDraft({ ...draft, jails: draft.jails.map((j) => (j.name === name ? { ...j, ...patch } : j)) });
  };
  const minutesOrNull = (v: string | number) => {
    const n = fromNumberInput(v);
    return n === null ? null : n * 60;
  };

  const toggleService = (enabled: boolean) =>
    void run('service', 'fail2ban.service', { enabled }, () => (enabled ? 'Fail2ban démarré et activé au boot' : 'Fail2ban arrêté et désactivé')).then(reloadAll);

  const save = () =>
    void run('save', 'fail2ban.config.set', { config: draft }, () => 'Configuration appliquée (fail2ban rechargé)').then((r) => {
      if (r !== null) reloadAll();
    });

  const ban = () =>
    void run('ban', 'fail2ban.ban', { ip: banIp.trim(), jail: banJail }, () => `${banIp.trim()} bannie (${banJail})`).then((r) => {
      if (r !== null) { setBanIp(''); void status.reload(true); }
    });

  const unban = (ip: string, jail: string) =>
    void run(`unban:${jail}:${ip}`, 'fail2ban.unban', { ip, jail }, () => `${ip} débannie (${jail})`).then(() => void status.reload(true));

  const bannedTotal = st.jails.reduce((sum, j) => sum + j.currentlyBanned, 0);
  const banIpValid = isIp(banIp.trim());

  return (
    <Stack>
      <Card withBorder>
        <Group justify="space-between">
          <Group gap="sm">
            {st.active ? <IconShieldCheck size={22} color="var(--mantine-color-teal-6)" /> : <IconShieldOff size={22} color="var(--mantine-color-orange-6)" />}
            <div>
              <Group gap="xs">
                <Text fw={600}>Fail2ban</Text>
                <Badge color={st.active ? 'teal' : 'orange'} variant="light">{st.active ? 'actif' : 'arrêté'}</Badge>
                {st.active && <Badge color={bannedTotal > 0 ? 'red' : 'gray'} variant="light">{bannedTotal} IP bannie(s)</Badge>}
              </Group>
              <Text size="xs" c="dimmed">Bannit temporairement les IP qui multiplient les échecs de connexion.</Text>
            </div>
          </Group>
          <Switch
            label="Démarré et activé au boot"
            checked={st.active && st.enabled}
            disabled={busy === 'service'}
            onChange={(e) => toggleService(e.currentTarget.checked)}
          />
        </Group>
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>Réglages globaux</Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <NumberInput
              label="Durée du bannissement (min)"
              description={humanDuration(draft.defaults.bantime)}
              {...LIMITS.bantime}
              allowDecimal={false}
              value={toMinutes(draft.defaults.bantime)}
              onChange={(v) => setDefault('bantime', minutesOrNull(v))}
            />
            <NumberInput
              label="Fenêtre d'observation (min)"
              description={`échecs comptés sur ${humanDuration(draft.defaults.findtime)}`}
              {...LIMITS.findtime}
              allowDecimal={false}
              value={toMinutes(draft.defaults.findtime)}
              onChange={(v) => setDefault('findtime', minutesOrNull(v))}
            />
            <NumberInput
              label="Tentatives avant bannissement"
              description="maxretry"
              {...LIMITS.maxretry}
              allowDecimal={false}
              value={draft.defaults.maxretry}
              onChange={(v) => setDefault('maxretry', fromNumberInput(v))}
            />
          </SimpleGrid>
          <TagsInput
            label="Liste blanche (jamais bannies)"
            description="IP ou réseaux CIDR, ex. 192.168.1.0/24. 127.0.0.1 et ::1 sont toujours ignorées. Entrée pour valider."
            placeholder="Ajouter une IP ou un réseau"
            value={draft.ignoreip}
            maxTags={50}
            onChange={(values) => {
              const bad = values.filter((v) => !isIpOrCidr(v));
              if (bad.length > 0) notifications.show({ message: `Adresse invalide : ${bad.join(', ')}`, color: 'red' });
              setDraft({ ...draft, ignoreip: values.filter(isIpOrCidr) });
            }}
          />

          <Text fw={600} mt="sm">Jails</Text>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Jail</Table.Th>
                  <Table.Th>Active</Table.Th>
                  <Table.Th>Bannissement (min)</Table.Th>
                  <Table.Th>Fenêtre (min)</Table.Th>
                  <Table.Th>Tentatives</Table.Th>
                  <Table.Th>Bannies</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {draft.jails.map((j) => {
                  const avail = available.has(j.name);
                  const live = jailStatus.get(j.name);
                  return (
                    <Table.Tr key={j.name} opacity={avail ? 1 : 0.55}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{j.name}</Text>
                        <Text size="xs" c="dimmed">{JAIL_INFO[j.name]}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Journal absent : service non installé sur ce serveur" disabled={avail}>
                          <div>
                            <Switch
                              checked={j.enabled && avail}
                              disabled={!avail}
                              onChange={(e) => setJail(j.name, { enabled: e.currentTarget.checked })}
                            />
                          </div>
                        </Tooltip>
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs" w={110} {...LIMITS.bantime} allowDecimal={false}
                          placeholder="défaut" disabled={!j.enabled || !avail}
                          value={toMinutes(j.bantime)}
                          onChange={(v) => setJail(j.name, { bantime: minutesOrNull(v) })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs" w={110} {...LIMITS.findtime} allowDecimal={false}
                          placeholder="défaut" disabled={!j.enabled || !avail}
                          value={toMinutes(j.findtime)}
                          onChange={(v) => setJail(j.name, { findtime: minutesOrNull(v) })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs" w={90} {...LIMITS.maxretry} allowDecimal={false}
                          placeholder="défaut" disabled={!j.enabled || !avail}
                          value={j.maxretry ?? ''}
                          onChange={(v) => setJail(j.name, { maxretry: fromNumberInput(v) })}
                        />
                      </Table.Td>
                      <Table.Td>
                        {live ? <Badge color={live.currentlyBanned > 0 ? 'red' : 'gray'} variant="light">{live.currentlyBanned}</Badge> : <Text size="xs" c="dimmed">—</Text>}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed">Champ vide : valeur par défaut (réglage global, ou celui de la jail fournie par fail2ban, ex. 1 semaine pour recidive).</Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={!dirty || busy === 'save'} onClick={() => setDraft(info.config)}>Annuler</Button>
            <Button disabled={!dirty} loading={busy === 'save'} onClick={save}>Enregistrer et recharger</Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Text fw={600}>IP bannies</Text>
          {!st.active && <Text size="sm" c="dimmed">Fail2ban est arrêté.</Text>}
          {st.active && (
            <>
              <Group align="flex-end">
                <TextInput
                  label="Bannir une IP"
                  placeholder="203.0.113.7"
                  value={banIp}
                  onChange={(e) => setBanIp(e.currentTarget.value)}
                  error={banIp.trim() !== '' && !banIpValid ? 'IP invalide' : undefined}
                />
                <Select
                  label="Jail"
                  w={180}
                  data={st.jails.map((j) => j.name)}
                  value={banJail}
                  onChange={setBanJail}
                  allowDeselect={false}
                />
                <Button color="red" variant="light" disabled={!banIpValid || !banJail} loading={busy === 'ban'} onClick={ban}>Bannir</Button>
              </Group>
              {bannedTotal === 0 && <Text size="sm" c="dimmed">Aucune IP bannie actuellement.</Text>}
              {st.jails.filter((j) => j.bannedIps.length > 0).map((j) => (
                <Stack key={j.name} gap={4}>
                  <Text size="sm" fw={600}>{j.name} <Text span size="xs" c="dimmed">({j.totalBanned} au total depuis le démarrage)</Text></Text>
                  <Table>
                    <Table.Tbody>
                      {j.bannedIps.map((ip) => (
                        <Table.Tr key={ip}>
                          <Table.Td ff="monospace">{ip}</Table.Td>
                          <Table.Td w={120}>
                            <Button size="compact-xs" variant="light" loading={busy === `unban:${j.name}:${ip}`} onClick={() => unban(ip, j.name)}>
                              Débannir
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              ))}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
