import { Card, Text, ThemeIcon, Group, Stack, Badge } from '@mantine/core';
import { IconShieldLock, IconCircleCheck, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { useModuleQuery } from '../api/hooks';

interface AuditCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'info';
  detail: string;
}

interface AuditResult {
  checks: AuditCheck[];
  checkedAt: string;
}

function statusIcon(status: AuditCheck['status']) {
  if (status === 'ok') return <IconCircleCheck size={16} stroke={1.5} />;
  if (status === 'warn') return <IconAlertTriangle size={16} stroke={1.5} />;
  return <IconInfoCircle size={16} stroke={1.5} />;
}

function statusColor(status: AuditCheck['status']) {
  if (status === 'ok') return 'teal';
  if (status === 'warn') return 'orange';
  return 'blue';
}

export function SecurityAuditCard() {
  const audit = useModuleQuery<AuditResult>('system', 'security.audit');
  const checks = audit.data?.checks ?? [];
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  return (
    <Card withBorder p="md" h="100%">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>Sécurité</Text>
        <ThemeIcon variant="light" color={warnCount > 0 ? 'orange' : 'teal'} size={34} radius="md">
          <IconShieldLock size={18} stroke={1.5} />
        </ThemeIcon>
      </Group>
      <Group gap="xs" mt="xs" align="center" wrap="nowrap">
        <Text fz="h2" fw={700} lh={1.2} style={{ whiteSpace: 'nowrap' }}>
          {audit.loading && !audit.data ? '…' : warnCount === 0 ? 'Saine' : `${warnCount} alerte${warnCount > 1 ? 's' : ''}`}
        </Text>
        {audit.data && (
          <Badge color={warnCount > 0 ? 'orange' : 'teal'} variant="light" size="lg">
            {checks.length} contrôles
          </Badge>
        )}
      </Group>
      <Stack gap={10} mt="sm">
        {checks.map((c) => (
          <Group key={c.id} gap="xs" wrap="nowrap" align="flex-start">
            <ThemeIcon variant="light" color={statusColor(c.status)} size={26} radius="md" mt={2}>
              {statusIcon(c.status)}
            </ThemeIcon>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text size="sm" fw={500}>{c.label}</Text>
              <Text size="xs" c="dimmed">{c.detail}</Text>
            </Stack>
          </Group>
        ))}
        {audit.error && (
          <Text size="xs" c="dimmed">Audit indisponible : {audit.error}</Text>
        )}
        {!audit.loading && checks.length === 0 && (
          <Text size="xs" c="dimmed">Aucun contrôle disponible.</Text>
        )}
      </Stack>
    </Card>
  );
}
