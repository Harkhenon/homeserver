import {
  Card, Text, ThemeIcon, Badge, Button, Group, Stack,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRocket, IconRefresh, IconCircleCheck, IconArrowUp, IconCircleX } from '@tabler/icons-react';
import { useState } from 'react';
import { useModuleQuery } from '../api/hooks';
import { call } from '../api/client';
import { usePanelUpdateModal } from './PanelUpdateModal';

interface PanelCheckInfo {
  available?: boolean;
  latest?: { version: string; notes?: string } | null;
}

export function PanelUpdateCard() {
  const check = useModuleQuery<PanelCheckInfo>('system', 'panel.check', undefined, {
    refetchInterval: 60_000,
  });
  const versionQuery = useModuleQuery<{ version: string }>('system', 'panel.version');
  const [checking, setChecking] = useState(false);
  const { open } = usePanelUpdateModal();
  const version = versionQuery.data?.version ?? '…';
  const available = check.data?.available ?? false;
  const loading = check.loading && !check.data;

  // « Vérifier » : check GitHub forcé (l'état est sinon mis en cache 30 min) ; la notification
  // utilise la réponse directe, check.data / available étant périmés dans cette closure.
  const checkNow = async () => {
    setChecking(true);
    let fresh: PanelCheckInfo;
    try {
      fresh = await call<PanelCheckInfo>('system', 'panel.check', { force: true });
    } catch (err) {
      notifications.show({
        message: `Vérification impossible : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
        color: 'red',
        icon: <IconCircleX size={16} stroke={1.5} />,
      });
      return;
    } finally {
      setChecking(false);
    }
    void check.reload(true);
    if (fresh.available) {
      notifications.show({
        message: `Nouvelle version v${fresh.latest?.version ?? '?'} disponible`,
        color: 'orange',
        icon: <IconArrowUp size={16} stroke={1.5} />,
      });
    } else {
      notifications.show({
        message: 'Le panel est à jour',
        color: 'green',
        icon: <IconCircleCheck size={16} stroke={1.5} />,
      });
    }
  };

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
          loading={check.loading || checking}
          onClick={() => void checkNow()}
        >
          Vérifier
        </Button>
        {available && (
          <Button
            size="compact-sm"
            color="orange"
            leftSection={<IconRocket size={14} stroke={1.5} />}
            onClick={open}
          >
            Mettre à jour
          </Button>
        )}
      </Stack>
      {loading && <Text size="xs" c="dimmed" mt="xs">Vérification en cours…</Text>}
    </Card>
  );
}
