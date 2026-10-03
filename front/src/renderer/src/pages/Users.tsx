import { useState, useEffect } from 'react';
import { call } from '../api/client';
import {
  Drawer, Table, Badge, Button, Modal, TextInput, PasswordInput, Stack,
  Text, Group, ThemeIcon, Divider, Tabs, Textarea, Select,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { IconUsers, IconUser, IconKey, IconPackage, IconBrandNodejs, IconPlus, IconTerminal2, IconTrash } from '@tabler/icons-react';
import { PageHeader, LoadingBlock, ErrorBlock, StatusBadge } from '../components';
import type { SftpUser } from '../types';

interface PhpVersionInfo {
  version: string;
  installed: boolean;
  available: boolean;
}

interface FpmPool {
  name: string;
  version: string;
  user: string;
}

interface NodeAppInfo {
  name: string;
  port: number;
  user: string;
  active: boolean;
}

export function UsersPage() {
  const users = useModuleQuery<SftpUser[]>('users', 'users.list');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (users.loading) return <LoadingBlock />;
  if (users.error) return <ErrorBlock error={users.error} />;

  const list = users.data ?? [];

  return (
    <div>
      <PageHeader
        icon={IconUsers}
        title="Utilisateurs"
        description={`${list.length} compte(s) SFTP chrooté(s) dans /var/www`}
        actions={
          <Button leftSection={<IconPlus size={16} stroke={1.5} />} onClick={() => setCreateOpen(true)}>
            Nouvel utilisateur
          </Button>
        }
      />
      <Stack gap="xs">
        {list.map((u) => (
          <Group
            key={u.username}
            wrap="nowrap"
            justify="space-between"
            px="md"
            py="sm"
            style={{
              border: '1px solid var(--mantine-color-dark-4)',
              borderRadius: 'var(--mantine-radius-lg)',
              background: 'var(--mantine-color-dark-7)',
              cursor: 'pointer',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onClick={() => setSelected(u.username)}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" size={36} radius="md">
                <IconUser size={18} stroke={1.5} />
              </ThemeIcon>
              <div>
                <Text fw={600}>{u.username}</Text>
                <Text size="xs" c="dimmed">{u.home.replace('/var/www/', '')}</Text>
              </div>
            </Group>
            <Group gap="md" wrap="nowrap">
              <Badge variant="light" size="sm">{u.uid}</Badge>
              <Badge variant="light" size="sm" color="teal">SFTP</Badge>
            </Group>
          </Group>
        ))}
        {list.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            Aucun utilisateur — « Nouvel utilisateur » pour commencer.
          </Text>
        )}
      </Stack>

      <CreateUserModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); void users.reload(); }}
      />
      <UserDrawer
        username={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => { setSelected(null); void users.reload(); }}
      />
    </div>
  );
}

