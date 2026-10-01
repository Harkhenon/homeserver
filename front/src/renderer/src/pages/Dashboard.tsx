import { SimpleGrid, Card, Group, Text, ThemeIcon, Badge, RingProgress, Stack } from '@mantine/core';
import {
  IconCpu, IconDatabase, IconClockBolt, IconServer2,
} from '@tabler/icons-react';
import { useModuleQuery } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';

interface SysInfo {
  hostname: string;
  distro: string;
  kernel: string;
  arch: string;
  uptimeSeconds: number;
}

interface Memory {
  totalBytes: number;
  usedBytes: number;
  usagePercent: number;
}

interface Cpu {
  model: string;
  cores: number;
  load: [number, number, number];
}

interface Disk {
  mount: string;
  usagePercent: number;
  totalBytes: number;
}

interface Health {
  status: string;
  uptime: number;
  modules: Array<{ module: string; healthy: boolean }>;
}

function fmtBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function DashboardPage() {
  const info = useModuleQuery<SysInfo>('system', 'info');
  const mem = useModuleQuery<Memory>('system', 'memory');
  const cpu = useModuleQuery<Cpu>('system', 'cpu');
  const disks = useModuleQuery<Disk[]>('system', 'disks');

  if (info.loading || mem.loading || cpu.loading) return <LoadingBlock />;
  if (info.error || mem.error || cpu.error) {
    return <ErrorBlock error={info.error ?? mem.error ?? cpu.error ?? 'Erreur'} />;
  }

  const memData = mem.data;
  const cpuData = cpu.data;
  const infoData = info.data;
  const rootDisk = disks.data?.[0];

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description={infoData ? `${infoData.hostname} — ${infoData.distro}` : undefined}
      />
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Card withBorder p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase">CPU</Text>
            <ThemeIcon variant="light"><IconCpu size={18} /></ThemeIcon>
          </Group>
          <Text fz="xl" fw={600} mt="xs">{cpuData?.cores} cœurs</Text>
          <Text size="sm" c="dimmed">Charge : {cpuData?.load?.[0]?.toFixed(2)} / {cpuData?.load?.[1]?.toFixed(2)} / {cpuData?.load?.[2]?.toFixed(2)}</Text>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase">Mémoire</Text>
            <ThemeIcon variant="light"><IconServer2 size={18} /></ThemeIcon>
          </Group>
          <Group mt="xs" gap="md" align="center">
            <RingProgress
              size={70}
              thickness={7}
              sections={[{ value: memData?.usagePercent ?? 0, color: 'blue' }]}
              label={<Text ta="center" fz="sm" fw={600}>{memData?.usagePercent}%</Text>}
            />
            <Stack gap={2}>
              <Text size="sm">{fmtBytes(memData?.usedBytes ?? 0)} utilisés</Text>
              <Text size="sm" c="dimmed">{fmtBytes(memData?.totalBytes ?? 0)} total</Text>
            </Stack>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase">Disque</Text>
            <ThemeIcon variant="light"><IconDatabase size={18} /></ThemeIcon>
          </Group>
          <Group mt="xs" gap="md" align="center">
            <RingProgress
              size={70}
              thickness={7}
              sections={[{ value: rootDisk?.usagePercent ?? 0, color: 'teal' }]}
              label={<Text ta="center" fz="sm" fw={600}>{rootDisk?.usagePercent}%</Text>}
            />
            <Stack gap={2}>
              <Text size="sm">{rootDisk?.mount}</Text>
              <Text size="sm" c="dimmed">{fmtBytes(rootDisk?.totalBytes ?? 0)}</Text>
            </Stack>
          </Group>
        </Card>

        <Card withBorder p="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed" tt="uppercase">Uptime</Text>
            <ThemeIcon variant="light"><IconClockBolt size={18} /></ThemeIcon>
          </Group>
          <Text fz="xl" fw={600} mt="xs">{fmtUptime(infoData?.uptimeSeconds ?? 0)}</Text>
          <Text size="sm" c="dimmed">Noyau {infoData?.kernel}</Text>
        </Card>
      </SimpleGrid>
    </div>
  );
}
