import { Table, Badge, Card, SimpleGrid, Text, Group, Button } from '@mantine/core';
import { useModuleQuery } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import { IconServer } from '@tabler/icons-react';
import type { ServiceStatus } from '../types';

interface SysInfo {
  hostname: string;
  platform: string;
  distro: string;
  kernel: string;
  arch: string;
  uptimeSeconds: number;
}

interface ProcInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

interface UpdatesInfo {
  family: string;
  count: number;
  packages: string[];
}

export function ServerPage() {
  const info = useModuleQuery<SysInfo>('system', 'info');
  const procs = useModuleQuery<ProcInfo[]>('system', 'processes', { limit: 15 });
  const updates = useModuleQuery<UpdatesInfo>('system', 'updates');
  const apache = useModuleQuery<ServiceStatus>('apache', 'service.status');
  const mariadb = useModuleQuery<ServiceStatus>('mariadb', 'service.status');
  const bind = useModuleQuery<ServiceStatus>('bind9', 'service.status');

  if (info.loading) return <LoadingBlock />;
  if (info.error) return <ErrorBlock error={info.error} />;
  const i = info.data;

  return (
    <div>
      <PageHeader icon={IconServer} title="Serveur" description={i ? `${i.hostname} — ${i.distro}` : undefined} />
      <SimpleGrid cols={{ base: 1, lg: 2 }} mb="md">
        <Card withBorder p="md">
          <Text fw={600} mb="sm">Informations</Text>
          <Table>
            <Table.Tbody>
              <Table.Tr><Table.Td c="dimmed">Hostname</Table.Td><Table.Td>{i?.hostname}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Distribution</Table.Td><Table.Td>{i?.distro}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Noyau</Table.Td><Table.Td>{i?.kernel}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td c="dimmed">Architecture</Table.Td><Table.Td>{i?.arch}</Table.Td></Table.Tr>
              <Table.Tr>
                <Table.Td c="dimmed">Mises à jour</Table.Td>
                <Table.Td>
                  {updates.data && (updates.data.count > 0
                    ? <Badge color="orange" variant="light">{updates.data.count} en attente</Badge>
                    : <Badge color="green" variant="light">à jour</Badge>)}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
        <Card withBorder p="md">
          <Text fw={600} mb="sm">Services</Text>
          <Group gap="md" mb="md">
            <ServiceBadge name="Apache" status={apache} />
            <ServiceBadge name="MariaDB" status={mariadb} />
            <ServiceBadge name="Bind9" status={bind} />
          </Group>
        </Card>
      </SimpleGrid>
      <Card withBorder p="md">
        <Text fw={600} mb="sm">Processus (top CPU)</Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>PID</Table.Th>
              <Table.Th>Utilisateur</Table.Th>
              <Table.Th>CPU %</Table.Th>
              <Table.Th>MEM %</Table.Th>
              <Table.Th>Commande</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(procs.data ?? []).map((p) => (
              <Table.Tr key={p.pid}>
                <Table.Td c="dimmed">{p.pid}</Table.Td>
                <Table.Td>{p.user}</Table.Td>
                <Table.Td>{p.cpuPercent}</Table.Td>
                <Table.Td>{p.memPercent}</Table.Td>
                <Table.Td c="dimmed" fz="sm">{p.command}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </div>
  );
}

function ServiceBadge({ name, status }: { name: string; status: { data: ServiceStatus | null; loading: boolean; error: string | null } }) {
  if (status.loading) return <Badge variant="light">{name}…</Badge>;
  if (status.error || !status.data) return <Badge color="gray" variant="light">{name} : n/a</Badge>;
  return (
    <Badge color={status.data.active ? 'green' : 'red'} variant="light">
      {name} : {status.data.active ? 'actif' : 'arrêté'}
    </Badge>
  );
}
