import { useEffect, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Card, Code, Group, Modal, Stack, Table, Text, Textarea, TextInput, Tooltip,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useModuleQuery } from '../../api/hooks';
import { ErrorBlock, LoadingBlock } from '../StateBlocks';
import { mailCall } from './MailboxesPanel';
import type { MailAlias } from '../../types';

function AliasModal({ domain, alias, opened, onClose, onDone }: {
  domain: string;
  alias: MailAlias | null;
  opened: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [local, setLocal] = useState('');
  const [destinations, setDestinations] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (opened) {
      setLocal(alias?.local ?? '');
      setDestinations(alias?.destinations.join('\n') ?? '');
    }
  }, [opened, alias]);
  const submit = async () => {
    setBusy(true);
    const res = await mailCall('aliases.set', { domain, local, destinations }, `Alias ${local}@${domain} enregistré`);
    setBusy(false);
    if (res) { onDone(); onClose(); }
  };
  return (
    <Modal opened={opened} onClose={onClose} title={alias ? `Alias ${alias.address}` : `Nouvel alias sur ${domain}`}>
      <Stack>
        <TextInput
          label="Adresse"
          required
          disabled={alias !== null}
          data-autofocus
          value={local}
          onChange={(e) => setLocal(e.currentTarget.value.toLowerCase())}
          rightSection={<Text size="sm" c="dimmed" pr="xs">@{domain}</Text>}
          rightSectionWidth={domain.length * 8 + 28}
          placeholder="contact"
        />
        <Textarea
          label="Destinations"
          description="Une adresse par ligne, sur ce serveur ou ailleurs. Les boîtes de ce serveur listées ici peuvent aussi envoyer sous cet alias."
          required
          autosize
          minRows={3}
          value={destinations}
          onChange={(e) => setDestinations(e.currentTarget.value)}
          placeholder={`alice@${domain}\nbob@exemple.com`}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button loading={busy} disabled={!local || !destinations.trim()} onClick={() => void submit()}>Enregistrer</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CatchAllCard({ domain, current, onDone }: { domain: string; current: string | null; onDone: () => void }) {
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current ?? ''), [current]);
  const save = async (destination: string) => {
    setBusy(true);
    const res = await mailCall('catchall.set', { domain, destination }, destination ? 'Catch-all activé' : 'Catch-all retiré');
    setBusy(false);
    if (res) onDone();
  };
  return (
    <Card withBorder>
      <Group justify="space-between" mb={4}>
        <Text fw={600}>Catch-all</Text>
        <Badge variant="light" color={current ? 'orange' : 'gray'}>{current ? 'Actif' : 'Inactif'}</Badge>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        Reçoit le courrier adressé à une adresse inexistante du domaine. Pratique, mais il attire beaucoup de spam : à garder désactivé si possible.
      </Text>
      <Group align="flex-end" gap="xs">
        <TextInput
          label="Adresse de destination"
          placeholder={`boite@${domain}`}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <Button loading={busy} disabled={!value.trim() || value.trim() === current} onClick={() => void save(value.trim())}>Enregistrer</Button>
        {current && <Button variant="subtle" color="red" loading={busy} onClick={() => void save('')}>Retirer</Button>}
      </Group>
    </Card>
  );
}

export function MailAliasesPanel({ domain, onChanged }: { domain: string; onChanged: () => void }) {
  const data = useModuleQuery<{ aliases: MailAlias[]; catchAll: string | null }>('mail', 'aliases.list', { domain });
  const [editing, setEditing] = useState<MailAlias | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<MailAlias | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = () => { void data.reload(true); onChanged(); };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const res = await mailCall('aliases.delete', { domain, local: deleting.local }, `Alias ${deleting.address} supprimé`);
    setBusy(false);
    if (res) { setDeleting(null); changed(); }
  };

  if (data.loading && !data.data) return <LoadingBlock />;
  if (data.error) return <ErrorBlock error={data.error} />;
  const list = data.data?.aliases ?? [];

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={600}>{list.length} alias</Text>
        <Button leftSection={<IconPlus size={16} stroke={1.5} />} onClick={() => { setEditing(null); setModalOpen(true); }}>Nouvel alias</Button>
      </Group>
      {list.length === 0 ? (
        <Text c="dimmed" ta="center" py="lg">Aucun alias : une adresse qui transmet le courrier à une ou plusieurs autres, sans boîte propre.</Text>
      ) : (
        <Table.ScrollContainer minWidth={520}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>Alias</Table.Th><Table.Th>Destinations</Table.Th><Table.Th w={90} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.map((a) => (
                <Table.Tr key={a.address}>
                  <Table.Td fw={600} fz="sm">{a.address}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>{a.destinations.map((d) => <Code key={d}>{d}</Code>)}</Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Tooltip label="Modifier">
                        <ActionIcon variant="subtle" color="gray" aria-label={`Modifier ${a.address}`} onClick={() => { setEditing(a); setModalOpen(true); }}><IconPencil size={16} stroke={1.5} /></ActionIcon>
                      </Tooltip>
                      <Tooltip label="Supprimer">
                        <ActionIcon variant="subtle" color="red" aria-label={`Supprimer ${a.address}`} onClick={() => setDeleting(a)}><IconTrash size={16} stroke={1.5} /></ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <CatchAllCard domain={domain} current={data.data?.catchAll ?? null} onDone={changed} />
      <AliasModal domain={domain} alias={editing} opened={modalOpen} onClose={() => setModalOpen(false)} onDone={changed} />
      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title={`Supprimer ${deleting?.address ?? ''} ?`}>
        <Stack>
          <Alert color="orange" variant="light">Les messages adressés à cet alias seront refusés. Les boîtes de destination ne sont pas touchées.</Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>Annuler</Button>
            <Button color="red" loading={busy} onClick={() => void remove()}>Supprimer</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
