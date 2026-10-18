import { Group, Switch, Text, Stack, Badge, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useModuleAction } from '../../api/hooks';
import type { Vhost, NginxVhost } from '../../types';

interface SiteGeneralTabProps {
  vhost: Vhost | NginxVhost;
  server: 'apache' | 'nginx';
  onChanged: () => void;
}

export function SiteGeneralTab({ vhost, server, onChanged }: SiteGeneralTabProps) {
  const action = useModuleAction(server);

  const toggle = async (enabled: boolean) => {
    const res = await action.run('vhosts.enable', { id: vhost.id, enabled });
    if (res !== null) {
      notifications.show({
        message: enabled ? `Site ${vhost.domain} activé` : `Site ${vhost.domain} désactivé`,
        color: 'green',
      });
      onChanged();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Stack gap={2}>
          <Text size="sm" fw={600}>Site actif</Text>
          <Text size="xs" c="dimmed">
            Un site désactivé ne répond plus aux requêtes (vhost retiré de sites-enabled).
          </Text>
        </Stack>
        <Switch checked={vhost.enabled} onChange={(e) => void toggle(e.currentTarget.checked)} size="md" />
      </Group>
      <Divider my={4} />
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Domaine principal</Text>
          <Text size="sm" fw={500}>{vhost.domain}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Racine des documents</Text>
          <Text size="sm" fw={500}>{vhost.docroot}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Serveur</Text>
          <Badge variant="light" color={server === 'apache' ? 'red' : 'green'}>
            {server === 'apache' ? 'Apache' : 'Nginx'}
          </Badge>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">PHP</Text>
          {vhost.phpVersion
            ? <Badge variant="light" color="violet">PHP {vhost.phpVersion}</Badge>
            : <Text size="sm">—</Text>}
        </Group>
        {'serverAdmin' in vhost && (
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Admin</Text>
            <Text size="sm" fw={500}>{(vhost as Vhost).serverAdmin ?? '—'}</Text>
          </Group>
        )}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">Fichier de config</Text>
          <Text size="sm" fw={500}>{vhost.confFile ?? '—'}</Text>
        </Group>
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed">Alias</Text>
          <Group gap={4} justify="flex-end">
            {vhost.aliases.length > 0
              ? vhost.aliases.map((a) => <Badge key={a} variant="light" size="sm">{a}</Badge>)
              : <Text size="sm">—</Text>}
          </Group>
        </Group>
      </Stack>
    </Stack>
  );
}
