import { Stack, Group, Text, Table, Badge, Alert, ThemeIcon, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeartbeat, IconRefresh } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';

interface NsEntry {
  ns: string;
  ip: string | null;
  external: boolean;
}

interface SlaveSync {
  name: string;
  ip: string;
  synced: boolean | null;
  serial: number | null;
}

interface ZoneHealth {
  zone: string;
  serial: number;
  ns: NsEntry[];
  redundant: boolean;
  delegable: boolean;
  slaves: SlaveSync[];
}

export function ZoneHealthTab({ zoneId }: { zoneId: string }) {
  const health = useModuleQuery<ZoneHealth>('bind9', 'zones.health', { id: zoneId });
  const bindAction = useModuleAction('bind9');

  const reloadBind = async () => {
    const res = await bindAction.run('service.reload');
    if (res !== null) {
      notifications.show({ message: 'Configuration Bind9 rechargée', color: 'green' });
    } else if (bindAction.error) {
      notifications.show({ message: bindAction.error, color: 'red' });
    }
  };

  if (health.loading) return <Text c="dimmed" size="sm">Analyse de la santé DNS…</Text>;
  if (health.error) return <Alert color="red" variant="light">{health.error}</Alert>;

  const data = health.data;
  if (!data) return null;

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="sm" align="center">
          <ThemeIcon variant="light" size={36} radius="md" color={data.redundant ? 'teal' : 'orange'}>
            <IconHeartbeat size={18} stroke={1.5} />
          </ThemeIcon>
          <div>
            <Text size="sm" fw={600}>Santé DNS</Text>
            <Group gap="xs">
              <Badge variant="light" color={data.redundant ? 'green' : 'orange'}>
                {data.redundant ? 'Redondance OK' : 'Pas de redondance IP'}
              </Badge>
              {data.delegable && <Badge variant="light" color="teal">Délégable</Badge>}
            </Group>
          </div>
        </Group>
        <Button
          size="sm"
          variant="light"
          leftSection={<IconRefresh size={14} stroke={1.5} />}
          loading={bindAction.loading}
          onClick={() => void reloadBind()}
        >
          Recharger Bind9
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={500}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Serveur de noms</Table.Th>
              <Table.Th>IP</Table.Th>
              <Table.Th>État</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.ns.map((n) => (
              <Table.Tr key={n.ns}>
                <Table.Td fz="sm" fw={500}>{n.ns}</Table.Td>
                <Table.Td fz="sm" c="dimmed">{n.ip ?? '—'}</Table.Td>
                <Table.Td>
                  {n.ip === null
                    ? <Badge variant="light" color="red">Sans IP (A manquant)</Badge>
                    : <Badge variant="light" color="green">OK</Badge>}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data.slaves.length > 0 && (
        <>
          <Text size="sm" fw={600} mt="xs">Synchronisation des esclaves</Text>
          <Table.ScrollContainer minWidth={500}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Esclave</Table.Th>
                  <Table.Th>IP</Table.Th>
                  <Table.Th>Serial</Table.Th>
                  <Table.Th>Sync</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.slaves.map((s) => (
                  <Table.Tr key={s.name}>
                    <Table.Td fz="sm" fw={500}>{s.name}</Table.Td>
                    <Table.Td fz="sm" c="dimmed">{s.ip}</Table.Td>
                    <Table.Td fz="sm">{s.serial ?? '—'}</Table.Td>
                    <Table.Td>
                      {s.synced === null
                        ? <Badge variant="light" color="gray">Injoignable</Badge>
                        : s.synced
                          ? <Badge variant="light" color="green">À jour</Badge>
                          : <Badge variant="light" color="orange">En retard</Badge>}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}

      {!data.redundant && (
        <Alert color="orange" variant="light">
          Une seule IP pour les NS — si le serveur tombe, le domaine ne résout plus.
          Ajoute un esclave DNS (onglet Esclaves) ou un NS externe.
        </Alert>
      )}
    </Stack>
  );
}
