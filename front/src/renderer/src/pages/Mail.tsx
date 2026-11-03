import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Badge, Button, Card, Group, Modal, NumberInput, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon,
} from '@mantine/core';
import { IconChevronRight, IconLock, IconMail, IconPlayerPause, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useModuleQuery } from '../api/hooks';
import { ErrorBlock, LoadingBlock, PageHeader } from '../components';
import { mailCall } from '../components/mail/MailboxesPanel';
import type { MailDomain, MailStatus, Zone } from '../types';

const SERVICE_LABELS: Record<string, string> = { postfix: 'Postfix (SMTP)', dovecot: 'Dovecot (IMAP/POP3)', opendkim: 'OpenDKIM (signature)' };

function ActivationCard({ zones, onDone }: { zones: Zone[]; onDone: () => void }) {
  const first = zones.find((z) => !z.external)?.domain ?? zones[0]?.domain;
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState(false);
  // Les domaines arrivent après le premier rendu : suggestion tant que rien n'est saisi
  useEffect(() => {
    if (first) setHostname((h) => h || `mail.${first}`);
  }, [first]);
  const submit = async () => {
    setBusy(true);
    const res = await mailCall('setup', { hostname: hostname.trim().toLowerCase() }, 'Service e-mail activé');
    setBusy(false);
    if (res) onDone();
  };
  return (
    <Card withBorder maw={640}>
      <Stack>
        <Group wrap="nowrap">
          <ThemeIcon variant="light" size={40} radius="md"><IconMail size={22} stroke={1.5} /></ThemeIcon>
          <div>
            <Text fw={600}>Activer le service e-mail</Text>
            <Text size="sm" c="dimmed">Installe et configure Postfix, Dovecot et OpenDKIM sur ce serveur.</Text>
          </div>
        </Group>
        <TextInput
          label="Nom d'hôte du serveur de mail"
          description="Il doit pointer vers ce serveur (DNS A). Tous les domaines l'utiliseront pour la réception et les logiciels de messagerie."
          placeholder="mail.exemple.fr"
          value={hostname}
          onChange={(e) => setHostname(e.currentTarget.value)}
        />
        <Alert color="blue" variant="light">
          Comptez quelques minutes. Les ports 25, 465, 587, 993 et 995 seront ouverts si un pare-feu est actif,
          et le service consommera environ 300 Mo de RAM.
        </Alert>
        <Group justify="flex-end">
          <Button loading={busy} disabled={!hostname.trim()} onClick={() => void submit()}>Activer</Button>
        </Group>
      </Stack>
    </Card>
  );
}

