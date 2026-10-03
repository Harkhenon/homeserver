import { useState } from 'react';
import { Table, Group, Breadcrumbs, Button, Modal, TextInput, Stack, Text, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFolder, IconFile, IconArrowUp, IconPlus } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconFileDescription } from '@tabler/icons-react';
import type { FsEntry } from '../types';

export function FilesPage() {
  const [path, setPath] = useState('/home');
  const entries = useModuleQuery<{ path: string; entries: FsEntry[] }>('files', 'files.list', { path });
  const action = useModuleAction('files');
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);

  const remove = async (name: string) => {
    const res = await action.run('files.delete', { path: `${path}/${name}` });
    if (res !== null) {
      notifications.show({ message: `${name} supprimé`, color: 'green' });
      void entries.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const crumbs = path.split('/').filter(Boolean);

  if (entries.loading) return <LoadingBlock />;
  if (entries.error) return <ErrorBlock error={entries.error} />;

  return (
    <div>
      <PageHeader
icon={IconFileDescription}         title="Fichiers"
        description="Explorateur /home et /var/www"
        actions={<Button size="xs" onClick={() => setMkdirOpen(true)}>Nouveau dossier</Button>}
      />
      <Group mb="sm">
        <Breadcrumbs>
          <Text
            size="sm"
            style={{ cursor: 'pointer' }}
            c={path === '/home' || path === '/var/www' ? 'white' : 'dimmed'}
            onClick={() => setPath(crumbs[0] === 'var' ? '/var/www' : '/home')}
          >
            /{crumbs[0] === 'var' ? 'var/www' : 'home'}
          </Text>
          {(crumbs[0] === 'var' ? crumbs.slice(2) : crumbs.slice(1)).map((crumb, i) => {
            const crumbPath = crumbs[0] === 'var'
              ? `/var/www/${crumbs.slice(2, i + 3).join('/')}`
              : `/home/${crumbs.slice(1, i + 2).join('/')}`;
            return (
              <Text
                key={crumbPath}
                size="sm"
                style={{ cursor: 'pointer' }}
                c={path === crumbPath ? 'white' : 'dimmed'}
                onClick={() => setPath(crumbPath)}
              >
                {crumb}
              </Text>
            );
          })}
        </Breadcrumbs>
        {path !== '/home' && (
          <ActionIcon variant="light" onClick={() => setPath(path.split('/').slice(0, -1).join('/') || '/home')}>
            <IconArrowUp size={16} />
          </ActionIcon>
        )}
      </Group>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nom</Table.Th>
            <Table.Th>Taille</Table.Th>
            <Table.Th>Modifié</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(entries.data?.entries ?? []).map((e) => (
            <Table.Tr key={e.name}>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  {e.type === 'dir' ? <IconFolder size={16} /> : <IconFile size={16} />}
                  <Text
                    style={{ cursor: 'pointer' }}
                    fw={e.type === 'dir' ? 600 : 400}
                    onClick={() => { if (e.type === 'dir') setPath(`${path}/${e.name}`); else setEditTarget(`${path}/${e.name}`); }}
                  >
                    {e.name}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td c="dimmed">{e.type === 'dir' ? '—' : `${(e.sizeBytes / 1024).toFixed(1)} Ko`}</Table.Td>
              <Table.Td c="dimmed">{new Date(e.modifiedAt).toLocaleString('fr-FR')}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(e.name)}>Suppr.</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <MkdirModal opened={mkdirOpen} onClose={() => setMkdirOpen(false)} path={path} onCreated={() => { setMkdirOpen(false); void entries.reload(); }} />
      <EditFileModal target={editTarget} onClose={() => { setEditTarget(null); void entries.reload(); }} />
    </div>
  );
}

function MkdirModal({ opened, onClose, path, onCreated }: { opened: boolean; onClose: () => void; path: string; onCreated: () => void }) {
  const action = useModuleAction('files');
  const [name, setName] = useState('');
  const submit = async () => {
    const res = await action.run('files.mkdir', { path: `${path}/${name}` });
    if (res !== null) {
      notifications.show({ message: `Dossier ${name} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Nouveau dossier">
      <Stack>
        <TextInput label="Nom" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}

function EditFileModal({ target, onClose }: { target: string | null; onClose: () => void }) {
  const file = useModuleQuery<{ path: string; content: string }>('files', 'files.read', target ? { path: target } : undefined);
  const action = useModuleAction('files');
  const [content, setContent] = useState<string | null>(null);

  if (target && file.data && content === null) setContent(file.data.content);

  const save = async () => {
    if (!target || content === null) return;
    const res = await action.run('files.write', { path: target, content });
    if (res !== null) {
      notifications.show({ message: 'Fichier enregistré', color: 'green' });
      onClose();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={target !== null} onClose={onClose} title={target ?? ''} size="lg">
      <Stack>
        <Text size="sm" component="pre" style={{ whiteSpace: 'pre-wrap' }}>
          {content ?? ''}
        </Text>
        <Button onClick={() => void save()} loading={action.loading}>Enregistrer</Button>
      </Stack>
    </Modal>
  );
}
