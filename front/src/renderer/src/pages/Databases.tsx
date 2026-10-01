import { useState } from 'react';
import { Table, Button, Modal, TextInput, Stack, Group, Badge, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';

export function DatabasesPage() {
  const dbs = useModuleQuery<{ databases: string[] }>('mariadb', 'dbs.list');
  const users = useModuleQuery<{ users: Array<{ user: string; host: string }> }>('mariadb', 'users.list');
  const action = useModuleAction('mariadb');
  const [dbOpen, setDbOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const dropDb = async (database: string) => {
    const res = await action.run('dbs.delete', { database });
    if (res !== null) {
      notifications.show({ message: `Base ${database} supprimée`, color: 'green' });
      void dbs.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (dbs.loading || users.loading) return <LoadingBlock />;
  if (dbs.error) return <ErrorBlock error={dbs.error} />;
  if (users.error) return <ErrorBlock error={users.error} />;

  return (
    <Group align="flex-start" grow gap="md" wrap="wrap">
      <div style={{ flex: 1, minWidth: 320 }}>
        <PageHeader
          title="Bases de données"
          actions={<Button size="xs" onClick={() => setDbOpen(true)}>Nouvelle base</Button>}
        />
        <Table>
          <Table.Tbody>
            {(dbs.data?.databases ?? []).map((db) => (
              <Table.Tr key={db}>
                <Table.Td fw={600}>{db}</Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="light" color="red" onClick={() => void dropDb(db)}>Supprimer</Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <CreateDbModal opened={dbOpen} onClose={() => setDbOpen(false)} onCreated={() => { setDbOpen(false); void dbs.reload(); }} />
      </div>

      <div style={{ flex: 1, minWidth: 320 }}>
        <PageHeader
          title="Utilisateurs SQL"
          actions={<Button size="xs" onClick={() => setUserOpen(true)}>Nouvel utilisateur</Button>}
        />
        <Table>
          <Table.Tbody>
            {(users.data?.users ?? []).map((u) => (
              <Table.Tr key={`${u.user}-${u.host}`}>
                <Table.Td fw={600}>{u.user}</Table.Td>
                <Table.Td><Badge variant="light" size="sm">{u.host}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <CreateSqlUserModal opened={userOpen} onClose={() => setUserOpen(false)} onCreated={() => { setUserOpen(false); void users.reload(); }} />
      </div>
    </Group>
  );
}

function CreateDbModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('mariadb');
  const [database, setDatabase] = useState('');
  const submit = async () => {
    const res = await action.run('dbs.create', { database });
    if (res !== null) {
      notifications.show({ message: `Base ${database} créée`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Nouvelle base de données">
      <Stack>
        <TextInput label="Nom" placeholder="sitedb" value={database} onChange={(e) => setDatabase(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}

function CreateSqlUserModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('mariadb');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = async () => {
    const res = await action.run('users.create', { username, password });
    if (res !== null) {
      notifications.show({ message: `Utilisateur ${username} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Nouvel utilisateur SQL">
      <Stack>
        <TextInput label="Nom d'utilisateur" placeholder="siteuser" value={username} onChange={(e) => setUsername(e.currentTarget.value)} required />
        <TextInput label="Mot de passe (8 min.)" type="password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
