import { Table, Badge, Button, Group, Text, ThemeIcon, Stack } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { notifications } from '@mantine/notifications';
import { IconBinaryTree, IconWorld, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { PageHeader, LoadingBlock, ErrorBlock, SslToggle } from '../components';
import type { Zone } from '../types';

export function DomainsPage() {
  const zones = useModuleQuery<Zone[]>('bind9', 'zones.list');
  const action = useModuleAction('bind9');
  const navigate = useNavigate();

  const remove = async (id: string) => {
    const res = await action.run('zones.delete', { id });
    if (res !== null) {
      notifications.show({ message: `Domaine ${id} supprimé`, color: 'green' });
      void zones.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (zones.loading) return <LoadingBlock />;
  if (zones.error) return <ErrorBlock error={zones.error} />;

  const list = zones.data ?? [];

  return (
    <div>
      <PageHeader
        icon={IconWorld}
        title="Domaines"
        description={`${list.length} domaine(s) géré(s)`}
        actions={
          <Button leftSection={<IconPlus size={16} stroke={1.5} />} onClick={() => navigate('/domains/new')}>
            Ajouter
          </Button>
        }
      />
      <Stack gap="xs">
        {list.map((zone) => (
          <Group
            key={zone.id}
            wrap="nowrap"
            justify="space-between"
            px="md"
            py="sm"
            style={{
              border: '1px solid var(--mantine-color-dark-4)',
              borderRadius: 'var(--mantine-radius-lg)',
              background: 'var(--mantine-color-dark-7)',
              cursor: 'pointer',
              transition: 'border-color 150ms ease, box-shadow 150ms ease',
            }}
            onClick={() => navigate(`/domains/${encodeURIComponent(zone.id)}`)}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" size={36} radius="md">
                <IconBinaryTree size={18} stroke={1.5} />
              </ThemeIcon>
              <div>
                <Text fw={600}>{zone.domain}</Text>
                <Text size="xs" c="dimmed">{zone.recordCount ?? 0} enregistrement(s)</Text>
              </div>
            </Group>
            <Group gap="sm" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">SSL</Text>
                <SslToggle domain={zone.domain} onChanged={() => void zones.reload()} />
              </Group>
              <Badge variant="light" size="sm">{zone.serial}</Badge>
              <Button size="compact-xs" variant="light" color="red" onClick={() => void remove(zone.id)}>
                Supprimer
              </Button>
              <IconChevronRight size={16} stroke={1.5} />
            </Group>
          </Group>
        ))}
        {list.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            Aucun domaine enregistré — clique sur « Ajouter » pour commencer.
          </Text>
        )}
      </Stack>
    </div>
  );
}
