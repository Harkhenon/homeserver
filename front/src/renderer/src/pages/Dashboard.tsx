import { useEffect, useState } from 'react';
import { SimpleGrid, Card, Group, Text, ThemeIcon, Stack, Table, UnstyledButton } from '@mantine/core';
import {
  IconCpu, IconDatabase, IconClockBolt, IconServer2, IconActivity,
  IconWorld, IconBrandNodejs, IconUsers, IconGrain,
} from '@tabler/icons-react';
import { useModuleQuery } from '../api/hooks';
import { Link } from 'react-router-dom';
import { health as fetchHealth, call } from '../api/client';
import { PageHeader, LoadingBlock, ErrorBlock, StatCard, WelcomeCard, StatusBadge, ServicesGrid } from '../components';
import type { Vhost, Zone } from '../types';

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
  usagePercent: number;
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
  const mem = useModuleQuery<Memory>('system', 'memory', undefined, { refetchInterval: 5000 });
  const cpu = useModuleQuery<Cpu>('system', 'cpu', undefined, { refetchInterval: 5000 });
  const disks = useModuleQuery<Disk[]>('system', 'disks');
  const [counts, setCounts] = useState<{ sites: number | null; domains: number | null; apps: number | null; users: number | null }>({
    sites: null, domains: null, apps: null, users: null,
  });
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchHealth().then((h) => { if (!cancelled) setHealth(h); }).catch(() => { if (!cancelled) setHealth(null); });
    (async () => {
      const [apache, nginx, zones, apps, users] = await Promise.allSettled([
        call<Vhost[]>('apache', 'vhosts.list'),
        call<Vhost[]>('nginx', 'vhosts.list'),
        call<Zone[]>('bind9', 'zones.list'),
        call<{ apps: unknown[] }>('node', 'apps.list'),
        call<unknown[]>('users', 'users.list'),
      ]);
      if (!cancelled) {
        setCounts({
          sites: (apache.status === 'fulfilled' ? apache.value.length : 0)
            + (nginx.status === 'fulfilled' ? nginx.value.length : 0),
          domains: zones.status === 'fulfilled' ? zones.value.length : 0,
          apps: apps.status === 'fulfilled' ? apps.value.apps.length : 0,
          users: users.status === 'fulfilled' ? users.value.length : 0,
        });
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  if (info.loading || mem.loading || cpu.loading) return <LoadingBlock />;
  if (info.error || mem.error || cpu.error) {
    return <ErrorBlock error={info.error ?? mem.error ?? cpu.error ?? 'Erreur'} />;
  }

  const memData = mem.data;
  const cpuData = cpu.data;
  const infoData = info.data;
  const rootDisk = disks.data?.[0];
  const modules = health?.modules ?? [];
  const healthyCount = modules.filter((m) => m.healthy).length;

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description={infoData ? `${infoData.hostname} — ${infoData.distro}` : undefined}
      />

      <Stack gap="md">
        <WelcomeCard
          title={`Bienvenue, ${localStorage.getItem('hs_username') ?? 'admin'}`}
          description={`Système en ligne depuis ${fmtUptime(infoData?.uptimeSeconds ?? 0)} — noyau ${infoData?.kernel} (${infoData?.arch}).`}
          icon={IconServer2}
          stats={[
            ...(modules.length > 0 ? [{ label: 'Modules actifs', value: `${healthyCount}/${modules.length}` }] : []),
            { label: 'Cœur', value: `${cpuData?.cores ?? '?'}` },
            { label: 'Mémoire', value: fmtBytes(memData?.totalBytes ?? 0) },
            { label: 'Disque', value: `${rootDisk?.usagePercent ?? 0}%` },
          ]}
        />

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <StatCard
            title="CPU"
            icon={IconCpu}
            color="blue"
            value={`${cpuData?.usagePercent ?? 0}%`}
            sub={`Charge 1/5/15 min : ${cpuData?.load?.[0]?.toFixed(2) ?? '0'} / ${cpuData?.load?.[1]?.toFixed(2) ?? '0'} / ${cpuData?.load?.[2]?.toFixed(2) ?? '0'}`}
            progress={{ value: cpuData?.usagePercent ?? 0, color: (cpuData?.usagePercent ?? 0) > 85 ? 'red' : 'blue' }}
          />
          <StatCard
            title="Mémoire"
            icon={IconDatabase}
            color="violet"
            value={`${memData?.usagePercent ?? 0}%`}
            sub={`${fmtBytes(memData?.usedBytes ?? 0)} / ${fmtBytes(memData?.totalBytes ?? 0)}`}
            progress={{ value: memData?.usagePercent ?? 0, color: (memData?.usagePercent ?? 0) > 85 ? 'red' : 'violet' }}
          />
          <StatCard
            title="Disque"
            icon={IconDatabase}
            color="teal"
            value={`${rootDisk?.usagePercent ?? 0}%`}
            sub={`${rootDisk?.mount ?? '/'} — ${fmtBytes(rootDisk?.totalBytes ?? 0)}`}
            progress={{ value: rootDisk?.usagePercent ?? 0, color: (rootDisk?.usagePercent ?? 0) > 85 ? 'red' : 'teal' }}
          />
          <StatCard
            title="Uptime"
            icon={IconClockBolt}
            color="orange"
            value={fmtUptime(infoData?.uptimeSeconds ?? 0)}
            sub={`Noyau ${infoData?.kernel}`}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {[
            { label: 'Sites', value: counts.sites, to: '/sites', icon: IconWorld },
            { label: 'Domaines', value: counts.domains, to: '/domains', icon: IconGrain },
            { label: 'Apps Node', value: counts.apps, to: '/node', icon: IconBrandNodejs },
            { label: 'Utilisateurs', value: counts.users, to: '/users', icon: IconUsers },
          ].map((obj) => (
            <UnstyledButton key={obj.label} component={Link} to={obj.to}>
              <Card withBorder p="md" h="100%" style={{ cursor: 'pointer' }}>
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0}>
                    <Text fz="h2" fw={700} lh={1.2}>{obj.value ?? '…'}</Text>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>{obj.label}</Text>
                  </Stack>
                  <ThemeIcon variant="light" size={34} radius="md">
                    <obj.icon size={18} stroke={1.5} />
                  </ThemeIcon>
                </Group>
              </Card>
            </UnstyledButton>
          ))}
        </SimpleGrid>

        <ServicesGrid />

        {modules.length > 0 && (
          <Card withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Group gap="sm">
                <ThemeIcon variant="light" size={30} radius="md">
                  <IconActivity size={16} stroke={1.5} />
                </ThemeIcon>
                <Text fw={600}>Santé des modules</Text>
              </Group>
              <StatusBadge
                status={healthyCount === modules.length ? 'ok' : 'error'}
                labels={{ ok: `${healthyCount}/${modules.length} sains`, error: 'Modules défaillants' }}
              />
            </Group>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Module</Table.Th>
                  <Table.Th fz="xs" c="dimmed">État</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {modules.map((m) => (
                  <Table.Tr key={m.module}>
                    <Table.Td fw={500}>{m.module}</Table.Td>
                    <Table.Td><StatusBadge status={m.healthy} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        )}
      </Stack>
    </div>
  );
}
