import { Card, Group, Text, ThemeIcon, Box, Progress } from '@mantine/core';
import { IconDashboard } from "@tabler/icons-react";

interface StatCardProps {
  title: string;
  icon: typeof IconDashboard;
  color?: string;
  value: string;
  sub?: string;
  progress?: { value: number; color?: string } | null;
}

export function StatCard({ title, icon: IconCmp, color = 'blue', value, sub, progress }: StatCardProps) {
  return (
    <Card withBorder p="md" h="100%">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>{title}</Text>
        <ThemeIcon variant="light" color={color} size={34} radius="md">
          <IconCmp size={18} stroke={1.5} />
        </ThemeIcon>
      </Group>
      <Text fz="h2" fw={700} lh={1.2} mt="xs">{value}</Text>
      {progress ? (
        <Box mt="xs">
          <Progress value={progress.value} color={progress.color ?? color} radius="sm" size="sm" />
        </Box>
      ) : null}
      {sub && <Text size="sm" c="dimmed" mt="xs">{sub}</Text>}
    </Card>
  );
}
