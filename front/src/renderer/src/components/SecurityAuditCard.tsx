import { useState } from 'react';
import { Card, Text, ThemeIcon, Group, Stack, Badge, Button, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconShieldLock, IconCircleCheck, IconAlertTriangle, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../api/hooks';
import { call } from '../api/client';
import { SshHardeningModal, type SshHardeningState } from './SshHardeningModal';

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

interface Fail2banInfo {
  installed: boolean;
  active: boolean;
  jails: Array<{ name: string; currentlyBanned: number; totalBanned: number }>;
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
  const f2b = useModuleQuery<Fail2banInfo>('system', 'security.f2b.status');
  const [sshModalOpen, setSshModalOpen] = useState(false);
  const [sshState, setSshState] = useState<SshHardeningState | null>(null);
  const action = useModuleAction('system');
  const [f2bBusy, setF2bBusy] = useState(false);
  const [unattendedBusy, setUnattendedBusy] = useState(false);

  const checks = audit.data?.checks ?? [];
  const warnCount = checks.filter((c) => c.status === 'warn').length;

  const openSshModal = async () => {
    try {
      const st = await call<SshHardeningState>('system', 'security.ssh.status');
      setSshState(st);
    } catch (err) {
      setSshState(null);
      notifications.show({ message: err instanceof Error ? err.message : 'État SSH indisponible', color: 'red' });
    }
    setSshModalOpen(true);
  };

  const refreshSshState = async () => {
    try {
      const st = await call<SshHardeningState>('system', 'security.ssh.status');
      setSshState(st);
    } catch { /* garder l'état précédent */ }
    void audit.reload();
  };

  const setupF2b = async () => {
    setF2bBusy(true);
    const res = await action.run<{ installed: boolean }>('security.f2b.setup');
    setF2bBusy(false);
    if (res !== null) {
      notifications.show({ message: 'Fail2ban installé et configuré (jails sshd + web)', color: 'green' });
      void f2b.reload();
      void audit.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const enableUnattended = async () => {
    setUnattendedBusy(true);
    const res = await action.run<{ enabled: boolean }>('security.unattended.enable');
    setUnattendedBusy(false);
    if (res !== null) {
      notifications.show({ message: 'unattended-upgrades activé — correctifs sécurité automatiques', color: 'green' });
      void audit.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  const f2bBanned = (f2b.data?.jails ?? []).reduce((sum, j) => sum + j.currentlyBanned, 0);
  const checkById = (id: string) => checks.find((c) => c.id === id);
  const sshCheck = checkById('ssh-password');
  const unattendedCheck = checkById('unattended-upgrades');

  return (
    <>
      <Card withBorder p="md" h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>Sécurité</Text>
          <Group gap="xs">
            <ThemeIcon
              variant="subtle"
              color="dimmed"
              size={26}
              radius="md"
              style={{ cursor: 'pointer' }}
              onClick={() => { void audit.reload(); void f2b.reload(); }}
            >
              <IconRefresh size={14} stroke={1.5} />
            </ThemeIcon>
            <ThemeIcon variant="light" color={warnCount > 0 ? 'orange' : 'teal'} size={34} radius="md">
              <IconShieldLock size={18} stroke={1.5} />
            </ThemeIcon>
          </Group>
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
                {/* Actions contextuelles */}
                {(c.id === 'ssh-password' || c.id === 'ssh-root') && sshCheck?.status === 'warn' && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="orange"
                    mt={4}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void openSshModal()}
                  >
                    Durcir SSH
                  </Button>
                )}
                {c.id === 'ssh-password' && sshCheck?.status === 'ok' && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="dimmed"
                    mt={4}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void openSshModal()}
                  >
                    Gérer les clés / réactiver
                  </Button>
                )}
                {c.id === 'fail2ban' && c.status === 'warn' && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="orange"
                    mt={4}
                    loading={f2bBusy}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void setupF2b()}
                  >
                    Installer fail2ban
                  </Button>
                )}
                {c.id === 'unattended-upgrades' && c.status !== 'ok' && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    mt={4}
                    loading={unattendedBusy}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => void enableUnattended()}
                  >
                    Activer
                  </Button>
                )}
              </Stack>
            </Group>
          ))}
          {audit.error && (
            <Text size="xs" c="dimmed">Audit indisponible : {audit.error}</Text>
          )}
          {!audit.loading && checks.length === 0 && (
            <Text size="xs" c="dimmed">Aucun contrôle disponible.</Text>
          )}
          {/* Fail2ban : détail des jails si actif */}
          {f2b.data?.active && (f2b.data.jails ?? []).length > 0 && (
            <>
              <Divider my={4} />
              <Text size="xs" c="dimmed" fw={600}>Fail2ban — {f2bBanned} IP bannie(s)</Text>
              {(f2b.data.jails ?? []).map((j) => (
                <Group key={j.name} gap="xs" wrap="nowrap">
                  <Badge size="sm" variant="light" color="grape">{j.name}</Badge>
                  <Text size="xs" c="dimmed">
                    {j.currentlyBanned} bannie(s) · {j.totalBanned} au total
                  </Text>
                </Group>
              ))}
            </>
          )}
        </Stack>
      </Card>
      <SshHardeningModal
        opened={sshModalOpen}
        onClose={() => setSshModalOpen(false)}
        state={sshState}
        onApplied={() => void refreshSshState()}
      />
    </>
  );
}
