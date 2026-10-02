import { useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { AppShell, Burger, Group, Title, Box, Text, ScrollArea, ThemeIcon } from '@mantine/core';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { IconServer2 } from '@tabler/icons-react';
import { NAV_SECTIONS } from './nav';
import { UserMenu } from './UserMenu';
import { SettingsModal } from './SettingsModal';
import type { AccentColor } from '../theme/colors';

interface AppLayoutProps {
  accent: AccentColor;
  onAccentChange: (color: AccentColor) => void;
  username: string;
  avatarSeed: string;
  onAvatarChange: (seed: string) => void;
}

export function AppLayout({ accent, onAccentChange, username, avatarSeed, onAvatarChange }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const navigate = useNavigate();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon size={32} radius="md" variant="filled">
              <IconServer2 size={18} stroke={1.5} />
            </ThemeIcon>
            <Title order={4}>Homeserver</Title>
            <Text size="xs" c="dimmed" visibleFrom="sm">v0.5.0</Text>
          </Group>
          <UserMenu username={avatarSeed || username} onOpenSettings={openSettings} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <ScrollArea h="100%" type="hover" scrollbarSize={6}>
          {NAV_SECTIONS.map((section) => (
            <Box key={section.label} mb="sm">
              <Group gap={6} mb={4} px="sm">
                <Box w={5} h={5} bg="var(--mantine-primary-color-filled)" style={{ borderRadius: '50%', flexShrink: 0 }} />
                <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>
                  {section.label}
                </Text>
              </Group>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--mantine-radius-md)',
                    textDecoration: 'none',
                    color: isActive ? 'var(--mantine-color-white)' : 'var(--mantine-color-dimmed)',
                    backgroundColor: isActive ? 'var(--mantine-color-dark-4)' : 'transparent',
                    fontSize: 'var(--mantine-font-size-sm)',
                  })}
                >
                  <item.icon size={18} stroke={1.5} />
                  {item.label}
                </NavLink>
              ))}
            </Box>
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <SettingsModal
        opened={settingsOpened}
        onClose={closeSettings}
        username={username}
        accent={accent}
        onAccentChange={onAccentChange}
        avatarSeed={avatarSeed}
        onAvatarChange={onAvatarChange}
      />
    </AppShell>
  );
}
