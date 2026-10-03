import { useMemo, useState } from 'react';
import {
  Table, Badge, Button, Group, Modal, TextInput, Switch, Stack, Text, Select, Pagination, Tooltip, SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconWorld } from '@tabler/icons-react';
import type { Vhost, NginxVhost, Zone, SftpUser } from '../types';

const PAGE_SIZE = 10;
type ServerKind = 'apache' | 'nginx';

interface SiteRow {
  id: string;
  server: ServerKind;
  domain: string;
  docroot: string;
  phpVersion?: string | null;
  nodePort?: number | null;
  ssl: boolean;
  enabled: boolean;
}

const SERVER_BADGE: Record<ServerKind, { label: string; color: string }> = {
  apache: { label: 'Apache', color: 'red' },
  nginx: { label: 'Nginx', color: 'green' },
};

export function SitesPage() {
  const apache = useModuleQuery<Vhost[]>('apache', 'vhosts.list');
  const nginx = useModuleQuery<NginxVhost[]>('nginx', 'vhosts.list');
  const apacheAction = useModuleAction('apache');
  const nginxAction = useModuleAction('nginx');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | ServerKind>('all');

  const loading = apache.loading || nginx.loading;
  const unavailable: string[] = [];
  if (apache.error) unavailable.push('Apache');
  if (nginx.error) unavailable.push('Nginx');
  const error = unavailable.length === 2 ? (apache.error ?? nginx.error) : null;

  const rows = useMemo<SiteRow[]>(() => {
    const apacheRows = (apache.data ?? []).map((vh) => ({
      id: vh.id, server: 'apache' as const, domain: vh.domain, docroot: vh.docroot,
      phpVersion: vh.phpVersion, nodePort: null, ssl: vh.ssl, enabled: vh.enabled,
    }));
    const nginxRows = (nginx.data ?? []).map((vh) => ({
      id: vh.id, server: 'nginx' as const, domain: vh.domain, docroot: vh.docroot,
      phpVersion: vh.phpVersion, nodePort: vh.nodePort, ssl: vh.ssl, enabled: vh.enabled,
    }));
    return [...apacheRows, ...nginxRows];
  }, [apache.data, nginx.data]);

  const list = filter === 'all' ? rows : rows.filter((r) => r.server === filter);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const reload = () => {
    void apache.reload();
    void nginx.reload();
  };

  const remove = async (row: SiteRow) => {
    const action = row.server === 'apache' ? apacheAction : nginxAction;
    const res = await action.run('vhosts.delete', { id: row.id });
    if (res !== null) {
      notifications.show({ message: `Site ${row.domain} supprimé`, color: 'green' });
      reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const toggle = async (row: SiteRow, enabled: boolean) => {
    const action = row.server === 'apache' ? apacheAction : nginxAction;
    const res = await action.run('vhosts.enable', { id: row.id, enabled });
    if (res !== null) {
      notifications.show({ message: enabled ? `Site ${row.domain} activé` : `Site ${row.domain} désactivé`, color: 'green' });
      reload();
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div>
      {unavailable.length > 0 && (
        <Text c="dimmed" size="sm" mb="md">
          Module{unavailable.length > 1 ? 's' : ''} {unavailable.join(' et ')} non actif — liste partielle
        </Text>
      )}
      <PageHeader
        icon={IconWorld}
        title="Sites"
        description={`${rows.length} virtualhost(s)`}
        actions={<Button onClick={() => setCreateOpen(true)}>Nouveau site</Button>}
      />
      <Group justify="space-between" mb="md">
        <SegmentedControl
          value={filter}
          onChange={(v) => { setFilter(v as 'all' | ServerKind); setPage(1); }}
          data={[
            { label: `Tous (${rows.length})`, value: 'all' },
            { label: `Apache (${rows.filter((r) => r.server === 'apache').length})`, value: 'apache' },
            { label: `Nginx (${rows.filter((r) => r.server === 'nginx').length})`, value: 'nginx' },
          ]}
        />
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Serveur</Table.Th>
              <Table.Th>Domaine</Table.Th>
              <Table.Th>DocumentRoot</Table.Th>
              <Table.Th>PHP</Table.Th>
              <Table.Th>Port Node</Table.Th>
              <Table.Th>SSL</Table.Th>
              <Table.Th>Actif</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paged.map((row) => (
              <Table.Tr key={`${row.server}:${row.id}`}>
                <Table.Td>
                  <Badge color={SERVER_BADGE[row.server].color} variant="light">
                    {SERVER_BADGE[row.server].label}
                  </Badge>
                </Table.Td>
                <Table.Td fw={600}>{row.domain}</Table.Td>
                <Table.Td c="dimmed">{row.docroot || <Text c="dimmed">proxy</Text>}</Table.Td>
                <Table.Td>{row.phpVersion ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>{row.nodePort ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  {row.ssl ? <Badge color="green" variant="light">SSL</Badge> : <Badge variant="light">—</Badge>}
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={row.enabled}
                    onChange={(e) => void toggle(row, e.currentTarget.checked)}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(row)}>
                      Supprimer
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination total={totalPages} value={safePage} onChange={setPage} />
        </Group>
      )}
      <CreateSiteModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateSiteModal({ opened, onClose, onCreated }: {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [server, setServer] = useState<ServerKind>('apache');
  const action = useModuleAction(server);
  const zones = useModuleQuery<Zone[]>('bind9', 'zones.list');
  const users = useModuleQuery<SftpUser[]>('users', 'users.list');
  const [domain, setDomain] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [docroot, setDocroot] = useState('');

  const pickDomain = (value: string | null) => {
    setDomain(value);
    if (value && owner) setDocroot(`/home/${owner}/www/${value}`);
  };

  const pickOwner = (value: string | null) => {
    setOwner(value);
    if (value && domain) setDocroot(`/home/${value}/www/${domain}`);
  };
  const [phpVersion, setPhpVersion] = useState<string | null>(null);
  const [ssl, setSsl] = useState(false);
  const [nodePort, setNodePort] = useState('');

  const submit = async () => {
    if (!domain) return;
    const res = await action.run('vhosts.create', {
      domain,
      docroot: docroot || `/var/www/${domain}`,
      phpVersion: phpVersion ?? undefined,
      ssl,
      ...(nodePort ? { nodePort: Number(nodePort) } : {}),
    });
    if (res !== null) {
      notifications.show({ message: `Site ${domain} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Nouveau site ${SERVER_BADGE[server].label}`}>
      <Stack>
        <SegmentedControl
          fullWidth
          value={server}
          onChange={(v) => setServer(v as ServerKind)}
          data={[
            { label: 'Apache', value: 'apache' },
            { label: 'Nginx', value: 'nginx' },
          ]}
        />
        <Select
          label="Propriétaire"
          placeholder="Choisir un utilisateur"
          data={(users.data ?? []).map((u) => ({ label: u.username, value: u.username }))}
          value={owner}
          onChange={pickOwner}
          required
          disabled={users.loading}
          error={!users.loading && (users.data ?? []).length === 0 ? 'Aucun utilisateur — créez-en un dans Utilisateurs' : undefined}
        />
        <Select
          label="Domaine"
          placeholder="Choisir un domaine enregistré"
          data={(zones.data ?? []).map((z) => ({ label: z.domain, value: z.domain }))}
          value={domain}
          onChange={pickDomain}
          required
          disabled={zones.loading}
          error={!zones.loading && (zones.data ?? []).length === 0 ? 'Aucun domaine enregistré — créez-en un dans Domaines' : undefined}
        />
        <TextInput label="DocumentRoot" placeholder={`/var/www/${domain ?? 'exemple.com'}`} value={docroot} onChange={(e) => setDocroot(e.currentTarget.value)} />
        <Select
          label="Version PHP"
          placeholder="Aucune (statique ou Node)"
          data={['8.1', '8.2', '8.3', '8.4']}
          value={phpVersion}
          onChange={setPhpVersion}
          clearable
        />
        <Tooltip label="Port d'une app Node (proxy inverse) — laisser vide pour un site classique">
          <TextInput
            label="Port app Node (optionnel)"
            placeholder="3001"
            value={nodePort}
            onChange={(e) => setNodePort(e.currentTarget.value)}
          />
        </Tooltip>
        <Switch label="SSL (Let's Encrypt déjà émis)" checked={ssl} onChange={(e) => setSsl(e.currentTarget.checked)} />
        <Button loading={action.loading} disabled={!domain} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
