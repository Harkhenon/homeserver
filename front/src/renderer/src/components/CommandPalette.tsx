import { useEffect, useMemo, useState } from 'react';
import {
  Modal, TextInput, Group, Text, Kbd, Stack, UnstyledButton, ThemeIcon, Box,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import {
  IconSearch, IconDashboard, IconServer, IconWorld, IconBrandNodejs,
  IconDatabase, IconUsers, IconFileDescription, IconClock, IconDatabaseImport,
  IconFlame, IconSettings, IconRefresh, IconGrain,
} from '@tabler/icons-react';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: typeof IconSearch;
  run: (navigate: (to: string) => void) => void | Promise<void>;
}

const NAV_COMMANDS: Command[] = [
  { id: 'nav-dashboard', label: 'Tableau de bord', group: 'Navigation', icon: IconDashboard, run: (n) => n('/') },
  { id: 'nav-server', label: 'Supervision', group: 'Navigation', icon: IconServer, run: (n) => n('/server') },
  { id: 'nav-sites', label: 'Sites', group: 'Navigation', icon: IconWorld, run: (n) => n('/sites') },
  { id: 'nav-node', label: 'Apps Node', group: 'Navigation', icon: IconBrandNodejs, run: (n) => n('/node') },
  { id: 'nav-domains', label: 'Domaines', group: 'Navigation', icon: IconWorld, run: (n) => n('/domains') },
  { id: 'nav-databases', label: 'Bases de données', group: 'Navigation', icon: IconDatabase, run: (n) => n('/databases') },
  { id: 'nav-users', label: 'Utilisateurs', group: 'Navigation', icon: IconUsers, run: (n) => n('/users') },
  { id: 'nav-files', label: 'Fichiers', group: 'Navigation', icon: IconFileDescription, run: (n) => n('/files') },
  { id: 'nav-cron', label: 'Tâches cron', group: 'Navigation', icon: IconClock, run: (n) => n('/cron') },
  { id: 'nav-backups', label: 'Sauvegardes', group: 'Navigation', icon: IconDatabaseImport, run: (n) => n('/backups') },
  { id: 'nav-firewall', label: 'Pare-feu', group: 'Navigation', icon: IconFlame, run: (n) => n('/firewall') },
  { id: 'nav-settings', label: 'Paramètres', group: 'Navigation', icon: IconSettings, run: (n) => n('/settings') },
];

interface ServiceCommandConfig {
  id: string;
  label: string;
  prefix: string;
  action: string;
  verb: 'reload' | 'restart';
  icon: typeof IconGrain;
}

const SERVICE_COMMANDS: ServiceCommandConfig[] = [
  { id: 'act-apache-reload', label: 'Recharger la configuration Apache', prefix: 'apache', action: 'service.reload', verb: 'reload', icon: IconServer },
  { id: 'act-apache-restart', label: 'Redémarrer Apache', prefix: 'apache', action: 'service.restart', verb: 'restart', icon: IconServer },
  { id: 'act-nginx-reload', label: 'Recharger la configuration Nginx', prefix: 'nginx', action: 'service.reload', verb: 'reload', icon: IconWorld },
  { id: 'act-bind9-reload', label: 'Recharger les zones DNS (Bind9)', prefix: 'bind9', action: 'service.reload', verb: 'reload', icon: IconGrain },
  { id: 'act-mariadb-restart', label: 'Redémarrer MariaDB', prefix: 'mariadb', action: 'service.restart', verb: 'restart', icon: IconDatabase },
  { id: 'act-php-restart', label: 'Redémarrer PHP-FPM', prefix: 'php', action: 'service.restart', verb: 'restart', icon: IconBrandNodejs },
];

interface CommandPaletteProps {
  opened: boolean;
  onClose: () => void;
}

export function CommandPalette({ opened, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();

  const runServiceAction = async (cfg: ServiceCommandConfig) => {
    try {
      const { call } = await import('../api/client');
      await call(cfg.prefix, cfg.action);
      notifications.show({
        message: `${cfg.label} — OK`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : 'Action échouée',
        color: 'red',
      });
    }
  };

  const commands: Command[] = useMemo(() => [
    ...NAV_COMMANDS,
    ...SERVICE_COMMANDS.map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      group: 'Actions',
      icon: cfg.icon,
      run: () => runServiceAction(cfg),
    })),
  ], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (!opened) {
      setQuery('');
      setCursor(0);
    }
  }, [opened]);

  const execute = async (cmd: Command) => {
    onClose();
    await cmd.run(navigate);
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
        if (cmd) void execute(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let lastGroup = '';

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
        placeholder="Rechercher une page ou une action…"
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
        {filtered.map((cmd, i) => {
          const showGroup = cmd.group !== lastGroup;
          lastGroup = cmd.group;
          return (
            <Box key={cmd.id}>
              {showGroup && (
                <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="sm" pt="xs" pb={4}>
                  {cmd.group}
                </Text>
              )}
              <UnstyledButton
                onClick={() => void execute(cmd)}
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
                  {cmd.group === 'Actions' && (
                    <Box ml="auto">
                      <Text size="xs" c={i === cursor ? 'white' : 'dimmed'}>↵ exécuter</Text>
                    </Box>
                  )}
                </Group>
              </UnstyledButton>
            </Box>
          );
        })}
      </Stack>
    </Modal>
  );
}
