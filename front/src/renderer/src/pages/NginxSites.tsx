import { useState } from 'react';
import { Table, Badge, Button, Modal, TextInput, Switch, Stack, Select, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconWorld } from '@tabler/icons-react';
import type { NginxVhost } from '../types';

export function NginxSitesPage() {
  const vhosts = useModuleQuery<NginxVhost[]>('nginx', 'vhosts.list');
  const action = useModuleAction('nginx');
  const [createOpen, setCreateOpen] = useState(false);

  const remove = async (id: string) => {
    const res = await action.run('vhosts.delete', { id });
    if (res !== null) {
      notifications.show({ message: `Site ${id} supprimé`, color: 'green' });
      void vhosts.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (vhosts.loading) return <LoadingBlock />;
  if (vhosts.error) return <ErrorBlock error={vhosts.error} />;

  return (
    <div>
      <PageHeader
icon={IconWorld}         title="Sites Nginx"
        description={`${vhosts.data?.length ?? 0} virtualhost(s)`}
        actions={<Button onClick={() => setCreateOpen(true)}>Nouveau site</Button>}
      />
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
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
            {(vhosts.data ?? []).map((vh) => (
              <Table.Tr key={vh.id}>
                <Table.Td fw={600}>{vh.domain}</Table.Td>
                <Table.Td c="dimmed">{vh.docroot || <Text c="dimmed">proxy</Text>}</Table.Td>
                <Table.Td>{vh.phpVersion ?? '—'}</Table.Td>
                <Table.Td>{vh.nodePort ?? '—'}</Table.Td>
                <Table.Td>{vh.ssl ? <Badge color="green" variant="light">SSL</Badge> : '—'}</Table.Td>
                <Table.Td>{vh.enabled ? <Badge color="green" variant="light">actif</Badge> : <Badge variant="light">inactif</Badge>}</Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(vh.id)}>
                    Supprimer
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <CreateModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void vhosts.reload(); }} />
    </div>
  );
}

function CreateModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('nginx');
  const [domain, setDomain] = useState('');
  const [docroot, setDocroot] = useState('');
  const [phpVersion, setPhpVersion] = useState<string | null>(null);
  const [nodePort, setNodePort] = useState('');
  const [ssl, setSsl] = useState(false);

  const submit = async () => {
    const res = await action.run('vhosts.create', {
      domain,
      docroot: docroot || `/var/www/${domain}`,
      phpVersion: phpVersion ?? undefined,
      ...(nodePort ? { nodePort: Number(nodePort) } : {}),
      ssl,
    });
    if (res !== null) {
      notifications.show({ message: `Site ${domain} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouveau site Nginx">
      <Stack>
        <TextInput label="Domaine" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} required />
        <TextInput label="DocumentRoot" placeholder={`/var/www/${domain || 'exemple.com'}`} value={docroot} onChange={(e) => setDocroot(e.currentTarget.value)} />
        <Select label="Version PHP" placeholder="Aucune" data={['8.1', '8.2', '8.3', '8.4']} value={phpVersion} onChange={setPhpVersion} clearable />
        <TextInput
          label="Port app Node (proxy, optionnel)"
          placeholder="3001"
          value={nodePort}
          onChange={(e) => setNodePort(e.currentTarget.value)}
        />
        <Switch label="SSL" checked={ssl} onChange={(e) => setSsl(e.currentTarget.checked)} />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
