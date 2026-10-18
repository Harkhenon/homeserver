import { useEffect, useMemo, useState } from 'react';
import {
  Modal, TextInput, Group, Text, Kbd, Stack, UnstyledButton, ThemeIcon, Box,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconSearch, IconDashboard, IconServer, IconWorld, IconBrandNodejs,
  IconDatabase, IconUsers, IconFileDescription, IconClock, IconDatabaseImport,
  IconFlame, IconSettings,
} from '@tabler/icons-react';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof IconSearch;
  action: (navigate: (to: string) => void) => void;
}

const NAV_COMMANDS: Command[] = [
  { id: 'nav-dashboard', label: 'Aller au Tableau de bord', icon: IconDashboard, action: (n) => n('/') },
  { id: 'nav-server', label: 'Aller à la Supervision', icon: IconServer, action: (n) => n('/server') },
  { id: 'nav-sites', label: 'Aller aux Sites', icon: IconWorld, action: (n) => n('/sites') },
  { id: 'nav-node', label: 'Aller aux Apps Node', icon: IconBrandNodejs, action: (n) => n('/node') },
  { id: 'nav-domains', label: 'Aller aux Domaines', icon: IconWorld, action: (n) => n('/domains') },
  { id: 'nav-databases', label: 'Aller aux Bases de données', icon: IconDatabase, action: (n) => n('/databases') },
  { id: 'nav-users', label: 'Aller aux Utilisateurs', icon: IconUsers, action: (n) => n('/users') },
  { id: 'nav-files', label: 'Aller aux Fichiers', icon: IconFileDescription, action: (n) => n('/files') },
  { id: 'nav-cron', label: 'Aller aux Tâches cron', icon: IconClock, action: (n) => n('/cron') },
  { id: 'nav-backups', label: 'Aller aux Sauvegardes', icon: IconDatabaseImport, action: (n) => n('/backups') },
  { id: 'nav-firewall', label: 'Aller au Pare-feu', icon: IconFlame, action: (n) => n('/firewall') },
  { id: 'nav-settings', label: 'Aller aux Paramètres', icon: IconSettings, action: (n) => n('/settings') },
];

interface CommandPaletteProps {
  opened: boolean;
  onClose: () => void;
}

export function CommandPalette({ opened, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();

  const commands = useMemo(() => NAV_COMMANDS, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!opened) {
      setQuery('');
      setCursor(0);
    }
  }, [opened]);

  const execute = (cmd: Command) => {
    onClose();
    cmd.action(navigate);
  };

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[cursor];
        if (cmd) execute(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      size="lg"
      padding={0}
      radius="lg"
      styles={{ content: { overflow: 'hidden' } }}
    >
      <TextInput
        variant="unstyled"
        placeholder="Rechercher une page, une action…"
        size="md"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        data-autofocus
        leftSection={<IconSearch size={18} stroke={1.5} />}
        rightSectionWidth={90}
        rightSection={
          <Group gap={4}>
            <Kbd size="xs">↑</Kbd>
            <Kbd size="xs">↓</Kbd>
            <Kbd size="xs">↵</Kbd>
          </Group>
        }
        styles={{
          root: { borderBottom: '1px solid var(--mantine-color-dark-4)' },
          input: { backgroundColor: 'transparent' },
        }}
      />
      <Stack gap={0} p="xs" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <Text size="sm" c="dimmed" p="md" ta="center">
            Aucun résultat pour « {query} »
          </Text>
        )}
        {filtered.map((cmd, i) => (
          <UnstyledButton
            key={cmd.id}
            onClick={() => execute(cmd)}
            onMouseEnter={() => setCursor(i)}
            style={{
              background: i === cursor ? 'var(--mantine-primary-color-filled)' : 'transparent',
              padding: '8px 12px',
              borderRadius: 'var(--mantine-radius-md)',
              width: '100%',
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon
                variant={i === cursor ? 'filled' : 'light'}
                size={28}
                radius="md"
                color={i === cursor ? undefined : 'gray'}
              >
                <cmd.icon size={15} stroke={1.5} />
              </ThemeIcon>
              <Text size="sm" c={i === cursor ? 'white' : undefined}>{cmd.label}</Text>
              {cmd.hint && (
                <Box ml="auto">
                  <Text size="xs" c={i === cursor ? 'white' : 'dimmed'}>{cmd.hint}</Text>
                </Box>
              )}
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </Modal>
  );
}
