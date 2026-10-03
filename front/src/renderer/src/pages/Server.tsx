import { AreaChart } from '@mantine/charts';
import { Table, Badge, Card, SimpleGrid, Text, Group, Stack, Divider } from '@mantine/core';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock, StatCard } from '../components';
import { IconServer } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { health as fetchHealth } from '../api/client';
import { notifications } from '@mantine/notifications';
import type { ServiceStatus, MonitorSample } from '../types';

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

interface Health {
  status: string;
  uptime: number;
  modules: Array<{ module: string; healthy: boolean }>;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function ServerPage() {
  const info = useModuleQuery<SysInfo>('system', 'info');
  const mem = useModuleQuery<{ totalBytes: number; usedBytes: number; usagePercent: number }>('system', 'memory', undefined, { refetchInterval: 5000 });
  const cpu = useModuleQuery<{ cores: number; load: [number, number, number]; usagePercent: number }>('system', 'cpu', undefined, { refetchInterval: 5000 });
  const procs = useModuleQuery<ProcInfo[]>('system', 'processes', { limit: 15 }, { refetchInterval: 5000 });
  const updates = useModuleQuery<UpdatesInfo>('system', 'updates');
  const history = useModuleQuery<{ samples: MonitorSample[] }>('monitor', 'history', { minutes: 60 });
  const latest = useModuleQuery<MonitorSample>('monitor', 'latest', undefined, { refetchInterval: 5000 });
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);
  const upgradeAction = useModuleAction('system');
  const [upgrading, setUpgrading] = useState(false);

  const runUpgrade = async () => {
    const confirmed = window.confirm('Appliquer toutes les mises à jour système ?');
    if (!confirmed) return;
    setUpgrading(true);
    const res = await upgradeAction.run('upgrade');
    setUpgrading(false);
    if (res !== null) {
      notifications.show({ message: 'Mises à jour appliquées', color: 'green' });
      void updates.reload();
    } else if (upgradeAction.error) {
      notifications.show({ message: upgradeAction.error, color: 'red' });
    }
  };

  const apache = useModuleQuery<ServiceStatus>('apache', 'service.status');
  const mariadb = useModuleQuery<ServiceStatus>('mariadb', 'service.status');
  const bind = useModuleQuery<ServiceStatus>('bind9', 'service.status');

  if (info.loading) return <LoadingBlock />;
  if (info.error) return <ErrorBlock error={info.error} />;

  const i = info.data;
  const samples = (history.data?.samples ?? []).map((s) => ({
    time: new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    cpu: Number((s.cpuLoad[0] ?? 0).toFixed(2)),
    ram: s.memUsagePercent,
  }));
  const last = latest.data;
  const modules = health?.modules ?? [];
  const healthyCount = modules.filter((m) => m.healthy).length;

  return (
    <div>
      <PageHeader
        icon={IconServer}
        title="Supervision"
        description={i ? `${i.hostname} — ${i.distro} — en ligne depuis ${fmtUptime(i.uptimeSeconds)}` : undefined}
      />

      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <StatCard
            title="CPU"
            icon={IconServer}
            color="blue"
            value={`${cpu.data?.usagePercent ?? 0}%`}
            sub={`Charge 1/5/15 : ${cpu.data?.load?.[0]?.toFixed(2) ?? '0'} / ${cpu.data?.load?.[1]?.toFixed(2) ?? '0'} / ${cpu.data?.load?.[2]?.toFixed(2) ?? '0'} — ${cpu.data?.cores ?? '?'} cœurs`}
            progress={{ value: cpu.data?.usagePercent ?? 0, color: (cpu.data?.usagePercent ?? 0) > 85 ? 'red' : 'blue' }}
          />
          <StatCard
            title="Mémoire"
            icon={IconServer}
            color="violet"
            value={`${mem.data?.usagePercent ?? 0}%`}
            sub={`${(mem.data?.usedBytes ?? 0) / 1e9 > 1 ? ((mem.data?.usedBytes ?? 0) / 1e9).toFixed(1) + ' Go' : ((mem.data?.usedBytes ?? 0) / 1e6).toFixed(0) + ' Mo'} utilisés`}
            progress={{ value: mem.data?.usagePercent ?? 0, color: (mem.data?.usagePercent ?? 0) > 85 ? 'red' : 'violet' }}
          />
          <StatCard
            title="Mises à jour"
            icon={IconServer}
            color={updates.data && updates.data.count > 0 ? 'orange' : 'teal'}
            value={updates.data ? `${updates.data.count}` : '…'}
            sub={updates.data && updates.data.count > 0 ? 'paquets en attente' : 'système à jour'}
            action={updates.data && updates.data.count > 0 ? { label: 'Mettre à jour', onClick: () => void runUpgrade(), loading: upgrading } : null}
          />
          <StatCard
            title="Modules"
            icon={IconServer}
            color={healthyCount === modules.length && modules.length > 0 ? 'teal' : 'red'}
            value={modules.length > 0 ? `${healthyCount}/${modules.length}` : '…'}
            sub="sains"
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Card withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Charge CPU</Text>
              {last && <Badge variant="light">{last.cpuLoad[0]?.toFixed(2)}</Badge>}
            </Group>
            <AreaChart
              h={220}
              data={samples}
              dataKey="time"
              series={[{ name: 'cpu', color: 'indigo.6' }]}
              curveType="monotone"
              gridAxis="y"
            />
          </Card>
          <Card withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Mémoire</Text>
              {last && <Badge variant="light">{last.memUsagePercent}%</Badge>}
            </Group>
            <AreaChart
              h={220}
              data={samples}
              dataKey="time"
              series={[{ name: 'ram', color: 'teal.6' }]}
              curveType="monotone"
              gridAxis="y"
            />
          </Card>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Card withBorder p="md">
            <Text fw={600} mb="sm">Informations</Text>
            <Table>
              <Table.Tbody>
                <Table.Tr><Table.Td c="dimmed">Hostname</Table.Td><Table.Td>{i?.hostname}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td c="dimmed">Distribution</Table.Td><Table.Td>{i?.distro}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td c="dimmed">Noyau</Table.Td><Table.Td>{i?.kernel}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td c="dimmed">Architecture</Table.Td><Table.Td>{i?.arch}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Card>
          <Card withBorder p="md">
            <Text fw={600} mb="sm">Services</Text>
            <Group gap="md">
              <ServiceBadge name="Apache" status={apache} />
              <ServiceBadge name="MariaDB" status={mariadb} />
              <ServiceBadge name="Bind9" status={bind} />
            </Group>
            <Divider my="sm" />
            <Text size="xs" c="dimmed" mb={4}>Modules du panel</Text>
            <Group gap={4}>
              {modules.map((m) => (
                <Badge key={m.module} color={m.healthy ? 'teal' : 'red'} variant="light" size="sm">
                  {m.module}
                </Badge>
              ))}
            </Group>
          </Card>
        </SimpleGrid>

        <Card withBorder p="md">
          <Text fw={600} mb="sm">Processus (top CPU)</Text>
          <Table.ScrollContainer minWidth={700}>
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
          </Table.ScrollContainer>
        </Card>
      </Stack>
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