function UserDrawer({ username, onClose, onDeleted }: {
  username: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const users = useModuleQuery<SftpUser[]>('users', 'users.list');
  const user = users.data?.find((u) => u.username === username) ?? null;

  return (
    <Drawer opened={username !== null} onClose={onClose} title={username ?? ''} position="right" size="lg">
      {user && <UserDetail user={user} onClose={onClose} onDeleted={onDeleted} />}
    </Drawer>
  );
}

function UserDetail({ user, onClose, onDeleted }: { user: SftpUser; onClose: () => void; onDeleted: () => void }) {
  const action = useModuleAction('users');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const phpVersions = useModuleQuery<{ versions: PhpVersionInfo[] }>('php', 'versions.list');
  const nodeApps = useModuleQuery<{ apps: NodeAppInfo[] }>('node', 'apps.list');
  const installedVersions = (phpVersions.data?.versions ?? []).filter((v) => v.installed);
  const poolsQueries = installedVersions.map((v) => v.version);
  const [poolsByUser, setPoolsByUser] = useState<FpmPool[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      poolsQueries.map(async (version) => {
        try {
          const pools = await call<FpmPool[]>('php', 'pools.list', { version });
          return pools.filter((p) => p.user === user.username).map((p) => ({ ...p, version }));
        } catch {
          return [] as FpmPool[];
        }
      }),
    ).then((all) => {
      if (!cancelled) setPoolsByUser(all.flat());
    });
    return () => { cancelled = true; };
  }, [user.username, JSON.stringify(poolsQueries)]);

  const submitPassword = async () => {
    if (newPassword.length < 8) {
      notifications.show({ message: 'Mot de passe trop court (8 min.)', color: 'red' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notifications.show({ message: 'Les mots de passe ne correspondent pas', color: 'red' });
      return;
    }
    const res = await action.run('users.setPassword', { username: user.username, password: newPassword });
    if (res !== null) {
      notifications.show({ message: 'Mot de passe mis à jour', color: 'green' });
      setNewPassword('');
      setConfirmPassword('');
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const remove = async () => {
    const res = await action.run('users.delete', { username: user.username });
    if (res !== null) {
      notifications.show({ message: `${user.username} supprimé`, color: 'green' });
      onDeleted();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const userNodeApps = (nodeApps.data?.apps ?? []).filter((a) => a.user === user.username);

  return (
    <Stack>
      <Group>
        <ThemeIcon variant="light" size={44} radius="md">
          <IconUser size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={0}>
          <Text fz="lg" fw={700}>{user.username}</Text>
          <Text size="sm" c="dimmed">UID {user.uid} — {user.home}</Text>
        </Stack>
      </Group>
      <Divider my="xs" />

      <Tabs defaultValue="security">
        <Tabs.List mb="md">
          <Tabs.Tab value="security" leftSection={<IconKey size={16} stroke={1.5} />}>Sécurité</Tabs.Tab>
          <Tabs.Tab value="ssh" leftSection={<IconTerminal2 size={16} stroke={1.5} />}>Clés SSH</Tabs.Tab>
          <Tabs.Tab value="versions" leftSection={<IconPackage size={16} stroke={1.5} />}>Versions</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="security">
          <Stack>
            <PasswordInput
              label="Nouveau mot de passe"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirmer"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            />
            <Button size="sm" variant="light" onClick={() => void submitPassword()} loading={action.loading}>
              Changer le mot de passe
            </Button>
            <Divider my="xs" />
            <Button size="sm" color="red" variant="light" onClick={() => void remove()}>
              Supprimer l'utilisateur
            </Button>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="ssh">
          <UserSshKeys username={user.username} />
        </Tabs.Panel>

        <Tabs.Panel value="versions">
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>PHP (pools FPM)</Text>
            </Group>
            {poolsByUser.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pool</Table.Th>
                    <Table.Th>Version</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {poolsByUser.map((p) => (
                    <Table.Tr key={`${p.version}-${p.name}`}>
                      <Table.Td fw={500}>{p.name}</Table.Td>
                      <Table.Td><Badge variant="light">PHP {p.version}</Badge></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text size="sm" c="dimmed">Aucun pool FPM dédié à cet utilisateur.</Text>
            )}
            {(phpVersions.data?.versions ?? []).length > 0 && (
              <Text size="xs" c="dimmed">
                Versions PHP installées sur le serveur : {(phpVersions.data?.versions ?? []).filter((v) => v.installed).map((v) => v.version).join(', ') || 'aucune'}
              </Text>
            )}
            <Divider my="xs" />
            <Group justify="space-between">
              <Text fw={600}>Node (applications)</Text>
            </Group>
            {userNodeApps.length > 0 ? (
              <Stack gap="xs">
                {userNodeApps.map((a) => (
                  <Group key={a.name} justify="space-between" px="md" py="xs" style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Group gap="sm">
                      <ThemeIcon variant="light" size={28} radius="sm">
                        <IconBrandNodejs size={15} stroke={1.5} />
                      </ThemeIcon>
                      <Text fw={500}>{a.name}</Text>
                    </Group>
                    <Group gap="sm">
                      <Badge variant="light" size="sm">:{a.port}</Badge>
                      <StatusBadge status={a.active} labels={{ ok: 'active', off: 'arrêtée' }} />
                    </Group>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">Aucune application Node pour cet utilisateur.</Text>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function CreateUserModal({ opened, onClose, onCreated }: {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const action = useModuleAction('users');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [site, setSite] = useState('');
  const [shell, setShell] = useState<string | null>('nologin');

  const submit = async () => {
    const res = await action.run('users.create', {
      username, password, site,
      shell: shell === 'bash' ? '/bin/bash' : undefined,
    });
    if (res !== null) {
      notifications.show({ message: `Utilisateur ${username} créé`, color: 'green' });
      onCreated();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvel utilisateur">
      <Stack>
        <TextInput label="Nom d'utilisateur" placeholder="web-alice" value={username} onChange={(e) => setUsername(e.currentTarget.value)} required />
        <PasswordInput label="Mot de passe (8 min.)" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
        <TextInput label="Site (chroot)" placeholder="exemple.com" value={site} onChange={(e) => setSite(e.currentTarget.value)} required />
        <Select
          label="Shell"
          description="nologin = SFTP uniquement ; bash = accès shell complet"
          data={[
            { label: 'nologin (SFTP uniquement)', value: 'nologin' },
            { label: 'bash (SFTP + shell)', value: 'bash' },
          ]}
          value={shell}
          onChange={setShell}
        />
        <Button loading={action.loading} onClick={() => void submit()}>Créer</Button>
      </Stack>
    </Modal>
  );
}

function UserSshKeys({ username }: { username: string }) {
  const keys = useModuleQuery<{ username: string; keys: string[] }>('users', 'users.sshKeys', { username });
  const action = useModuleAction('users');
  const [newKey, setNewKey] = useState('');

  const add = async () => {
    const key = newKey.trim();
    if (key.length < 50) {
      notifications.show({ message: 'Clé SSH invalide (trop courte)', color: 'red' });
      return;
    }
    const res = await action.run('users.sshKeys.add', { username, key });
    if (res !== null) {
      notifications.show({ message: 'Clé SSH ajoutée', color: 'green' });
      setNewKey('');
      void keys.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const remove = async (index: number) => {
    const res = await action.run('users.sshKeys.remove', { username, index });
    if (res !== null) {
      notifications.show({ message: 'Clé retirée', color: 'green' });
      void keys.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const list = keys.data?.keys ?? [];

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Les clés autorisent la connexion SFTP (et SSH si l'utilisateur dispose d'un shell).
      </Text>
      {keys.loading ? (
        <Text size="sm" c="dimmed">Chargement…</Text>
      ) : list.length > 0 ? (
        <Stack gap="xs">
          {list.map((key, i) => (
            <Group key={i} justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} miw={100}>
                {key}
              </Text>
              <Button size="compact-xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => void remove(i)}>
                Retirer
              </Button>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Aucune clé SSH installée.</Text>
      )}
      <Divider my="xs" />
      <Textarea
        label="Nouvelle clé publique"
        placeholder="ssh-ed25519 AAAAC3Nza... user@machine"
        autosize
        minRows={2}
        value={newKey}
        onChange={(e) => setNewKey(e.currentTarget.value)}
      />
      <Button size="sm" variant="light" loading={action.loading} onClick={() => void add()}>
        Ajouter la clé
      </Button>
    </Stack>
  );
}
