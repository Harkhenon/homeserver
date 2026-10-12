import { useState } from 'react';
import {
  Stack,
  Text,
  Badge,
  Button,
  Group,
  ThemeIcon,
  Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh, IconDownload, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';

interface PanelVersionInfo {
  version: string;
}

interface PanelCheckInfo {
  current: string;
  latest: string;
  available: boolean;
  branch: string;
}

interface PanelUpdateResult {
  updated?: boolean;
  current?: string;
  latest?: string;
  branch?: string;
  active?: boolean;
}

export function UpdatePanel() {
  const version = useModuleQuery<PanelVersionInfo>('system', 'panel.version');
  const check = useModuleQuery<PanelCheckInfo>('system', 'panel.check');
  const action = useModuleAction('system');
  const [updating, setUpdating] = useState(false);

  const applyUpdate = async () => {
    setUpdating(true);
    notifications.show({
      message: 'Mise à jour en cours — le panel redémarrera à la fin',
      color: 'blue',
    });
    const res = await action.run<PanelUpdateResult>('panel.update');
    setUpdating(false);
    if (res !== null) {
      notifications.show({
        message: res.updated
          ? `Panel mis à jour vers ${res.latest ?? '?'} — recharge la page`
          : 'Le panel est déjà à jour',
        color: 'green',
      });
      void version.reload();
      void check.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const current = version.data?.version ?? check.data?.current ?? '?';
  const latest = check.data?.latest;
  const available = check.data?.available ?? false;

  return (
    <Stack>
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md">
          <IconRefresh size={18} stroke={1.5} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Version installée</Text>
          <Group gap="xs">
            <Badge variant="light" color={available ? 'orange' : 'green'}>{current}</Badge>
            {available && latest && (
              <Text size="xs" c="dimmed">{latest} disponible</Text>
            )}
            {!available && (
              <Group gap={4}>
                <IconCircleCheck size={14} stroke={1.5} />
                <Text size="xs" c="dimmed">À jour</Text>
              </Group>
            )}
          </Group>
        </div>
      </Group>
      {available && (
        <Alert icon={<IconInfoCircle size={16} stroke={1.5} />} color="blue" variant="light">
          La mise à jour récupère la dernière version du dépôt ({check.data?.branch ?? 'dev'}),
          recompile le back et le front, puis redémarre les services homeserver et hs-helper.
          Le panel sera indisponible quelques instants.
        </Alert>
      )}
      <Group gap="sm">
        <Button
          size="sm"
          variant="light"
          leftSection={<IconRefresh size={14} stroke={1.5} />}
          loading={check.loading}
          onClick={() => {
            void version.reload();
            void check.reload();
          }}
        >
          Vérifier
        </Button>
        <Button
          size="sm"
          leftSection={<IconDownload size={14} stroke={1.5} />}
          loading={updating}
          onClick={() => void applyUpdate()}
        >
          Mettre à jour le panel
        </Button>
      </Group>
      {check.error && (
        <Text size="xs" c="dimmed">
          Vérification indisponible : {check.error}
        </Text>
      )}
    </Stack>
  );
}
