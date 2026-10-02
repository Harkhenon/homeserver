import { Group, Title, Text, ThemeIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import { IconDashboard } from '@tabler/icons-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: typeof IconDashboard;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon: IconCmp, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" mb="lg" wrap="nowrap" align="flex-start">
      <Group gap="sm" wrap="nowrap">
        {IconCmp && (
          <ThemeIcon variant="light" size={42} radius="md">
            <IconCmp size={22} stroke={1.5} />
          </ThemeIcon>
        )}
        <div>
          <Title order={3}>{title}</Title>
          {description && <Text c="dimmed" size="sm">{description}</Text>}
        </div>
      </Group>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
