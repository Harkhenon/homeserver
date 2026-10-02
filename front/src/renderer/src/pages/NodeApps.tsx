import { useState } from 'react';
import { Table, Badge, Button, Modal, TextInput, Select, Stack, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconBrandNodejs } from '@tabler/icons-react';
import type { NodeApp } from '../types';

export function NodeAppsPage() {
  const apps = useModuleQuery<{ apps: NodeApp[] }>('node', 'apps.list');
  const action = useModuleAction('node');
  const [createOpen, setCreateOpen] = useState(false);

  const service = async (name: string, verb: 'start' | 'stop' | 'restart') => {
    const res = await action.run('apps.service', { name, verb });
    if (res !== null) {
      notifications.show({ message: `${name} : ${verb} OK`, color: 'green' });
      void apps.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const remove = async (name: string) => {
    const res = await action.run('apps.delete', { name });
    if (res !== null) {
      notifications.show({ message: `${name} supprimée`, color: 'green' });
      void apps.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (apps.loading) return <LoadingBlock />;
  if (apps.error) return <ErrorBlock error={apps.error} />;

  return (
    <div>
      <PageHeader
icon={IconBrandNodejs}         title="Applications Node"
        description="Services systemd hs-app-* avec port dédié"
        actions={<Button onClick={() => setCreateOpen(true)}>Nouvelle app</Button>}
      />
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Port</Table.Th>
              <Table.Th>Utilisateur</Table.Th>
              <Table.Th>État</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(apps.data?.apps ?? []).map((app) => (
              <Table.Tr key={app.name}>
                <Table.Td fw={600}>{app.name}</Table.Td>
                <Table.Td>{app.port}</Table.Td>
                <Table.Td c="dimmed">{app.user}</Table.Td>
                <Table.Td>
                  {app.active
                    ? <Badge color="green" variant="light">active</Badge>
                    : <Badge color="red" variant="light">arrêtée</Badge>}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button size="compact-xs" variant="light" onClick={() => void service(app.name, 'restart')}>Redémarrer</Button>
                    <Button size="compact-xs" variant="light" color="orange" onClick={() => void service(app.name, 'stop')}>Arrêter</Button>
                    <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(app.name)}>Supprimer</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <CreateAppModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void apps.reload(); }} />
    </div>
  );
}

function CreateAppModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('node');
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [user, setUser] = useState('');
  const [entry, setEntry] = useState('server.js');

  const submit = async () => {
    const appName = name.startsWith('hs-app-') ? name : `hs-app-${name}`;
    const res = await action.run('apps.create', { name: appName, port: Number(port), user, entry });
    if (res !== null) {
      notifications.show({ message: `App ${appName} créée`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvelle application Node">
      <Stack>
        <TextInput label="Nom" placeholder="blog" description="Préfixe hs-app- ajouté automatiquement" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <TextInput label="Port" placeholder="3001" value={port} onChange={(e) => setPort(e.currentTarget.value)} required />
        <TextInput label="Utilisateur système" placeholder="web-alice" value={user} onChange={(e) => setUser(e.currentTarget.value)} required />
        <TextInput label="Point d'entrée" placeholder="server.js" value={entry} onChange={(e) => setEntry(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
