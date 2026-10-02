import { useState } from 'react';
import { Table, Button, Modal, TextInput, Stack, Badge } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconDatabaseImport } from '@tabler/icons-react';
import type { BackupInfo } from '../types';

export function BackupsPage() {
  const backups = useModuleQuery<{ backups: BackupInfo[] }>('backups', 'backups.list');
  const action = useModuleAction('backups');
  const [createOpen, setCreateOpen] = useState(false);

  const remove = async (file: string) => {
    const res = await action.run('backups.delete', { file });
    if (res !== null) {
      notifications.show({ message: 'Sauvegarde supprimée', color: 'green' });
      void backups.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const restore = async (file: string, site: string) => {
    const res = await action.run('backups.restore', { file, site });
    if (res !== null) {
      notifications.show({ message: `${site} restauré`, color: 'green' });
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (backups.loading) return <LoadingBlock />;
  if (backups.error) return <ErrorBlock error={backups.error} />;

  return (
    <div>
      <PageHeader
icon={IconDatabaseImport}         title="Sauvegardes"
        description="/var/backups/homeserver"
        actions={<Button onClick={() => setCreateOpen(true)}>Sauvegarder un site</Button>}
      />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Fichier</Table.Th>
            <Table.Th>Site</Table.Th>
            <Table.Th>Taille</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(backups.data?.backups ?? []).map((b) => (
            <Table.Tr key={b.file}>
              <Table.Td fw={600} fz="sm">{b.file}</Table.Td>
              <Table.Td><Badge variant="light">{b.site}</Badge></Table.Td>
              <Table.Td c="dimmed">{(b.sizeBytes / 1024 / 1024).toFixed(1)} Mo</Table.Td>
              <Table.Td c="dimmed">{new Date(b.createdAt).toLocaleString('fr-FR')}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" onClick={() => void restore(b.file, b.site)}>Restaurer</Button>
                <Button size="compact-xs" variant="light" color="red" ml="xs" onClick={() => void remove(b.file)}>Suppr.</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <CreateBackupModal opened={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void backups.reload(); }} />
    </div>
  );
}

function CreateBackupModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: () => void }) {
  const action = useModuleAction('backups');
  const [site, setSite] = useState('');
  const submit = async () => {
    const res = await action.run('backups.create', { site });
    if (res !== null) {
      notifications.show({ message: `Sauvegarde de ${site} créée`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Sauvegarder un site">
      <Stack>
        <TextInput label="Site" placeholder="exemple.com" value={site} onChange={(e) => setSite(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Sauvegarder</Button>
      </Stack>
    </Modal>
  );
}
