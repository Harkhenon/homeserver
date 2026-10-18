import { Card, Group, Text, Badge, ActionIcon, Tooltip, ThemeIcon, SimpleGrid, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconServer2, IconRefresh, IconWorld, IconDatabase, IconBrandNodejs,
  IconGrain, IconClock, IconFlame,
} from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../api/hooks';

interface ServiceStatus {
  unit: string;
  active: boolean;
  enabled: boolean;
}

interface ServiceConfig {
  key: string;
  label: string;
  prefix: string;
  icon: typeof IconServer2;
  color: string;
  reloadAction?: string;
  restartAction?: string;
  reloadLabel?: string;
}

const SERVICES: ServiceConfig[] = [
  { key: 'apache', label: 'Apache', prefix: 'apache', icon: IconServer2, color: 'red', reloadAction: 'service.reload', restartAction: 'service.restart', reloadLabel: 'Recharger la config' },
  { key: 'nginx', label: 'Nginx', prefix: 'nginx', icon: IconWorld, color: 'green', reloadAction: 'service.reload' },
  { key: 'bind9', label: 'Bind9 (DNS)', prefix: 'bind9', icon: IconGrain, color: 'blue', reloadAction: 'service.reload', reloadLabel: 'Recharger les zones' },
  { key: 'mariadb', label: 'MariaDB', prefix: 'mariadb', icon: IconDatabase, color: 'violet', restartAction: 'service.restart' },
  { key: 'php', label: 'PHP-FPM', prefix: 'php', icon: IconBrandNodejs, color: 'indigo', restartAction: 'service.restart' },
];

function ServiceCard({ config }: { config: ServiceConfig }) {
  const status = useModuleQuery<ServiceStatus>(config.prefix, 'service.status');
  const action = useModuleAction(config.prefix);

  const run = async (verb: 'reload' | 'restart') => {
    const actionName = verb === 'reload' ? config.reloadAction : config.restartAction;
    if (!actionName) return;
    const res = await action.run(actionName);
    if (res !== null) {
      notifications.show({
        message: `${config.label} : ${verb === 'reload' ? 'configuration rechargée' : 'service redémarré'}`,
        color: 'green',
      });
      void status.reload(true);
    } else if (action.error) {
      notifications.show({ message: `${config.label} : ${action.error}`, color: 'red' });
    }
  };

  const active = status.data?.active ?? null;

  return (
    <Card withBorder p="md" radius="lg">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon variant="light" size={34} radius="md" color={config.color}>
            <config.icon size={17} stroke={1.5} />
          </ThemeIcon>
          <Stack gap={0}>
            <Text size="sm" fw={600}>{config.label}</Text>
            <Badge
              variant="light"
              size="sm"
              color={active === null ? 'gray' : active ? 'green' : 'red'}
            >
              {active === null ? '—' : active ? 'Actif' : 'Arrêté'}
            </Badge>
          </Stack>
        </Group>
        <Group gap={4} wrap="nowrap">
          {config.reloadAction && (
            <Tooltip label={config.reloadLabel ?? 'Recharger'} withinPortal>
              <ActionIcon
                variant="subtle"
                color={config.color}
                loading={action.loading}
                onClick={() => void run('reload')}
              >
                <IconClock size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          )}
          {config.restartAction && (
            <Tooltip label="Redémarrer" withinPortal>
              <ActionIcon
                variant="subtle"
                color="orange"
                loading={action.loading}
                onClick={() => void run('restart')}
              >
                <IconRefresh size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
}

export function ServicesGrid() {
  return (
    <Stack gap="xs">
      <Group gap="sm">
        <ThemeIcon variant="light" size={30} radius="md">
          <IconFlame size={16} stroke={1.5} />
        </ThemeIcon>
        <Text fw={600}>Services</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
        {SERVICES.map((config) => (
          <ServiceCard key={config.key} config={config} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
