import { useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { AppShell, Burger, Group, Title, Box, Text, ScrollArea, ThemeIcon, Tooltip, ActionIcon } from '@mantine/core';
import { NavLink, Outlet } from 'react-router-dom';
import { IconServer2, IconLayoutSidebar } from '@tabler/icons-react';
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
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);

  const navbarWidth = desktopCollapsed ? 76 : 250;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: navbarWidth,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: false },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Tooltip label={desktopCollapsed ? 'Déplier le menu' : 'Replier le menu'} position="bottom" withinPortal>
              <ActionIcon
                variant="subtle"
                onClick={() => setDesktopCollapsed((v) => !v)}
                visibleFrom="sm"
                size="lg"
              >
                <IconLayoutSidebar size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <ThemeIcon size={32} radius="md" variant="filled">
              <IconServer2 size={18} stroke={1.5} />
            </ThemeIcon>
            <Title order={4}>Homeserver</Title>
            <Text size="xs" c="dimmed" visibleFrom="sm">v0.5.0</Text>
          </Group>
          <UserMenu username={avatarSeed || username} onOpenSettings={openSettings} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea h="100%" type="hover" scrollbarSize={6}>
          {NAV_SECTIONS.map((section) => (
            <Box key={section.label} mb="sm">
              {!desktopCollapsed && (
                <Group gap={6} mb={4} px="sm">
                  <Box w={5} h={5} bg="var(--mantine-primary-color-filled)" style={{ borderRadius: '50%', flexShrink: 0 }} />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700} lts={0.5}>
                    {section.label}
                  </Text>
                </Group>
              )}
              {section.items.map((item) => (
                <Tooltip
                  key={item.to}
                  label={item.label}
                  position="right"
                  withinPortal
                  disabled={!desktopCollapsed}
                  transitionProps={{ duration: 0 }}
                >
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: desktopCollapsed ? '8px 0' : '8px 12px',
                      justifyContent: desktopCollapsed ? 'center' : 'flex-start',
                      borderRadius: 'var(--mantine-radius-md)',
                      textDecoration: 'none',
                      color: isActive ? 'var(--mantine-color-white)' : 'var(--mantine-color-dark-1)',
                      backgroundColor: isActive ? 'var(--mantine-primary-color-filled)' : 'transparent',
                      fontSize: 'var(--mantine-font-size-sm)',
                      transition: 'background-color 150ms ease',
                    })}
                  >
                    <item.icon size={18} stroke={1.5} style={{ flexShrink: 0 }} />
                    {!desktopCollapsed && item.label}
                  </NavLink>
                </Tooltip>
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
