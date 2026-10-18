import { useEffect, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import {
  AppShell,
  Burger,
  Group,
  Title,
  Box,
  Text,
  ThemeIcon,
  Tooltip,
  ActionIcon,
  Image,
} from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { IconServer2, IconLayoutSidebar, IconSearch } from '@tabler/icons-react';
import { SideNav } from './SideNav';
import { useModuleQuery } from '../api/hooks';
import { UserMenu } from './UserMenu';
import { SettingsModal } from './SettingsModal';
import { UpdateNotification } from '../components/UpdateNotification';
import { CommandPalette } from '../components/CommandPalette';
import { PanelUpdateModalProvider } from '../components/PanelUpdateModal';
import type { AccentColor } from '../theme/colors';
import HomeserverLogo from '../assets/logo_homeserver.webp';

interface AppLayoutProps {
  accent: AccentColor;
  onAccentChange: (color: AccentColor) => void;
  username: string;
  avatarSeed: string;
  onAvatarChange: (seed: string) => void;
}

function PanelVersionText() {
  const version = useModuleQuery<{ version: string; source?: string }>('system', 'panel.version');
  return (
    <Text
      size='xs'
      c='dimmed'
      visibleFrom='sm'>
      v{version.data?.version ?? '…'}
    </Text>
  );
}

export function AppLayout({
  accent,
  onAccentChange,
  username,
  avatarSeed,
  onAvatarChange,
}: AppLayoutProps) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [settingsOpened, { open: openSettings, close: closeSettings }] =
    useDisclosure(false);
  const [paletteOpened, { open: openPalette, close: closePalette }] =
    useDisclosure(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);

  const navbarWidth = desktopCollapsed ? 76 : 250;

  return (
    <PanelUpdateModalProvider>
      <AppShell
      header={{ height: 60 }}
      navbar={{
        width: navbarWidth,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: false },
      }}
      padding='md'>
      <AppShell.Header>
        <Group
          h='100%'
          px='md'
          justify='space-between'
          wrap='nowrap'>
          <Group
            gap='sm'
            wrap='nowrap'>
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              hiddenFrom='sm'
              size='sm'
            />
            <Tooltip
              label={desktopCollapsed ? 'Déplier le menu' : 'Replier le menu'}
              position='bottom'
              withinPortal>
              <ActionIcon
                variant='subtle'
                onClick={() => setDesktopCollapsed((v) => !v)}
                visibleFrom='sm'
                size='lg'>
                <IconLayoutSidebar
                  size={18}
                  stroke={1.5}
                />
              </ActionIcon>
            </Tooltip>
            <ThemeIcon
              size={32}
              radius='md'
              variant='filled'>
              <Image
                src={HomeserverLogo}
                alt='Homeserver logo'
                style={{ width: '32px', height: '32px' }}
              />
            </ThemeIcon>
            <Title order={4}>Homeserver</Title>
            <PanelVersionText />
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Tooltip label='Rechercher (Ctrl+K)' position='bottom' withinPortal>
              <ActionIcon variant='subtle' size='lg' onClick={openPalette}>
                <IconSearch size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Box miw={200} visibleFrom="xs">
              <UpdateNotification />
            </Box>
            <UserMenu
              username={avatarSeed || username}
              onOpenSettings={openSettings}
            />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p='xs'>
        <SideNav collapsed={desktopCollapsed} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <CommandPalette opened={paletteOpened} onClose={closePalette} />
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
    </PanelUpdateModalProvider>
  );
}
