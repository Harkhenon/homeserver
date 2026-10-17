import { useState } from 'react';
import {
  Stack,
  Text,
  Badge,
  Button,
  Group,
  ThemeIcon,
  Alert,
  Accordion,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconRefresh, IconRocket, IconCircleCheck, IconInfoCircle,
  IconHistory, IconArrowBackUp,
} from '@tabler/icons-react';
import { useModuleQuery, useModuleAction } from '../../api/hooks';
import { usePanelUpdateModal } from '../PanelUpdateModal';

interface PanelCheckInfo {
  available?: boolean;
  latest?: { version: string; notes?: string } | null;
  updaterHealth?: { core: string; updater: string; pairVersion?: string };
}

interface PanelRollbackResult {
  rolledBack?: boolean;
  current?: string;
  active?: boolean;
}

interface PanelReleasesInfo {
  releases: string[];
  current: string | null;
  previous: string | null;
  sizes?: Record<string, number>;
}

export function UpdatePanel() {
  const check = useModuleQuery<PanelCheckInfo>('system', 'panel.check');
  const releases = useModuleQuery<PanelReleasesInfo>('system', 'panel.releases');
  const action = useModuleAction('system');
  const { open } = usePanelUpdateModal();
  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteRelease = async (version: string) => {
    setDeleting(version);
    const res = await action.run<{ deleted?: boolean }>('panel.release.delete', { version });
    setDeleting(null);
    if (res !== null) {
      notifications.show({ message: `Release ${version} supprimée`, color: 'green' });
      void releases.reload();
      void check.reload();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  const [busy, setBusy] = useState<'rollback' | null>(null);
  const reloadAll = async () => {
    await check.reload();
    void releases.reload();
    if (check.error) {
      notifications.show({ message: `Vérification impossible : ${check.error}`, color: 'red' });
      return;
    }
    if (check.data?.available) {
      notifications.show({ message: `Nouvelle version ${check.data?.latest?.version ?? '?'} disponible`, color: 'orange' });
    } else {
      notifications.show({ message: 'Le panel est à jour', color: 'green' });
    }
  };
  const rollback = async () => {
    setBusy('rollback');
    const res = await action.run<PanelRollbackResult>('panel.rollback');
    setBusy(null);
    if (res !== null) {
      notifications.show({
        message: `Retour à la version ${res.current ?? '?'} — recharge la page`,
        color: res.active ? 'green' : 'red',
      });
      reloadAll();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };
  const current = releases.data?.current ?? '?';
  const available = check.data?.available ?? false;
  const canRollback = Boolean(releases.data?.previous);
  return (
    <Stack>
      <Group gap="sm" align="center">
        <ThemeIcon variant="light" size={36} radius="md">
          <IconRefresh size={18} stroke={1.5} />
        </ThemeIcon>
        <div>
          <Text size="sm" fw={600}>Version installée</Text>
          <Group gap="xs">
            <Badge variant="light" color={available ? 'orange' : 'green'}>{current}</Badge>
            {available && (
              <Text size="xs" c="dimmed">{check.data?.latest?.version} disponible</Text>
            )}
            {!available && (
              <Group gap={4}>
                <IconCircleCheck size={14} stroke={1.5} />
                <Text size="xs" c="dimmed">
                  À jour
                </Text>
              </Group>
            )}
          </Group>
        </div>
      </Group>
      {available && (
        <Alert icon={<IconInfoCircle size={16} stroke={1.5} />} color="blue" variant="light">
          La mise à jour construit la nouvelle version à côté de l'actuelle, bascule
          dessus, vérifie la santé du panel puis redémarre. En cas d'échec, retour
          automatique à la version précédente.
        </Alert>
      )}
      <Group gap="sm">
        <Button
          size="sm"
          variant="light"
          leftSection={<IconRefresh size={14} stroke={1.5} />}
          loading={check.loading || busy !== null}
          onClick={() => void reloadAll()}
        >
          Vérifier
        </Button>
        <Button
          size="sm"
          leftSection={<IconRocket size={14} stroke={1.5} />}
          disabled={!available}
          onClick={open}
        >
          Mettre à jour le panel
        </Button>
        <Button
          size="sm"
          variant="light"
          color="orange"
          leftSection={<IconArrowBackUp size={14} stroke={1.5} />}
          loading={busy === 'rollback'}
          disabled={!canRollback}
          onClick={() => void rollback()}
        >
          Version précédente
        </Button>
      </Group>
      <Accordion variant="separated">
        <Accordion.Item value="releases">
          <Accordion.Control icon={<IconHistory size={16} stroke={1.5} />}>
            Releases présentes sur le serveur
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              {(releases.data?.releases ?? []).map((v) => {
                const isActive = v === current;
                const isPrevious = v === releases.data?.previous;
                const sizeMb = releases.data?.sizes?.[v];
                return (
                  <Group key={v} gap="xs" wrap="nowrap" justify="space-between">
                    <Group gap="xs" wrap="nowrap">
                      {isActive && <IconCircleCheck size={14} stroke={1.5} />}
                      <Text size="sm" fw={isActive ? 600 : 400} c={isActive ? undefined : 'dimmed'}>{v}</Text>
                      {isActive && <Badge size="sm" variant="light">active</Badge>}
                      {isPrevious && (
                        <Badge size="sm" variant="light" color="orange">précédente</Badge>
                      )}
                      {sizeMb !== undefined && (
                        <Text size="xs" c="dimmed">{sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} Go` : `${sizeMb} Mo`}</Text>
                      )}
                    </Group>
                    {!isActive && !isPrevious && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="red"
                        loading={deleting === v}
                        onClick={() => void deleteRelease(v)}
                      >
                        Supprimer
                      </Button>
                    )}
                  </Group>
                );
              })}
              {(releases.data?.releases ?? []).length === 0 && (
                <Text size="sm" c="dimmed">Aucune release — le panel tourne encore en mode install initial.</Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {check.data?.updaterHealth && (
        <Group gap="xs">
          <IconCircleCheck size={14} stroke={1.5} />
          <Text size="xs" c="dimmed">
            Updater sain — core {check.data.updaterHealth.core}, couple v{check.data.updaterHealth.pairVersion ?? '?'}
          </Text>
        </Group>
      )}
      {check.error && (
        <Text size="xs" c="dimmed">
          Vérification indisponible : {check.error}
        </Text>
      )}
    </Stack>
  );
}
