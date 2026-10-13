import { useState } from 'react';
import {
  Card, Text, ThemeIcon, Badge, Button, Group, Stack,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRocket, IconRefresh, IconCircleCheck, IconArrowUp } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../api/hooks';

interface PanelCheckInfo {
  available?: boolean;
  latest?: { version: string; notes?: string } | null;
}

interface PanelUpdateResult {
  updated?: boolean;
  current?: string;
  latest?: string;
  rolledBack?: boolean;
  active?: boolean;
}

export function PanelUpdateCard() {
  const check = useModuleQuery<PanelCheckInfo>('system', 'panel.check', undefined, {
    refetchInterval: 60_000,
  });
  const versionQuery = useModuleQuery<{ version: string }>('system', 'panel.version');
  const action = useModuleAction('system');
  const [updating, setUpdating] = useState(false);

  const applyUpdate = async () => {
    setUpdating(true);
    notifications.show({
      message: 'Mise à jour du panel en cours — il redémarrera à la fin',
      color: 'blue',
    });
    const res = await action.run<PanelUpdateResult>('panel.update');
    setUpdating(false);
    if (res !== null) {
      if (res.rolledBack) {
        notifications.show({
          message: 'Mise à jour échouée — retour automatique à la version précédente',
          color: 'orange',
        });
      } else if (res.updated) {
        notifications.show({
          message: `Panel mis à jour vers ${res.latest ?? '?'} — recharge la page`,
          color: 'green',
        });
      } else {
        notifications.show({ message: 'Le panel est déjà à jour', color: 'blue' });
      }
      void check.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const version = versionQuery.data?.version ?? '…';
  const available = check.data?.available ?? false;
  const loading = check.loading && !check.data;

  return (
    <Card withBorder p="md" h="100%">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>Panel</Text>
        <ThemeIcon variant="light" color={available ? 'orange' : 'teal'} size={34} radius="md">
          <IconRocket size={18} stroke={1.5} />
        </ThemeIcon>
      </Group>
      <Group gap="xs" mt="xs" align="center" wrap="nowrap">
        <Text fz="h2" fw={700} lh={1.2} style={{ whiteSpace: 'nowrap' }}>v{version}</Text>
        {available ? (
          <Badge color="orange" variant="light" size="lg">
            <Group gap={4} wrap="nowrap">
              <IconArrowUp size={12} stroke={2.5} />
              {check.data?.latest?.version}
            </Group>
          </Badge>
        ) : (
          <Badge color="teal" variant="light" size="lg" leftSection={<IconCircleCheck size={12} stroke={2.5} />}>
            À jour
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mt="xs">
        {available
          ? 'Une nouvelle version est disponible'
          : check.error
            ? 'Vérification indisponible'
            : 'Aucune mise à jour en attente'}
      </Text>
      <Stack gap={6} mt="sm">
        <Button
          size="compact-sm"
          variant="light"
          color={available ? 'orange' : 'teal'}
          leftSection={<IconRefresh size={14} stroke={1.5} />}
          loading={check.loading}
          onClick={() => void check.reload()}
        >
          Vérifier
        </Button>
        {available && (
          <Button
            size="compact-sm"
            color="orange"
            leftSection={<IconRocket size={14} stroke={1.5} />}
            loading={updating}
            onClick={() => void applyUpdate()}
          >
            Mettre à jour
          </Button>
        )}
      </Stack>
      {loading && <Text size="xs" c="dimmed" mt="xs">Vérification en cours…</Text>}
    </Card>
  );
}
