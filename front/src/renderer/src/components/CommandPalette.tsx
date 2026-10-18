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
import { call } from '../api/client';
import type { Vhost, NginxVhost, Zone, NodeApp } from '../types';

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
  { id: 'nav-firewall', label: 'Pare-feu', group: 'Navigation', icon: IconFlame, run: (n) => n('/settings') },
  { id: 'nav-settings', label: 'Paramètres', group: 'Navigation', icon: IconSettings, run: (n) => n('/settings') },
];

interface ServiceCommandConfig {
  id: string;
  label: string;
  prefix: string;
  action: string;
  icon: typeof IconGrain;
}

const SERVICE_COMMANDS: ServiceCommandConfig[] = [
  { id: 'act-apache-reload', label: 'Recharger la configuration Apache', prefix: 'apache', action: 'service.reload', icon: IconServer },
  { id: 'act-apache-restart', label: 'Redémarrer Apache', prefix: 'apache', action: 'service.restart', icon: IconServer },
  { id: 'act-nginx-reload', label: 'Recharger la configuration Nginx', prefix: 'nginx', action: 'service.reload', icon: IconWorld },
  { id: 'act-bind9-reload', label: 'Recharger les zones DNS (Bind9)', prefix: 'bind9', action: 'service.reload', icon: IconGrain },
  { id: 'act-mariadb-restart', label: 'Redémarrer MariaDB', prefix: 'mariadb', action: 'service.restart', icon: IconDatabase },
  { id: 'act-php-restart', label: 'Redémarrer PHP-FPM', prefix: 'php', action: 'service.restart', icon: IconBrandNodejs },
];

interface DataItem {
  id: string;
  label: string;
  kind: 'site' | 'domain' | 'app';
  detail: string;
  to: string;
  icon: typeof IconSearch;
}

interface SiteEntry {
  server: 'apache' | 'nginx';
  vhost: Vhost | NginxVhost;
}

interface DataIndex {
  sites: SiteEntry[];
  zones: Zone[];
  apps: NodeApp[];
}

async function loadDataIndex(): Promise<Partial<DataIndex>> {
  const [apache, nginx, zones, apps] = await Promise.allSettled([
    call<Vhost[]>('apache', 'vhosts.list'),
    call<NginxVhost[]>('nginx', 'vhosts.list'),
    call<Zone[]>('bind9', 'zones.list'),
    call<{ apps: NodeApp[] }>('node', 'apps.list'),
  ]);
  return {
    sites: [
      ...(apache.status === 'fulfilled' ? apache.value.map((v) => ({ server: 'apache' as const, vhost: v })) : []),
      ...(nginx.status === 'fulfilled' ? nginx.value.map((v) => ({ server: 'nginx' as const, vhost: v })) : []),
    ],
    zones: zones.status === 'fulfilled' ? zones.value : [],
    apps: apps.status === 'fulfilled' ? apps.value.apps : [],
  };
}

interface CommandPaletteProps {
  opened: boolean;
  onClose: () => void;
}

export function CommandPalette({ opened, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState<Partial<DataIndex> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (opened && index === null) {
      void loadDataIndex().then(setIndex).catch(() => setIndex({}));
    }
  }, [opened, index]);

  const runServiceAction = async (cfg: ServiceCommandConfig) => {
    try {
      await call(cfg.prefix, cfg.action);
      notifications.show({ message: `${cfg.label} — OK`, color: 'green' });
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

  const dataItems: DataItem[] = useMemo(() => {
    if (!index) return [];
    const items: DataItem[] = [];
    for (const entry of index.sites ?? []) {
      items.push({
        id: `site-${entry.vhost.id}`,
        label: entry.vhost.domain,
        kind: 'site',
        detail: `Site — ${entry.vhost.docroot || 'proxy'}`,
        to: `/sites/${entry.server}/${encodeURIComponent(entry.vhost.id)}`,
        icon: IconWorld,
      });
    }
    for (const z of index.zones ?? []) {
      items.push({
        id: `zone-${z.id}`,
        label: z.domain,
        kind: 'domain',
        detail: `Domaine — ${z.recordCount ?? z.records?.length ?? 0} enr.`,
        to: `/domains/${encodeURIComponent(z.id)}`,
        icon: IconGrain,
      });
    }
    for (const app of index.apps ?? []) {
      items.push({
        id: `app-${app.name}`,
        label: app.name,
        kind: 'app',
        detail: `App Node — port ${app.port}`,
        to: `/node/${encodeURIComponent(app.name)}`,
        icon: IconBrandNodejs,
      });
    }
    return items;
  }, [index]);

  const q = query.trim().toLowerCase();

  const filteredCommands = useMemo(() => {
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [q, commands]);

  const filteredData = useMemo(() => {
    if (!q || !index) return [];
    return dataItems.filter((d) => d.label.toLowerCase().includes(q));
  }, [q, dataItems, index]);

  const total = filteredData.length + filteredCommands.length;

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    if (!opened) {
      setQuery('');
      setCursor(0);
    }
  }, [opened]);

  const executeAt = async (i: number) => {
    if (i < filteredData.length) {
      const item = filteredData[i];
      if (item) {
        onClose();
        navigate(item.to);
      }
      return;
    }
    const cmd = filteredCommands[i - filteredData.length];
    if (cmd) {
      onClose();
      await cmd.run(navigate);
    }
  };

  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, total - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void executeAt(cursor);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const renderItem = (key: string, label: string, detail: string, icon: typeof IconSearch, i: number) => (
    <UnstyledButton
      key={key}
      onClick={() => void executeAt(i)}
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
          {icon({ size: 15, stroke: 1.5 })}
        </ThemeIcon>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" c={i === cursor ? 'white' : undefined}>{label}</Text>
          <Text size="xs" c={i === cursor ? 'white' : 'dimmed'}>{detail}</Text>
        </Group>
      </Group>
    </UnstyledButton>
  );

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
        placeholder="Rechercher un site, un domaine, une app, une action…"
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
        {total === 0 && (
          <Text size="sm" c="dimmed" p="md" ta="center">
            Aucun résultat pour « {query} »
          </Text>
        )}
        {filteredData.length > 0 && (
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="sm" pt="xs" pb={4}>
            Données ({filteredData.length})
          </Text>
        )}
        {filteredData.map((d, i) => renderItem(d.id, d.label, d.detail, d.icon, i))}
        {filteredCommands.map((cmd, i) => {
          const gi = filteredData.length + i;
          const showHeader = filteredData.length > 0
            ? i === 0
            : cmd.group !== (filteredCommands[i - 1]?.group ?? '');
          if (!showHeader) return renderItem(cmd.id, cmd.label, '', cmd.icon, gi);
          return (
            <Box key={cmd.id}>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" px="sm" pt="xs" pb={4}>
                {cmd.group}
              </Text>
              {renderItem(cmd.id, cmd.label, '', cmd.icon, gi)}
            </Box>
          );
        })}
      </Stack>
    </Modal>
  );
}
