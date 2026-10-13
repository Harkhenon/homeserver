import { useState } from 'react';
import {
  Modal, Button, Group, Stack, Text, Badge, ThemeIcon, Alert, Divider, Code, ScrollArea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import {
  IconRocket, IconCircleCheck, IconArrowUp, IconAlertTriangle,
} from '@tabler/icons-react';
import { usePanelUpdate, type PanelUpdateStatus } from '../api/usePanelUpdate';

function renderNotes(notes?: string): React.ReactNode {
  if (!notes || notes.trim().length === 0) {
    return <Text size="sm" c="dimmed">Aucun changelog fourni pour cette version.</Text>;
  }
  // Rendu markdown minimaliste : titres, gras, listes à puces, code inline.
  const lines = notes.split('\n').filter((l) => l.trim().length > 0);
  return (
    <Stack gap={6}>
      {lines.slice(0, 40).map((line, i) => {
        const bold = line.replace(/\*\*(.+?)\*\*/g, '«$1»').replace(/^#+\s*/, '');
        if (/^[-*]\s+/.test(line)) {
          return (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
              <Text size="sm" c="dimmed" mt={2}>•</Text>
              <Text size="sm" style={{ flex: 1 }}>{inline(bold.replace(/^[-*]\s+/, ''))}</Text>
            </Group>
          );
        }
        if (/^#{1,3}\s/.test(line)) {
          return <Text key={i} size="sm" fw={700} mt={4}>{inline(bold)}</Text>;
        }
        return <Text key={i} size="sm">{inline(line)}</Text>;
      })}
    </Stack>
  );
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/`([^`]+)`/);
  return parts.map((p, i) => (i % 2 === 1 ? <Code key={i}>{p}</Code> : <span key={i}>{p}</span>));
}

export function UpdateNotification() {
  const { status, action } = usePanelUpdate(6 * 60 * 60 * 1000);
  const [opened, { open, close }] = useDisclosure(false);
  const [applying, setApplying] = useState(false);

  const available = status.data?.available === true && Boolean(status.data.latest?.version);

  const apply = async () => {
    setApplying(true);
    const res = await action.run<PanelUpdateStatus>('panel.update');
    setApplying(false);
    if (res !== null) {
      const result = res.lastRun?.result;
      if (result === 'ok') {
        notifications.show({
          message: 'Mise à jour terminée — rechargement de la page',
          color: 'green',
        });
        setTimeout(() => window.location.reload(), 1500);
      } else if (result === 'rolledBack') {
        notifications.show({
          message: 'Échec du health-check — retour automatique à la version précédente, rien à faire',
          color: 'orange',
        });
      } else if (result === 'noop') {
        notifications.show({ message: 'Le panel est déjà à jour', color: 'blue' });
      } else {
        notifications.show({ message: res.lastRun?.message ?? 'Mise à jour échouée', color: 'red' });
      }
      void status.reload();
      close();
    } else if (action.error) {
      notifications.show({ message: action.error, color: 'red' });
    }
  };

  if (!available) return null;

  const version = status.data?.latest?.version ?? '?';
  const notes = status.data?.latest?.notes;

  return (
    <>
      {/* Bulle persistante : rappelle tant que la version n'est pas appliquée */}
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

      <Modal opened={opened} onClose={close} title={
        <Group gap="xs">
          <ThemeIcon variant="light" color="orange" size={30} radius="md">
            <IconRocket size={16} stroke={1.5} />
          </ThemeIcon>
          <Text fw={700}>Mise à jour du panel — v{version}</Text>
        </Group>
      } size="lg">
        <Stack>
          <Divider label="Changelog" labelPosition="center" />
          <ScrollArea.Autosize mah={320} type="auto">
            {renderNotes(notes)}
          </ScrollArea.Autosize>
          <Divider />
          {applying ? (
            <Alert icon={<IconAlertTriangle size={16} stroke={1.5} />} color="blue" variant="light">
              Mise à jour en cours — le panel redémarrera à la fin. Cette page se rechargera automatiquement.
            </Alert>
          ) : (
            <Text size="xs" c="dimmed">
              La nouvelle version sera construite à côté de l'actuelle, puis basculée après vérification.
              En cas de problème, retour automatique à la version courante.
            </Text>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={close} disabled={applying}>Annuler</Button>
            <Button
              color="orange"
              leftSection={<IconCircleCheck size={16} stroke={1.5} />}
              loading={applying}
              onClick={() => void apply()}
            >
              Appliquer la mise à jour
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
