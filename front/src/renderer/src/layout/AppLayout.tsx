import { useDisclosure } from '@mantine/hooks';
import { AppShell, Burger, Group, Title, SegmentedControl, Box } from '@mantine/core';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { IconLogout } from '@tabler/icons-react';
import { NAV_ITEMS } from './nav';
import { ACCENT_COLORS, type AccentColor } from '../theme/colors';
import { setToken } from '../api/client';

interface AppLayoutProps {
  accent: AccentColor;
  onAccentChange: (color: AccentColor) => void;
}

export function AppLayout({ accent, onAccentChange }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>Homeserver</Title>
          </Group>
          <Group gap="sm">
            <SegmentedControl
              size="xs"
              value={accent}
              onChange={(v) => onAccentChange(v as AccentColor)}
              data={ACCENT_COLORS.map((c) => ({ value: c.value, label: c.label }))}
            />
            <Box
              component="span"
              onClick={() => {
                setToken(null);
                navigate('/login');
              }}
              style={{ cursor: 'pointer' }}
            >
              <IconLogout size={18} />
            </Box>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--mantine-radius-md)',
              textDecoration: 'none',
              color: isActive ? 'var(--mantine-color-white)' : 'var(--mantine-color-dimmed)',
              backgroundColor: isActive ? 'var(--mantine-color-dark-4)' : 'transparent',
              marginBottom: '2px',
            })}
          >
            <Group gap="sm" wrap="nowrap">
              <item.icon size={18} stroke={1.5} />
              {item.label}
            </Group>
          </NavLink>
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
