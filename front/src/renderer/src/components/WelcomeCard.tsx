import { Card, Group, Text, ThemeIcon, Stack, Badge } from '@mantine/core';
import { IconDashboard } from "@tabler/icons-react";
import type { ReactNode } from 'react';

interface WelcomeCardProps {
  title: string;
  description: ReactNode;
  icon: typeof IconDashboard;
  stats?: Array<{ label: string; value: string }>;
}

export function WelcomeCard({ title, description, icon: IconCmp, stats }: WelcomeCardProps) {
  return (
    <Card
      withBorder
      p="lg"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, var(--mantine-primary-color-filled) 18%, color-mix(in srgb, var(--mantine-color-dark-7) 72%, transparent)) 0%, color-mix(in srgb, var(--mantine-color-dark-7) 72%, transparent) 65%)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon variant="filled" size={52} radius="lg">
          <IconCmp size={28} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={4} style={{ flex: 1 }}>
          <Text fz="h4" fw={700}>{title}</Text>
          <Text size="sm" c="dimmed">{description}</Text>
          {stats && (
            <Group gap="lg" mt={8}>
              {stats.map((s) => (
                <Stack key={s.label} gap={0}>
                  <Text fz="lg" fw={700}>{s.value}</Text>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{s.label}</Text>
                </Stack>
              ))}
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

type StatusValue = 'ok' | 'warn' | 'error' | 'off' | boolean;

export function StatusBadge({ status, labels }: { status: StatusValue; labels?: { ok?: string; warn?: string; error?: string; off?: string } }) {
  const l = labels ?? {};
  if (status === 'ok' || status === true) return <Badge color="teal" variant="light">{l.ok ?? 'Actif'}</Badge>;
  if (status === 'warn') return <Badge color="yellow" variant="light">{l.warn ?? 'Attention'}</Badge>;
  if (status === 'error') return <Badge color="red" variant="light">{l.error ?? 'Erreur'}</Badge>;
  return <Badge color="gray" variant="light">{l.off ?? 'Inactif'}</Badge>;
}
