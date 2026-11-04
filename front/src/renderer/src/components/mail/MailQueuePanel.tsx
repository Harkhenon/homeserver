import { useState } from 'react';
import { ActionIcon, Badge, Button, Group, Menu, Modal, Stack, Table, Text } from '@mantine/core';
import { IconDots, IconPlayerPause, IconPlayerPlay, IconRefresh, IconSend, IconTrash } from '@tabler/icons-react';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import { mailCall } from './MailboxesPanel';
import type { MailQueueItem, MailQueueResult } from '../../types';

const QUEUE_LABEL: Record<string, { text: string; color: string }> = {
  active: { text: 'En cours', color: 'blue' },
  incoming: { text: 'Entrant', color: 'blue' },
  maildrop: { text: 'Entrant', color: 'blue' },
  deferred: { text: 'Différé', color: 'orange' },
  hold: { text: 'Retenu', color: 'gray' },
};

function size(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.ceil(bytes / 1024)} Ko`;
}

/** File d'attente de Postfix : ce qui n'est pas encore parti, et pourquoi. */
export function MailQueuePanel() {
  const queue = useModuleQuery<MailQueueResult>('mail', 'queue.list');
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmItem, setConfirmItem] = useState<MailQueueItem | null>(null);

  const act = async (action: string, id: string | undefined, success: string) => {
    setBusy(true);
    const res = await mailCall('queue.action', { action, ...(id ? { id } : {}) }, success);
    setBusy(false);
    if (res) void queue.reload(true);
  };

  if (queue.loading && !queue.data) return <LoadingBlock />;
  if (queue.error) return <ErrorBlock error={queue.error} />;
  const items = queue.data?.items ?? [];
  const total = queue.data?.total ?? 0;

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {total === 0 ? 'File vide : tout est parti.' : `${total} message(s) en attente${total > items.length ? `, ${items.length} affichés` : ''}.`}
        </Text>
        <Group gap="xs">
          <Button size="compact-sm" variant="default" leftSection={<IconRefresh size={14} stroke={1.5} />} onClick={() => void queue.reload(true)}>Actualiser</Button>
          <Button size="compact-sm" variant="light" loading={busy} disabled={total === 0} leftSection={<IconSend size={14} stroke={1.5} />} onClick={() => void act('flush', undefined, 'Nouvel essai demandé pour toute la file')}>Tout relancer</Button>
          <Button size="compact-sm" variant="light" color="red" disabled={total === 0} leftSection={<IconTrash size={14} stroke={1.5} />} onClick={() => setConfirmAll(true)}>Tout supprimer</Button>
        </Group>
      </Group>
      {items.length > 0 && (
        <Table.ScrollContainer minWidth={760}>
          <Table>
            <Table.Thead>
              <Table.Tr><Table.Th>Expéditeur</Table.Th><Table.Th>Destinataires</Table.Th><Table.Th>État</Table.Th><Table.Th>Taille</Table.Th><Table.Th>Arrivée</Table.Th><Table.Th w={40} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((m) => {
                const label = QUEUE_LABEL[m.queue] ?? { text: m.queue, color: 'gray' };
                return (
                  <Table.Tr key={m.id}>
                    <Table.Td style={{ wordBreak: 'break-all' }}>{m.sender || '(rebond)'}</Table.Td>
                    <Table.Td>
                      {m.recipients.map((r) => (
                        <div key={r.address}>
                          <Text size="sm" style={{ wordBreak: 'break-all' }}>{r.address}</Text>
                          {r.reason && <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>{r.reason}</Text>}
                        </div>
                      ))}
                    </Table.Td>
                    <Table.Td><Badge variant="light" color={label.color} miw={84}>{label.text}</Badge></Table.Td>
                    <Table.Td c="dimmed">{size(m.sizeBytes)}</Table.Td>
                    <Table.Td c="dimmed">{m.arrivalAt ? new Date(m.arrivalAt).toLocaleString('fr-FR') : '—'}</Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={`Actions sur ${m.id}`}><IconDots size={16} stroke={1.5} /></ActionIcon></Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconSend size={14} stroke={1.5} />} disabled={m.queue === 'hold'} onClick={() => void act('retry', m.id, 'Nouvel essai demandé')}>Relancer</Menu.Item>
                          {m.queue === 'hold'
                            ? <Menu.Item leftSection={<IconPlayerPlay size={14} stroke={1.5} />} onClick={() => void act('release', m.id, 'Message remis en file')}>Libérer</Menu.Item>
                            : <Menu.Item leftSection={<IconPlayerPause size={14} stroke={1.5} />} onClick={() => void act('hold', m.id, 'Message retenu')}>Retenir</Menu.Item>}
                          <Menu.Divider />
                          <Menu.Item color="red" leftSection={<IconTrash size={14} stroke={1.5} />} onClick={() => setConfirmItem(m)}>Supprimer</Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={confirmAll} onClose={() => setConfirmAll(false)} title="Supprimer toute la file ?">
        <Stack>
          <Text size="sm">{total} message(s) seront perdus sans prévenir leurs expéditeurs.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmAll(false)}>Annuler</Button>
            <Button color="red" loading={busy} onClick={() => { setConfirmAll(false); void act('delete', undefined, 'File vidée'); }}>Tout supprimer</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={confirmItem !== null} onClose={() => setConfirmItem(null)} title="Supprimer ce message ?">
        <Stack>
          <Text size="sm" style={{ wordBreak: 'break-word' }}>Le message de {confirmItem?.sender || '(rebond)'} sera perdu sans prévenir son expéditeur.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmItem(null)}>Annuler</Button>
            <Button color="red" loading={busy} onClick={() => { const id = confirmItem?.id; setConfirmItem(null); void act('delete', id, 'Message supprimé'); }}>Supprimer</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
