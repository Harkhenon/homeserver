import { Group, Title, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" mb="md" wrap="nowrap">
      <div>
        <Title order={3}>{title}</Title>
        {description && <Text c="dimmed" size="sm">{description}</Text>}
      </div>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
