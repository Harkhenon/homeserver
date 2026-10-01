import { useState } from 'react';
import {
  Table, Badge, Button, Group, Modal, TextInput, Switch, Stack, Text, Select, Pagination, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { Vhost } from '../types';

const PAGE_SIZE = 10;

export function SitesPage() {
  const vhosts = useModuleQuery<Vhost[]>('apache', 'vhosts.list');
  const action = useModuleAction('apache');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const remove = async (id: string) => {
    const res = await action.run('vhosts.delete', { id });
    if (res !== null) {
      notifications.show({ message: `Site ${id} supprimé`, color: 'green' });
      void vhosts.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    const res = await action.run('vhosts.enable', { id, enabled });
    if (res !== null) {
      notifications.show({ message: enabled ? `Site ${id} activé` : `Site ${id} désactivé`, color: 'green' });
      void vhosts.reload();
    }
  };

  if (vhosts.loading) return <LoadingBlock />;
  if (vhosts.error) return <ErrorBlock error={vhosts.error} />;

  const list = vhosts.data ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Sites Apache"
        description={`${list.length} virtualhost(s)`}
        actions={<Button onClick={() => setCreateOpen(true)}>Nouveau site</Button>}
      />
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Domaine</Table.Th>
              <Table.Th>DocumentRoot</Table.Th>
              <Table.Th>PHP</Table.Th>
              <Table.Th>SSL</Table.Th>
              <Table.Th>Actif</Table.Th>
              <Table.Th /></Table.Tr>
            </Table.Thead>
          <Table.Tbody>
            {paged.map((vh) => (
              <Table.Tr key={vh.id}>
                <Table.Td fw={600}>{vh.domain}</Table.Td>
                <Table.Td c="dimmed">{vh.docroot}</Table.Td>
                <Table.Td>{vh.phpVersion ?? <Text c="dimmed">—</Text>}</Table.Td>
                <Table.Td>
                  {vh.ssl ? <Badge color="green" variant="light">SSL</Badge> : <Badge variant="light">—</Badge>}
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={vh.enabled}
                    onChange={(e) => void toggle(vh.id, e.currentTarget.checked)}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(vh.id)}>
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
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </Group>
      )}
      <CreateSiteModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void vhosts.reload();
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
  const action = useModuleAction('apache');
  const [domain, setDomain] = useState('');
  const [docroot, setDocroot] = useState('');
  const [phpVersion, setPhpVersion] = useState<string | null>(null);
  const [ssl, setSsl] = useState(false);
  const [nodePort, setNodePort] = useState('');

  const submit = async () => {
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
    <Modal opened={opened} onClose={onClose} title="Nouveau site Apache">
      <Stack>
        <TextInput label="Domaine" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} required />
        <TextInput label="DocumentRoot" placeholder={`/var/www/${domain || 'exemple.com'}`} value={docroot} onChange={(e) => setDocroot(e.currentTarget.value)} />
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
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
