import { useState } from 'react';
import {
  Stack, Group, Text, Badge, Button, Tabs, TextInput, NumberInput, Code, ScrollArea,
  ThemeIcon, Table, Divider,
} from '@mantine/core';
import { useNavigate, useParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, ErrorBlock } from '../components';
import { IconBrandNodejs, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react';

interface AppInfo {
  name: string;
  port: number;
  user: string;
  appDir: string;
  entry: string;
  active: boolean;
  enabled: boolean;
  pid: number | null;
  cpuPercent: number | null;
  memPercent: number | null;
  memBytes: number | null;
  log: string[];
}

const REFRESH_MS = 5000;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function NodeAppDetailPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const info = useModuleQuery<AppInfo>('node', 'apps.info', { name }, { refetchInterval: REFRESH_MS });
  const action = useModuleAction('node');
  const [port, setPort] = useState<number | undefined>(undefined);
  const [entry, setEntry] = useState<string | undefined>(undefined);

  const app = info.data;

  const service = async (verb: 'start' | 'stop' | 'restart') => {
    if (!name) return;
    const res = await action.run('apps.service', { name, verb });
    if (res !== null) {
      notifications.show({ message: `${name} : ${verb} OK`, color: 'green' });
      void info.reload(true);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const save = async () => {
    if (!name) return;
    const res = await action.run('apps.update', {
      name,
      ...(port !== undefined ? { port } : {}),
      ...(entry !== undefined && entry !== '' ? { entry } : {}),
    });
    if (res !== null) {
      notifications.show({ message: 'Configuration enregistrée', color: 'green' });
      setPort(undefined);
      setEntry(undefined);
      void info.reload(true);
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (!name) return null;
  if (info.error) return <ErrorBlock error={info.error} />;

  return (
    <div>
      <PageHeader
        icon={IconBrandNodejs}
        title={name}
        description={app ? (app.active ? 'Service actif' : 'Service arrêté') : 'Chargement…'}
        actions={
          <Group gap="xs">
            <Button
              leftSection={<IconRefresh size={16} stroke={1.5} />}
              variant="light"
              onClick={() => void service('restart')}
            >
              Redémarrer
            </Button>
            {app?.active ? (
              <Button
                leftSection={<IconPlayerStop size={16} stroke={1.5} />}
                variant="light"
                color="orange"
                onClick={() => void service('stop')}
              >
                Arrêter
              </Button>
            ) : (
              <Button
                leftSection={<IconPlayerPlay size={16} stroke={1.5} />}
                variant="light"
                color="green"
                onClick={() => void service('start')}
              >
                Démarrer
              </Button>
            )}
          </Group>
        }
      />
      <Tabs defaultValue="infos">
        <Tabs.List mb="md">
          <Tabs.Tab value="infos">Informations</Tabs.Tab>
          <Tabs.Tab value="console">Console</Tabs.Tab>
          <Tabs.Tab value="monitoring">Monitoring</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="infos" pt="xs">
          {info.loading && !app ? (
            <Text c="dimmed">Chargement…</Text>
          ) : app ? (
            <Stack gap="md" maw={560}>
              <Group gap="sm">
                <ThemeIcon variant="light" size={36} radius="md">
                  <IconBrandNodejs size={18} stroke={1.5} />
                </ThemeIcon>
                <Group gap="xs">
                  <Text fw={600}>{app.name}</Text>
                  {app.active
                    ? <Badge color="green" variant="light">active</Badge>
                    : <Badge color="red" variant="light">arrêtée</Badge>}
                  {app.enabled && <Badge variant="light">enabled</Badge>}
                </Group>
              </Group>
              <Table.ScrollContainer minWidth={400}>
                <Table>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td c="dimmed">Port</Table.Td>
                      <Table.Td fw={600}>{app.port}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Utilisateur</Table.Td>
                      <Table.Td fw={600}>{app.user}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">Dossier</Table.Td>
                      <Table.Td><Code>{app.appDir}</Code></Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td c="dimmed">PID</Table.Td>
                      <Table.Td fw={600}>{app.pid ?? '—'}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Divider label="Modifier la configuration" labelPosition="center" />
              <NumberInput
                label="Port"
                placeholder={String(app.port)}
                value={port}
                onChange={(v) => setPort(typeof v === 'number' ? v : undefined)}
                min={1024}
                max={65535}
                hideControls
              />
              <TextInput
                label="Fichier de lancement (point d'entrée)"
                placeholder={app.entry}
                value={entry ?? ''}
                onChange={(e) => setEntry(e.currentTarget.value)}
              />
              <Group>
                <Button loading={action.loading} onClick={() => void save()}>Enregistrer</Button>
                <Button
                  variant="subtle"
                  onClick={() => { setPort(undefined); setEntry(undefined); }}
                  disabled={port === undefined && (entry ?? '') === ''}
                >
                  Annuler
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                L'application est redémarrée automatiquement après modification si elle est active.
              </Text>
            </Stack>
          ) : null}
        </Tabs.Panel>

        <Tabs.Panel value="console" pt="xs">
          <ScrollArea.Autosize mah={520} type="always" offsetScrollbars p="sm" style={{ background: 'var(--mantine-color-dark-8)', borderRadius: 'var(--mantine-radius-lg)' }}>
            <Stack gap={0}>
              {(app?.log ?? []).map((line, i) => (
                <Text key={i} fz="xs" ff="monospace" c={line.includes('error') || line.includes('Error') ? 'red.4' : 'dark-2'} style={{ whiteSpace: 'pre-wrap' }}>
                  {line || ' '}
                </Text>
              ))}
              {(app?.log ?? []).length === 0 && <Text c="dimmed">Aucune sortie de journal</Text>}
            </Stack>
          </ScrollArea.Autosize>
          <Text size="xs" c="dimmed" mt="xs">Les 200 dernières lignes du journal systemd, rafraîchies toutes les 5 s.</Text>
        </Tabs.Panel>

        <Tabs.Panel value="monitoring" pt="xs">
          {app ? (
            <Stack gap="md" maw={560}>
              <Group grow>
                <Stack gap={4} p="md" style={{ background: 'var(--mantine-color-dark-7)', borderRadius: 'var(--mantine-radius-lg)' }}>
                  <Text size="xs" c="dimmed">CPU</Text>
                  <Text fz="h3" fw={700}>{app.cpuPercent !== null ? `${app.cpuPercent.toFixed(1)} %` : '—'}</Text>
                </Stack>
                <Stack gap={4} p="md" style={{ background: 'var(--mantine-color-dark-7)', borderRadius: 'var(--mantine-radius-lg)' }}>
                  <Text size="xs" c="dimmed">Mémoire</Text>
                  <Text fz="h3" fw={700}>{app.memPercent !== null ? `${app.memPercent.toFixed(1)} %` : '—'}</Text>
                  <Text size="xs" c="dimmed">{formatBytes(app.memBytes)}</Text>
                </Stack>
              </Group>
              <Text size="xs" c="dimmed">
                {app.pid
                  ? `Processus PID ${app.pid} — mesures issues de ps, rafraîchies toutes les 5 s.`
                  : 'Application arrêtée : aucune mesure disponible.'}
              </Text>
            </Stack>
          ) : (
            <Text c="dimmed">Chargement…</Text>
          )}
        </Tabs.Panel>
      </Tabs>
      <Button variant="subtle" size="xs" mt="lg" onClick={() => navigate('/node')}>
        ← Retour aux applications
      </Button>
    </div>
  );
}
