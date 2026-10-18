import {
  Stack, Text, Button, Group, Table, Badge, ActionIcon, Tooltip, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabaseImport, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';
import type { Vhost, NginxVhost, BackupInfo } from '../../types';

interface SiteBackupsTabProps {
  vhost: Vhost | NginxVhost;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function SiteBackupsTab({ vhost }: SiteBackupsTabProps) {
  const backups = useModuleQuery<{ backups: BackupInfo[] }>('backups', 'backups.list');
  const action = useModuleAction('backups');

  const siteBackups = (backups.data?.backups ?? [])
    .filter((b) => b.site === vhost.domain)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const create = async () => {
    const res = await action.run('backups.create', { site: vhost.domain });
    if (res !== null) {
      notifications.show({ message: `Sauvegarde de ${vhost.domain} créée`, color: 'green' });
      void backups.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const remove = async (file: string) => {
    const res = await action.run('backups.delete', { file });
    if (res !== null) {
      notifications.show({ message: 'Sauvegarde supprimée', color: 'green' });
      void backups.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const restore = async (file: string) => {
    const res = await action.run('backups.restore', { file, site: vhost.domain });
    if (res !== null) {
      notifications.show({ message: `${vhost.domain} restauré`, color: 'green' });
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="sm" align="center">
          <Text size="sm" fw={600}>Sauvegardes de {vhost.domain}</Text>
          <Badge variant="light" color={siteBackups.length > 0 ? 'green' : 'orange'}>
            {siteBackups.length}
          </Badge>
        </Group>
        <Button
          size="sm"
          variant="light"
          leftSection={<IconDatabaseImport size={14} stroke={1.5} />}
          loading={action.loading}
          onClick={() => void create()}
        >
          Nouvelle sauvegarde
        </Button>
      </Group>

      {siteBackups.length === 0 ? (
        <Alert color="blue" variant="light">
          Aucune sauvegarde pour ce site. Une sauvegarde compresse le contenu de{' '}
          <code>{vhost.docroot}</code> en tar.gz.
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={500}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Taille</Table.Th>
                <Table.Th>Fichier</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {siteBackups.map((b) => (
                <Table.Tr key={b.file}>
                  <Table.Td c="dimmed" fz="sm">{new Date(b.createdAt).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td fz="sm">{formatSize(b.sizeBytes)}</Table.Td>
                  <Table.Td fz="sm">{b.file}</Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      <Tooltip label="Restaurer" withinPortal>
                        <ActionIcon
                          variant="subtle"
                          color="teal"
                          loading={action.loading}
                          onClick={() => void restore(b.file)}
                        >
                          <IconUpload size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Supprimer" withinPortal>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          loading={action.loading}
                          onClick={() => void remove(b.file)}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Group gap={6}>
        <IconRefresh size={14} stroke={1.5} />
        <Text size="xs" c="dimmed">
          Les sauvegardes sont stockées dans /var/backups/homeserver — visibles aussi dans le module Sauvegardes.
        </Text>
      </Group>
    </Stack>
  );
}
