import { useState } from 'react';
import { Table, Button, Modal, TextInput, PasswordInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { SftpUser } from '../types';

export function UsersPage() {
  const users = useModuleQuery<SftpUser[]>('users', 'users.list');
  const action = useModuleAction('users');
  const [createOpen, setCreateOpen] = useState(false);

  const remove = async (username: string) => {
    const res = await action.run('users.delete', { username });
    if (res !== null) {
      notifications.show({ message: `Utilisateur ${username} supprimé`, color: 'green' });
      void users.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (users.loading) return <LoadingBlock />;
  if (users.error) return <ErrorBlock error={users.error} />;

  return (
    <div>
      <PageHeader
        title="Utilisateurs SFTP"
        description={`${users.data?.length ?? 0} compte(s) chrooté(s) dans /var/www`}
        actions={<Button onClick={() => setCreateOpen(true)}>Nouvel utilisateur</Button>}
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Utilisateur</Table.Th>
            <Table.Th>UID</Table.Th>
            <Table.Th>Chroot (site)</Table.Th>
            <Table.Th>Shell</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(users.data ?? []).map((u) => (
            <Table.Tr key={u.username}>
              <Table.Td fw={600}>{u.username}</Table.Td>
              <Table.Td c="dimmed">{u.uid}</Table.Td>
              <Table.Td c="dimmed">{u.home.replace('/var/www/', '')}</Table.Td>
              <Table.Td c="dimmed" fz="sm">{u.shell}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(u.username)}>Supprimer</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <CreateUserModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void users.reload(); }} />
    </div>
  );
}

function CreateUserModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('users');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [site, setSite] = useState('');

  const submit = async () => {
    const res = await action.run('users.create', { username, password, site });
    if (res !== null) {
      notifications.show({ message: `Utilisateur ${username} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvel utilisateur SFTP">
      <Stack>
        <TextInput label="Nom d'utilisateur" placeholder="web-alice" value={username} onChange={(e) => setUsername(e.currentTarget.value)} required />
        <PasswordInput label="Mot de passe (8 min.)" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
        <TextInput label="Site (chroot)" placeholder="exemple.com" value={site} onChange={(e) => setSite(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}
