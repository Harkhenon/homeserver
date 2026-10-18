import { Group, Title, Text, ThemeIcon, Anchor, Box } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconDashboard } from '@tabler/icons-react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: typeof IconDashboard;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export function PageHeader({ title, description, icon: IconCmp, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Group justify="space-between" mb="lg" wrap="nowrap" align="flex-start">
      <Group gap="sm" wrap="nowrap">
        {IconCmp && (
          <ThemeIcon variant="light" size={42} radius="md">
            <IconCmp size={22} stroke={1.5} />
          </ThemeIcon>
        )}
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Box mb={2}>
              <Group gap={6} wrap="nowrap">
                {breadcrumbs.map((crumb, i) => (
                  <Group gap={6} key={i} wrap="nowrap">
                    {i > 0 && (
                      <Text size="xs" c="dimmed" style={{ userSelect: 'none' }}>/</Text>
                    )}
                    {crumb.to ? (
                      <Anchor
                        size="xs"
                        c="dimmed"
                        component={Link}
                        to={crumb.to}
                        underline="never"
                      >
                        {crumb.label}
                      </Anchor>
                    ) : (
                      <Text size="xs" c="dimmed" truncate>
                        {crumb.label}
                      </Text>
                    )}
                  </Group>
                ))}
              </Group>
            </Box>
          )}
          <Title order={3}>{title}</Title>
          {description && <Text c="dimmed" size="sm">{description}</Text>}
        </div>
      </Group>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
