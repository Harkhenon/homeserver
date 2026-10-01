import { AreaChart } from '@mantine/charts';
import { Card, SimpleGrid, Text, Badge } from '@mantine/core';
import { useModuleQuery } from '../api/hooks';
import { PageHeader, LoadingBlock, ErrorBlock } from '../components';
import type { MonitorSample } from '../types';

export function MonitorPage() {
  const history = useModuleQuery<{ samples: MonitorSample[] }>('monitor', 'history', { minutes: 60 });
  const latest = useModuleQuery<MonitorSample>('monitor', 'latest');

  if (history.loading) return <LoadingBlock />;
  if (history.error) return <ErrorBlock error={history.error} />;

  const samples = (history.data?.samples ?? []).map((s) => ({
    time: new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    cpu: Number((s.cpuLoad[0] ?? 0).toFixed(2)),
    ram: s.memUsagePercent,
  }));

  const last = latest.data;

  return (
    <div>
      <PageHeader title="Supervision" description="60 dernières minutes" />
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Card withBorder p="md">
          <Text mb="sm" fw={600}>Charge CPU {last && <Badge variant="light" ml="xs">{last.cpuLoad[0]?.toFixed(2)}</Badge>}</Text>
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
          <Text mb="sm" fw={600}>Mémoire {last && <Badge variant="light" ml="xs">{last.memUsagePercent}%</Badge>}</Text>
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
    </div>
  );
}
