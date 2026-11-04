import { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { IconDatabaseImport } from '@tabler/icons-react';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import { mailCall } from './MailboxesPanel';
import type { MailBackup } from '../../types';

/** Sauvegardes de messagerie, d'un domaine ou de tout le serveur (page Sauvegardes). */
export function MailBackupsPanel({ domain, onRestored }: { domain?: string; onRestored?: () => void }) {
  const backups = useModuleQuery<{ backups: MailBackup[] }>('mail', 'backups.list');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<MailBackup | null>(null);
  const [removing, setRemoving] = useState<MailBackup | null>(null);

  if (backups.loading && !backups.data) return <LoadingBlock />;
  if (backups.error) return <ErrorBlock error={backups.error} />;
  const list = (backups.data?.backups ?? []).filter((b) => !domain || b.domain === domain);

  const create = async () => {
    setBusy(true);
    const res = await mailCall('backups.create', { domain }, `Sauvegarde de ${domain ?? ''} créée`);
    setBusy(false);
    if (res) void backups.reload(true);
  };
  const restore = async () => {
    if (!restoring) return;
    setBusy(true);
    const res = await mailCall('backups.restore', { file: restoring.file }, 'Sauvegarde restaurée');
    setBusy(false);
    setRestoring(null);
    if (res) { void backups.reload(true); onRestored?.(); }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const res = await mailCall('backups.delete', { file: removing.file }, 'Sauvegarde supprimée');
    setBusy(false);
    setRemoving(null);
    if (res) void backups.reload(true);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Messages, réglages, mots de passe (hashés) et clés DKIM, dans /var/backups/homeserver/mail, lisibles par root seulement.</Text>
        {domain && (
          <Button size="compact-sm" variant="light" loading={busy} leftSection={<IconDatabaseImport size={14} stroke={1.5} />} onClick={() => void create()}>
            Sauvegarder le domaine
          </Button>
        )}
      </Group>
      {list.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">Aucune sauvegarde de messagerie{domain ? ' pour ce domaine' : ''}.</Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table>
            <Table.Thead>
              <Table.Tr><Table.Th>Contenu</Table.Th><Table.Th>Taille</Table.Th><Table.Th>Date</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((b) => (
                <Table.Tr key={b.file}>
                  <Table.Td>
                    {b.local ? <Text size="sm" fw={600}>{b.local}@{b.domain}</Text> : <Text size="sm" fw={600}>{b.domain}</Text>}
                    <Badge variant="light" size="xs" color={b.local ? 'gray' : 'blue'}>{b.local ? 'Boîte' : 'Domaine'}</Badge>
                  </Table.Td>
                  <Table.Td c="dimmed">{b.sizeMb} Mo</Table.Td>
                  <Table.Td c="dimmed">{new Date(b.createdAt).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button size="compact-xs" variant="light" onClick={() => setRestoring(b)}>Restaurer</Button>
                      <Button size="compact-xs" variant="light" color="red" onClick={() => setRemoving(b)}>Suppr.</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={restoring !== null} onClose={() => setRestoring(null)} title="Restaurer cette sauvegarde ?">
        <Stack>
          <Alert variant="light" color="blue">
            Les messages sauvegardés sont ajoutés à ceux déjà présents, sans rien écraser. Ce qui manque (boîtes, alias, domaine) est recréé
            avec son ancien mot de passe ; ce qui existe garde ses réglages et son mot de passe actuels.
            Un message supprimé depuis la sauvegarde réapparaît.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRestoring(null)}>Annuler</Button>
            <Button loading={busy} onClick={() => void restore()}>Restaurer</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={removing !== null} onClose={() => setRemoving(null)} title="Supprimer cette sauvegarde ?">
        <Stack>
          <Text size="sm" style={{ wordBreak: 'break-all' }}>{removing?.file}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(null)}>Annuler</Button>
            <Button color="red" loading={busy} onClick={() => void remove()}>Supprimer</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
