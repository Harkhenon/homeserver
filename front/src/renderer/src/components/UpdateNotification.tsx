import { Alert, Group, Text, Badge } from '@mantine/core';
import { IconArrowUp } from '@tabler/icons-react';
import { usePanelUpdate } from '../api/usePanelUpdate';
import { usePanelUpdateModal } from './PanelUpdateModal';

export function UpdateNotification() {
  const { status } = usePanelUpdate(60_000);
  const { open } = usePanelUpdateModal();
  const available = status.data?.available === true && Boolean(status.data?.latest?.version);
  if (!available) return null;
  const version = status.data?.latest?.version ?? '?';
  return (
    <Alert
      icon={<IconArrowUp size={16} stroke={1.5} />}
      color="orange"
      variant="light"
      py={6}
      px="sm"
      style={{ cursor: 'pointer' }}
      onClick={open}
    >
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={600}>Nouvelle version</Text>
        <Badge size="sm" variant="filled" color="orange">v{version}</Badge>
        <Text size="xs" c="dimmed" visibleFrom="xs">disponible — clique pour voir le changelog</Text>
      </Group>
    </Alert>
  );
}