function TlsModal({ opened, onClose, onDone, hostname }: { opened: boolean; onClose: () => void; onDone: () => void; hostname: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const res = await mailCall('tls.issue', { email: email.trim() }, 'Certificat Let\'s Encrypt installé');
    setBusy(false);
    if (res) { onDone(); onClose(); }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Certificat Let's Encrypt">
      <Stack>
        <Text size="sm">Remplace le certificat auto-signé pour <b>{hostname}</b>, qui doit pointer vers ce serveur (port 80 joignable). Le renouvellement est automatique.</Text>
        <TextInput label="Email de contact Let's Encrypt" value={email} onChange={(e) => setEmail(e.currentTarget.value)} data-autofocus />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={!email.includes('@')} onClick={() => void submit()}>Obtenir le certificat</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ServiceCard({ status, onChanged }: { status: MailStatus; onChanged: () => void }) {
  const [tlsOpen, setTlsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = Object.values(status.services).every(Boolean);
  const toggle = async () => {
    setBusy(true);
    const res = await mailCall('service.set', { enabled: !running }, running ? 'Service e-mail arrêté (boîtes conservées)' : 'Service e-mail démarré');
    setBusy(false);
    if (res) onChanged();
  };
  const expires = status.tls.expiresAt ? new Date(status.tls.expiresAt).toLocaleDateString('fr-FR') : '—';
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Service</Text>
          <Button
            size="compact-sm"
            variant="light"
            color={running ? 'orange' : 'teal'}
            loading={busy}
            leftSection={running ? <IconPlayerPause size={14} stroke={1.5} /> : <IconPlayerPlay size={14} stroke={1.5} />}
            onClick={() => void toggle()}
          >
            {running ? 'Arrêter' : 'Démarrer'}
          </Button>
        </Group>
        <Text size="sm" c="dimmed" mb="xs">{status.hostname}{status.serverIp ? ` · ${status.serverIp}` : ''}</Text>
        <Group gap="xs">
          {Object.entries(status.services).map(([unit, active]) => (
            <Badge key={unit} variant="light" color={active ? 'teal' : 'red'}>{SERVICE_LABELS[unit] ?? unit}</Badge>
          ))}
        </Group>
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Certificat</Text>
          <Button size="compact-sm" variant="light" leftSection={<IconLock size={14} stroke={1.5} />} onClick={() => setTlsOpen(true)}>
            {status.tls.mode === 'letsencrypt' ? 'Renouveler' : 'Let\'s Encrypt'}
          </Button>
        </Group>
        <Badge variant="light" color={status.tls.mode === 'letsencrypt' ? 'teal' : 'orange'} mb="xs">
          {status.tls.mode === 'letsencrypt' ? 'Let\'s Encrypt' : 'Auto-signé'}
        </Badge>
        <Text size="sm" c="dimmed">
          Expire le {expires}
          {status.tls.mode !== 'letsencrypt' && ' — les logiciels de messagerie afficheront un avertissement.'}
        </Text>
      </Card>
      <TlsModal opened={tlsOpen} onClose={() => setTlsOpen(false)} onDone={onChanged} hostname={status.hostname ?? ''} />
    </SimpleGrid>
  );
}

function AddDomainModal({ opened, onClose, onDone, suggestions }: { opened: boolean; onClose: () => void; onDone: (d: string) => void; suggestions: string[] }) {
  const [domain, setDomain] = useState('');
  const [quota, setQuota] = useState<number | string>(2048);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const value = domain.trim().toLowerCase();
    setBusy(true);
    const res = await mailCall('domains.add', { domain: value, defaultQuotaMb: Number(quota) }, `Messagerie activée pour ${value}`);
    setBusy(false);
    if (res) { setDomain(''); onDone(value); }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Activer la messagerie d'un domaine">
      <Stack>
        <Autocomplete label="Domaine" placeholder="exemple.fr" data={suggestions} value={domain} onChange={setDomain} data-autofocus />
        <NumberInput label="Quota par défaut des boîtes (Mo)" description="0 : illimité." min={0} allowDecimal={false} value={quota} onChange={setQuota} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={!domain.trim() || quota === ''} onClick={() => void submit()}>Activer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function MailPage() {
  const status = useModuleQuery<MailStatus>('mail', 'status');
  const configured = status.data?.configured === true;
  const domains = useModuleQuery<{ domains: MailDomain[] }>('mail', 'domains.list');
  const zones = useModuleQuery<Zone[]>('bind9', 'zones.list');
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();

  const list = domains.data?.domains ?? [];
  const suggestions = useMemo(() => {
    const used = new Set(list.map((d) => d.domain));
    return (zones.data ?? []).map((z) => z.domain).filter((d) => !used.has(d));
  }, [zones.data, list]);

  if (status.loading && !status.data) return <LoadingBlock />;
  if (status.error) return <ErrorBlock error={status.error} />;

  const reload = () => { void status.reload(true); void domains.reload(true); };

  return (
    <div>
      <PageHeader
        icon={IconMail}
        title="E-mails"
        description={configured ? `${list.length} domaine(s) · ${status.data?.boxCount ?? 0} boîte(s)` : 'Boîtes e-mail de vos domaines'}
        actions={configured
          ? <Button leftSection={<IconPlus size={16} stroke={1.5} />} onClick={() => setAddOpen(true)}>Ajouter un domaine</Button>
          : undefined}
      />
      {!configured || !status.data ? (
        <ActivationCard zones={zones.data ?? []} onDone={reload} />
      ) : (
        <Stack>
          <ServiceCard status={status.data} onChanged={reload} />
          {domains.error && <ErrorBlock error={domains.error} />}
          {list.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">Aucun domaine pour l'instant : ajoute le premier pour créer des boîtes.</Text>
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>Domaine</Table.Th><Table.Th>Boîtes</Table.Th><Table.Th>État</Table.Th><Table.Th w={40} /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((d) => (
                  <Table.Tr key={d.domain} style={{ cursor: 'pointer' }} onClick={() => navigate(`/mail/${d.domain}`)}>
                    <Table.Td fw={600}>{d.domain}</Table.Td>
                    <Table.Td>{d.boxCount}</Table.Td>
                    <Table.Td><Badge variant="light" color={d.suspended ? 'orange' : 'teal'}>{d.suspended ? 'Suspendu' : 'Actif'}</Badge></Table.Td>
                    <Table.Td><IconChevronRight size={16} stroke={1.5} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      )}
      <AddDomainModal
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        suggestions={suggestions}
        onDone={(d) => { setAddOpen(false); reload(); navigate(`/mail/${d}`); }}
      />
    </div>
  );
}
