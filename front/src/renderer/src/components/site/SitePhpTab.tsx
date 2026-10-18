import {
  Stack, Text, Badge, Group, Divider, Alert, Skeleton,
} from '@mantine/core';
import { useModuleQuery, useModuleAction } from '../../api/hooks';
import { notifications } from '@mantine/notifications';
import { Select, Button } from '@mantine/core';
import { useState } from 'react';
import type { Vhost, NginxVhost } from '../../types';

interface PhpVersion {
  version: string;
  available: boolean;
}

interface SitePhpTabProps {
  vhost: Vhost | NginxVhost;
  server: 'apache' | 'nginx';
  onChanged: () => void;
}

export function SitePhpTab({ vhost, server, onChanged }: SitePhpTabProps) {
  const versions = useModuleQuery<{ versions: PhpVersion[] }>('php', 'versions.list');
  const action = useModuleAction(server);
  const [selected, setSelected] = useState<string | null>(vhost.phpVersion);

  const installed = (versions.data?.versions ?? []).filter((v) => v.available);

  const apply = async () => {
    if (!selected) return;
    const res = await action.run('vhosts.update', { id: vhost.id, phpVersion: selected });
    if (res !== null) {
      notifications.show({ message: `PHP ${selected} appliqué à ${vhost.domain}`, color: 'green' });
      onChanged();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Stack gap={2}>
          <Text size="sm" fw={600}>Version PHP du site</Text>
          <Text size="xs" c="dimmed">
            Change la version de PHP-FPM qui traite les requêtes de ce virtualhost.
          </Text>
        </Stack>
        <Badge variant="light" color="violet">PHP {vhost.phpVersion}</Badge>
      </Group>

      {versions.loading ? (
        <Skeleton height={36} />
      ) : (
        <Group gap="sm" align="flex-end">
          <Select
            label="Version PHP-FPM"
            placeholder="Choisir une version"
            data={installed.map((v) => ({ value: v.version, label: `PHP ${v.version}` }))}
            value={selected}
            onChange={setSelected}
            w={220}
          />
          <Button
            size="sm"
            variant="light"
            disabled={selected === vhost.phpVersion}
            loading={action.loading}
            onClick={() => void apply()}
          >
            Appliquer
          </Button>
        </Group>
      )}

      <Divider my={4} />
      <Alert color="blue" variant="light">
        Les versions listées sont celles installées sur le serveur. Les pools FPM détaillés
        (utilisateurs, limites mémoire…) restent gérés dans Paramètres → Versions par défaut / module PHP.
      </Alert>
    </Stack>
  );
}
